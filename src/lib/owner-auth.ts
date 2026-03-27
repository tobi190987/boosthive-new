import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

/**
 * Prueft ob der aktuelle Request von einem authentifizierten Owner (platform_admin) kommt.
 *
 * Gibt bei Erfolg die user_id zurueck.
 * Gibt bei Fehler eine NextResponse mit 401/403 zurueck.
 */
export async function requireOwner(): Promise<
  { userId: string } | { error: NextResponse }
> {
  const supabase = await createClient()

  // 1. Session pruefen
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      error: NextResponse.json(
        { error: 'Nicht authentifiziert. Bitte einloggen.' },
        { status: 401 }
      ),
    }
  }

  // 2. Owner-Status pruefen (RLS filtert automatisch auf auth.uid())
  const { data: admin, error: adminError } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .single()

  if (adminError || !admin) {
    return {
      error: NextResponse.json(
        { error: 'Zugriff verweigert. Nur Plattform-Owner haben Zugang.' },
        { status: 403 }
      ),
    }
  }

  return { userId: user.id }
}
