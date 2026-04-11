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
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  EXPORTS_READ,
  EXPORTS_CREATE,
} from '@/lib/rate-limit'
import {
  generateKeywordRankingsXlsx,
  generateGscDiscoveryXlsx,
  generateKeywordRankingsPdf,
  generateMarketingDashboardPdf,
  generateCustomerReportPdf,
  type BrandingConfig,
  type KeywordRankingRow,
  type PerformanceRow,
  type CustomerSummaryData,
} from '@/lib/export-generators'

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

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_FORMAT_ALLOWED: Record<ExportType, ExportFormat[]> = {
  keyword_rankings: ['pdf', 'xlsx'],
  marketing_dashboard: ['pdf', 'png'],
  gsc_discovery: ['xlsx'],
  customer_report: ['pdf'],
}

const MIME_BY_FORMAT: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

const EXT_BY_FORMAT: Record<ExportFormat, string> = {
  pdf: 'pdf',
  png: 'png',
  xlsx: 'xlsx',
}

const TYPE_LABELS: Record<ExportType, string> = {
  keyword_rankings: 'Keyword Rankings',
  marketing_dashboard: 'Marketing Dashboard',
  gsc_discovery: 'GSC Discovery',
  customer_report: 'Kundenbericht',
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

  const exports = (data ?? []).map((row) => {
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

  // PNG is handled via client-side upload endpoint — not generated server-side
  if (format === 'png') {
    return NextResponse.json(
      { error: 'PNG-Exporte werden clientseitig erstellt. Nutze den Upload-Endpunkt.' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  // Resolve customer if provided
  let customerName: string | null = null
  let customerLogoUrl: string | null = null

  if (customer_id) {
    const { data: customer } = await admin
      .from('customers')
      .select('name, logo_url, brand_color')
      .eq('id', customer_id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .maybeSingle()

    if (!customer) {
      return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })
    }
    customerName = customer.name
    customerLogoUrl = (customer as { logo_url?: string | null }).logo_url ?? null
  }

  // Resolve tenant branding
  const { data: tenant } = await admin
    .from('tenants')
    .select('name, logo_url, slug')
    .eq('id', tenantId)
    .maybeSingle()

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
  }

  const logoUrl =
    branding_source === 'customer' && customerLogoUrl
      ? customerLogoUrl
      : (tenant as { logo_url?: string | null }).logo_url ?? null

  const branding: BrandingConfig = {
    logoUrl,
    accentColor: brand_color,
    tenantName: tenant.name,
    customerName,
  }

  // ── Fetch source data ──
  let fileBuffer: Buffer
  let fileName: string
  let isEmpty = false

  try {
    if (type === 'keyword_rankings') {
      const result = await fetchKeywordRankingsData(admin, tenantId, customer_id ?? null)
      isEmpty = result.length === 0

      if (isEmpty && !acknowledge_empty) {
        return NextResponse.json(
          { message: 'Für diese Auswahl liegen aktuell keine Keyword-Ranking-Daten vor.' },
          { status: 409 }
        )
      }

      if (format === 'xlsx') {
        fileBuffer = generateKeywordRankingsXlsx(result, branding)
      } else {
        fileBuffer = await generateKeywordRankingsPdf(result, branding)
      }
      fileName = buildFileName('keyword-rankings', format, customerName ?? tenant.slug)
    } else if (type === 'gsc_discovery') {
      // GSC Discovery reuses keyword_ranking_snapshots — same data, different framing
      const result = await fetchKeywordRankingsData(admin, tenantId, customer_id ?? null)
      isEmpty = result.length === 0

      if (isEmpty && !acknowledge_empty) {
        return NextResponse.json(
          { message: 'Für diese Auswahl liegen aktuell keine GSC-Daten vor.' },
          { status: 409 }
        )
      }

      fileBuffer = generateGscDiscoveryXlsx(result, branding)
      fileName = buildFileName('gsc-discovery', format, customerName ?? tenant.slug)
    } else if (type === 'marketing_dashboard') {
      const result = await fetchPerformanceData(admin, tenantId, customer_id ?? null)
      isEmpty = result.length === 0

      if (isEmpty && !acknowledge_empty) {
        return NextResponse.json(
          { message: 'Für diese Auswahl liegen aktuell keine Performance-Daten vor.' },
          { status: 409 }
        )
      }

      fileBuffer = await generateMarketingDashboardPdf(result, branding)
      fileName = buildFileName('marketing-dashboard', format, customerName ?? tenant.slug)
    } else {
      // customer_report
      if (!customer_id || !customerName) {
        return NextResponse.json(
          { error: 'Für den Kundenbericht muss ein Kunde ausgewählt sein.' },
          { status: 400 }
        )
      }
      const result = await fetchCustomerSummaryData(admin, tenantId, customer_id)
      isEmpty = result.keywordCount === 0

      if (isEmpty && !acknowledge_empty) {
        return NextResponse.json(
          { message: 'Für diesen Kunden liegen noch keine Daten vor.' },
          { status: 409 }
        )
      }

      fileBuffer = await generateCustomerReportPdf(result, branding)
      fileName = buildFileName('kundenbericht', format, customerName)
    }
  } catch (genError) {
    console.error('[POST /api/tenant/exports] Generierungs-Fehler:', genError)

    // Persist failed record
    await admin.from('exports').insert({
      tenant_id: tenantId,
      created_by_user_id: authResult.auth.userId,
      export_type: type,
      format,
      customer_id: customer_id ?? null,
      branding_source,
      brand_color,
      status: 'failed',
      error_message: genError instanceof Error ? genError.message : 'Unbekannter Fehler',
    })

    return NextResponse.json({ error: 'Export-Generierung fehlgeschlagen.' }, { status: 500 })
  }

  // ── Upload to Supabase Storage ──
  const storagePath = `${tenantId}/${Date.now()}-${fileName}`

  const { error: uploadError } = await admin.storage
    .from('exports')
    .upload(storagePath, fileBuffer, {
      contentType: MIME_BY_FORMAT[format],
      upsert: false,
    })

  if (uploadError) {
    console.error('[POST /api/tenant/exports] Storage-Upload fehlgeschlagen:', uploadError)
    return NextResponse.json({ error: 'Export-Datei konnte nicht gespeichert werden.' }, { status: 500 })
  }

  // ── Persist export record ──
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
      file_name: fileName,
    })
    .select(
      'id, export_type, format, customer_id, branding_source, brand_color, status, error_message, created_at, email_sent_at, email_sent_to'
    )
    .single()

  if (insertError || !exportRecord) {
    console.error('[POST /api/tenant/exports] Insert fehlgeschlagen:', insertError)
    return NextResponse.json({ error: 'Export-Eintrag konnte nicht gespeichert werden.' }, { status: 500 })
  }

  // Audit log
  await recordTenantDataAuditLog({
    tenantId,
    actorUserId: authResult.auth.userId,
    actionType: 'data_export',
    resourceType: `export_${type}`,
    resourceId: exportRecord.id,
    context: { format, file_name: fileName, customer_id: customer_id ?? null },
  })

  return NextResponse.json({
    export: {
      ...exportRecord,
      type: exportRecord.export_type,
      customer_name: customerName,
    },
  })
}

// ─── Data fetchers ────────────────────────────────────────────────────────────

async function fetchKeywordRankingsData(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  customerId: string | null
): Promise<KeywordRankingRow[]> {
  let query = admin
    .from('keyword_ranking_snapshots')
    .select('keyword_label, position, best_url, clicks, impressions, tracked_at')
    .eq('tenant_id', tenantId)
    .order('tracked_at', { ascending: false })
    .limit(2000)

  if (customerId) {
    // Join through keyword_projects to filter by customer
    const { data: projectIds } = await admin
      .from('keyword_projects')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
    const ids = (projectIds ?? []).map((p: { id: string }) => p.id)
    if (ids.length === 0) return []
    query = query.in('project_id', ids)
  }

  const { data, error } = await query

  if (error) {
    console.error('[fetchKeywordRankingsData] DB-Fehler:', error)
    return []
  }

  return (data ?? []).map((row) => ({
    keyword: row.keyword_label,
    position: row.position,
    url: row.best_url,
    clicks: row.clicks,
    impressions: row.impressions,
    trackedAt: row.tracked_at,
  }))
}

async function fetchPerformanceData(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  customerId: string | null
): Promise<PerformanceRow[]> {
  let query = admin
    .from('performance_analyses')
    .select('metrics, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (customerId) {
    query = query.eq('customer_id', customerId)
  }

  const { data, error } = await query

  if (error || !data || data.length === 0) return []

  const metrics = data[0].metrics as Record<string, unknown> | null
  if (!metrics || typeof metrics !== 'object') return []

  return Object.entries(metrics)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([key, value]) => ({
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      value: typeof value === 'number' ? value.toLocaleString('de-DE') : String(value),
    }))
    .slice(0, 50)
}

async function fetchCustomerSummaryData(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  customerId: string
): Promise<CustomerSummaryData> {
  const { data: customer } = await admin
    .from('customers')
    .select('name, industry, website')
    .eq('id', customerId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  const rankings = await fetchKeywordRankingsData(admin, tenantId, customerId)

  const avgPosition =
    rankings.length > 0
      ? rankings.reduce((sum, r) => sum + (r.position ?? 0), 0) / rankings.length
      : null

  const topKeywords = [...rankings]
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
    .slice(0, 20)

  return {
    customerName: customer?.name ?? 'Unbekannt',
    industry: (customer as { industry?: string | null } | null)?.industry ?? null,
    website: (customer as { website?: string | null } | null)?.website ?? null,
    keywordCount: rankings.length,
    avgPosition,
    topKeywords,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildFileName(type: string, format: ExportFormat, context: string): string {
  const date = new Date().toISOString().slice(0, 10)
  const slug = context
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `${type}_${slug}_${date}.${EXT_BY_FORMAT[format]}`
}
