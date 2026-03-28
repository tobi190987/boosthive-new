import { NextRequest, NextResponse } from 'next/server'
import { deleteTenantForOwner, listTenantUsers } from '@/lib/owner-tenant-management'
import { listOwnerAuditLogsForTenant, recordOwnerAuditLog } from '@/lib/owner-audit'
import { logAudit, logOperationalError } from '@/lib/observability'
import { requireOwner } from '@/lib/owner-auth'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  RestoreTenantSchema,
  UpdateTenantArchiveSchema,
  UpdateTenantBasicsSchema,
  UpdateTenantBillingSchema,
  UpdateTenantContactSchema,
  UpdateTenantStatusSchema,
} from '@/lib/schemas/tenant'
import { hasMissingTenantStatusColumnError, resolveTenantStatus } from '@/lib/tenant-status'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const TENANT_DETAIL_SELECT = `
  id,
  name,
  slug,
  status,
  created_at,
  billing_onboarding_completed_at,
  subscription_status,
  archived_at,
  archived_by,
  archive_reason,
  logo_url,
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

function serializeTenantForOwner(tenant: Record<string, unknown>) {
  const resolution = resolveTenantStatus({
    status: typeof tenant.status === 'string' ? tenant.status : null,
    subscription_status:
      typeof tenant.subscription_status === 'string' ? tenant.subscription_status : null,
    billing_onboarding_completed_at:
      typeof tenant.billing_onboarding_completed_at === 'string'
        ? tenant.billing_onboarding_completed_at
        : null,
    archived_at: typeof tenant.archived_at === 'string' ? tenant.archived_at : null,
  })

  return {
    ...tenant,
    base_status: tenant.status,
    status: resolution.effectiveStatus,
    status_reason: resolution.reason,
    status_allows_login: resolution.allowsLogin,
    is_archived: Boolean(tenant.archived_at),
  }
}

async function getCurrentAdmin(tenantId: string) {
  const supabaseAdmin = createAdminClient()
  const { data: adminMemberships, error: adminMembershipError } = await supabaseAdmin
    .from('tenant_members')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('role', 'admin')
    .eq('status', 'active')
    .order('joined_at', { ascending: true, nullsFirst: true })
    .order('invited_at', { ascending: true, nullsFirst: true })

  if (adminMembershipError) {
    return {
      data: null,
      error: adminMembershipError,
    }
  }

  if (!adminMemberships?.length) {
    return {
      data: null,
      error: null,
    }
  }

  for (const adminMembership of adminMemberships) {
    if (!adminMembership.user_id) {
      continue
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(
      adminMembership.user_id
    )

    if (userError || !userData?.user) {
      logOperationalError('owner_tenant_detail_admin_user_missing', userError, {
        tenantId,
        adminUserId: adminMembership.user_id,
      })
      continue
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

  return {
    data: null,
    error: null,
  }
}

async function loadTenantDetail(tenantId: string) {
  const supabaseAdmin = createAdminClient()
  let tenantLookup = await supabaseAdmin
    .from('tenants')
    .select(TENANT_DETAIL_SELECT)
    .eq('id', tenantId)
    .maybeSingle()

  if (hasMissingTenantStatusColumnError(tenantLookup.error, 'subscription_status')) {
    tenantLookup = await supabaseAdmin
      .from('tenants')
      .select(`
        id,
        name,
        slug,
        status,
        created_at,
        billing_onboarding_completed_at,
        archived_at,
        archived_by,
        archive_reason,
        logo_url,
        billing_company,
        billing_street,
        billing_zip,
        billing_city,
        billing_country,
        billing_vat_id,
        contact_person,
        contact_phone,
        contact_website
      `)
      .eq('id', tenantId)
      .maybeSingle()
  }

  if (hasMissingTenantStatusColumnError(tenantLookup.error, 'billing_onboarding_completed_at')) {
    tenantLookup = await supabaseAdmin
      .from('tenants')
      .select(`
        id,
        name,
        slug,
        status,
        created_at,
        archived_at,
        archived_by,
        archive_reason,
        logo_url,
        billing_company,
        billing_street,
        billing_zip,
        billing_city,
        billing_country,
        billing_vat_id,
        contact_person,
        contact_phone,
        contact_website
      `)
      .eq('id', tenantId)
      .maybeSingle()
  }

  if (hasMissingTenantStatusColumnError(tenantLookup.error, 'archived_at')) {
    tenantLookup = await supabaseAdmin
      .from('tenants')
      .select(`
        id,
        name,
        slug,
        status,
        created_at,
        logo_url,
        billing_company,
        billing_street,
        billing_zip,
        billing_city,
        billing_country,
        billing_vat_id,
        contact_person,
        contact_phone,
        contact_website
      `)
      .eq('id', tenantId)
      .maybeSingle()
  }

  const { data: tenant, error: tenantError } = tenantLookup

  if (tenantError) {
    return { tenant: null, currentAdmin: null, users: [], auditLogs: [], error: tenantError }
  }

  if (!tenant) {
    return { tenant: null, currentAdmin: null, users: [], auditLogs: [], error: null }
  }

  const users = await listTenantUsers(supabaseAdmin, tenantId)
  const currentAdminResult = await getCurrentAdmin(tenantId)
  const auditLogs = await listOwnerAuditLogsForTenant(tenantId)
  return {
    tenant,
    currentAdmin: currentAdminResult.data,
    users,
    auditLogs,
    error: currentAdminResult.error,
  }
}

async function reloadTenantRecord(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  tenantId: string
) {
  let tenantLookup = await supabaseAdmin
    .from('tenants')
    .select(TENANT_DETAIL_SELECT)
    .eq('id', tenantId)
    .maybeSingle()

  if (hasMissingTenantStatusColumnError(tenantLookup.error, 'subscription_status')) {
    tenantLookup = await supabaseAdmin
      .from('tenants')
      .select(`
        id,
        name,
        slug,
        status,
        created_at,
        billing_onboarding_completed_at,
        archived_at,
        archived_by,
        archive_reason,
        logo_url,
        billing_company,
        billing_street,
        billing_zip,
        billing_city,
        billing_country,
        billing_vat_id,
        contact_person,
        contact_phone,
        contact_website
      `)
      .eq('id', tenantId)
      .maybeSingle()
  }

  if (hasMissingTenantStatusColumnError(tenantLookup.error, 'billing_onboarding_completed_at')) {
    tenantLookup = await supabaseAdmin
      .from('tenants')
      .select(`
        id,
        name,
        slug,
        status,
        created_at,
        archived_at,
        archived_by,
        archive_reason,
        logo_url,
        billing_company,
        billing_street,
        billing_zip,
        billing_city,
        billing_country,
        billing_vat_id,
        contact_person,
        contact_phone,
        contact_website
      `)
      .eq('id', tenantId)
      .maybeSingle()
  }

  if (hasMissingTenantStatusColumnError(tenantLookup.error, 'archived_at')) {
    tenantLookup = await supabaseAdmin
      .from('tenants')
      .select(`
        id,
        name,
        slug,
        status,
        created_at,
        logo_url,
        billing_company,
        billing_street,
        billing_zip,
        billing_city,
        billing_country,
        billing_vat_id,
        contact_person,
        contact_phone,
        contact_website
      `)
      .eq('id', tenantId)
      .maybeSingle()
  }

  return tenantLookup
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

  const { tenant, currentAdmin, users, auditLogs, error } = await loadTenantDetail(id)

  if (error) {
    logOperationalError('owner_tenant_detail_load_failed', error, {
      ownerUserId: auth.userId,
      tenantId: id,
    })
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
      ...serializeTenantForOwner(tenant),
      currentAdmin,
      users,
      auditLogs,
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

  if (operationType === 'archive') {
    const parsed = UpdateTenantArchiveSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validierungsfehler.', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const archivedAt = new Date().toISOString()
    const { error } = await supabaseAdmin
      .from('tenants')
      .update({
        archived_at: archivedAt,
        archived_by: auth.userId,
        archive_reason: parsed.data.archiveReason,
      })
      .eq('id', id)

    if (error) {
      logOperationalError('owner_tenant_archive_failed', error, {
        ownerUserId: auth.userId,
        tenantId: id,
      })
      return NextResponse.json(
        { error: 'Tenant konnte nicht archiviert werden.' },
        { status: 500 }
      )
    }

    const tenantReload = await reloadTenantRecord(supabaseAdmin, id)
    const tenant = tenantReload.data

    if (tenantReload.error) {
      logOperationalError('owner_tenant_archive_reload_failed', tenantReload.error, {
        ownerUserId: auth.userId,
        tenantId: id,
      })
      return NextResponse.json(
        { error: 'Tenant konnte nicht archiviert werden.' },
        { status: 500 }
      )
    }

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
    }

    const currentAdminResult = await getCurrentAdmin(id)
    logAudit('owner_tenant_archived', {
      ownerUserId: auth.userId,
      tenantId: id,
      archiveReason: parsed.data.archiveReason,
    })
    await recordOwnerAuditLog({
      actorUserId: auth.userId,
      tenantId: id,
      eventType: 'tenant_archived',
      context: {
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        archiveReason: parsed.data.archiveReason,
        archivedAt,
      },
    })
    return NextResponse.json({
      tenant: {
        ...serializeTenantForOwner(tenant),
        currentAdmin: currentAdminResult.data,
      },
    })
  }

  if (operationType === 'restore') {
    const parsed = RestoreTenantSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validierungsfehler.', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin
      .from('tenants')
      .update({
        archived_at: null,
        archived_by: null,
        archive_reason: null,
      })
      .eq('id', id)

    if (error) {
      logOperationalError('owner_tenant_restore_failed', error, {
        ownerUserId: auth.userId,
        tenantId: id,
      })
      return NextResponse.json(
        { error: 'Tenant konnte nicht wiederhergestellt werden.' },
        { status: 500 }
      )
    }

    const tenantReload = await reloadTenantRecord(supabaseAdmin, id)
    const tenant = tenantReload.data

    if (tenantReload.error) {
      logOperationalError('owner_tenant_restore_reload_failed', tenantReload.error, {
        ownerUserId: auth.userId,
        tenantId: id,
      })
      return NextResponse.json(
        { error: 'Tenant konnte nicht wiederhergestellt werden.' },
        { status: 500 }
      )
    }

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
    }

    const currentAdminResult = await getCurrentAdmin(id)
    logAudit('owner_tenant_restored', {
      ownerUserId: auth.userId,
      tenantId: id,
    })
    await recordOwnerAuditLog({
      actorUserId: auth.userId,
      tenantId: id,
      eventType: 'tenant_restored',
      context: {
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
      },
    })
    return NextResponse.json({
      tenant: {
        ...serializeTenantForOwner(tenant),
        currentAdmin: currentAdminResult.data,
      },
    })
  }

  if (operationType === 'status') {
    const parsed = UpdateTenantStatusSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validierungsfehler.', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin
      .from('tenants')
      .update({ status: parsed.data.status })
      .eq('id', id)

    if (error) {
      logOperationalError('owner_tenant_status_update_failed', error, {
        ownerUserId: auth.userId,
        tenantId: id,
        nextStatus: parsed.data.status,
      })
      return NextResponse.json(
        { error: 'Tenant-Status konnte nicht aktualisiert werden.' },
        { status: 500 }
      )
    }

    const tenantReload = await reloadTenantRecord(supabaseAdmin, id)
    const tenant = tenantReload.data

    if (tenantReload.error) {
      logOperationalError('owner_tenant_status_reload_failed', tenantReload.error, {
        ownerUserId: auth.userId,
        tenantId: id,
        nextStatus: parsed.data.status,
      })
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
      logOperationalError('owner_tenant_status_admin_reload_failed', currentAdminResult.error, {
        ownerUserId: auth.userId,
        tenantId: id,
        nextStatus: parsed.data.status,
      })
    }

    logAudit('owner_tenant_status_updated', {
      ownerUserId: auth.userId,
      tenantId: id,
      status: parsed.data.status,
    })
    const serializedTenant = serializeTenantForOwner(tenant)
    await recordOwnerAuditLog({
      actorUserId: auth.userId,
      tenantId: id,
      eventType: 'tenant_status_updated',
      context: {
        status: serializedTenant.status,
        baseStatus: parsed.data.status,
        statusReason: serializedTenant.status_reason,
      },
    })
    return NextResponse.json({
      tenant: {
        ...serializedTenant,
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
      logOperationalError('owner_tenant_slug_conflict_check_failed', conflictingTenantError, {
        ownerUserId: auth.userId,
        tenantId: id,
        slug: parsed.data.slug,
      })
      return NextResponse.json(
        { error: 'Tenant konnte nicht aktualisiert werden.' },
        { status: 500 }
      )
    }

    if (conflictingTenant) {
      return NextResponse.json(
        {
          error: `Die Subdomain "${parsed.data.slug}" ist bereits vergeben.`,
          details: {
            slug: [`Die Subdomain "${parsed.data.slug}" ist bereits vergeben.`],
          },
        },
        { status: 409 }
      )
    }

    const { error } = await supabaseAdmin
      .from('tenants')
      .update({
        name: parsed.data.name,
        slug: parsed.data.slug,
      })
      .eq('id', id)

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          {
            error: `Die Subdomain "${parsed.data.slug}" ist bereits vergeben.`,
            details: {
              slug: [`Die Subdomain "${parsed.data.slug}" ist bereits vergeben.`],
            },
          },
          { status: 409 }
        )
      }

      console.error(`[PATCH /api/owner/tenants/${id}] Basisdaten-Update fehlgeschlagen:`, error)
      logOperationalError('owner_tenant_basics_update_failed', error, {
        ownerUserId: auth.userId,
        tenantId: id,
        slug: parsed.data.slug,
        name: parsed.data.name,
      })
      return NextResponse.json(
        { error: 'Basisdaten konnten nicht gespeichert werden.' },
        { status: 500 }
      )
    }

    const tenantReload = await reloadTenantRecord(supabaseAdmin, id)
    const tenant = tenantReload.data

    if (tenantReload.error) {
      logOperationalError('owner_tenant_basics_reload_failed', tenantReload.error, {
        ownerUserId: auth.userId,
        tenantId: id,
        slug: parsed.data.slug,
        name: parsed.data.name,
      })
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
      logOperationalError('owner_tenant_basics_admin_reload_failed', currentAdminResult.error, {
        ownerUserId: auth.userId,
        tenantId: id,
      })
    }

    logAudit('owner_tenant_basics_updated', {
      ownerUserId: auth.userId,
      tenantId: id,
      slug: parsed.data.slug,
      name: parsed.data.name,
    })
    await recordOwnerAuditLog({
      actorUserId: auth.userId,
      tenantId: id,
      eventType: 'tenant_basics_updated',
      context: {
        name: parsed.data.name,
        slug: parsed.data.slug,
      },
    })
      return NextResponse.json({
        tenant: {
          ...serializeTenantForOwner(tenant),
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
    const { error } = await supabaseAdmin
      .from('tenants')
      .update(billingValues)
      .eq('id', id)

    if (error) {
      logOperationalError('owner_tenant_billing_update_failed', error, {
        ownerUserId: auth.userId,
        tenantId: id,
      })
      return NextResponse.json(
        { error: 'Rechnungsadresse konnte nicht gespeichert werden.' },
        { status: 500 }
      )
    }

    const tenantReload = await reloadTenantRecord(supabaseAdmin, id)
    const tenant = tenantReload.data

    if (tenantReload.error) {
      logOperationalError('owner_tenant_billing_reload_failed', tenantReload.error, {
        ownerUserId: auth.userId,
        tenantId: id,
      })
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
      logOperationalError('owner_tenant_billing_admin_reload_failed', currentAdminResult.error, {
        ownerUserId: auth.userId,
        tenantId: id,
      })
    }

    logAudit('owner_tenant_billing_updated', {
      ownerUserId: auth.userId,
      tenantId: id,
    })
    await recordOwnerAuditLog({
      actorUserId: auth.userId,
      tenantId: id,
      eventType: 'tenant_billing_updated',
      context: billingValues,
    })
      return NextResponse.json({
        tenant: {
          ...serializeTenantForOwner(tenant),
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
    const { error } = await supabaseAdmin
      .from('tenants')
      .update(contactValues)
      .eq('id', id)

    if (error) {
      logOperationalError('owner_tenant_contact_update_failed', error, {
        ownerUserId: auth.userId,
        tenantId: id,
      })
      return NextResponse.json(
        { error: 'Kontaktdaten konnten nicht gespeichert werden.' },
        { status: 500 }
      )
    }

    const tenantReload = await reloadTenantRecord(supabaseAdmin, id)
    const tenant = tenantReload.data

    if (tenantReload.error) {
      logOperationalError('owner_tenant_contact_reload_failed', tenantReload.error, {
        ownerUserId: auth.userId,
        tenantId: id,
      })
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
      logOperationalError('owner_tenant_contact_admin_reload_failed', currentAdminResult.error, {
        ownerUserId: auth.userId,
        tenantId: id,
      })
    }

    logAudit('owner_tenant_contact_updated', {
      ownerUserId: auth.userId,
      tenantId: id,
    })
    await recordOwnerAuditLog({
      actorUserId: auth.userId,
      tenantId: id,
      eventType: 'tenant_contact_updated',
      context: contactValues,
    })
      return NextResponse.json({
        tenant: {
          ...serializeTenantForOwner(tenant),
          currentAdmin: currentAdminResult.data,
        },
      })
  }

  return NextResponse.json({ error: 'Unbekannter Update-Typ.' }, { status: 400 })
}

/**
 * DELETE /api/owner/tenants/[id]
 * Löscht einen Tenant und bereinigt verwaiste Auth-User.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOwner()
  if ('error' in auth) return auth.error

  const { id } = await params
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Ungültige Tenant-ID.' }, { status: 400 })
  }

  const supabaseAdmin = createAdminClient()
  const mode = request.nextUrl.searchParams.get('mode') === 'hard' ? 'hard' : 'archive'

  if (mode === 'archive') {
    const archivedAt = new Date().toISOString()
    const { error } = await supabaseAdmin
      .from('tenants')
      .update({
        archived_at: archivedAt,
        archived_by: auth.userId,
      })
      .eq('id', id)

    if (error) {
      logOperationalError('owner_tenant_delete_soft_archive_failed', error, {
        ownerUserId: auth.userId,
        tenantId: id,
      })
      return NextResponse.json(
        { error: 'Tenant konnte nicht archiviert werden.' },
        { status: 500 }
      )
    }

    const tenantReload = await reloadTenantRecord(supabaseAdmin, id)
    if (tenantReload.error) {
      logOperationalError('owner_tenant_delete_soft_archive_reload_failed', tenantReload.error, {
        ownerUserId: auth.userId,
        tenantId: id,
      })
      return NextResponse.json(
        { error: 'Tenant konnte nicht archiviert werden.' },
        { status: 500 }
      )
    }

    if (!tenantReload.data) {
      return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
    }

    await recordOwnerAuditLog({
      actorUserId: auth.userId,
      tenantId: id,
      eventType: 'tenant_archived',
      context: {
        tenantName: tenantReload.data.name,
        tenantSlug: tenantReload.data.slug,
        archivedAt,
        source: 'delete_endpoint_default',
      },
    })

    return NextResponse.json({
      success: true,
      mode,
      tenant: serializeTenantForOwner(tenantReload.data),
    })
  }

  const tenantReload = await reloadTenantRecord(supabaseAdmin, id)
  const tenantBeforeDelete = tenantReload.data

  if (tenantReload.error) {
    logOperationalError('owner_tenant_hard_delete_precheck_failed', tenantReload.error, {
      ownerUserId: auth.userId,
      tenantId: id,
    })
    return NextResponse.json(
      { error: 'Tenant konnte nicht gelöscht werden.' },
      { status: 500 }
    )
  }

  if (!tenantBeforeDelete) {
    return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
  }

  if (!tenantBeforeDelete.archived_at) {
    return NextResponse.json(
      { error: 'Harte Löschung ist nur für bereits archivierte Tenants erlaubt.' },
      { status: 409 }
    )
  }

  try {
    const result = await deleteTenantForOwner(supabaseAdmin, id)

    if (!result.deleted) {
      return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
    }

    if (result.cleanupErrors.length > 0) {
      logOperationalError('owner_tenant_delete_cleanup_incomplete', result.cleanupErrors, {
        ownerUserId: auth.userId,
        tenantId: id,
      })
    }

    logAudit('owner_tenant_deleted', {
      ownerUserId: auth.userId,
      tenantId: id,
      deletedAuthUsers: result.deletedAuthUsers,
      cleanupErrors: result.cleanupErrors.length,
    })
    await recordOwnerAuditLog({
      actorUserId: auth.userId,
      tenantId: id,
      eventType: 'tenant_deleted',
      context: {
        tenantName: result.tenant.name,
        deletedAuthUsers: result.deletedAuthUsers,
        cleanupErrors: result.cleanupErrors.length,
      },
    })
    return NextResponse.json({
      success: true,
      tenant: result.tenant,
      deletedAuthUsers: result.deletedAuthUsers,
      cleanupErrors: result.cleanupErrors,
    })
  } catch (error) {
    logOperationalError('owner_tenant_delete_failed', error, {
      ownerUserId: auth.userId,
      tenantId: id,
    })
    return NextResponse.json(
      { error: 'Tenant konnte nicht gelöscht werden.' },
      { status: 500 }
    )
  }
}
