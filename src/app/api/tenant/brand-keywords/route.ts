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

const KEYWORD_MAX_PER_CUSTOMER = 5

const KeywordSchema = z
  .string()
  .trim()
  .min(2, 'Keyword muss mindestens 2 Zeichen haben.')
  .max(60, 'Keyword darf maximal 60 Zeichen haben.')
  .regex(
    /^[\p{L}\p{N}\s&.\-']+$/u,
    'Keyword enthält ungültige Sonderzeichen.'
  )

const CreateBrandKeywordSchema = z.object({
  customer_id: z.string().uuid('Ungültige customer_id.'),
  keyword: KeywordSchema,
})

interface BrandKeywordRow {
  id: string
  keyword: string
  is_primary: boolean
  created_at: string
}

function serialize(row: BrandKeywordRow) {
  return {
    id: row.id,
    keyword: row.keyword,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
  }
}

async function ensureCustomerBelongsToTenant(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  customerId: string
): Promise<boolean> {
  const { data } = await admin
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle()
  return !!data
}

// ---------------------------------------------------------------------------
// GET /api/tenant/brand-keywords?customer_id=…
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const rl = checkRateLimit(
    `brand-keywords-read:${tenantId}:${getClientIp(request)}`,
    CUSTOMERS_READ
  )
  if (!rl.allowed) return rateLimitResponse(rl)

  const auth = await requireTenantUser(tenantId)
  if ('error' in auth) return auth.error

  const customerId = request.nextUrl.searchParams.get('customer_id')
  if (!customerId || !z.string().uuid().safeParse(customerId).success) {
    return NextResponse.json(
      { error: 'Ungültige oder fehlende customer_id.' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  if (!(await ensureCustomerBelongsToTenant(admin, tenantId, customerId))) {
    return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })
  }

  const { data, error } = await admin
    .from('brand_keywords')
    .select('id, keyword, is_primary, created_at')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(KEYWORD_MAX_PER_CUSTOMER + 5)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    keywords: (data ?? []).map((row) => serialize(row as BrandKeywordRow)),
  })
}

// ---------------------------------------------------------------------------
// POST /api/tenant/brand-keywords
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const rl = checkRateLimit(
    `brand-keywords-write:${tenantId}:${getClientIp(request)}`,
    CUSTOMERS_WRITE
  )
  if (!rl.allowed) return rateLimitResponse(rl)

  const auth = await requireTenantUser(tenantId)
  if ('error' in auth) return auth.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = CreateBrandKeywordSchema.safeParse(body)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? 'Validierungsfehler.'
    return NextResponse.json({ error: firstIssue }, { status: 400 })
  }

  const { customer_id, keyword } = parsed.data
  const normalizedKeyword = keyword.trim()
  const admin = createAdminClient()

  if (!(await ensureCustomerBelongsToTenant(admin, tenantId, customer_id))) {
    return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })
  }

  // Limit-Prüfung: max. 5 pro Customer
  const { count, error: countError } = await admin
    .from('brand_keywords')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customer_id)

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 })
  }

  if ((count ?? 0) >= KEYWORD_MAX_PER_CUSTOMER) {
    return NextResponse.json(
      { error: `Maximal ${KEYWORD_MAX_PER_CUSTOMER} Keywords pro Kunde erlaubt.` },
      { status: 409 }
    )
  }

  // Erstes Keyword wird automatisch primär
  const isPrimary = (count ?? 0) === 0

  const { data, error } = await admin
    .from('brand_keywords')
    .insert({
      tenant_id: tenantId,
      customer_id,
      keyword: normalizedKeyword,
      is_primary: isPrimary,
      created_by: auth.auth.userId,
    })
    .select('id, keyword, is_primary, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Dieses Keyword existiert bereits für den Kunden.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    { keyword: serialize(data as BrandKeywordRow) },
    { status: 201 }
  )
}
