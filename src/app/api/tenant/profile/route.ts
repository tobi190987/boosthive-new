import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { hasRequiredBillingDetails } from '@/lib/profile'
import { BillingAddressSchema, ProfileUpdateSchema } from '@/lib/schemas/profile'
import { createAdminClient } from '@/lib/supabase-admin'

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const supabaseAdmin = createAdminClient()
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('first_name, last_name, avatar_url')
    .eq('user_id', authResult.auth.userId)
    .maybeSingle()

  let tenant:
    | {
        billing_company: string | null
        billing_street: string | null
        billing_zip: string | null
        billing_city: string | null
        billing_country: string | null
        billing_vat_id: string | null
        billing_onboarding_completed_at: string | null
      }
    | null = null

  if (authResult.auth.role === 'admin') {
    const { data: tenantData } = await supabaseAdmin
      .from('tenants')
      .select(
        'billing_company, billing_street, billing_zip, billing_city, billing_country, billing_vat_id, billing_onboarding_completed_at'
      )
      .eq('id', tenantId)
      .single()

    tenant = tenantData
  }

  return NextResponse.json({
    first_name: profile?.first_name ?? '',
    last_name: profile?.last_name ?? '',
    avatar_url: profile?.avatar_url ?? null,
    role: authResult.auth.role,
    billing_company: tenant?.billing_company ?? '',
    billing_street: tenant?.billing_street ?? '',
    billing_zip: tenant?.billing_zip ?? '',
    billing_city: tenant?.billing_city ?? '',
    billing_country: tenant?.billing_country ?? '',
    billing_vat_id: tenant?.billing_vat_id ?? '',
    billing_onboarding_completed_at: tenant?.billing_onboarding_completed_at ?? null,
  })
}

export async function PUT(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungueltige Eingabedaten.' }, { status: 400 })
  }

  const parsed = ProfileUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Bitte pruefe deine Eingaben.', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const input = parsed.data
  const supabaseAdmin = createAdminClient()
  let validatedBillingAddress:
    | {
        billing_company: string
        billing_street: string
        billing_zip: string
        billing_city: string
        billing_country: string
        billing_vat_id: string
      }
    | null = null
  const { data: existingProfile } = await supabaseAdmin
    .from('user_profiles')
    .select('avatar_url')
    .eq('user_id', authResult.auth.userId)
    .maybeSingle()

  const { error: profileError } = await supabaseAdmin.from('user_profiles').upsert({
    user_id: authResult.auth.userId,
    first_name: input.first_name,
    last_name: input.last_name,
    avatar_url: existingProfile?.avatar_url ?? null,
  })

  if (profileError) {
    console.error('[PUT /api/tenant/profile] Profil konnte nicht gespeichert werden:', profileError)
    return NextResponse.json({ error: 'Profil konnte nicht gespeichert werden.' }, { status: 500 })
  }

  if (authResult.auth.role === 'admin') {
    const billingResult = BillingAddressSchema.safeParse({
      billing_company: input.billing_company ?? '',
      billing_street: input.billing_street ?? '',
      billing_zip: input.billing_zip ?? '',
      billing_city: input.billing_city ?? '',
      billing_country: input.billing_country ?? '',
      billing_vat_id: input.billing_vat_id ?? '',
    })

    if (!billingResult.success) {
      return NextResponse.json(
        {
          error: 'Bitte hinterlege eine vollstaendige Rechnungsadresse.',
          details: billingResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    validatedBillingAddress = billingResult.data

    const { error: tenantError } = await supabaseAdmin
      .from('tenants')
      .update(validatedBillingAddress)
      .eq('id', tenantId)

    if (tenantError) {
      console.error('[PUT /api/tenant/profile] Rechnungsadresse konnte nicht gespeichert werden:', tenantError)
      return NextResponse.json(
        { error: 'Rechnungsadresse konnte nicht gespeichert werden.' },
        { status: 500 }
      )
    }
  }

  if (input.complete_onboarding) {
    if (authResult.auth.role === 'admin') {
      if (!hasRequiredBillingDetails(validatedBillingAddress)) {
        return NextResponse.json(
          { error: 'Bitte vervollstaendige zuerst die Rechnungsadresse.' },
          { status: 400 }
        )
      }

      if (process.env.STRIPE_SECRET_KEY) {
        const { data: tenantStripeData, error: tenantStripeError } = await supabaseAdmin
          .from('tenants')
          .select('stripe_customer_id')
          .eq('id', tenantId)
          .maybeSingle()

        if (tenantStripeError) {
          console.warn(
            '[PUT /api/tenant/profile] Stripe-Tenantdaten konnten nicht geladen werden:',
            tenantStripeError
          )
        } else if (!tenantStripeData) {
          console.warn('[PUT /api/tenant/profile] Stripe-Tenantdatensatz fehlt fuer:', tenantId)
        } else if (!tenantStripeData.stripe_customer_id) {
          console.warn(
            '[PUT /api/tenant/profile] Kein stripe_customer_id hinterlegt; Stripe-Pruefung wird uebersprungen.'
          )
        } else {
          let hasPaymentMethod = false

          try {
            const { stripe } = await import('@/lib/stripe')
            const paymentMethods = await stripe.paymentMethods.list({
              customer: tenantStripeData.stripe_customer_id,
              type: 'card',
              limit: 1,
            })
            hasPaymentMethod = paymentMethods.data.length > 0
          } catch (stripeError) {
            console.warn('[PUT /api/tenant/profile] Stripe-Pruefung fehlgeschlagen:', stripeError)
          }

          if (!hasPaymentMethod) {
            return NextResponse.json(
              { error: 'Bitte hinterlege zuerst eine Zahlungsmethode fuer Stripe.' },
              { status: 400 }
            )
          }
        }
      }

      const { error: billingStatusError } = await supabaseAdmin
        .from('tenants')
        .update({ billing_onboarding_completed_at: new Date().toISOString() })
        .eq('id', tenantId)

      if (billingStatusError) {
        console.error(
          '[PUT /api/tenant/profile] Billing-Onboarding konnte nicht markiert werden:',
          billingStatusError
        )
        return NextResponse.json(
          { error: 'Stripe-Status konnte nicht gespeichert werden.' },
          { status: 500 }
        )
      }
    }

    const { error: onboardingError } = await supabaseAdmin
      .from('tenant_members')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('user_id', authResult.auth.userId)

    if (onboardingError) {
      console.error('[PUT /api/tenant/profile] Onboarding-Status konnte nicht gespeichert werden:', onboardingError)
      return NextResponse.json(
        { error: 'Onboarding konnte nicht abgeschlossen werden.' },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({
    success: true,
    onboarding_complete: input.complete_onboarding,
    redirectTo: input.complete_onboarding ? '/dashboard' : null,
  })
}
