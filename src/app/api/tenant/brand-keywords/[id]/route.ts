import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantAdmin, requireTenantUser } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  CUSTOMERS_WRITE,
} from '@/lib/rate-limit'

// ---------------------------------------------------------------------------
// PATCH /api/tenant/brand-keywords/[id]
// Body: { sentiment_alert_threshold: number | null }
// Admin-only (PROJ-67).
// ---------------------------------------------------------------------------
const PatchSchema = z.object({
  sentiment_alert_threshold: z
    .union([
      z.number().int().min(0).max(100),
      z.null(),
    ])
    .optional(),
})

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

  // Nur Admins dürfen Alert-Schwellwert konfigurieren
  const auth = await requireTenantAdmin(tenantId)
  if ('error' in auth) return auth.error

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Ungültige Keyword-ID.' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? 'Validierungsfehler.'
    return NextResponse.json({ error: firstIssue }, { status: 400 })
  }

  if (!('sentiment_alert_threshold' in parsed.data)) {
    return NextResponse.json(
      { error: 'Kein Feld zum Aktualisieren angegeben.' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  // Tenant-Scoped Lookup (Cross-Tenant-Schutz)
  const { data: existing, error: lookupError } = await admin
    .from('brand_keywords')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 })
  }
  if (!existing) {
    return NextResponse.json({ error: 'Keyword nicht gefunden.' }, { status: 404 })
  }

  const { error: updateError } = await admin
    .from('brand_keywords')
    .update({
      sentiment_alert_threshold: parsed.data.sentiment_alert_threshold ?? null,
    })
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    sentiment_alert_threshold:
      parsed.data.sentiment_alert_threshold ?? null,
  })
}

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
