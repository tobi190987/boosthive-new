import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { executeTenantProfileUpdate } from '@/lib/profile-update'
import { ProfileUpdateSchema } from '@/lib/schemas/profile'
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

  const result = await executeTenantProfileUpdate({
    tenantId,
    userId: authResult.auth.userId,
    role: authResult.auth.role === 'admin' ? 'admin' : 'member',
    input: parsed.data,
  })

  if ('error' in result) {
    return result.error
  }

  return NextResponse.json({
    success: true,
    onboarding_complete: result.onboardingComplete,
    redirectTo: result.redirectTo,
  })
}
