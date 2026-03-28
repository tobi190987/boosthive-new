import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  VISIBILITY_PROJECT_WRITE,
  VISIBILITY_READ,
} from '@/lib/rate-limit'

const updateProjectSchema = z.object({
  brand_name: z.string().min(1).max(200).optional(),
  website_url: z.string().url().max(500).nullable().optional(),
  competitors: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        url: z.string().max(500).optional().default(''),
      })
    )
    .max(3)
    .optional(),
  keywords: z.array(z.string().min(1).max(300)).min(1).max(10).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`visibility-project-read:${tenantId}:${getClientIp(request)}`, VISIBILITY_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'ai_visibility')
  if ('error' in moduleAccess) return moduleAccess.error

  const { id } = await params
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('visibility_projects')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'Projekt nicht gefunden.' }, { status: 404 })
  }

  return NextResponse.json({ project: data })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(
    `visibility-project-write:${tenantId}:${getClientIp(request)}`,
    VISIBILITY_PROJECT_WRITE
  )
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'ai_visibility')
  if ('error' in moduleAccess) return moduleAccess.error

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungueltiger JSON-Body.' }, { status: 400 })
  }

  const parsed = updateProjectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validierungsfehler.', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.data.brand_name !== undefined) updates.brand_name = parsed.data.brand_name.trim()
  if (parsed.data.website_url !== undefined) updates.website_url = parsed.data.website_url
  if (parsed.data.competitors !== undefined) updates.competitors = parsed.data.competitors
  if (parsed.data.keywords !== undefined) updates.keywords = parsed.data.keywords.map((k) => k.trim())

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('visibility_projects')
    .update(updates)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Projekt nicht gefunden.' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(
    `visibility-project-delete:${tenantId}:${getClientIp(request)}`,
    VISIBILITY_PROJECT_WRITE
  )
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'ai_visibility')
  if ('error' in moduleAccess) return moduleAccess.error

  const { id } = await params
  const admin = createAdminClient()
  const { error } = await admin
    .from('visibility_projects')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return new NextResponse(null, { status: 204 })
}
