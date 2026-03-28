import { NextResponse } from 'next/server'
import { hasRequiredBillingDetails } from '@/lib/profile'
import {
  BillingAddressSchema,
  type BillingAddressInput,
  type ProfileUpdateInput,
} from '@/lib/schemas/profile'
import { createAdminClient } from '@/lib/supabase-admin'

type TenantProfileRole = 'admin' | 'member'

interface TenantProfileUpdateParams {
  tenantId: string
  userId: string
  role: TenantProfileRole
  input: ProfileUpdateInput
}

interface TenantProfileUpdateResult {
  onboardingComplete: boolean
  redirectTo: string | null
}

interface TenantStripeData {
  stripe_customer_id: string | null
}

function errorResponse(error: string, status: number, details?: Record<string, string[] | undefined>) {
  return NextResponse.json(details ? { error, details } : { error }, { status })
}

function validateBillingAddress(input: ProfileUpdateInput) {
  const billingResult = BillingAddressSchema.safeParse({
    billing_company: input.billing_company ?? '',
    billing_street: input.billing_street ?? '',
    billing_zip: input.billing_zip ?? '',
    billing_city: input.billing_city ?? '',
    billing_country: input.billing_country ?? '',
    billing_vat_id: input.billing_vat_id ?? '',
  })

  if (!billingResult.success) {
    return {
      error: errorResponse(
        'Bitte hinterlege eine vollständige Rechnungsadresse.',
        400,
        billingResult.error.flatten().fieldErrors
      ),
    }
  }

  return { data: billingResult.data }
}

async function loadExistingAvatarUrl(userId: string) {
  const supabaseAdmin = createAdminClient()
  const { data: existingProfile, error } = await supabaseAdmin
    .from('user_profiles')
    .select('avatar_url')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[profile-update] Profil konnte nicht geladen werden:', error)
    return { error: errorResponse('Profil konnte nicht gespeichert werden.', 500) }
  }

  return { avatarUrl: existingProfile?.avatar_url ?? null }
}

async function saveUserProfile(params: {
  userId: string
  firstName: string
  lastName: string
  avatarUrl: string | null
}) {
  const supabaseAdmin = createAdminClient()
  const { error } = await supabaseAdmin.from('user_profiles').upsert({
    user_id: params.userId,
    first_name: params.firstName,
    last_name: params.lastName,
    avatar_url: params.avatarUrl,
  })

  if (error) {
    console.error('[profile-update] Profil konnte nicht gespeichert werden:', error)
    return { error: errorResponse('Profil konnte nicht gespeichert werden.', 500) }
  }

  return { success: true as const }
}

async function saveTenantBillingAddress(tenantId: string, billingAddress: BillingAddressInput) {
  const supabaseAdmin = createAdminClient()
  const { error } = await supabaseAdmin.from('tenants').update(billingAddress).eq('id', tenantId)

  if (error) {
    console.error('[profile-update] Rechnungsadresse konnte nicht gespeichert werden:', error)
    return { error: errorResponse('Rechnungsadresse konnte nicht gespeichert werden.', 500) }
  }

  return { success: true as const }
}

async function loadTenantStripeData(tenantId: string) {
  const supabaseAdmin = createAdminClient()
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('stripe_customer_id')
    .eq('id', tenantId)
    .maybeSingle<TenantStripeData>()

  if (error) {
    console.warn('[profile-update] Stripe-Tenantdaten konnten nicht geladen werden:', error)
    return { data: null }
  }

  if (!data) {
    console.warn('[profile-update] Stripe-Tenantdatensatz fehlt fuer:', tenantId)
    return { data: null }
  }

  return { data }
}

async function assertAdminOnboardingReady(tenantId: string, billingAddress: BillingAddressInput | null) {
  if (!hasRequiredBillingDetails(billingAddress)) {
    return {
      error: errorResponse('Bitte vervollständige zuerst die Rechnungsadresse.', 400),
    }
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return { success: true as const }
  }

  const stripeTenantData = await loadTenantStripeData(tenantId)
  const tenantData = stripeTenantData.data

  if (!tenantData?.stripe_customer_id) {
    console.warn(
      '[profile-update] Kein stripe_customer_id hinterlegt; Stripe-Pruefung wird uebersprungen.'
    )
    return { success: true as const }
  }

  let hasPaymentMethod = false

  try {
    const { stripe } = await import('@/lib/stripe')
    const paymentMethods = await stripe.paymentMethods.list({
      customer: tenantData.stripe_customer_id,
      type: 'card',
      limit: 1,
    })
    hasPaymentMethod = paymentMethods.data.length > 0
  } catch (error) {
    console.warn('[profile-update] Stripe-Pruefung fehlgeschlagen:', error)
  }

  if (!hasPaymentMethod) {
    return {
      error: errorResponse('Bitte hinterlege zuerst eine Zahlungsmethode für Stripe.', 400),
    }
  }

  return { success: true as const }
}

async function markAdminBillingOnboardingComplete(tenantId: string, completedAt: string) {
  const supabaseAdmin = createAdminClient()
  const { error } = await supabaseAdmin
    .from('tenants')
    .update({ billing_onboarding_completed_at: completedAt })
    .eq('id', tenantId)

  if (error) {
    console.error('[profile-update] Billing-Onboarding konnte nicht markiert werden:', error)
    return { error: errorResponse('Stripe-Status konnte nicht gespeichert werden.', 500) }
  }

  return { success: true as const }
}

async function markMemberOnboardingComplete(params: {
  tenantId: string
  userId: string
  completedAt: string
}) {
  const supabaseAdmin = createAdminClient()
  const { error } = await supabaseAdmin
    .from('tenant_members')
    .update({ onboarding_completed_at: params.completedAt })
    .eq('tenant_id', params.tenantId)
    .eq('user_id', params.userId)

  if (error) {
    console.error('[profile-update] Onboarding-Status konnte nicht gespeichert werden:', error)
    return { error: errorResponse('Onboarding konnte nicht abgeschlossen werden.', 500) }
  }

  return { success: true as const }
}

export async function executeTenantProfileUpdate(
  params: TenantProfileUpdateParams
): Promise<TenantProfileUpdateResult | { error: NextResponse }> {
  const billingAddress = params.role === 'admin' ? validateBillingAddress(params.input) : null

  if (billingAddress && 'error' in billingAddress) {
    return { error: billingAddress.error! }
  }

  const existingAvatar = await loadExistingAvatarUrl(params.userId)
  if ('error' in existingAvatar) {
    return { error: existingAvatar.error! }
  }

  const profileSave = await saveUserProfile({
    userId: params.userId,
    firstName: params.input.first_name,
    lastName: params.input.last_name,
    avatarUrl: existingAvatar.avatarUrl,
  })
  if ('error' in profileSave) {
    return { error: profileSave.error! }
  }

  const validatedBillingAddress = billingAddress?.data ?? null

  if (validatedBillingAddress) {
    const billingSave = await saveTenantBillingAddress(params.tenantId, validatedBillingAddress)
    if ('error' in billingSave) {
      return { error: billingSave.error! }
    }
  }

  if (!params.input.complete_onboarding) {
    return {
      onboardingComplete: false,
      redirectTo: null,
    }
  }

  const completedAt = new Date().toISOString()

  if (params.role === 'admin') {
    const onboardingGate = await assertAdminOnboardingReady(params.tenantId, validatedBillingAddress)
    if ('error' in onboardingGate) {
      return { error: onboardingGate.error! }
    }

    const billingCompleted = await markAdminBillingOnboardingComplete(params.tenantId, completedAt)
    if ('error' in billingCompleted) {
      return { error: billingCompleted.error! }
    }
  }

  const onboardingCompleted = await markMemberOnboardingComplete({
    tenantId: params.tenantId,
    userId: params.userId,
    completedAt,
  })
  if ('error' in onboardingCompleted) {
    return { error: onboardingCompleted.error! }
  }

  return {
    onboardingComplete: true,
    redirectTo: '/dashboard',
  }
}
