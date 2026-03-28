import { NextRequest, NextResponse } from 'next/server'
import { logAudit, logOperationalError, logSecurity } from '@/lib/observability'
import { createClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'
import { LoginSchema } from '@/lib/schemas/auth'
import { checkRateLimit, getClientIp, rateLimitResponse, AUTH_OWNER_LOGIN } from '@/lib/rate-limit'

/**
 * POST /api/auth/owner/login
 *
 * Owner-Login: Authentifiziert via Supabase Auth und prüft,
 * ob der User in der platform_admins-Tabelle steht.
 *
 * Gibt bei JEDEM Fehler die gleiche generische Meldung zurück.
 */
export async function POST(request: NextRequest) {
  const GENERIC_ERROR = 'Ungültige Zugangsdaten.'

  // Rate Limiting: 5 requests / 15 min / IP (stricter for owner)
  const ip = getClientIp(request)
  const rl = checkRateLimit(`auth-owner-login:${ip}`, AUTH_OWNER_LOGIN)
  if (!rl.allowed) {
    logSecurity('owner_login_rate_limited', { ip })
    return rateLimitResponse(rl)
  }

  // 1. Request-Body parsen
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 })
  }

  // 2. Input mit Zod validieren
  const parsed = LoginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: GENERIC_ERROR, details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { email, password } = parsed.data

  // 3. Supabase Auth: Credentials prüfen
  const supabase = await createClient()
  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({ email, password })

  if (authError || !authData.user) {
    logSecurity('owner_login_invalid_credentials', { email })
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 })
  }

  // 4. Owner-Status prüfen.
  // Der eingeloggte User darf dank RLS seinen eigenen platform_admins-Eintrag
  // selbst lesen, daher brauchen wir hier keinen service-role Client.
  const { data: admin, error: adminError } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', authData.user.id)
    .single()

  if (adminError || !admin) {
    logSecurity('owner_login_non_owner_blocked', {
      userId: authData.user.id,
      email,
      adminError: adminError?.message ?? null,
    })
    // User existiert, ist aber kein Owner -> Logout + generischer Fehler
    await supabase.auth.signOut()
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 })
  }

  // 5. Owner-Claims best effort aktualisieren.
  // Die echte Autorisierung für den Owner-Bereich laeuft serverseitig über
  // platform_admins. Wenn Claim-Update oder Session-Refresh in Produktion
  // fehlschlagen, soll der Login deshalb nicht komplett blockiert werden.
  try {
    const supabaseAdmin = createAdminClient()
    const mergedAppMetadata = {
      ...(authData.user.app_metadata ?? {}),
      role: 'owner',
      tenant_id: null,
    }

    const { error: claimError } = await supabaseAdmin.auth.admin.updateUserById(authData.user.id, {
      app_metadata: mergedAppMetadata,
    })

    if (claimError) {
      logOperationalError('owner_login_claim_update_failed', claimError, {
        userId: authData.user.id,
        email,
      })
    } else {
      const { error: refreshError } = await supabase.auth.refreshSession()
      if (refreshError) {
        logOperationalError('owner_login_session_refresh_failed', refreshError, {
          userId: authData.user.id,
          email,
        })
      }
    }
  } catch (claimSetupError) {
    logOperationalError('owner_login_claim_setup_unavailable', claimSetupError, {
      userId: authData.user.id,
      email,
    })
  }

  // 6. Erfolg — Session-Cookie wurde bereits von Supabase SSR gesetzt
  logAudit('owner_login_succeeded', {
    userId: authData.user.id,
    email: authData.user.email,
  })
  return NextResponse.json({
    user: {
      id: authData.user.id,
      email: authData.user.email,
      role: 'owner',
    },
  })
}
