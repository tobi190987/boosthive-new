import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'
import { LoginSchema } from '@/lib/schemas/auth'

/**
 * POST /api/auth/login
 *
 * Tenant-Login: Authentifiziert einen User via Supabase Auth und prüft,
 * ob er Mitglied des aktuellen Tenants ist (aktiv, nicht inaktiv).
 *
 * Gibt bei JEDEM Fehler die gleiche generische Meldung zurück,
 * um Information Leakage zu verhindern (SEC).
 */
export async function POST(request: NextRequest) {
  const GENERIC_ERROR = 'Ungültige Zugangsdaten.'

  // 1. Tenant-ID aus Header lesen (vom Proxy injiziert)
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 })
  }

  // 2. Request-Body parsen
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 })
  }

  // 3. Input mit Zod validieren
  const parsed = LoginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: GENERIC_ERROR, details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { email, password } = parsed.data

  // 3.5 Tenant-Status prüfen: inaktive Tenants duerfen keine neuen Logins akzeptieren
  const supabaseAdmin = createAdminClient()
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select('id, status')
    .eq('id', tenantId)
    .maybeSingle()

  if (tenantError || !tenant || tenant.status !== 'active') {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 })
  }

  // 4. Supabase Auth: Credentials prüfen
  const supabase = await createClient()
  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({ email, password })

  if (authError || !authData.user) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 })
  }

  // 5. Tenant-Membership prüfen (mit Admin-Client, da RLS zu restriktiv ist
  // für die Mitgliedschaftsprüfung eines gerade eingeloggten Users)
  const { data: membership, error: memberError } = await supabaseAdmin
    .from('tenant_members')
    .select('id, role, status')
    .eq('user_id', authData.user.id)
    .eq('tenant_id', tenantId)
    .single()

  if (memberError || !membership) {
    // User existiert, ist aber kein Mitglied dieses Tenants -> Logout + generischer Fehler
    await supabase.auth.signOut()
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 })
  }

  // 6. Status prüfen (inaktive Accounts -> generischer Fehler, kein Info Leak)
  if (membership.status !== 'active') {
    await supabase.auth.signOut()
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 })
  }

  // 7. JWT Custom Claims setzen (tenant_id + role für sicheren Proxy-Check)
  const { error: claimError } = await supabaseAdmin.auth.admin.updateUserById(authData.user.id, {
    app_metadata: { tenant_id: tenantId, role: membership.role },
  })
  if (claimError) {
    console.error('[POST /api/auth/login] Claim-Update fehlgeschlagen:', claimError)
    await supabase.auth.signOut()
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
  }

  // Session neu erstellen damit neue Claims sofort im JWT enthalten sind
  const { error: refreshError } = await supabase.auth.refreshSession()
  if (refreshError) {
    console.error('[POST /api/auth/login] Session-Refresh fehlgeschlagen:', refreshError)
    await supabase.auth.signOut()
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
  }

  // 8. Erfolg — Session-Cookie wurde bereits von Supabase SSR gesetzt
  return NextResponse.json({
    user: {
      id: authData.user.id,
      email: authData.user.email,
      role: membership.role,
    },
  })
}
