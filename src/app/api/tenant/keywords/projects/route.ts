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

const PROJECT_LIMIT = 5

function normalizeDomain(raw: string): string {
  let d = raw.trim().toLowerCase()
  d = d.replace(/^https?:\/\//, '')
  d = d.replace(/^www\./, '')
  d = d.replace(/\/.*$/, '')
  return d
}

const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

const createProjectSchema = z.object({
  name: z.string().min(1, 'Name ist erforderlich.').max(100, 'Name darf maximal 100 Zeichen haben.'),
  target_domain: z
    .string()
    .min(1, 'Domain ist erforderlich.')
    .max(253)
    .transform(normalizeDomain)
    .refine((d) => DOMAIN_REGEX.test(d), 'Ungültige Domain (z. B. example.de).'),
  language_code: z.string().min(2).max(10).default('de'),
  country_code: z.string().min(2).max(10).default('DE'),
})

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`kw-projects-read:${tenantId}:${getClientIp(request)}`, VISIBILITY_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'seo_analyse')
  if ('error' in moduleAccess) return moduleAccess.error

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('keyword_projects')
    .select(`
      id,
      name,
      target_domain,
      language_code,
      country_code,
      status,
      last_tracking_run,
      created_at,
      keywords(count),
      competitor_domains(count)
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const projects = (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    target_domain: p.target_domain,
    language_code: p.language_code,
    country_code: p.country_code,
    status: p.status,
    last_tracking_run: p.last_tracking_run,
    created_at: p.created_at,
    keyword_count: (p.keywords as unknown as { count: number }[])?.[0]?.count ?? 0,
    competitor_count: (p.competitor_domains as unknown as { count: number }[])?.[0]?.count ?? 0,
  }))

  return NextResponse.json({ projects })
}

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`kw-projects-write:${tenantId}:${getClientIp(request)}`, VISIBILITY_PROJECT_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'seo_analyse')
  if ('error' in moduleAccess) return moduleAccess.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = createProjectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validierungsfehler.' },
      { status: 422 }
    )
  }

  const admin = createAdminClient()

  // Enforce project limit
  const { count, error: countError } = await admin
    .from('keyword_projects')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)

  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })
  if ((count ?? 0) >= PROJECT_LIMIT) {
    return NextResponse.json(
      { error: `Maximale Projektanzahl (${PROJECT_LIMIT}) erreicht.` },
      { status: 422 }
    )
  }

  const { data, error } = await admin
    .from('keyword_projects')
    .insert({
      tenant_id: tenantId,
      name: parsed.data.name,
      target_domain: parsed.data.target_domain,
      language_code: parsed.data.language_code,
      country_code: parsed.data.country_code,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(
    {
      project: {
        ...data,
        keyword_count: 0,
        competitor_count: 0,
      },
    },
    { status: 201 }
  )
}
