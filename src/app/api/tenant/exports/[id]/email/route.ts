/**
 * PROJ-55: POST /api/tenant/exports/[id]/email
 *
 * Downloads the export file from Storage and sends it via Mailtrap
 * as an email attachment to the specified recipient.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { sendExportDelivery } from '@/lib/email'
import { checkRateLimit, getClientIp, rateLimitResponse, EXPORTS_EMAIL } from '@/lib/rate-limit'

const idSchema = z.string().uuid('Ungültige Export-ID.')

const emailBodySchema = z.object({
  to: z.string().email('Ungültige E-Mail-Adresse.').optional(),
  email: z.string().email('Ungültige E-Mail-Adresse.').optional(),
  message: z.string().max(1000, 'Nachricht zu lang.').optional().nullable(),
}).refine((value) => Boolean(value.to ?? value.email), {
  message: 'Ungültige E-Mail-Adresse.',
})

const FORMAT_LABELS: Record<string, string> = {
  pdf: 'PDF',
  png: 'PNG',
  xlsx: 'XLSX',
}

const TYPE_LABELS: Record<string, string> = {
  keyword_rankings: 'Keyword Rankings',
  marketing_dashboard: 'Marketing Dashboard',
  gsc_discovery: 'GSC Discovery',
  customer_report: 'Kundenbericht',
}

const MIME_BY_FORMAT: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`exports-email:${tenantId}:${getClientIp(request)}`, EXPORTS_EMAIL)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const { id } = await params
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: parsedId.error.issues[0]?.message }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsedBody = emailBodySchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: parsedBody.error.issues[0]?.message ?? 'Ungültige Parameter.' },
      { status: 400 }
    )
  }

  const to = parsedBody.data.to ?? parsedBody.data.email ?? ''
  const { message } = parsedBody.data

  const admin = createAdminClient()

  // Load export record
  const { data: exportRecord, error: fetchError } = await admin
    .from('exports')
    .select(
      'id, export_type, format, status, storage_path, file_name, customer_id, tenant_id'
    )
    .eq('id', parsedId.data)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (fetchError || !exportRecord) {
    return NextResponse.json({ error: 'Export nicht gefunden.' }, { status: 404 })
  }

  if (exportRecord.status !== 'done' || !exportRecord.storage_path || !exportRecord.file_name) {
    return NextResponse.json(
      { error: 'Export ist nicht verfügbar. Status muss "done" sein.' },
      { status: 409 }
    )
  }

  // Load tenant info for branding
  const { data: tenant } = await admin
    .from('tenants')
    .select('name, slug')
    .eq('id', tenantId)
    .maybeSingle()

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
  }

  // Download the file from Storage
  const { data: fileData, error: downloadError } = await admin.storage
    .from('exports')
    .download(exportRecord.storage_path)

  if (downloadError || !fileData) {
    console.error('[POST /exports/[id]/email] Download fehlgeschlagen:', downloadError)
    return NextResponse.json(
      { error: 'Datei konnte nicht geladen werden. Bitte erstelle den Export erneut.' },
      { status: 410 }
    )
  }

  const fileBuffer = Buffer.from(await fileData.arrayBuffer())

  // Send email
  try {
    await sendExportDelivery({
      to,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      exportTypeLabel: TYPE_LABELS[exportRecord.export_type] ?? exportRecord.export_type,
      formatLabel: FORMAT_LABELS[exportRecord.format] ?? exportRecord.format.toUpperCase(),
      customMessage: message ?? null,
      fileBuffer,
      fileName: exportRecord.file_name,
      mimeType: MIME_BY_FORMAT[exportRecord.format] ?? 'application/octet-stream',
    })
  } catch (emailError) {
    console.error('[POST /exports/[id]/email] E-Mail-Versand fehlgeschlagen:', emailError)
    return NextResponse.json({ error: 'E-Mail-Versand fehlgeschlagen.' }, { status: 500 })
  }

  // Update export record with email info
  const { data: updated, error: updateError } = await admin
    .from('exports')
    .update({ email_sent_at: new Date().toISOString(), email_sent_to: to })
    .eq('id', parsedId.data)
    .select(
      'id, export_type, format, customer_id, branding_source, brand_color, status, error_message, created_at, email_sent_at, email_sent_to, customers(name)'
    )
    .single()

  if (updateError || !updated) {
    // Email was sent successfully, just couldn't update the record
    console.warn('[POST /exports/[id]/email] Verlaufs-Update fehlgeschlagen:', updateError)
  }

  return NextResponse.json({
    export: updated
      ? {
          ...(updated as typeof updated & { customers?: { name: string } | null }),
          type: updated.export_type,
          customer_name: (updated as typeof updated & { customers?: { name: string } | null }).customers?.name ?? null,
        }
      : null,
  })
}
