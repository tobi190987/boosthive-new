import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser, requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  BUDGETS_READ,
  BUDGETS_WRITE,
} from '@/lib/rate-limit'

const createBudgetSchema = z.object({
  customer_id: z.string().uuid('Ungültige Kunden-ID.'),
  platform: z.enum(['google_ads', 'meta_ads', 'tiktok_ads']),
  label: z.string().trim().max(100).nullable().optional(),
  budget_month: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'budget_month muss YYYY-MM-DD sein.'),
  planned_amount: z.number().min(0, 'Betrag darf nicht negativ sein.'),
  alert_threshold_percent: z.number().int().min(0).max(200).optional().default(80),
  currency: z.string().max(3).optional().default('EUR'),
})

// ── GET /api/tenant/budgets?month=YYYY-MM&customer_id=uuid ──

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`budgets-read:${tenantId}:${getClientIp(request)}`, BUDGETS_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const url = new URL(request.url)
  const monthParam = url.searchParams.get('month') // YYYY-MM
  const customerIdParam = url.searchParams.get('customer_id')

  // Resolve budget_month: first day of requested month, default = current month
  let budgetMonth: string
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    budgetMonth = `${monthParam}-01`
  } else {
    const now = new Date()
    budgetMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  }

  const admin = createAdminClient()

  // Fetch budgets (with customer name)
  let budgetsQuery = admin
    .from('ad_budgets')
    .select(`
      id,
      customer_id,
      customers!inner(name),
      platform,
      label,
      budget_month,
      planned_amount,
      currency,
      alert_threshold_percent,
      cached_cpc,
      cached_cpm,
      cached_roas,
      last_synced_at
    `)
    .eq('tenant_id', tenantId)
    .eq('budget_month', budgetMonth)
    .order('created_at', { ascending: true })
    .limit(500)

  if (customerIdParam) {
    budgetsQuery = budgetsQuery.eq('customer_id', customerIdParam)
  }

  const { data: budgets, error: budgetsError } = await budgetsQuery
  if (budgetsError) {
    return NextResponse.json({ error: budgetsError.message }, { status: 500 })
  }

  if (!budgets || budgets.length === 0) {
    // Check if any integration exists to show the banner.
    // customer_integrations has no tenant_id column — join via customers.
    const { data: tenantCustomers } = await admin
      .from('customers')
      .select('id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .limit(500)

    const tenantCustomerIds = tenantCustomers?.map((c) => c.id) ?? []
    let hasAnyIntegration = false
    if (tenantCustomerIds.length > 0) {
      const { data: integrations } = await admin
        .from('customer_integrations')
        .select('id')
        .in('customer_id', tenantCustomerIds)
        .in('integration_type', ['google_ads', 'meta_ads', 'tiktok_ads'])
        .neq('status', 'disconnected')
        .limit(1)
      hasAnyIntegration = (integrations?.length ?? 0) > 0
    }

    return NextResponse.json({ budgets: [], hasAnyIntegration })
  }

  const budgetIds = budgets.map((b) => b.id)

  // Aggregate spend per budget for this month
  const monthStart = budgetMonth
  const [year, month] = budgetMonth.split('-').map(Number)
  const monthEnd = new Date(year, month, 0).toISOString().split('T')[0] // last day

  const { data: spendRows, error: spendError } = await admin
    .from('ad_spend_entries')
    .select('budget_id, amount, source')
    .in('budget_id', budgetIds)
    .gte('spend_date', monthStart)
    .lte('spend_date', monthEnd)
    .limit(50000)

  if (spendError) {
    return NextResponse.json({ error: spendError.message }, { status: 500 })
  }

  // Aggregate spend per budget
  type SpendAgg = { total: number; sources: Set<string> }
  const spendByBudget = new Map<string, SpendAgg>()
  for (const row of spendRows ?? []) {
    const existing = spendByBudget.get(row.budget_id)
    if (existing) {
      existing.total += Number(row.amount)
      existing.sources.add(row.source)
    } else {
      spendByBudget.set(row.budget_id, { total: Number(row.amount), sources: new Set([row.source]) })
    }
  }

  // Check integrations for each unique customer
  const uniqueCustomerIds = [...new Set(budgets.map((b) => b.customer_id))]
  // customer_integrations has no tenant_id — filter by customer_id only (already scoped to tenant via budgets)
  const { data: integrations } = await admin
    .from('customer_integrations')
    .select('customer_id, integration_type, status')
    .in('customer_id', uniqueCustomerIds)
    .in('integration_type', ['google_ads', 'meta_ads', 'tiktok_ads'])
    .neq('status', 'disconnected')
    .limit(500)

  // Map: customerId -> Set<platform>
  const integratedPlatforms = new Map<string, Set<string>>()
  for (const integration of integrations ?? []) {
    const existing = integratedPlatforms.get(integration.customer_id)
    const platformKey =
      integration.integration_type === 'google_ads'
        ? 'google_ads'
        : integration.integration_type === 'meta_ads'
          ? 'meta_ads'
          : 'tiktok_ads'
    if (existing) {
      existing.add(platformKey)
    } else {
      integratedPlatforms.set(integration.customer_id, new Set([platformKey]))
    }
  }

  const hasAnyIntegration = (integrations?.length ?? 0) > 0

  const result = budgets.map((b) => {
    const agg = spendByBudget.get(b.id)
    const totalSpent = agg?.total ?? 0
    const sources = agg?.sources ?? new Set<string>()

    let spentSource: 'api' | 'manual' | 'mixed' = 'manual'
    const hasApi = [...sources].some((s) => s.startsWith('api_'))
    const hasManual = sources.has('manual')
    if (hasApi && hasManual) spentSource = 'mixed'
    else if (hasApi) spentSource = 'api'
    else spentSource = 'manual'

    const customerIntegrations = integratedPlatforms.get(b.customer_id)
    const hasIntegration = customerIntegrations?.has(b.platform) ?? false

    return {
      id: b.id,
      customer_id: b.customer_id,
      customer_name: (Array.isArray(b.customers) ? (b.customers as { name: string }[])[0]?.name : (b.customers as { name: string } | null)?.name) ?? '',
      platform: b.platform,
      label: b.label ?? null,
      budget_month: b.budget_month,
      planned_amount: Number(b.planned_amount),
      currency: b.currency,
      alert_threshold_percent: b.alert_threshold_percent,
      spent_amount: totalSpent,
      spent_source: spentSource,
      cpc: b.cached_cpc !== null ? Number(b.cached_cpc) : null,
      cpm: b.cached_cpm !== null ? Number(b.cached_cpm) : null,
      roas: b.cached_roas !== null ? Number(b.cached_roas) : null,
      has_integration: hasIntegration,
      last_synced_at: b.last_synced_at ?? null,
    }
  })

  return NextResponse.json({ budgets: result, hasAnyIntegration })
}

// ── POST /api/tenant/budgets ──

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`budgets-write:${tenantId}:${getClientIp(request)}`, BUDGETS_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = createBudgetSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  }

  const { customer_id, platform, label, budget_month, planned_amount, alert_threshold_percent, currency } =
    parsed.data

  // Ensure budget_month is the first of the month
  const normalizedMonth = `${budget_month.substring(0, 7)}-01`

  const admin = createAdminClient()

  // Verify customer belongs to tenant
  const { data: customer, error: customerError } = await admin
    .from('customers')
    .select('id')
    .eq('id', customer_id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle()

  if (customerError) return NextResponse.json({ error: customerError.message }, { status: 500 })
  if (!customer) return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })

  const { data: inserted, error: insertError } = await admin
    .from('ad_budgets')
    .insert({
      tenant_id: tenantId,
      customer_id,
      platform,
      label: label ?? null,
      budget_month: normalizedMonth,
      planned_amount,
      currency: currency ?? 'EUR',
      alert_threshold_percent: alert_threshold_percent ?? 80,
    })
    .select(`id, customer_id, customers!inner(name), platform, label, budget_month, planned_amount, currency, alert_threshold_percent, cached_cpc, cached_cpm, cached_roas`)
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json(
        { error: 'Ein Budget für diese Kombination (Plattform, Label, Monat) existiert bereits.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const budget = {
    id: inserted.id,
    customer_id: inserted.customer_id,
    customer_name: (Array.isArray(inserted.customers) ? (inserted.customers as { name: string }[])[0]?.name : (inserted.customers as { name: string } | null)?.name) ?? '',
    platform: inserted.platform,
    label: inserted.label ?? null,
    budget_month: inserted.budget_month,
    planned_amount: Number(inserted.planned_amount),
    currency: inserted.currency,
    alert_threshold_percent: inserted.alert_threshold_percent,
    spent_amount: 0,
    spent_source: 'manual' as const,
    cpc: null,
    cpm: null,
    roas: null,
    has_integration: false,
  }

  return NextResponse.json({ budget }, { status: 201 })
}
