import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/owner-auth'
import { createAdminClient } from '@/lib/supabase-admin'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: string) {
  return UUID_REGEX.test(value)
}

const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
]

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2 MB

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOwner()
  if ('error' in auth) return auth.error

  const { id } = await params
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Ungültige Tenant-ID.' }, { status: 400 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Ungültige FormData.' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Kein Bild hochgeladen. Feld "file" fehlt.' }, { status: 400 })
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Ungültiger Dateityp: ${file.type}. Erlaubt: PNG, JPEG, WebP, SVG.` },
      { status: 400 }
    )
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: 'Datei zu groß. Maximal 2 MB erlaubt.' },
      { status: 400 }
    )
  }

  const supabaseAdmin = createAdminClient()

  // Verify tenant exists
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('id', id)
    .maybeSingle()

  if (tenantError) {
    console.error('[POST /api/owner/tenants/[id]/logo] Tenant-Lookup fehlgeschlagen:', tenantError)
    return NextResponse.json({ error: 'Tenant konnte nicht geladen werden.' }, { status: 500 })
  }

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
  }

  // Delete existing logos for this tenant
  const { data: existingFiles, error: listError } = await supabaseAdmin.storage
    .from('tenant-logos')
    .list(id)

  if (listError) {
    console.error('[POST /api/owner/tenants/[id]/logo] Bestehende Logos konnten nicht aufgelistet werden:', listError)
  } else if (existingFiles && existingFiles.length > 0) {
    const filePaths = existingFiles.map((f) => `${id}/${f.name}`)
    const { error: deleteError } = await supabaseAdmin.storage
      .from('tenant-logos')
      .remove(filePaths)

    if (deleteError) {
      console.error('[POST /api/owner/tenants/[id]/logo] Bestehende Logos konnten nicht geloescht werden:', deleteError)
    }
  }

  // Upload new logo
  const ext = MIME_TO_EXT[file.type] ?? 'png'
  const filePath = `${id}/${Date.now()}.${ext}`
  const arrayBuffer = await file.arrayBuffer()

  const { error: uploadError } = await supabaseAdmin.storage
    .from('tenant-logos')
    .upload(filePath, arrayBuffer, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    console.error('[POST /api/owner/tenants/[id]/logo] Upload fehlgeschlagen:', uploadError)
    return NextResponse.json({ error: 'Logo-Upload fehlgeschlagen.' }, { status: 500 })
  }

  // Get public URL
  const { data: publicUrlData } = supabaseAdmin.storage
    .from('tenant-logos')
    .getPublicUrl(filePath)

  const logoUrl = publicUrlData.publicUrl

  // Save URL to tenants table
  const { error: updateError } = await supabaseAdmin
    .from('tenants')
    .update({ logo_url: logoUrl })
    .eq('id', id)

  if (updateError) {
    console.error('[POST /api/owner/tenants/[id]/logo] logo_url Update fehlgeschlagen:', updateError)
    return NextResponse.json({ error: 'Logo-URL konnte nicht gespeichert werden.' }, { status: 500 })
  }

  return NextResponse.json({ logoUrl })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOwner()
  if ('error' in auth) return auth.error

  const { id } = await params
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Ungültige Tenant-ID.' }, { status: 400 })
  }

  const supabaseAdmin = createAdminClient()

  // Verify tenant exists
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('id', id)
    .maybeSingle()

  if (tenantError) {
    console.error('[DELETE /api/owner/tenants/[id]/logo] Tenant-Lookup fehlgeschlagen:', tenantError)
    return NextResponse.json({ error: 'Tenant konnte nicht geladen werden.' }, { status: 500 })
  }

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
  }

  // Delete all files in the tenant's logo folder
  const { data: existingFiles, error: listError } = await supabaseAdmin.storage
    .from('tenant-logos')
    .list(id)

  if (listError) {
    console.error('[DELETE /api/owner/tenants/[id]/logo] Logos konnten nicht aufgelistet werden:', listError)
    return NextResponse.json({ error: 'Logo-Dateien konnten nicht aufgelistet werden.' }, { status: 500 })
  }

  if (existingFiles && existingFiles.length > 0) {
    const filePaths = existingFiles.map((f) => `${id}/${f.name}`)
    const { error: deleteError } = await supabaseAdmin.storage
      .from('tenant-logos')
      .remove(filePaths)

    if (deleteError) {
      console.error('[DELETE /api/owner/tenants/[id]/logo] Logo-Dateien konnten nicht geloescht werden:', deleteError)
      return NextResponse.json({ error: 'Logo-Dateien konnten nicht geloescht werden.' }, { status: 500 })
    }
  }

  // Set logo_url to null
  const { error: updateError } = await supabaseAdmin
    .from('tenants')
    .update({ logo_url: null })
    .eq('id', id)

  if (updateError) {
    console.error('[DELETE /api/owner/tenants/[id]/logo] logo_url Reset fehlgeschlagen:', updateError)
    return NextResponse.json({ error: 'Logo-URL konnte nicht zurückgesetzt werden.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
