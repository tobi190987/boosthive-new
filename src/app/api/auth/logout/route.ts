import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

/**
 * POST /api/auth/logout
 *
 * Invalidiert die Supabase-Session serverseitig und loescht die Cookies.
 */
export async function POST() {
  const supabase = await createClient()
  await supabase.auth.getUser()
  await supabase.auth.signOut()

  return NextResponse.json({ success: true })
}
