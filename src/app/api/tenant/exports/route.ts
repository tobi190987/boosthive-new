/**
 * PROJ-55: Reporting & Export Center
 *
 * GET  /api/tenant/exports  — list last 50 exports for the tenant
 * POST /api/tenant/exports  — create + generate a new export
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { recordTenantDataAuditLog } from '@/lib/tenant-data-audit'
import {
  createPendingMarketingDashboardPngExport,
  generateExportFile,
  MIME_BY_FORMAT,
  TYPE_FORMAT_ALLOWED,
  TYPE_LABELS,
} from '@/lib/export-service'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  EXPORTS_READ,
  EXPORTS_CREATE,
} from '@/lib/rate-limit'

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createExportSchema = z.object({
  type: z.enum(['keyword_rankings', 'marketing_dashboard', 'gsc_discovery', 'customer_report']),
  format: z.enum(['pdf', 'png', 'xlsx']),
  customer_id: z.string().uuid().nullable().optional(),
  branding_source: z.enum(['tenant', 'customer']).default('tenant'),
  brand_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Ungültige Hex-Farbe.')
    .default('#2563eb'),
  acknowledge_empty: z.boolean().default(false),
})

type ExportType = z.infer<typeof createExportSchema>['type']
type ExportFormat = z.infer<typeof createExportSchema>['format']

function isStaleInProgressExport(status: string, createdAt: string, now = Date.now()) {
  if (status !== 'pending' && status !== 'generating') return false

  const createdAtMs = new Date(createdAt).getTime()
  if (Number.isNaN(createdAtMs)) return false

  return now - createdAtMs > 2 * 60 * 1000
}

// ─── GET /api/tenant/exports ──────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`exports-read:${tenantId}:${getClientIp(request)}`, EXPORTS_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const admin = createAdminClient()

  const staleThreshold = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const { error: staleUpdateError } = await admin
    .from('exports')
    .update({
      status: 'failed',
      error_message: 'Export wurde nicht abgeschlossen.',
    })
    .eq('tenant_id', tenantId)
    .in('status', ['pending', 'generating'])
    .lt('created_at', staleThreshold)

  if (staleUpdateError) {
    console.error('[GET /api/tenant/exports] Stale-Exports konnten nicht aktualisiert werden:', staleUpdateError)
  }

  const { data, error } = await admin
    .from('exports')
    .select(
      'id, export_type, format, customer_id, branding_source, brand_color, status, error_message, created_at, email_sent_at, email_sent_to, customers(name)'
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[GET /api/tenant/exports] DB-Fehler:', error)
    return NextResponse.json({ error: 'Export-Verlauf konnte nicht geladen werden.' }, { status: 500 })
  }

  const now = Date.now()
  const exports = (data ?? [])
    .filter((row) => !isStaleInProgressExport(row.status, row.created_at, now))
    .map((row) => {
    const { customers: customerRel, ...rest } = row as typeof row & { customers: { name: string } | null }
    return {
      ...rest,
      type: rest.export_type,
      customer_name: customerRel?.name ?? null,
    }
    })

  return NextResponse.json({ exports })
}

// ─── POST /api/tenant/exports ─────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`exports-create:${tenantId}:${getClientIp(request)}`, EXPORTS_CREATE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = createExportSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Ungültige Parameter.' },
      { status: 400 }
    )
  }

  const { type, format, customer_id, branding_source, brand_color, acknowledge_empty } = parsed.data

  // Validate format is allowed for this type
  if (!TYPE_FORMAT_ALLOWED[type].includes(format)) {
    return NextResponse.json(
      { error: `Format ${format} ist für ${TYPE_LABELS[type]} nicht erlaubt.` },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  try {
    if (format === 'png') {
      const prepared = await createPendingMarketingDashboardPngExport({
        admin,
        tenantId,
        createdByUserId: authResult.auth.userId,
        customerId: customer_id ?? null,
        brandingSource: branding_source,
        brandColor: brand_color,
        acknowledgeEmpty: acknowledge_empty,
      })

      return NextResponse.json(prepared)
    }

    const generated = await generateExportFile({
      admin,
      tenantId,
      type,
      format,
      customerId: customer_id ?? null,
      brandingSource: branding_source,
      brandColor: brand_color,
      acknowledgeEmpty: acknowledge_empty,
    })

    const storagePath = `${tenantId}/${Date.now()}-${generated.fileName}`

    const { error: uploadError } = await admin.storage
      .from('exports')
      .upload(storagePath, generated.fileBuffer, {
        contentType: MIME_BY_FORMAT[format],
        upsert: false,
      })

    if (uploadError) {
      console.error('[POST /api/tenant/exports] Storage-Upload fehlgeschlagen:', uploadError)
      return NextResponse.json({ error: 'Export-Datei konnte nicht gespeichert werden.' }, { status: 500 })
    }

    const { data: exportRecord, error: insertError } = await admin
      .from('exports')
      .insert({
        tenant_id: tenantId,
        created_by_user_id: authResult.auth.userId,
        export_type: type,
        format,
        customer_id: customer_id ?? null,
        branding_source,
        brand_color,
        status: 'done',
        storage_path: storagePath,
        file_name: generated.fileName,
      })
      .select(
        'id, export_type, format, customer_id, branding_source, brand_color, status, error_message, created_at, email_sent_at, email_sent_to'
      )
      .single()

    if (insertError || !exportRecord) {
      console.error('[POST /api/tenant/exports] Insert fehlgeschlagen:', insertError)
      return NextResponse.json({ error: 'Export-Eintrag konnte nicht gespeichert werden.' }, { status: 500 })
    }

    await recordTenantDataAuditLog({
      tenantId,
      actorUserId: authResult.auth.userId,
      actionType: 'data_export',
      resourceType: `export_${type}`,
      resourceId: exportRecord.id,
      context: { format, file_name: generated.fileName, customer_id: customer_id ?? null },
    })

    return NextResponse.json({
      export: {
        ...exportRecord,
        type: exportRecord.export_type,
        customer_name: generated.customerName,
      },
    })
  } catch (genError) {
    const status = (genError as Error & { status?: number }).status
    const userMessage = (genError as Error & { userMessage?: string }).userMessage
    if (status && userMessage && status < 500) {
      return NextResponse.json(status === 409 ? { message: userMessage } : { error: userMessage }, { status })
    }

    console.error('[POST /api/tenant/exports] Generierungs-Fehler:', genError)

    const fallbackMessage =
      genError instanceof Error && genError.message.trim().length > 0
        ? genError.message
        : 'Export-Generierung fehlgeschlagen.'

    await admin.from('exports').insert({
      tenant_id: tenantId,
      created_by_user_id: authResult.auth.userId,
      export_type: type,
      format,
      customer_id: customer_id ?? null,
      branding_source,
      brand_color,
      status: 'failed',
      error_message: fallbackMessage,
    })

    return NextResponse.json({ error: fallbackMessage }, { status: 500 })
  }
}
