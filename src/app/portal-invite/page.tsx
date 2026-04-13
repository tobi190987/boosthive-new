'use client'

import { useEffect, useState } from 'react'
import { Loader2, XCircle } from 'lucide-react'

/**
 * /portal-invite (root domain)
 *
 * Relay page for Supabase invite callbacks.
 *
 * Supabase inviteUserByEmail uses the implicit flow and may fall back to the
 * Site URL (boost-hive.de) when the redirect_to URL isn't in the whitelist.
 * This page handles that case by:
 *   1. Reading the hash tokens (#access_token=...&refresh_token=...)
 *   2. Decoding the JWT payload (no verification — just parsing) to get tenant_id
 *   3. Looking up the tenant slug via /api/portal/tenant-lookup
 *   4. Redirecting to https://[slug].[rootDomain]/portal/auth/callback#...
 *
 * The tenant-subdomain /portal/auth/callback page then sets the session
 * and calls /api/portal/auth/finalize.
 */

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'boost-hive.de'

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(decoded) as Record<string, unknown>
  } catch {
    return null
  }
}

export default function PortalInvitePage() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function relay() {
      const hash = window.location.hash.substring(1)
      const params = new URLSearchParams(hash)
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')

      if (!accessToken || !refreshToken) {
        setError('Ungültiger Einladungslink. Bitte fordere eine neue Einladung an.')
        return
      }

      const payload = decodeJwtPayload(accessToken)
      const userMeta = payload?.user_metadata as Record<string, unknown> | undefined
      const tenantId = typeof userMeta?.tenant_id === 'string' ? userMeta.tenant_id : null

      if (!tenantId) {
        setError('Kein Tenant in Token gefunden. Bitte fordere eine neue Einladung an.')
        return
      }

      const res = await fetch(`/api/portal/tenant-lookup?tenantId=${encodeURIComponent(tenantId)}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        setError(`Tenant konnte nicht ermittelt werden (${res.status}: ${body.error ?? 'Unbekannter Fehler'}). Tenant-ID: ${tenantId}`)
        return
      }

      const { slug } = await res.json() as { slug: string }

      const isLocal = window.location.hostname === 'localhost' || window.location.hostname.endsWith('.localhost')
      const targetOrigin = isLocal
        ? `http://${slug}.localhost:${window.location.port || 3000}`
        : `https://${slug}.${ROOT_DOMAIN}`

      window.location.href = `${targetOrigin}/portal/auth/callback#${hash}`
    }

    void relay()
  }, [])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <XCircle className="h-10 w-10 text-red-500" />
          <p className="text-sm font-medium text-slate-700">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">Weiterleitung zum Portal…</p>
      </div>
    </div>
  )
}
