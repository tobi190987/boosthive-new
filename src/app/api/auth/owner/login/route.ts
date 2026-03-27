import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'
import { LoginSchema } from '@/lib/schemas/auth'

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
      console.error('[POST /api/auth/owner/login] Claim-Update fehlgeschlagen:', claimError)
    } else {
      const { error: refreshError } = await supabase.auth.refreshSession()
      if (refreshError) {
        console.error('[POST /api/auth/owner/login] Session-Refresh fehlgeschlagen:', refreshError)
      }
    }
  } catch (claimSetupError) {
    console.error('[POST /api/auth/owner/login] Admin-Client für Claim-Setup nicht verfügbar:', claimSetupError)
  }

  // 6. Erfolg — Session-Cookie wurde bereits von Supabase SSR gesetzt
  return NextResponse.json({
    user: {
      id: authData.user.id,
      email: authData.user.email,
      role: 'owner',
    },
  })
}
