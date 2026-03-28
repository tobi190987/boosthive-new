import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'

const COMPETITOR_LIMIT = 5

const addCompetitorSchema = z.object({
  domain: z
    .string()
    .min(1, 'Domain ist erforderlich.')
    .max(253)
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/,
      'Ungueltige Domain (z. B. competitor.de).'
    ),
})

async function resolveProject(tenantId: string, projectId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('keyword_projects')
    .select('id, target_domain')
    .eq('id', projectId)
    .eq('tenant_id', tenantId)
    .single()
  return data
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'keyword_tracking')
  if ('error' in moduleAccess) return moduleAccess.error

  const { id: projectId } = await params
  const project = await resolveProject(tenantId, projectId)
  if (!project) return NextResponse.json({ error: 'Projekt nicht gefunden.' }, { status: 404 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('competitor_domains')
    .select('id, domain, created_at')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ competitors: data ?? [] })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'keyword_tracking')
  if ('error' in moduleAccess) return moduleAccess.error

  const { id: projectId } = await params
  const project = await resolveProject(tenantId, projectId)
  if (!project) return NextResponse.json({ error: 'Projekt nicht gefunden.' }, { status: 404 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = addCompetitorSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json(
      { error: issue?.message ?? 'Validierungsfehler.' },
      { status: 422 }
    )
  }

  // Prevent adding target domain as competitor
  if (parsed.data.domain === project.target_domain) {
    return NextResponse.json(
      { error: 'Die Wettbewerber-Domain darf nicht mit der Ziel-Domain identisch sein.' },
      { status: 422 }
    )
  }

  const admin = createAdminClient()

  // Enforce competitor limit
  const { count, error: countError } = await admin
    .from('competitor_domains')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)

  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })
  if ((count ?? 0) >= COMPETITOR_LIMIT) {
    return NextResponse.json(
      { error: `Wettbewerber-Limit (${COMPETITOR_LIMIT}) erreicht.` },
      { status: 422 }
    )
  }

  const { error } = await admin
    .from('competitor_domains')
    .insert({ project_id: projectId, tenant_id: tenantId, domain: parsed.data.domain })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Diese Domain ist bereits als Wettbewerber eingetragen.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({}, { status: 201 })
}
