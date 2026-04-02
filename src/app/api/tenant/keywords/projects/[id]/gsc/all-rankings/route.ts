/**
 * PROJ-32: GET /api/tenant/keywords/projects/[id]/gsc/all-rankings?days=7|28|90
 *
 * Fetches ALL keywords a domain ranks for in Google Search Console (discovery view).
 * Returns up to 1000 rows with clicks, impressions, CTR, and average position.
 * Also marks which keywords are already tracked in the project.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import { decryptToken, encryptToken } from '@/lib/gsc-crypto'
import {
  querySearchAnalytics,
  refreshAccessToken,
  TokenRevokedError,
} from '@/lib/gsc-oauth'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import type { RateLimitOptions } from '@/lib/rate-limit'

/** GSC Discovery: 10 requests / hour / tenant+IP */
const GSC_DISCOVERY: RateLimitOptions = { limit: 10, windowMs: 60 * 60 * 1000 }

const GSC_REFRESH_BUFFER_MS = 2 * 60 * 1000

const paramsSchema = z.object({
  id: z.string().uuid('Ungueltige Projekt-ID.'),
})

const querySchema = z.object({
  days: z.enum(['7', '28', '90']).default('28'),
})

function getDateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date()
  end.setDate(end.getDate() - 3) // GSC data has ~3 day lag
  const start = new Date(end)
  start.setDate(start.getDate() - days)

  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`gsc-discovery:${tenantId}:${getClientIp(request)}`, GSC_DISCOVERY)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'seo_analyse')
  if ('error' in moduleAccess) return moduleAccess.error

  const parsedParams = paramsSchema.safeParse(await params)
  if (!parsedParams.success) {
    return NextResponse.json({ error: parsedParams.error.issues[0]?.message }, { status: 400 })
  }

  const { id: projectId } = parsedParams.data

  const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries())
  const parsedQuery = querySchema.safeParse(searchParams)
  if (!parsedQuery.success) {
    return NextResponse.json({ error: 'Ungueltiger Zeitraum.' }, { status: 400 })
  }

  const days = parseInt(parsedQuery.data.days, 10)
  const admin = createAdminClient()

  // Verify project belongs to tenant
  const { data: project, error: projectError } = await admin
    .from('keyword_projects')
    .select('id, country_code')
    .eq('id', projectId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 })
  if (!project) return NextResponse.json({ error: 'Projekt nicht gefunden.' }, { status: 404 })

  // Get GSC connection with tokens
  const { data: connection, error: connError } = await admin
    .from('gsc_connections')
    .select('id, encrypted_access_token, encrypted_refresh_token, token_expires_at, selected_property, status')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (connError) return NextResponse.json({ error: connError.message }, { status: 500 })

  if (!connection || connection.status !== 'connected' || !connection.selected_property) {
    return NextResponse.json(
      { error: 'Keine aktive GSC-Verbindung fuer dieses Projekt.' },
      { status: 422 }
    )
  }

  // Ensure valid access token (refresh if needed)
  let accessToken: string
  try {
    accessToken = decryptToken(connection.encrypted_access_token)
    const expiresAt = new Date(connection.token_expires_at).getTime()

    if (Date.now() > expiresAt - GSC_REFRESH_BUFFER_MS) {
      const refreshToken = decryptToken(connection.encrypted_refresh_token)
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
        .eq('id', connection.id)
    }
  } catch (error) {
    if (error instanceof TokenRevokedError) {
      await admin
        .from('gsc_connections')
        .update({
          status: 'revoked',
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id)

      return NextResponse.json(
        { error: 'GSC-Verbindung wurde widerrufen. Bitte erneut verbinden.' },
        { status: 403 }
      )
    }
    return NextResponse.json(
      { error: 'Token-Refresh fehlgeschlagen.' },
      { status: 500 }
    )
  }

  // Query GSC Search Analytics for all keywords
  const dateRange = getDateRange(days)
  const countryFilter = project.country_code && project.country_code !== 'all'
    ? project.country_code.toLowerCase()
    : undefined

  let gscRows
  try {
    gscRows = await querySearchAnalytics(accessToken, {
      siteUrl: connection.selected_property,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      dimensions: ['query'],
      rowLimit: 1000,
      country: countryFilter,
    })
  } catch (error) {
    if (error instanceof TokenRevokedError) {
      await admin
        .from('gsc_connections')
        .update({ status: 'revoked', updated_at: new Date().toISOString() })
        .eq('id', connection.id)

      return NextResponse.json(
        { error: 'GSC-Verbindung wurde widerrufen. Bitte erneut verbinden.' },
        { status: 403 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'GSC-Abfrage fehlgeschlagen.' },
      { status: 502 }
    )
  }

  // Get tracked keywords for this project
  const { data: trackedKeywords } = await admin
    .from('keywords')
    .select('keyword')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)

  const trackedSet = new Set(
    (trackedKeywords ?? []).map((k: { keyword: string }) => k.keyword.toLowerCase())
  )

  // Map GSC rows to response format
  const rows = gscRows.map((row) => {
    const keyword = row.keys?.[0] ?? ''
    return {
      keyword,
      position: row.position != null ? Number(row.position.toFixed(1)) : null,
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: row.ctr != null ? Number((row.ctr * 100).toFixed(2)) : 0,
      isTracked: trackedSet.has(keyword.toLowerCase()),
    }
  })

  return NextResponse.json({
    rows,
    limitReached: gscRows.length >= 1000,
    dateRange,
    total: rows.length,
  })
}
