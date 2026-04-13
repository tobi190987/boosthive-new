import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  BUDGETS_WRITE,
} from '@/lib/rate-limit'

const updateBudgetSchema = z.object({
  planned_amount: z.number().min(0).optional(),
  label: z.string().trim().max(100).nullable().optional(),
  alert_threshold_percent: z.number().int().min(0).max(200).optional(),
  currency: z.string().max(3).optional(),
  campaign_ids: z.array(z.string()).nullable().optional(),
})

// ── PUT /api/tenant/budgets/[id] ──

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`budgets-write:${tenantId}:${getClientIp(request)}`, BUDGETS_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = updateBudgetSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verify ownership
  const { data: existing, error: fetchError } = await admin
    .from('ad_budgets')
    .select('id, budget_month')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Budget nicht gefunden.' }, { status: 404 })

  const { data: updated, error: updateError } = await admin
    .from('ad_budgets')
    .update({
      ...(parsed.data.planned_amount !== undefined && { planned_amount: parsed.data.planned_amount }),
      ...(parsed.data.label !== undefined && { label: parsed.data.label }),
      ...(parsed.data.alert_threshold_percent !== undefined && {
        alert_threshold_percent: parsed.data.alert_threshold_percent,
        // Reset alert flags when threshold changes
        alert_80_sent_at: null,
        alert_100_sent_at: null,
        alert_150_sent_at: null,
      }),
      ...(parsed.data.currency !== undefined && { currency: parsed.data.currency }),
      ...(parsed.data.campaign_ids !== undefined && {
        campaign_ids:
          Array.isArray(parsed.data.campaign_ids) && parsed.data.campaign_ids.length > 0
            ? parsed.data.campaign_ids
            : null,
      }),
    })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select(`id, customer_id, customers!inner(name), platform, label, budget_month, planned_amount, currency, alert_threshold_percent, campaign_ids, cached_cpc, cached_cpm, cached_roas`)
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // Fetch current month spend for response
  const budgetMonth = existing.budget_month
  const [year, month] = (budgetMonth as string).split('-').map(Number)
  const monthEnd = new Date(year, month, 0).toISOString().split('T')[0]

  const { data: spendRows } = await admin
    .from('ad_spend_entries')
    .select('amount, source')
    .eq('budget_id', id)
    .gte('spend_date', budgetMonth)
    .lte('spend_date', monthEnd)
    .limit(10000)

  const totalSpent = (spendRows ?? []).reduce((acc, r) => acc + Number(r.amount), 0)
  const sources = new Set((spendRows ?? []).map((r) => r.source))
  const hasApi = [...sources].some((s) => s.startsWith('api_'))
  const hasManual = sources.has('manual')
  const spentSource = hasApi && hasManual ? 'mixed' : hasApi ? 'api' : 'manual'

  const budget = {
    id: updated.id,
    customer_id: updated.customer_id,
    customer_name: (Array.isArray(updated.customers) ? (updated.customers as { name: string }[])[0]?.name : (updated.customers as { name: string } | null)?.name) ?? '',
    platform: updated.platform,
    label: updated.label ?? null,
    budget_month: updated.budget_month,
    planned_amount: Number(updated.planned_amount),
    currency: updated.currency,
    alert_threshold_percent: updated.alert_threshold_percent,
    campaign_ids: (updated.campaign_ids as string[] | null) ?? null,
    spent_amount: totalSpent,
    spent_source: spentSource as 'api' | 'manual' | 'mixed',
    cpc: updated.cached_cpc !== null ? Number(updated.cached_cpc) : null,
    cpm: updated.cached_cpm !== null ? Number(updated.cached_cpm) : null,
    roas: updated.cached_roas !== null ? Number(updated.cached_roas) : null,
    has_integration: false,
  }

  return NextResponse.json({ budget })
}

// ── DELETE /api/tenant/budgets/[id] ──

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`budgets-write:${tenantId}:${getClientIp(request)}`, BUDGETS_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const { id } = await params
  const admin = createAdminClient()

  // Verify ownership before deletion
  const { data: existing } = await admin
    .from('ad_budgets')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Budget nicht gefunden.' }, { status: 404 })

  const { error: deleteError } = await admin
    .from('ad_budgets')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
