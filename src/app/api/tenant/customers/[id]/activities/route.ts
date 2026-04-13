import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  CUSTOMERS_READ,
  CUSTOMERS_WRITE,
} from '@/lib/rate-limit'

const ACTIVITY_TYPES = ['call', 'meeting', 'email', 'note', 'task'] as const

const createActivitySchema = z.object({
  activity_type: z.enum(ACTIVITY_TYPES),
  description: z.string().trim().min(1, 'Beschreibung ist erforderlich.').max(5000),
  activity_date: z.string().datetime().optional(),
  follow_up_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})

const PAGE_SIZE = 50

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`customers-read:${tenantId}:${getClientIp(request)}`, CUSTOMERS_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const { id } = await params
  const url = new URL(request.url)
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'))
  const typeFilter = url.searchParams.get('type')
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const admin = createAdminClient()

  // Verify customer belongs to tenant
  const { data: customer, error: customerErr } = await admin
    .from('customers')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (customerErr) return NextResponse.json({ error: customerErr.message }, { status: 500 })
  if (!customer) return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })

  let query = admin
    .from('customer_activities')
    .select('id, activity_type, description, activity_date, follow_up_date, created_by, created_at, updated_at', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('customer_id', id)
    .order('activity_date', { ascending: false })
    .range(from, to)

  if (typeFilter && (ACTIVITY_TYPES as readonly string[]).includes(typeFilter)) {
    query = query.eq('activity_type', typeFilter)
  }

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Resolve creator names
  const creatorIds = Array.from(new Set((data ?? []).map((a) => a.created_by).filter(Boolean))) as string[]
  let creatorsMap: Record<string, string> = {}
  if (creatorIds.length) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .in('id', creatorIds)
    creatorsMap = Object.fromEntries(
      (profiles ?? []).map((p) => [p.id, p.full_name || p.email || 'Unbekannt'])
    )
  }

  return NextResponse.json({
    activities: (data ?? []).map((a) => ({
      ...a,
      created_by_name: creatorsMap[a.created_by] ?? 'Unbekannt',
    })),
    total: count ?? 0,
    page,
    page_size: PAGE_SIZE,
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`customers-write:${tenantId}:${getClientIp(request)}`, CUSTOMERS_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = createActivitySchema.safeParse(body)
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors
    const firstDetail = Object.values(details).flat().find(Boolean)
    return NextResponse.json({ error: firstDetail ?? 'Validierungsfehler.', details }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verify customer belongs to tenant
  const { data: customer } = await admin
    .from('customers')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!customer) return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })

  const insertData: Record<string, unknown> = {
    tenant_id: tenantId,
    customer_id: id,
    activity_type: parsed.data.activity_type,
    description: parsed.data.description,
    created_by: authResult.auth.userId,
    follow_up_date: parsed.data.follow_up_date ?? null,
  }
  if (parsed.data.activity_date) {
    insertData.activity_date = parsed.data.activity_date
  }

  const { data, error } = await admin
    .from('customer_activities')
    .insert(insertData)
    .select('id, activity_type, description, activity_date, follow_up_date, created_by, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ activity: data }, { status: 201 })
}
