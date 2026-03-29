/**
 * PROJ-26: PATCH /api/tenant/keywords/projects/[id]/gsc/property
 *
 * Sets the active GSC property (domain) for this project.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse, GSC_WRITE } from '@/lib/rate-limit'
import { decryptToken, encryptToken, isTokenDecryptError } from '@/lib/gsc-crypto'
import { listGscProperties, refreshAccessToken, TokenRevokedError } from '@/lib/gsc-oauth'

const paramsSchema = z.object({
  id: z.string().uuid('Ungueltige Projekt-ID.'),
})

const schema = z.object({
  selected_property: z.string().min(1).max(2048),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenantId = request.headers.get('x-tenant-id')
    if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

    const rl = checkRateLimit(`gsc-property:${tenantId}:${getClientIp(request)}`, GSC_WRITE)
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

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
    }

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Validierungsfehler.' },
        { status: 422 }
      )
    }

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

    if (Date.now() > new Date(conn.token_expires_at).getTime() - 60_000) {
      try {
        const refreshToken = decryptToken(conn.encrypted_refresh_token)
        const refreshed = await refreshAccessToken(refreshToken)
        accessToken = refreshed.access_token

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

        console.error('[gsc/property] Token-Refresh fehlgeschlagen:', err)
        return NextResponse.json(
          { error: 'Property kann gerade nicht validiert werden. Bitte gleich erneut versuchen.' },
          { status: 502 }
        )
      }
    }

    try {
      const availableProperties = await listGscProperties(accessToken)
      const selectedProperty = parsed.data.selected_property
      const isValidProperty = availableProperties.some((property) => property.siteUrl === selectedProperty)

      if (!isValidProperty) {
        return NextResponse.json(
          { error: 'Die ausgewaehlte Property ist fuer dieses Google-Konto nicht verfuegbar.' },
          { status: 422 }
        )
      }
    } catch (err) {
      if (err instanceof TokenRevokedError) {
        await admin
          .from('gsc_connections')
          .update({ status: 'revoked', updated_at: new Date().toISOString() })
          .eq('id', conn.id)
        return NextResponse.json({ error: 'GSC-Token wurde widerrufen. Bitte erneut verbinden.' }, { status: 403 })
      }

      console.error('[gsc/property] Property-Validierung fehlgeschlagen:', err)
      return NextResponse.json(
        { error: 'Property konnte nicht gegen Google validiert werden.' },
        { status: 502 }
      )
    }

    const { error } = await admin
      .from('gsc_connections')
      .update({
        selected_property: parsed.data.selected_property,
        updated_at: new Date().toISOString(),
      })
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({})
  } catch (err) {
    if (isTokenDecryptError(err)) {
      console.error('[gsc/property] Token konnte nicht entschluesselt werden:', err)
      return NextResponse.json(
        {
          error:
            'Die gespeicherte GSC-Verbindung kann mit dem aktuellen Verschluesselungs-Schluessel nicht gelesen werden. Bitte trenne die Verbindung und verbinde Google Search Console erneut.',
        },
        { status: 409 }
      )
    }

    console.error('[gsc/property] Unerwarteter Fehler:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Property konnte nicht gespeichert werden.' },
      { status: 500 }
    )
  }
}
