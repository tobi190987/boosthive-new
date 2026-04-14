import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  CUSTOMERS_WRITE,
} from '@/lib/rate-limit'

// ---------------------------------------------------------------------------
// PATCH /api/tenant/brand-keywords/[id]/primary
// Setzt das Keyword als primäres Keyword des Kunden (max. 1 primäres pro Kunde).
// ---------------------------------------------------------------------------
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Ungültige Keyword-ID.' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: target, error: lookupError } = await admin
    .from('brand_keywords')
    .select('id, customer_id, is_primary')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 })
  }
  if (!target) {
    return NextResponse.json({ error: 'Keyword nicht gefunden.' }, { status: 404 })
  }

  if (target.is_primary) {
    return NextResponse.json({ success: true })
  }

  // Schritt 1: Bisheriges primäres Keyword zurücksetzen
  // (vor dem Setzen, da partial unique index sonst greift)
  const { error: clearError } = await admin
    .from('brand_keywords')
    .update({ is_primary: false })
    .eq('customer_id', target.customer_id)
    .eq('is_primary', true)

  if (clearError) {
    return NextResponse.json({ error: clearError.message }, { status: 500 })
  }

  // Schritt 2: Neues Keyword als primär markieren
  const { error: setError } = await admin
    .from('brand_keywords')
    .update({ is_primary: true })
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (setError) {
    return NextResponse.json({ error: setError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
