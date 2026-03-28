import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/owner-auth'
import { createAdminClient } from '@/lib/supabase-admin'

const PROFILE_AVATAR_BUCKET = 'profile-avatars'
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
const MIME_TO_EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
}
const MAX_FILE_SIZE = 2 * 1024 * 1024

async function clearExistingAvatarFiles(userId: string) {
  const supabaseAdmin = createAdminClient()
  const { data: existingFiles, error: listError } = await supabaseAdmin.storage
    .from(PROFILE_AVATAR_BUCKET)
    .list(userId)

  if (listError || !existingFiles || existingFiles.length === 0) {
    return
  }

  const paths = existingFiles.map((file) => `${userId}/${file.name}`)
  await supabaseAdmin.storage.from(PROFILE_AVATAR_BUCKET).remove(paths)
}

export async function POST(request: NextRequest) {
  const auth = await requireOwner()
  if ('error' in auth) return auth.error

  const formData = await request.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Bitte waehle ein Bild aus.' }, { status: 400 })
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Erlaubt sind PNG, JPG und WEBP bis 2 MB.' },
      { status: 400 }
    )
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Das Bild darf maximal 2 MB gross sein.' }, { status: 400 })
  }

  const extension = MIME_TO_EXTENSION[file.type]
  const filePath = `${auth.userId}/avatar-${Date.now()}.${extension}`
  const arrayBuffer = await file.arrayBuffer()
  const supabaseAdmin = createAdminClient()
  const { data: existingProfile } = await supabaseAdmin
    .from('user_profiles')
    .select('first_name, last_name')
    .eq('user_id', auth.userId)
    .maybeSingle()

  await clearExistingAvatarFiles(auth.userId)

  const { error: uploadError } = await supabaseAdmin.storage
    .from(PROFILE_AVATAR_BUCKET)
    .upload(filePath, arrayBuffer, {
      contentType: file.type,
      upsert: true,
    })

  if (uploadError) {
    console.error('[POST /api/owner/profile/avatar] Upload fehlgeschlagen:', uploadError)
    return NextResponse.json({ error: 'Profilbild konnte nicht hochgeladen werden.' }, { status: 500 })
  }

  const { data: publicUrlData } = supabaseAdmin.storage
    .from(PROFILE_AVATAR_BUCKET)
    .getPublicUrl(filePath)

  const { error: updateError } = await supabaseAdmin.from('user_profiles').upsert({
    user_id: auth.userId,
    first_name: existingProfile?.first_name ?? null,
    last_name: existingProfile?.last_name ?? null,
    avatar_url: publicUrlData.publicUrl,
  })

  if (updateError) {
    console.error('[POST /api/owner/profile/avatar] Profilbild konnte nicht gespeichert werden:', updateError)
    return NextResponse.json({ error: 'Profilbild konnte nicht gespeichert werden.' }, { status: 500 })
  }

  return NextResponse.json({ avatar_url: publicUrlData.publicUrl })
}

export async function DELETE() {
  const auth = await requireOwner()
  if ('error' in auth) return auth.error

  const supabaseAdmin = createAdminClient()
  const { data: existingProfile } = await supabaseAdmin
    .from('user_profiles')
    .select('first_name, last_name')
    .eq('user_id', auth.userId)
    .maybeSingle()

  await clearExistingAvatarFiles(auth.userId)

  const { error: updateError } = await supabaseAdmin.from('user_profiles').upsert({
    user_id: auth.userId,
    first_name: existingProfile?.first_name ?? null,
    last_name: existingProfile?.last_name ?? null,
    avatar_url: null,
  })

  if (updateError) {
    console.error('[DELETE /api/owner/profile/avatar] Profilbild konnte nicht entfernt werden:', updateError)
    return NextResponse.json({ error: 'Profilbild konnte nicht entfernt werden.' }, { status: 500 })
  }

  return NextResponse.json({ avatar_url: null })
}
