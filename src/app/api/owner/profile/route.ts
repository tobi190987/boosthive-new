import { NextRequest, NextResponse } from 'next/server'
import { BaseProfileSchema } from '@/lib/schemas/profile'
import { requireOwner } from '@/lib/owner-auth'
import { createAdminClient } from '@/lib/supabase-admin'

export async function PUT(request: NextRequest) {
  const auth = await requireOwner()
  if ('error' in auth) return auth.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültige Eingabedaten.' }, { status: 400 })
  }

  const parsed = BaseProfileSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Bitte pruefe deine Eingaben.', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const supabaseAdmin = createAdminClient()
  const { data: existingProfile } = await supabaseAdmin
    .from('user_profiles')
    .select('avatar_url')
    .eq('user_id', auth.userId)
    .maybeSingle()

  const { error } = await supabaseAdmin.from('user_profiles').upsert({
    user_id: auth.userId,
    first_name: parsed.data.first_name,
    last_name: parsed.data.last_name,
    avatar_url: existingProfile?.avatar_url ?? null,
  })

  if (error) {
    console.error('[PUT /api/owner/profile] Profil konnte nicht gespeichert werden:', error)
    return NextResponse.json({ error: 'Profil konnte nicht gespeichert werden.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
