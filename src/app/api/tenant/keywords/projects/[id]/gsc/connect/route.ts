/**
 * PROJ-26: POST /api/tenant/keywords/projects/[id]/gsc/connect
 *
 * Generates a Google OAuth authorization URL and returns it.
 * The frontend then redirects the user to that URL.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse, GSC_CONNECT } from '@/lib/rate-limit'
import {
  buildAuthorizationUrl,
  createOAuthState,
  generateNonce,
} from '@/lib/gsc-oauth'

const paramsSchema = z.object({
  id: z.string().uuid('Ungültige Projekt-ID.'),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenantId = request.headers.get('x-tenant-id')
    if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

    const rl = checkRateLimit(`gsc-connect:${tenantId}:${getClientIp(request)}`, GSC_CONNECT)
    if (!rl.allowed) return rateLimitResponse(rl)

    const authResult = await requireTenantAdmin(tenantId)
    if ('error' in authResult) return authResult.error

    const moduleAccess = await requireTenantModuleAccess(tenantId, 'seo_analyse')
    if ('error' in moduleAccess) return moduleAccess.error

    const parsedParams = paramsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: parsedParams.error.issues[0]?.message }, { status: 400 })
    }

    const { id: projectId } = parsedParams.data
    const nonce = generateNonce()

    const admin = createAdminClient()
    const { data: project, error: projectError } = await admin
      .from('keyword_projects')
      .select('id')
      .eq('id', projectId)
      .eq('tenant_id', tenantId)
      .single()

    if (projectError) {
      console.error('[gsc/connect] Projekt-Lookup fehlgeschlagen:', projectError)
      return NextResponse.json({ error: 'Projekt konnte nicht geladen werden.' }, { status: 500 })
    }

    if (!project) {
      return NextResponse.json({ error: 'Projekt nicht gefunden.' }, { status: 404 })
    }

    const state = createOAuthState({
      projectId,
      tenantId,
      userId: authResult.auth.userId,
      nonce,
      issuedAt: Date.now(),
    })

    const url = buildAuthorizationUrl(state)
    return NextResponse.json({ url })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'OAuth-Flow konnte nicht gestartet werden.'
    console.error('[gsc/connect] Unerwarteter Fehler:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
