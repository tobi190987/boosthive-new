/**
 * PROJ-26: GET /api/tenant/keywords/projects/[id]/gsc/properties
 *
 * Lists all verified GSC properties for the connected Google account.
 * Refreshes the access token if needed before calling the GSC API.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse, GSC_READ } from '@/lib/rate-limit'
import { listGscProperties, refreshAccessToken, TokenRevokedError } from '@/lib/gsc-oauth'
import { encryptToken, decryptToken, isTokenDecryptError } from '@/lib/gsc-crypto'

const paramsSchema = z.object({
  id: z.string().uuid('Ungueltige Projekt-ID.'),
})

function toSafeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return 'Fehler beim Abrufen der GSC-Properties.'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenantId = request.headers.get('x-tenant-id')
    if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

    const rl = checkRateLimit(`gsc-properties:${tenantId}:${getClientIp(request)}`, GSC_READ)
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

    const admin = createAdminClient()
    const { data: conn } = await admin
      .from('gsc_connections')
      .select('id, encrypted_access_token, encrypted_refresh_token, token_expires_at, status')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!conn) {
      return NextResponse.json({ error: 'Keine GSC-Verbindung fuer dieses Projekt.' }, { status: 404 })
    }

    if (conn.status === 'revoked') {
      return NextResponse.json({ error: 'GSC-Verbindung wurde widerrufen.' }, { status: 403 })
    }

    let accessToken = decryptToken(conn.encrypted_access_token)

    // Refresh token if expired (with 60s buffer)
    const expiresAt = new Date(conn.token_expires_at).getTime()
    if (Date.now() > expiresAt - 60_000) {
      try {
        const refreshToken = decryptToken(conn.encrypted_refresh_token)
        const refreshed = await refreshAccessToken(refreshToken)
        accessToken = refreshed.access_token

        // Update DB with new access token
        await admin
          .from('gsc_connections')
          .update({
            encrypted_access_token: encryptToken(refreshed.access_token),
            token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
            status: 'connected',
            updated_at: new Date().toISOString(),
          })
          .eq('id', conn.id)
      } catch (err) {
        if (err instanceof TokenRevokedError) {
          await admin
            .from('gsc_connections')
            .update({ status: 'revoked', updated_at: new Date().toISOString() })
            .eq('id', conn.id)
          return NextResponse.json({ error: 'GSC-Token wurde widerrufen. Bitte erneut verbinden.' }, { status: 403 })
        }
        console.error('[gsc/properties] Token-Refresh fehlgeschlagen:', err)
        return NextResponse.json(
          { error: 'Token-Refresh ist temporaer fehlgeschlagen. Bitte gleich erneut versuchen.' },
          { status: 502 }
        )
      }
    }

    try {
      const sites = await listGscProperties(accessToken)
      return NextResponse.json({
        properties: sites.map((s) => ({
          siteUrl: s.siteUrl,
          permissionLevel: s.permissionLevel,
        })),
      })
    } catch (err) {
      if (err instanceof TokenRevokedError) {
        await admin
          .from('gsc_connections')
          .update({ status: 'revoked', updated_at: new Date().toISOString() })
          .eq('id', conn.id)
        return NextResponse.json({ error: 'GSC-Token wurde widerrufen. Bitte erneut verbinden.' }, { status: 403 })
      }

      console.error('[gsc/properties] GSC-Sites-Abfrage fehlgeschlagen:', err)
      return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 })
    }
  } catch (err) {
    if (isTokenDecryptError(err)) {
      console.error('[gsc/properties] Token konnte nicht entschluesselt werden:', err)
      return NextResponse.json(
        {
          error:
            'Die gespeicherte GSC-Verbindung kann mit dem aktuellen Verschluesselungs-Schluessel nicht gelesen werden. Bitte trenne die Verbindung und verbinde Google Search Console erneut.',
        },
        { status: 409 }
      )
    }
    console.error('[gsc/properties] Unerwarteter Fehler:', err)
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 })
  }
}
