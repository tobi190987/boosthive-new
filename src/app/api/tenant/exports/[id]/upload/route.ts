/**
 * PROJ-55: POST /api/tenant/exports/[id]/upload
 *
 * Receives a PNG blob from the client (html-to-image capture) and stores it
 * in Supabase Storage. Updates the export record to status "done".
 *
 * Expected request: multipart/form-data with field "file" (PNG blob).
 * The export record must exist with status "pending" and format "png".
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { recordTenantDataAuditLog } from '@/lib/tenant-data-audit'
import { checkRateLimit, getClientIp, rateLimitResponse, EXPORTS_CREATE } from '@/lib/rate-limit'

const idSchema = z.string().uuid('Ungültige Export-ID.')
const MAX_PNG_SIZE = 20 * 1024 * 1024  // 20 MB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`exports-create:${tenantId}:${getClientIp(request)}`, EXPORTS_CREATE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const { id } = await params
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: parsedId.error.issues[0]?.message }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: exportRecord, error: fetchError } = await admin
    .from('exports')
    .select('id, tenant_id, format, export_type, customer_id, status')
    .eq('id', parsedId.data)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (fetchError || !exportRecord) {
    return NextResponse.json({ error: 'Export nicht gefunden.' }, { status: 404 })
  }

  if (exportRecord.format !== 'png') {
    return NextResponse.json({ error: 'Dieser Export erwartet kein PNG.' }, { status: 400 })
  }

  if (exportRecord.status === 'done') {
    return NextResponse.json({ error: 'Export wurde bereits hochgeladen.' }, { status: 409 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Ungültige FormData.' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Kein PNG hochgeladen. Feld "file" fehlt.' }, { status: 400 })
  }

  if (file.type !== 'image/png') {
    return NextResponse.json({ error: 'Nur PNG-Dateien erlaubt.' }, { status: 400 })
  }

  if (file.size > MAX_PNG_SIZE) {
    return NextResponse.json({ error: 'PNG zu groß. Maximal 20 MB erlaubt.' }, { status: 400 })
  }

  const date = new Date().toISOString().slice(0, 10)
  const fileName = `${exportRecord.export_type.replace(/_/g, '-')}_${date}.png`
  const storagePath = `${tenantId}/${Date.now()}-${fileName}`

  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await admin.storage
    .from('exports')
    .upload(storagePath, arrayBuffer, {
      contentType: 'image/png',
      upsert: false,
    })

  if (uploadError) {
    console.error('[POST /exports/[id]/upload] Upload fehlgeschlagen:', uploadError)
    return NextResponse.json({ error: 'PNG-Upload fehlgeschlagen.' }, { status: 500 })
  }

  const { error: updateError } = await admin
    .from('exports')
    .update({ status: 'done', storage_path: storagePath, file_name: fileName })
    .eq('id', parsedId.data)

  if (updateError) {
    console.error('[POST /exports/[id]/upload] Update fehlgeschlagen:', updateError)
    return NextResponse.json({ error: 'Export-Status konnte nicht aktualisiert werden.' }, { status: 500 })
  }

  const { data: updated, error: refetchError } = await admin
    .from('exports')
    .select(
      'id, export_type, format, customer_id, branding_source, brand_color, status, error_message, created_at, email_sent_at, email_sent_to, customers(name)'
    )
    .eq('id', parsedId.data)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (refetchError || !updated) {
    console.error('[POST /exports/[id]/upload] Refetch fehlgeschlagen:', refetchError)
    return NextResponse.json({ error: 'Aktualisierter Export konnte nicht geladen werden.' }, { status: 500 })
  }

  await recordTenantDataAuditLog({
    tenantId,
    actorUserId: authResult.auth.userId,
    actionType: 'data_export',
    resourceType: `export_${exportRecord.export_type}`,
    resourceId: parsedId.data,
    context: { format: 'png', file_name: fileName },
  })

  return NextResponse.json({
    export: {
      ...(updated as typeof updated & { customers?: { name: string } | null }),
      type: updated.export_type,
      customer_name: (updated as typeof updated & { customers?: { name: string } | null }).customers?.name ?? null,
    },
  })
}
