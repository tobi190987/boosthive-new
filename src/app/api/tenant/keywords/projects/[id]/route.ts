import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantAdmin, requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  VISIBILITY_PROJECT_WRITE,
  VISIBILITY_READ,
} from '@/lib/rate-limit'

function normalizeDomain(raw: string): string {
  let d = raw.trim().toLowerCase()
  d = d.replace(/^https?:\/\//, '')
  d = d.replace(/^www\./, '')
  d = d.replace(/\/.*$/, '')
  return d
}

const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  target_domain: z
    .string()
    .min(1)
    .max(253)
    .transform(normalizeDomain)
    .refine((d) => DOMAIN_REGEX.test(d), 'Ungültige Domain.')
    .optional(),
  language_code: z.string().min(2).max(10).optional(),
  country_code: z.string().min(2).max(10).optional(),
  tracking_interval: z.enum(['daily', 'weekly']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
})

async function resolveProject(tenantId: string, projectId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('keyword_projects')
    .select('id, tenant_id')
    .eq('id', projectId)
    .eq('tenant_id', tenantId)
    .single()

  if (error || !data) return null
  return data
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`kw-project-read:${tenantId}:${getClientIp(request)}`, VISIBILITY_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'seo_analyse')
  if ('error' in moduleAccess) return moduleAccess.error

  const { id: projectId } = await params
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('keyword_projects')
    .select(`
      id,
      name,
      target_domain,
      language_code,
      country_code,
      tracking_interval,
      status,
      last_tracking_run,
      created_at,
      keywords(count),
      competitor_domains(count)
    `)
    .eq('id', projectId)
    .eq('tenant_id', tenantId)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Projekt nicht gefunden.' }, { status: 404 })

  return NextResponse.json({
    project: {
      id: data.id,
      name: data.name,
      target_domain: data.target_domain,
      language_code: data.language_code,
      country_code: data.country_code,
      tracking_interval: data.tracking_interval,
      status: data.status,
      last_tracking_run: data.last_tracking_run,
      created_at: data.created_at,
      keyword_count: (data.keywords as unknown as { count: number }[])?.[0]?.count ?? 0,
      competitor_count: (data.competitor_domains as unknown as { count: number }[])?.[0]?.count ?? 0,
    },
  })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`kw-project-write:${tenantId}:${getClientIp(request)}`, VISIBILITY_PROJECT_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'seo_analyse')
  if ('error' in moduleAccess) return moduleAccess.error

  const { id: projectId } = await params

  const existing = await resolveProject(tenantId, projectId)
  if (!existing) return NextResponse.json({ error: 'Projekt nicht gefunden.' }, { status: 404 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = updateProjectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validierungsfehler.' },
      { status: 422 }
    )
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.data.name !== undefined) updates.name = parsed.data.name
  if (parsed.data.target_domain !== undefined) updates.target_domain = parsed.data.target_domain
  if (parsed.data.language_code !== undefined) updates.language_code = parsed.data.language_code
  if (parsed.data.country_code !== undefined) updates.country_code = parsed.data.country_code
  if (parsed.data.tracking_interval !== undefined) {
    updates.tracking_interval = parsed.data.tracking_interval
  }
  if (parsed.data.status !== undefined) updates.status = parsed.data.status

  const admin = createAdminClient()
  const { error } = await admin
    .from('keyword_projects')
    .update(updates)
    .eq('id', projectId)
    .eq('tenant_id', tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({})
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`kw-project-write:${tenantId}:${getClientIp(request)}`, VISIBILITY_PROJECT_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'seo_analyse')
  if ('error' in moduleAccess) return moduleAccess.error

  const { id: projectId } = await params

  const existing = await resolveProject(tenantId, projectId)
  if (!existing) return NextResponse.json({ error: 'Projekt nicht gefunden.' }, { status: 404 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('keyword_projects')
    .delete()
    .eq('id', projectId)
    .eq('tenant_id', tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({})
}
