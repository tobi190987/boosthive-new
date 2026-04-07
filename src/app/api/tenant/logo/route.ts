import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { recordTenantDataAuditLog } from '@/lib/tenant-data-audit'

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
const MAX_FILE_SIZE = 2 * 1024 * 1024

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

async function clearTenantLogoFiles(tenantId: string) {
  const supabaseAdmin = createAdminClient()
  const { data: existingFiles, error: listError } = await supabaseAdmin.storage
    .from('tenant-logos')
    .list(tenantId)

  if (listError || !existingFiles || existingFiles.length === 0) {
    return
  }

  const filePaths = existingFiles.map((file) => `${tenantId}/${file.name}`)
  await supabaseAdmin.storage.from('tenant-logos').remove(filePaths)
}

export async function POST(request: NextRequest) {
  const tenantIdFromHeader = request.headers.get('x-tenant-id')
  if (!tenantIdFromHeader) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const authResult = await requireTenantAdmin(tenantIdFromHeader)
  if ('error' in authResult) return authResult.error
  const tenantId = authResult.auth.tenantId ?? tenantIdFromHeader

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Ungültige FormData.' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Kein Bild hochgeladen. Feld "file" fehlt.' }, { status: 400 })
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Ungültiger Dateityp: ${file.type}. Erlaubt: PNG, JPEG, WebP, SVG.` },
      { status: 400 }
    )
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Datei zu groß. Maximal 2 MB erlaubt.' }, { status: 400 })
  }

  const supabaseAdmin = createAdminClient()
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .maybeSingle()

  if (tenantError) {
    console.error('[POST /api/tenant/logo] Tenant-Lookup fehlgeschlagen:', tenantError)
    return NextResponse.json({ error: 'Tenant konnte nicht geladen werden.' }, { status: 500 })
  }

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
  }

  await clearTenantLogoFiles(tenantId)

  const ext = MIME_TO_EXT[file.type] ?? 'png'
  const filePath = `${tenantId}/${Date.now()}.${ext}`
  const arrayBuffer = await file.arrayBuffer()

  const { error: uploadError } = await supabaseAdmin.storage
    .from('tenant-logos')
    .upload(filePath, arrayBuffer, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    console.error('[POST /api/tenant/logo] Upload fehlgeschlagen:', uploadError)
    return NextResponse.json({ error: 'Logo-Upload fehlgeschlagen.' }, { status: 500 })
  }

  const { data: publicUrlData } = supabaseAdmin.storage.from('tenant-logos').getPublicUrl(filePath)
  const logoUrl = publicUrlData.publicUrl

  const { error: updateError } = await supabaseAdmin
    .from('tenants')
    .update({ logo_url: logoUrl })
    .eq('id', tenantId)

  if (updateError) {
    console.error('[POST /api/tenant/logo] logo_url Update fehlgeschlagen:', updateError)
    return NextResponse.json({ error: 'Logo-URL konnte nicht gespeichert werden.' }, { status: 500 })
  }

  return NextResponse.json({ logoUrl })
}

export async function DELETE(request: NextRequest) {
  const tenantIdFromHeader = request.headers.get('x-tenant-id')
  if (!tenantIdFromHeader) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const authResult = await requireTenantAdmin(tenantIdFromHeader)
  if ('error' in authResult) return authResult.error
  const tenantId = authResult.auth.tenantId ?? tenantIdFromHeader

  const supabaseAdmin = createAdminClient()
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .maybeSingle()

  if (tenantError) {
    console.error('[DELETE /api/tenant/logo] Tenant-Lookup fehlgeschlagen:', tenantError)
    return NextResponse.json({ error: 'Tenant konnte nicht geladen werden.' }, { status: 500 })
  }

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
  }

  await clearTenantLogoFiles(tenantId)

  const { error: updateError } = await supabaseAdmin
    .from('tenants')
    .update({ logo_url: null })
    .eq('id', tenantId)

  if (updateError) {
    console.error('[DELETE /api/tenant/logo] logo_url Reset fehlgeschlagen:', updateError)
    return NextResponse.json({ error: 'Logo-URL konnte nicht zurückgesetzt werden.' }, { status: 500 })
  }

  await recordTenantDataAuditLog({
    tenantId,
    actorUserId: authResult.auth.userId,
    actionType: 'data_delete',
    resourceType: 'tenant_logo',
  })

  return NextResponse.json({ success: true })
}
