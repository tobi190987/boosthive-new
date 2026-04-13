import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser, requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { CUSTOMER_INDUSTRIES, CUSTOMER_INDUSTRY_ERROR_MESSAGE } from '@/lib/customer-industries'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  CUSTOMERS_READ,
  CUSTOMERS_WRITE,
} from '@/lib/rate-limit'

const createCustomerSchema = z.object({
  name: z.string().trim().min(1, 'Name ist erforderlich.').max(200),
  domain: z.string().trim().max(500).nullable().optional(),
  industry: z.enum(CUSTOMER_INDUSTRIES, {
    error: () => ({ message: CUSTOMER_INDUSTRY_ERROR_MESSAGE }),
  }),
  contact_email: z.string().trim().email('Ungültige E-Mail-Adresse.').nullable().optional(),
  status: z.enum(['active', 'paused']).default('active'),
})

function isMissingCustomerCrmColumns(error: { code?: string; message?: string } | null) {
  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    error?.message?.includes('crm_status') === true ||
    error?.message?.includes('monthly_volume') === true ||
    error?.message?.includes('onboarding_checklist') === true
  )
}

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`customers-read:${tenantId}:${getClientIp(request)}`, CUSTOMERS_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const admin = createAdminClient()
  const todayStr = new Date().toISOString().slice(0, 10)
  const customerSelectWithCrm = `
        id,
        name,
        domain,
        industry,
        contact_email,
        logo_url,
        internal_notes,
        status,
        crm_status,
        monthly_volume,
        onboarding_checklist,
        created_at,
        updated_at
      `
  const customerSelectFallback = `
        id,
        name,
        domain,
        industry,
        contact_email,
        logo_url,
        internal_notes,
        status,
        created_at,
        updated_at
      `

  const [initialCustomersResult, approvalsResult, followUpsResult] = await Promise.all([
    admin
      .from('customers')
      .select(customerSelectWithCrm)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .limit(500),
    admin
      .from('approval_requests')
      .select('customer_id')
      .eq('tenant_id', tenantId)
      .in('status', ['pending_approval', 'changes_requested'])
      .not('customer_id', 'is', null),
    admin
      .from('customer_activities')
      .select('customer_id')
      .eq('tenant_id', tenantId)
      .not('follow_up_date', 'is', null)
      .lte('follow_up_date', todayStr),
  ])

  let customersData = initialCustomersResult.data as Array<Record<string, unknown>> | null
  let customersError = initialCustomersResult.error

  if (isMissingCustomerCrmColumns(customersError)) {
    const fallbackCustomersResult = await admin
      .from('customers')
      .select(customerSelectFallback)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .limit(500)

    customersData =
      fallbackCustomersResult.data?.map((customer) => ({
        ...(customer as Record<string, unknown>),
        crm_status: 'active',
        monthly_volume: null,
        onboarding_checklist: [],
      })) ?? null
    customersError = fallbackCustomersResult.error
  }

  if (customersError) {
    return NextResponse.json({ error: customersError.message }, { status: 500 })
  }

  if (approvalsResult.error) {
    return NextResponse.json({ error: approvalsResult.error.message }, { status: 500 })
  }

  const openApprovalsByCustomer = new Map<string, number>()
  for (const row of approvalsResult.data ?? []) {
    if (!row.customer_id) continue
    openApprovalsByCustomer.set(
      row.customer_id,
      (openApprovalsByCustomer.get(row.customer_id) ?? 0) + 1
    )
  }

  const dueFollowUpCustomerIds = new Set<string>()
  if (!followUpsResult.error) {
    for (const row of followUpsResult.data ?? []) {
      if (row.customer_id) dueFollowUpCustomerIds.add(row.customer_id)
    }
  }

  return NextResponse.json({
    customers: (customersData ?? []).map((customer) => ({
      ...customer,
      openApprovalsCount:
        typeof customer.id === 'string' ? (openApprovalsByCustomer.get(customer.id) ?? 0) : 0,
      has_due_follow_up:
        typeof customer.id === 'string' ? dueFollowUpCustomerIds.has(customer.id) : false,
    })),
  })
}

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`customers-write:${tenantId}:${getClientIp(request)}`, CUSTOMERS_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = createCustomerSchema.safeParse(body)
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors
    const firstDetail = Object.values(details).flat().find(Boolean)
    return NextResponse.json({ error: firstDetail ?? 'Validierungsfehler.', details }, { status: 400 })
  }

  const { name, domain, industry, contact_email, status } = parsed.data
  const admin = createAdminClient()

  // Check for duplicate domain within same tenant (only if domain is provided)
  if (domain && domain.trim()) {
    const { data: existingCustomer } = await admin
      .from('customers')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('domain', domain.trim().toLowerCase())
      .is('deleted_at', null)
      .maybeSingle() // Use maybeSingle instead of single to avoid errors

    if (existingCustomer) {
      return NextResponse.json({ 
        error: 'Ein Kunde mit dieser Website-URL existiert bereits.' 
      }, { status: 409 })
    }
  }

  const { data, error } = await admin
    .from('customers')
    .insert({
      tenant_id: tenantId,
      created_by: authResult.auth.userId,
      name,
      domain: domain ?? null,
      industry: industry ?? null,
      contact_email: contact_email ?? null,
      status,
    })
    .select(`
      id,
      name,
      domain,
      industry,
      contact_email,
      logo_url,
      internal_notes,
      status,
      created_at,
      updated_at
    `)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ customer: data }, { status: 201 })
}
