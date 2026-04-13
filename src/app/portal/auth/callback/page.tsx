'use client'

import { useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase-browser'
import { Loader2 } from 'lucide-react'

/**
 * /portal/auth/callback
 *
 * Handles the Supabase inviteUserByEmail redirect.
 * Supabase uses the old implicit flow for invites — it appends tokens as a
 * URL hash fragment (#access_token=...&refresh_token=...) which never reaches
 * the server. This client-side page reads the hash, sets the session, and calls
 * /api/portal/auth/finalize to promote user_metadata → app_metadata.
 *
 * Magic-link OTP logins (signInWithOtp / PKCE flow) continue to use
 * /api/portal/auth/callback which handles the ?token_hash= query param server-side.
 */
export default function PortalAuthCallbackPage() {
  useEffect(() => {
    async function handleInviteCallback() {
      const hash = window.location.hash.substring(1)
      const params = new URLSearchParams(hash)
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')

      if (!accessToken || !refreshToken) {
        window.location.href = '/portal/login?error=missing_token'
        return
      }

      const supabase = createBrowserClient()

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })

      if (sessionError) {
        window.location.href = '/portal/login?error=invalid_token'
        return
      }

      // Promote user_metadata (set by invite) → app_metadata (used by requirePortalUser)
      const res = await fetch('/api/portal/auth/finalize', { method: 'POST' })

      if (!res.ok) {
        await supabase.auth.signOut()
        window.location.href = '/portal/login?error=no_access'
        return
      }

      window.location.href = '/portal/dashboard'
    }

    void handleInviteCallback()
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-background">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">Einloggen…</p>
      </div>
    </div>
  )
}
