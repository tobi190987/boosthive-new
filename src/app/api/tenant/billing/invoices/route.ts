import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { stripe } from '@/lib/stripe'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

/**
 * GET /api/tenant/billing/invoices
 * Returns the last 12 finalized invoices for the tenant's Stripe customer.
 * Admin-only.
 */
export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const rl = checkRateLimit(`billing-invoices:${tenantId}:${getClientIp(request)}`, {
    limit: 20,
    windowMs: 60_000,
  })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Zu viele Anfragen. Bitte warte einen Moment.' },
      { status: 429 }
    )
  }

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const supabaseAdmin = createAdminClient()

  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select('stripe_customer_id')
    .eq('id', tenantId)
    .single()

  if (tenantError || !tenant?.stripe_customer_id) {
    return NextResponse.json({ invoices: [] })
  }

  try {
    const stripeInvoices = await stripe.invoices.list({
      customer: tenant.stripe_customer_id,
      limit: 12,
      status: 'paid',
    })

    const invoices = stripeInvoices.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      amount_paid: inv.amount_paid,
      currency: inv.currency,
      status: inv.status,
      created: inv.created,
      invoice_pdf: inv.invoice_pdf,
      hosted_invoice_url: inv.hosted_invoice_url,
    }))

    return NextResponse.json({ invoices })
  } catch (err) {
    console.error('[GET /api/tenant/billing/invoices] Stripe-Fehler:', err)
    return NextResponse.json({ invoices: [] })
  }
}
