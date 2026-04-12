import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  CUSTOMERS_READ,
} from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`customers-read:${tenantId}:${getClientIp(request)}`, CUSTOMERS_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const today = new Date().toISOString().slice(0, 10)
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('customer_activities')
    .select('id, customer_id, activity_type, description, follow_up_date, created_by, created_at, customers!inner(id, name, deleted_at)')
    .eq('tenant_id', tenantId)
    .not('follow_up_date', 'is', null)
    .lte('follow_up_date', today)
    .order('follow_up_date', { ascending: true })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const followUps = (data ?? [])
    .filter((row) => {
      const c = row.customers as unknown as { id: string; name: string; deleted_at: string | null } | null
      return c && !c.deleted_at
    })
    .map((row) => {
      const c = row.customers as unknown as { id: string; name: string }
      return {
        id: row.id,
        customer_id: row.customer_id,
        customer_name: c.name,
        activity_type: row.activity_type,
        description: row.description,
        follow_up_date: row.follow_up_date,
        created_by: row.created_by,
        created_at: row.created_at,
      }
    })

  // Count per customer
  const countByCustomer: Record<string, number> = {}
  for (const fu of followUps) {
    countByCustomer[fu.customer_id] = (countByCustomer[fu.customer_id] ?? 0) + 1
  }

  return NextResponse.json({
    follow_ups: followUps,
    count_by_customer: countByCustomer,
    total: followUps.length,
  })
}
