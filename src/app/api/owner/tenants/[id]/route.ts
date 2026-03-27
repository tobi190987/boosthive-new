import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/owner-auth'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  UpdateTenantBasicsSchema,
  UpdateTenantBillingSchema,
  UpdateTenantContactSchema,
  UpdateTenantStatusSchema,
} from '@/lib/schemas/tenant'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const TENANT_DETAIL_SELECT = `
  id,
  name,
  slug,
  status,
  created_at,
  billing_company,
  billing_street,
  billing_zip,
  billing_city,
  billing_country,
  billing_vat_id,
  contact_person,
  contact_phone,
  contact_website
`

function isUuid(value: string) {
  return UUID_REGEX.test(value)
}

async function getCurrentAdmin(tenantId: string) {
  const supabaseAdmin = createAdminClient()
  const { data: adminMembership, error: adminMembershipError } = await supabaseAdmin
    .from('tenant_members')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('role', 'admin')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (adminMembershipError) {
    return {
      data: null,
      error: adminMembershipError,
    }
  }

  if (!adminMembership?.user_id) {
    return {
      data: null,
      error: null,
    }
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(
    adminMembership.user_id
  )

  if (userError || !userData?.user) {
    return {
      data: null,
      error: userError ?? new Error('Admin-User konnte nicht geladen werden.'),
    }
  }

  const displayName =
    (userData.user.user_metadata?.display_name as string | undefined) ??
    (userData.user.email?.split('@')[0] ?? null)

  return {
    data: {
      id: userData.user.id,
      name: displayName,
      email: userData.user.email ?? null,
    },
    error: null,
  }
}

async function loadTenantDetail(tenantId: string) {
  const supabaseAdmin = createAdminClient()
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select(TENANT_DETAIL_SELECT)
    .eq('id', tenantId)
    .maybeSingle()

  if (tenantError) {
    return { tenant: null, currentAdmin: null, error: tenantError }
  }

  if (!tenant) {
    return { tenant: null, currentAdmin: null, error: null }
  }

  const currentAdminResult = await getCurrentAdmin(tenantId)
  return {
    tenant,
    currentAdmin: currentAdminResult.data,
    error: currentAdminResult.error,
  }
}

/**
 * GET /api/owner/tenants/[id]
 * Detailansicht für genau einen Tenant (nur für Owner).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOwner()
  if ('error' in auth) return auth.error

  const { id } = await params
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Ungültige Tenant-ID.' }, { status: 400 })
  }

  const { tenant, currentAdmin, error } = await loadTenantDetail(id)

  if (error) {
    console.error(`[GET /api/owner/tenants/${id}] Laden fehlgeschlagen:`, error)
    return NextResponse.json(
      { error: 'Tenant-Details konnten nicht geladen werden.' },
      { status: 500 }
    )
  }

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
  }

  return NextResponse.json({
    tenant: {
      ...tenant,
      currentAdmin,
    },
  })
}

/**
 * PATCH /api/owner/tenants/[id]
 * Aktualisiert Status oder Detaildaten eines Tenants (nur für Owner).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOwner()
  if ('error' in auth) return auth.error

  const { id } = await params
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Ungültige Tenant-ID.' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const operationType =
    typeof body === 'object' && body !== null && 'type' in body && typeof body.type === 'string'
      ? body.type
      : 'status'

  const supabaseAdmin = createAdminClient()

  if (operationType === 'status') {
    const parsed = UpdateTenantStatusSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validierungsfehler.', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .update({ status: parsed.data.status })
      .eq('id', id)
      .select(TENANT_DETAIL_SELECT)
      .maybeSingle()

    if (error) {
      console.error(`[PATCH /api/owner/tenants/${id}] Status-Update fehlgeschlagen:`, error)
      return NextResponse.json(
        { error: 'Tenant-Status konnte nicht aktualisiert werden.' },
        { status: 500 }
      )
    }

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
    }

    const currentAdminResult = await getCurrentAdmin(id)
    if (currentAdminResult.error) {
      console.error(
        `[PATCH /api/owner/tenants/${id}] Admin-Info nach Status-Update fehlgeschlagen:`,
        currentAdminResult.error
      )
    }

    return NextResponse.json({
      tenant: {
        ...tenant,
        currentAdmin: currentAdminResult.data,
      },
    })
  }

  if (operationType === 'basics') {
    const parsed = UpdateTenantBasicsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validierungsfehler.', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { data: conflictingTenant, error: conflictingTenantError } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('slug', parsed.data.slug)
      .neq('id', id)
      .maybeSingle()

    if (conflictingTenantError) {
      console.error(`[PATCH /api/owner/tenants/${id}] Slug-Prüfung fehlgeschlagen:`, conflictingTenantError)
      return NextResponse.json(
        { error: 'Tenant konnte nicht aktualisiert werden.' },
        { status: 500 }
      )
    }

    if (conflictingTenant) {
      return NextResponse.json(
        { error: `Die Subdomain "${parsed.data.slug}" ist bereits vergeben.` },
        { status: 409 }
      )
    }

    const { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .update({
        name: parsed.data.name,
        slug: parsed.data.slug,
      })
      .eq('id', id)
      .select(TENANT_DETAIL_SELECT)
      .maybeSingle()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `Die Subdomain "${parsed.data.slug}" ist bereits vergeben.` },
          { status: 409 }
        )
      }

      console.error(`[PATCH /api/owner/tenants/${id}] Basisdaten-Update fehlgeschlagen:`, error)
      return NextResponse.json(
        { error: 'Basisdaten konnten nicht gespeichert werden.' },
        { status: 500 }
      )
    }

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
    }

    const currentAdminResult = await getCurrentAdmin(id)
    if (currentAdminResult.error) {
      console.error(
        `[PATCH /api/owner/tenants/${id}] Admin-Info nach Basisdaten-Update fehlgeschlagen:`,
        currentAdminResult.error
      )
    }

    return NextResponse.json({
      tenant: {
        ...tenant,
        currentAdmin: currentAdminResult.data,
      },
    })
  }

  if (operationType === 'billing') {
    const parsed = UpdateTenantBillingSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validierungsfehler.', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { type: _type, ...billingValues } = parsed.data
    const { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .update(billingValues)
      .eq('id', id)
      .select(TENANT_DETAIL_SELECT)
      .maybeSingle()

    if (error) {
      console.error(`[PATCH /api/owner/tenants/${id}] Billing-Update fehlgeschlagen:`, error)
      return NextResponse.json(
        { error: 'Rechnungsadresse konnte nicht gespeichert werden.' },
        { status: 500 }
      )
    }

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
    }

    const currentAdminResult = await getCurrentAdmin(id)
    if (currentAdminResult.error) {
      console.error(
        `[PATCH /api/owner/tenants/${id}] Admin-Info nach Billing-Update fehlgeschlagen:`,
        currentAdminResult.error
      )
    }

    return NextResponse.json({
      tenant: {
        ...tenant,
        currentAdmin: currentAdminResult.data,
      },
    })
  }

  if (operationType === 'contact') {
    const parsed = UpdateTenantContactSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validierungsfehler.', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { type: _type, ...contactValues } = parsed.data
    const { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .update(contactValues)
      .eq('id', id)
      .select(TENANT_DETAIL_SELECT)
      .maybeSingle()

    if (error) {
      console.error(`[PATCH /api/owner/tenants/${id}] Kontakt-Update fehlgeschlagen:`, error)
      return NextResponse.json(
        { error: 'Kontaktdaten konnten nicht gespeichert werden.' },
        { status: 500 }
      )
    }

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
    }

    const currentAdminResult = await getCurrentAdmin(id)
    if (currentAdminResult.error) {
      console.error(
        `[PATCH /api/owner/tenants/${id}] Admin-Info nach Kontakt-Update fehlgeschlagen:`,
        currentAdminResult.error
      )
    }

    return NextResponse.json({
      tenant: {
        ...tenant,
        currentAdmin: currentAdminResult.data,
      },
    })
  }

  return NextResponse.json({ error: 'Unbekannter Update-Typ.' }, { status: 400 })
}
