import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { checkRateLimit, getClientIp, rateLimitResponse, VISIBILITY_PROJECT_WRITE, VISIBILITY_READ } from '@/lib/rate-limit'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'

const KEYWORD_LIMIT = 50

// Accepts { keyword: string } or { keywords: string[] } for bulk import
const addKeywordsSchema = z.union([
  z.object({ keyword: z.string().min(1).max(200) }),
  z.object({ keywords: z.array(z.string().min(1).max(200)).min(1).max(50) }),
])

async function resolveProject(tenantId: string, projectId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('keyword_projects')
    .select('id')
    .eq('id', projectId)
    .eq('tenant_id', tenantId)
    .single()
  return data
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`kw-keywords-read:${tenantId}:${getClientIp(request)}`, VISIBILITY_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'seo_analyse')
  if ('error' in moduleAccess) return moduleAccess.error

  const { id: projectId } = await params
  const project = await resolveProject(tenantId, projectId)
  if (!project) return NextResponse.json({ error: 'Projekt nicht gefunden.' }, { status: 404 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('keywords')
    .select('id, keyword, created_at')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ keywords: data ?? [] })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`kw-keywords-write:${tenantId}:${getClientIp(request)}`, VISIBILITY_PROJECT_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'seo_analyse')
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

  const parsed = addKeywordsSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json(
      { error: issue?.message ?? 'Validierungsfehler.' },
      { status: 422 }
    )
  }

  const newKeywords =
    'keywords' in parsed.data ? parsed.data.keywords : [parsed.data.keyword]

  const admin = createAdminClient()

  // Enforce keyword limit
  const { count, error: countError } = await admin
    .from('keywords')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)

  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })

  const currentCount = count ?? 0
  if (currentCount + newKeywords.length > KEYWORD_LIMIT) {
    return NextResponse.json(
      {
        error: `Keyword-Limit (${KEYWORD_LIMIT}) würde überschritten. Aktuell: ${currentCount}, neu: ${newKeywords.length}.`,
      },
      { status: 422 }
    )
  }

  const rows = newKeywords.map((kw) => ({
    project_id: projectId,
    tenant_id: tenantId,
    keyword: kw.trim(),
  }))

  const { error } = await admin
    .from('keywords')
    .insert(rows)
    .select()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ein oder mehrere Keywords existieren bereits.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({}, { status: 201 })
}
