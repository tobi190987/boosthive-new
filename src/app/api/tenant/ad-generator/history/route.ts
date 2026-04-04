import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  AD_GENERATOR_READ,
} from '@/lib/rate-limit'
import type { PlatformId } from '@/lib/ad-limits'

const platformSchema = z.enum(['facebook', 'linkedin', 'tiktok', 'google'])

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`ad-generator-read:${tenantId}:${getClientIp(request)}`, AD_GENERATOR_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'ad_generator')
  if ('error' in moduleAccess) return moduleAccess.error

  const customerId = request.nextUrl.searchParams.get('customerId')
  const platformRaw = request.nextUrl.searchParams.get('platform')
  const parsedPlatform = platformRaw ? platformSchema.safeParse(platformRaw) : null
  if (platformRaw && !parsedPlatform?.success) {
    return NextResponse.json({ error: 'Ungültiger Plattform-Filter.' }, { status: 400 })
  }
  const platformFilter = parsedPlatform?.success ? parsedPlatform.data : null

  const admin = createAdminClient()

  let query = admin
    .from('ad_generations')
    .select('id, briefing, customer_id, status, created_at, customers(name)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (customerId) {
    query = query.eq('customer_id', customerId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const generationIds = (data ?? []).map((row) => row.id)
  const approvalMap = new Map<string, 'draft' | 'pending_approval' | 'approved' | 'changes_requested'>()

  if (generationIds.length > 0) {
    const { data: approvals } = await admin
      .from('approval_requests')
      .select('content_id, status, created_at')
      .eq('tenant_id', tenantId)
      .eq('content_type', 'ad_generation')
      .in('content_id', generationIds)
      .order('created_at', { ascending: false })

    for (const approval of approvals ?? []) {
      if (!approvalMap.has(approval.content_id)) {
        approvalMap.set(
          approval.content_id,
          approval.status as 'draft' | 'pending_approval' | 'approved' | 'changes_requested'
        )
      }
    }
  }

  const generations = (data ?? [])
    .map((row) => {
      const briefing = isRecord(row.briefing) ? row.briefing : {}
      const platforms = extractPlatforms(briefing.platforms)
      const product =
        typeof briefing.product === 'string' && briefing.product.trim()
          ? briefing.product.trim()
          : 'Unbenanntes Produkt'

      return {
        id: row.id,
        product,
        platforms,
        customer_id: row.customer_id ?? null,
        customer_name: extractCustomerName(row.customers),
        created_at: row.created_at,
        status: row.status as 'pending' | 'completed' | 'failed',
        approval_status: approvalMap.get(row.id) ?? 'draft',
      }
    })
    .filter((entry) => (platformFilter ? entry.platforms.includes(platformFilter) : true))

  return NextResponse.json({ generations })
}

function extractPlatforms(value: unknown): PlatformId[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => platformSchema.safeParse(item))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data)
}

function extractCustomerName(value: unknown): string | null {
  if (Array.isArray(value)) {
    const first = value[0]
    if (isRecord(first) && typeof first.name === 'string' && first.name.trim()) return first.name.trim()
    return null
  }
  if (isRecord(value) && typeof value.name === 'string' && value.name.trim()) {
    return value.name.trim()
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
