import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

/**
 * POST /api/portal/auth/logout
 *
 * Signs out the portal user and invalidates the session cookie.
 */
export async function POST() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.json({ success: true })
}
