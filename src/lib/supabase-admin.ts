import { createClient } from '@supabase/supabase-js'

/**
 * Supabase Admin Client (Service Role)
 *
 * ACHTUNG: Dieser Client umgeht Row Level Security!
 * Nur server-seitig verwenden — niemals im Client-Bundle importieren.
 *
 * Verwendung: Auth-User erstellen, privilegierte DB-Operationen
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen als Umgebungsvariablen gesetzt sein.'
    )
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
