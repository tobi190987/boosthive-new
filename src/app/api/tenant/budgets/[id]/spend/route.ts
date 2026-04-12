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

const manualSpendSchema = z.object({
  spend_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum muss YYYY-MM-DD sein.'),
  amount: z.number().min(0, 'Betrag darf nicht negativ sein.'),
  source: z.enum(['manual', 'api_google', 'api_meta', 'api_tiktok']).optional().default('manual'),
})

// ── GET /api/tenant/budgets/[id]/spend ──
// Returns all daily spend entries for this budget

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`budgets-read:${tenantId}:${getClientIp(request)}`, BUDGETS_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const { id } = await params
  const admin = createAdminClient()

  // Verify budget belongs to tenant
  const { data: budget, error: budgetError } = await admin
    .from('ad_budgets')
    .select('id, budget_month')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (budgetError) return NextResponse.json({ error: budgetError.message }, { status: 500 })
  if (!budget) return NextResponse.json({ error: 'Budget nicht gefunden.' }, { status: 404 })

  // Fetch all spend entries for the budget's month
  const budgetMonth = budget.budget_month as string
  const [year, month] = budgetMonth.split('-').map(Number)
  const monthEnd = new Date(year, month, 0).toISOString().split('T')[0]

  const { data: entries, error: entriesError } = await admin
    .from('ad_spend_entries')
    .select('spend_date, amount, source')
    .eq('budget_id', id)
    .gte('spend_date', budgetMonth)
    .lte('spend_date', monthEnd)
    .order('spend_date', { ascending: true })
    .limit(1000)

  if (entriesError) return NextResponse.json({ error: entriesError.message }, { status: 500 })

  return NextResponse.json({
    entries: (entries ?? []).map((e) => ({
      date: e.spend_date,
      amount: Number(e.amount),
      source: e.source,
    })),
  })
}

// ── POST /api/tenant/budgets/[id]/spend ──
// Upsert a single daily spend entry (manual or via sync)

export async function POST(
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

  const parsed = manualSpendSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  }

  const { spend_date, amount, source } = parsed.data
  const admin = createAdminClient()

  // Verify budget belongs to tenant
  const { data: budget, error: budgetError } = await admin
    .from('ad_budgets')
    .select('id, budget_month')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (budgetError) return NextResponse.json({ error: budgetError.message }, { status: 500 })
  if (!budget) return NextResponse.json({ error: 'Budget nicht gefunden.' }, { status: 404 })

  // Verify spend_date is within the budget's month
  const budgetMonth = (budget.budget_month as string).substring(0, 7)
  const spendMonth = spend_date.substring(0, 7)
  if (budgetMonth !== spendMonth) {
    return NextResponse.json(
      { error: 'Das Datum liegt nicht im Budget-Monat.' },
      { status: 400 }
    )
  }

  const { error: upsertError } = await admin.from('ad_spend_entries').upsert(
    {
      budget_id: id,
      tenant_id: tenantId,
      spend_date,
      amount,
      source,
    },
    { onConflict: 'budget_id,spend_date' }
  )

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
