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
// DELETE /api/tenant/brand-keywords/[id]
// ---------------------------------------------------------------------------
export async function DELETE(
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

  // Tenant-Scoped Lookup zur Cross-Tenant-Absicherung
  const { data: existing, error: lookupError } = await admin
    .from('brand_keywords')
    .select('id, customer_id, is_primary')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 })
  }
  if (!existing) {
    return NextResponse.json({ error: 'Keyword nicht gefunden.' }, { status: 404 })
  }

  // Mindest-1-Keyword pro Kunde sicherstellen
  const { count } = await admin
    .from('brand_keywords')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', existing.customer_id)
    .eq('tenant_id', tenantId)

  if ((count ?? 0) <= 1) {
    return NextResponse.json(
      { error: 'Pro Kunde muss mindestens ein Brand-Keyword vorhanden sein.' },
      { status: 409 }
    )
  }

  const { error: deleteError } = await admin
    .from('brand_keywords')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  // War es das primäre Keyword? → Nächstes als primär setzen
  if (existing.is_primary) {
    const { data: next } = await admin
      .from('brand_keywords')
      .select('id')
      .eq('customer_id', existing.customer_id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (next) {
      await admin
        .from('brand_keywords')
        .update({ is_primary: true })
        .eq('id', next.id)
    }
  }

  return NextResponse.json({ success: true })
}
