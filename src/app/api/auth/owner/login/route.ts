import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'
import { LoginSchema } from '@/lib/schemas/auth'

/**
 * POST /api/auth/owner/login
 *
 * Owner-Login: Authentifiziert via Supabase Auth und prueft,
 * ob der User in der platform_admins-Tabelle steht.
 *
 * Gibt bei JEDEM Fehler die gleiche generische Meldung zurueck.
 */
export async function POST(request: NextRequest) {
  const GENERIC_ERROR = 'Ungueltige Zugangsdaten.'

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

  // 3. Supabase Auth: Credentials pruefen
  const supabase = await createClient()
  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({ email, password })

  if (authError || !authData.user) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 })
  }

  // 4. Owner-Status pruefen (Admin-Client, da RLS nur eigenen Eintrag zeigt
  // und wir sicher sein muessen)
  const supabaseAdmin = createAdminClient()
  const { data: admin, error: adminError } = await supabaseAdmin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', authData.user.id)
    .single()

  if (adminError || !admin) {
    // User existiert, ist aber kein Owner -> Logout + generischer Fehler
    await supabase.auth.signOut()
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 })
  }

  // 5. Erfolg — Session-Cookie wurde bereits von Supabase SSR gesetzt
  return NextResponse.json({
    user: {
      id: authData.user.id,
      email: authData.user.email,
      role: 'owner',
    },
  })
}
