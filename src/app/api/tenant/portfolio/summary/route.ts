import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  CUSTOMERS_READ,
} from '@/lib/rate-limit'
import { readSeoConfigSummary } from '@/lib/seo-analysis'

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
  noIntegrationConnected: boolean
  hasBudget: boolean
  seoLatest: { score: number; completedAt: string; totalPages: number } | null
  keywordsLatest: { projectName: string; lastRun: string | null; keywordCount: number } | null
}

export interface PortfolioSummaryResponse {
  customers: PortfolioCustomerSummary[]
  actionBar: {
    pendingApprovals: number
    overdueFollowups: number
    brokenIntegrations: number
  }
  userRole: 'admin' | 'member'
  generatedAt: string
}

type IntegrationStatusKey = 'ga4' | 'google_ads' | 'meta_ads' | 'tiktok_ads' | 'gsc'

const SUPABASE_STORAGE_PREFIX = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/`
  : null

function sanitizeLogoUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (SUPABASE_STORAGE_PREFIX && url.startsWith(SUPABASE_STORAGE_PREFIX)) return url
  return null
}

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
  const userRole = authResult.auth.role === 'admin' ? 'admin' : 'member'

  const admin = createAdminClient()

  const [customersResult, approvalsResult] = await Promise.all([
    admin
      .from('customers')
      .select('id, name, domain, industry, logo_url, status, updated_at')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .limit(500),
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

  const customerIds = (customersResult.data ?? []).map((c) => c.id)

  // customer_integrations has no tenant_id column — filter by customer_id only
  const now = new Date()
  const currentBudgetMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const [integrationsResult, seoResult, keywordProjectsResult, budgetsResult] = await Promise.all([
    customerIds.length > 0
      ? admin
          .from('customer_integrations')
          .select('customer_id, integration_type, status')
          .in('customer_id', customerIds)
          .limit(2000)
      : Promise.resolve({ data: [] as { customer_id: string; integration_type: string; status: string | null }[], error: null }),
    customerIds.length > 0
      ? admin
          .from('seo_analyses')
          .select('id, customer_id, status, completed_at, config')
          .eq('tenant_id', tenantId)
          .in('customer_id', customerIds)
          .eq('status', 'done')
          .order('completed_at', { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] as { id: string; customer_id: string | null; status: string; completed_at: string | null; config: unknown }[], error: null }),
    customerIds.length > 0
      ? admin
          .from('keyword_projects')
          .select('id, customer_id, name, last_tracking_run, keywords(count)')
          .eq('tenant_id', tenantId)
          .in('customer_id', customerIds)
          .order('last_tracking_run', { ascending: false, nullsFirst: false })
          .limit(500)
      : Promise.resolve({ data: [] as { id: string; customer_id: string | null; name: string; last_tracking_run: string | null; keywords: { count: number }[] | null }[], error: null }),
    admin
      .from('ad_budgets')
      .select('customer_id')
      .eq('tenant_id', tenantId)
      .gte('budget_month', currentBudgetMonth)
      .lte('budget_month', currentBudgetMonth)
      .limit(1000),
  ])

  // Build integration maps
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

  // Latest SEO per customer (results already ordered desc by completed_at)
  const seoByCustomer = new Map<string, { score: number; completedAt: string; totalPages: number }>()
  if (!seoResult.error) {
    for (const row of seoResult.data ?? []) {
      if (!row.customer_id || seoByCustomer.has(row.customer_id)) continue
      const summary = readSeoConfigSummary(row.config)
      if (summary) {
        seoByCustomer.set(row.customer_id, {
          score: summary.overallScore,
          completedAt: summary.completedAt,
          totalPages: summary.totalPages,
        })
      }
    }
  }

  // Latest keyword project per customer
  const keywordsByCustomer = new Map<string, { projectName: string; lastRun: string | null; keywordCount: number }>()
  if (!keywordProjectsResult.error) {
    for (const row of keywordProjectsResult.data ?? []) {
      if (!row.customer_id || keywordsByCustomer.has(row.customer_id)) continue
      const kwArr = row.keywords as { count: number }[] | null
      keywordsByCustomer.set(row.customer_id, {
        projectName: row.name,
        lastRun: row.last_tracking_run ?? null,
        keywordCount: kwArr?.[0]?.count ?? 0,
      })
    }
  }

  // Budget map: customer_ids that have a budget this month
  const customersWithBudget = new Set<string>()
  if (!budgetsResult.error) {
    for (const row of budgetsResult.data ?? []) {
      if (row.customer_id) customersWithBudget.add(row.customer_id)
    }
  }

  // Approvals map
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
      logo_url: sanitizeLogoUrl(customer.logo_url),
      status: (customer.status ?? 'active') as 'active' | 'paused',
      updated_at: customer.updated_at,
      integrations,
      openApprovalsCount: approvalsByCustomer.get(customer.id) ?? 0,
      integrationsError: (integrationErrorsByCustomer.get(customer.id) ?? 0) > 0,
      noIntegrationConnected: !integrationsByCustomer.has(customer.id) ||
        Object.values(integrationsByCustomer.get(customer.id)!).every((s) => s === 'disconnected'),
      hasBudget: customersWithBudget.has(customer.id),
      seoLatest: seoByCustomer.get(customer.id) ?? null,
      keywordsLatest: keywordsByCustomer.get(customer.id) ?? null,
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
  // Also count customers with zero integrations connected as "needing attention"
  for (const customer of customers) {
    if (customer.noIntegrationConnected) totalBrokenIntegrations += 1
  }

  const response: PortfolioSummaryResponse = {
    customers,
    actionBar: {
      pendingApprovals: totalPendingApprovals,
      overdueFollowups: 0,
      brokenIntegrations: totalBrokenIntegrations,
    },
    userRole,
    generatedAt: new Date().toISOString(),
  }

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
