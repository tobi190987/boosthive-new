import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  CUSTOMERS_READ,
} from '@/lib/rate-limit'

export interface PortfolioCustomerSummary {
  id: string
  name: string
  domain: string | null
  industry: string | null
  logo_url: string | null
  status: 'active' | 'paused'
  updated_at: string
  integrations: {
    ga4: 'connected' | 'error' | 'disconnected'
    google_ads: 'connected' | 'error' | 'disconnected'
    meta_ads: 'connected' | 'error' | 'disconnected'
    tiktok_ads: 'connected' | 'error' | 'disconnected'
    gsc: 'connected' | 'error' | 'disconnected'
  }
  openApprovalsCount: number
  integrationsError: boolean
}

export interface PortfolioSummaryResponse {
  customers: PortfolioCustomerSummary[]
  actionBar: {
    pendingApprovals: number
    overdueFollowups: number
    brokenIntegrations: number
  }
  generatedAt: string
}

type IntegrationStatusKey = 'ga4' | 'google_ads' | 'meta_ads' | 'tiktok_ads' | 'gsc'

function normalizeIntegrationStatus(
  raw: string | null | undefined
): 'connected' | 'error' | 'disconnected' {
  if (!raw) return 'disconnected'
  const normalized = raw.toLowerCase()
  if (normalized === 'connected' || normalized === 'active') return 'connected'
  if (normalized === 'disconnected' || normalized === 'inactive') return 'disconnected'
  return 'error'
}

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(
    `portfolio-summary:${tenantId}:${getClientIp(request)}`,
    CUSTOMERS_READ
  )
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const admin = createAdminClient()

  const [customersResult, integrationsResult, approvalsResult] = await Promise.all([
    admin
      .from('customers')
      .select(
        'id, name, domain, industry, logo_url, status, updated_at'
      )
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .limit(500),
    admin
      .from('customer_integrations')
      .select('customer_id, integration_type, status')
      .eq('tenant_id', tenantId)
      .limit(2000),
    admin
      .from('approval_requests')
      .select('customer_id')
      .eq('tenant_id', tenantId)
      .in('status', ['pending_approval', 'changes_requested'])
      .limit(2000),
  ])

  if (customersResult.error) {
    return NextResponse.json({ error: customersResult.error.message }, { status: 500 })
  }

  const integrationsByCustomer = new Map<string, Record<IntegrationStatusKey, string>>()
  const integrationErrorsByCustomer = new Map<string, number>()

  if (!integrationsResult.error) {
    for (const row of integrationsResult.data ?? []) {
      if (!row.customer_id || !row.integration_type) continue
      const key = row.integration_type.toLowerCase() as IntegrationStatusKey
      if (!['ga4', 'google_ads', 'meta_ads', 'tiktok_ads', 'gsc'].includes(key)) continue

      const existing = integrationsByCustomer.get(row.customer_id) ?? {
        ga4: 'disconnected',
        google_ads: 'disconnected',
        meta_ads: 'disconnected',
        tiktok_ads: 'disconnected',
        gsc: 'disconnected',
      }
      existing[key] = row.status ?? 'disconnected'
      integrationsByCustomer.set(row.customer_id, existing)

      const normalizedStatus = normalizeIntegrationStatus(row.status)
      if (normalizedStatus === 'error') {
        integrationErrorsByCustomer.set(
          row.customer_id,
          (integrationErrorsByCustomer.get(row.customer_id) ?? 0) + 1
        )
      }
    }
  }

  const approvalsByCustomer = new Map<string, number>()
  if (!approvalsResult.error) {
    for (const row of approvalsResult.data ?? []) {
      if (!row.customer_id) continue
      approvalsByCustomer.set(
        row.customer_id,
        (approvalsByCustomer.get(row.customer_id) ?? 0) + 1
      )
    }
  }

  const customers: PortfolioCustomerSummary[] = (customersResult.data ?? []).map((customer) => {
    const raw = integrationsByCustomer.get(customer.id)
    const integrations = {
      ga4: normalizeIntegrationStatus(raw?.ga4),
      google_ads: normalizeIntegrationStatus(raw?.google_ads),
      meta_ads: normalizeIntegrationStatus(raw?.meta_ads),
      tiktok_ads: normalizeIntegrationStatus(raw?.tiktok_ads),
      gsc: normalizeIntegrationStatus(raw?.gsc),
    }

    return {
      id: customer.id,
      name: customer.name,
      domain: customer.domain ?? null,
      industry: customer.industry ?? null,
      logo_url: customer.logo_url ?? null,
      status: (customer.status ?? 'active') as 'active' | 'paused',
      updated_at: customer.updated_at,
      integrations,
      openApprovalsCount: approvalsByCustomer.get(customer.id) ?? 0,
      integrationsError: (integrationErrorsByCustomer.get(customer.id) ?? 0) > 0,
    }
  })

  let totalPendingApprovals = 0
  for (const count of approvalsByCustomer.values()) {
    totalPendingApprovals += count
  }

  let totalBrokenIntegrations = 0
  for (const count of integrationErrorsByCustomer.values()) {
    totalBrokenIntegrations += count
  }

  const response: PortfolioSummaryResponse = {
    customers,
    actionBar: {
      pendingApprovals: totalPendingApprovals,
      overdueFollowups: 0,
      brokenIntegrations: totalBrokenIntegrations,
    },
    generatedAt: new Date().toISOString(),
  }

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  })
}
