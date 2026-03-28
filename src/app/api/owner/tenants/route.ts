import { NextRequest, NextResponse } from 'next/server'
import { buildTenantUrl, overrideActionLinkRedirect, sendWelcome } from '@/lib/email'
import { recordOwnerAuditLog } from '@/lib/owner-audit'
import { logAudit, logOperationalError, logSecurity } from '@/lib/observability'
import { requireOwner } from '@/lib/owner-auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { CreateTenantSchema } from '@/lib/schemas/tenant'
import { stripe } from '@/lib/stripe'
import { hasMissingTenantStatusColumnError, resolveTenantStatus } from '@/lib/tenant-status'
import crypto from 'crypto'

type TenantStatusFilter = 'active' | 'inactive' | 'all'
type TenantArchivedFilter = 'exclude' | 'include' | 'only'

function parsePositiveInteger(value: string | null, fallback: number) {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * GET /api/owner/tenants
 * Alle Tenants auflisten (nur für Owner).
 */
export async function GET(request: NextRequest) {
  const auth = await requireOwner()
  if ('error' in auth) return auth.error

  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q')?.trim() ?? ''
  const statusParam = searchParams.get('status')
  const status: TenantStatusFilter =
    statusParam === 'active' || statusParam === 'inactive' || statusParam === 'all'
      ? statusParam
      : 'all'
  const archivedParam = searchParams.get('archived')
  const archived: TenantArchivedFilter =
    archivedParam === 'include' || archivedParam === 'only' ? archivedParam : 'exclude'
  const page = parsePositiveInteger(searchParams.get('page'), 1)
  const requestedPageSize = parsePositiveInteger(searchParams.get('pageSize'), 20)
  const pageSize = Math.min(requestedPageSize, 50)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const supabaseAdmin = createAdminClient()
  let dataQuery = supabaseAdmin
    .from('tenants')
    .select(
      'id, name, slug, status, created_at, subscription_status, billing_onboarding_completed_at, archived_at, archive_reason'
    )
    .order('created_at', { ascending: false })

  if (query.length > 0) {
    const escapedQuery = query.replace(/[%_]/g, '\\$&')
    const pattern = `%${escapedQuery}%`
    dataQuery = dataQuery.or(`name.ilike.${pattern},slug.ilike.${pattern}`)
  }

  let tenantResult = (await dataQuery) as {
    data: Record<string, unknown>[] | null
    error: unknown
  }

  if (hasMissingTenantStatusColumnError(tenantResult.error, 'subscription_status')) {
    let fallbackQuery = supabaseAdmin
      .from('tenants')
      .select('id, name, slug, status, created_at, billing_onboarding_completed_at, archived_at, archive_reason')
      .order('created_at', { ascending: false })

    if (query.length > 0) {
      const escapedQuery = query.replace(/[%_]/g, '\\$&')
      const pattern = `%${escapedQuery}%`
      fallbackQuery = fallbackQuery.or(`name.ilike.${pattern},slug.ilike.${pattern}`)
    }

    tenantResult = (await fallbackQuery) as typeof tenantResult
  }

  if (hasMissingTenantStatusColumnError(tenantResult.error, 'billing_onboarding_completed_at')) {
    let fallbackQuery = supabaseAdmin
      .from('tenants')
      .select('id, name, slug, status, created_at, archived_at, archive_reason')
      .order('created_at', { ascending: false })

    if (query.length > 0) {
      const escapedQuery = query.replace(/[%_]/g, '\\$&')
      const pattern = `%${escapedQuery}%`
      fallbackQuery = fallbackQuery.or(`name.ilike.${pattern},slug.ilike.${pattern}`)
    }

    tenantResult = (await fallbackQuery) as typeof tenantResult
  }

  if (hasMissingTenantStatusColumnError(tenantResult.error, 'archived_at')) {
    let fallbackQuery = supabaseAdmin
      .from('tenants')
      .select('id, name, slug, status, created_at')
      .order('created_at', { ascending: false })

    if (query.length > 0) {
      const escapedQuery = query.replace(/[%_]/g, '\\$&')
      const pattern = `%${escapedQuery}%`
      fallbackQuery = fallbackQuery.or(`name.ilike.${pattern},slug.ilike.${pattern}`)
    }

    tenantResult = (await fallbackQuery) as typeof tenantResult
  }

  const { data: tenants, error } = tenantResult

  if (error) {
    logOperationalError('owner_tenant_list_load_failed', error, {
      ownerUserId: auth.userId,
      query,
      status,
      archived,
      page,
      pageSize,
    })
    return NextResponse.json(
      { error: 'Tenants konnten nicht geladen werden.' },
      { status: 500 }
    )
  }

  const resolvedTenants = (tenants ?? []).map((tenant) => {
    const resolution = resolveTenantStatus(tenant)
    return {
      id: tenant.id as string,
      name: tenant.name as string,
      slug: tenant.slug as string,
      status: resolution.effectiveStatus,
      base_status: tenant.status,
      status_reason: resolution.reason,
      status_allows_login: resolution.allowsLogin,
      created_at: tenant.created_at as string,
      archived_at: 'archived_at' in tenant ? tenant.archived_at : null,
      is_archived: Boolean('archived_at' in tenant && tenant.archived_at),
      archive_reason: 'archive_reason' in tenant ? tenant.archive_reason : null,
    }
  })

  const archiveFilteredTenants =
    archived === 'only'
      ? resolvedTenants.filter((tenant) => tenant.is_archived)
      : archived === 'include'
        ? resolvedTenants
        : resolvedTenants.filter((tenant) => !tenant.is_archived)

  const filteredTenants =
    status === 'all'
      ? archiveFilteredTenants
      : status === 'active'
        ? archiveFilteredTenants.filter((tenant) => tenant.status === 'active')
        : archiveFilteredTenants.filter((tenant) => tenant.status !== 'active')

  const paginatedTenants = filteredTenants.slice(from, to + 1)
  const tenantIds = paginatedTenants.map((tenant) => tenant.id)
  let memberCountMap = new Map<string, number>()

  if (tenantIds.length > 0) {
    const { data: members, error: membersError } = await supabaseAdmin
      .from('tenant_members')
      .select('tenant_id')
      .in('tenant_id', tenantIds)
      .eq('status', 'active')

    if (membersError) {
      logOperationalError('owner_tenant_list_member_count_failed', membersError, {
        ownerUserId: auth.userId,
        tenantIds,
      })
      return NextResponse.json(
        { error: 'Tenants konnten nicht geladen werden.' },
        { status: 500 }
      )
    }

    memberCountMap = (members ?? []).reduce((map, member) => {
      map.set(member.tenant_id, (map.get(member.tenant_id) ?? 0) + 1)
      return map
    }, new Map<string, number>())
  }

  const enrichedTenants = paginatedTenants.map((tenant) => ({
    ...tenant,
    memberCount: memberCountMap.get(tenant.id) ?? 0,
  }))

  return NextResponse.json({
    tenants: enrichedTenants,
    pagination: {
      page,
      pageSize,
      total: filteredTenants.length,
      totalPages: Math.max(1, Math.ceil(filteredTenants.length / pageSize)),
    },
    filters: {
      q: query,
      status,
      archived,
    },
  })
}

/**
 * POST /api/owner/tenants
 * Neuen Tenant mit initialem Admin-User atomar anlegen.
 */
export async function POST(request: NextRequest) {
  // Owner-Authentifizierung prüfen
  const auth = await requireOwner()
  if ('error' in auth) return auth.error

  // Request-Body parsen
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Ungültiger JSON-Body.' },
      { status: 400 }
    )
  }

  // Input mit Zod validieren
  const parsed = CreateTenantSchema.safeParse(body)
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors
    return NextResponse.json(
      { error: 'Validierungsfehler.', details: fieldErrors },
      { status: 400 }
    )
  }

  const { name, slug, adminEmail } = parsed.data
  const supabaseAdmin = createAdminClient()

  // 1. Prüfen ob Slug bereits vergeben ist
  const { data: existingTenant } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single()

  if (existingTenant) {
    logSecurity('owner_tenant_create_slug_conflict', {
      ownerUserId: auth.userId,
      slug,
    })
    return NextResponse.json(
      { error: `Die Subdomain "${slug}" ist bereits vergeben.` },
      { status: 409 }
    )
  }

  // 2. Auth-User erstellen mit sicherem Zufallspasswort
  // Doppelter E-Mail-Check via listUsers() entfernt (BUG-3: false negatives bei >1000 Usern).
  // Stattdessen: createUser-Fehler für doppelte E-Mail abfangen.
  const randomPassword = crypto.randomBytes(32).toString('base64url')

  const { data: newUser, error: createUserError } =
    await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: randomPassword,
      email_confirm: false,
    })

  let adminUserId: string
  let adminUserCreated = false

  if (createUserError) {
    // Supabase meldet doppelte E-Mail mit "already been registered" oder Status 422
    const isDuplicate =
      createUserError.message?.toLowerCase().includes('already been registered') ||
      createUserError.message?.toLowerCase().includes('already exists') ||
      (createUserError as { status?: number }).status === 422

    if (!isDuplicate) {
      logOperationalError('owner_tenant_create_admin_user_failed', createUserError, {
        ownerUserId: auth.userId,
        slug,
        adminEmail,
      })
      return NextResponse.json(
        { error: 'Admin-User konnte nicht erstellt werden.' },
        { status: 500 }
      )
    }

    // E-Mail bereits vergeben: existierenden User prüfen
    const existingUserLookup = await supabaseAdmin.rpc('find_auth_user_by_email', {
      p_email: adminEmail,
    })

    if (existingUserLookup.error || !existingUserLookup.data?.[0]?.id) {
      logOperationalError('owner_tenant_create_existing_user_lookup_failed', existingUserLookup.error, {
        ownerUserId: auth.userId,
        slug,
        adminEmail,
      })
      return NextResponse.json(
        { error: `Ein User mit der E-Mail "${adminEmail}" existiert bereits im System.` },
        { status: 409 }
      )
    }

    const existingUserId = existingUserLookup.data[0].id as string

    // Prüfen ob der User bereits in einem anderen Tenant ist
    const { data: otherMembership } = await supabaseAdmin
      .from('tenant_members')
      .select('id')
      .eq('user_id', existingUserId)
      .limit(1)
      .maybeSingle()

    if (otherMembership) {
      return NextResponse.json(
        { error: `Ein User mit der E-Mail "${adminEmail}" ist bereits in einem anderen Tenant aktiv.` },
        { status: 409 }
      )
    }

    adminUserId = existingUserId
  } else {
    if (!newUser?.user) {
      return NextResponse.json(
        { error: 'Admin-User konnte nicht erstellt werden.' },
        { status: 500 }
      )
    }
    adminUserId = newUser.user.id
    adminUserCreated = true
  }

  // 4. Tenant + Admin-Membership atomar erstellen via RPC
  const { data: tenant, error: rpcError } = await supabaseAdmin.rpc(
    'create_tenant_with_admin',
    {
      p_tenant_name: name,
      p_slug: slug,
      p_admin_user_id: adminUserId,
    }
  )

  if (rpcError) {
    logOperationalError('owner_tenant_create_rpc_failed', rpcError, {
      ownerUserId: auth.userId,
      slug,
      adminEmail,
      adminUserId,
      adminUserCreated,
    })

    // Rollback: nur neu erstellten Auth-User löschen (nicht wiederverwendete bestehende User)
    if (adminUserCreated) {
      const { error: rollbackError } = await supabaseAdmin.auth.admin.deleteUser(adminUserId)
      if (rollbackError) {
        console.error(
          '[POST /api/owner/tenants] ROLLBACK FEHLGESCHLAGEN — Verwaister Auth-User:',
          adminUserId,
          rollbackError
        )
      }
    }

    // Spezifische Fehlermeldung bei Unique-Constraint-Verletzung
    if (rpcError.code === '23505') {
      return NextResponse.json(
        { error: `Die Subdomain "${slug}" ist bereits vergeben.` },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: 'Tenant konnte nicht erstellt werden.' },
      { status: 500 }
    )
  }

  // 5. Stripe Customer erstellen und stripe_customer_id speichern
  try {
    const tenantData = tenant as { id: string; name: string; slug: string }
    const customer = await stripe.customers.create({
      name,
      metadata: {
        tenant_id: tenantData.id,
        tenant_slug: slug,
      },
    })

    const { error: stripeUpdateError } = await supabaseAdmin
      .from('tenants')
      .update({ stripe_customer_id: customer.id })
      .eq('id', tenantData.id)

    if (stripeUpdateError) {
      console.error(
        '[POST /api/owner/tenants] stripe_customer_id konnte nicht gespeichert werden:',
        stripeUpdateError
      )
    }
  } catch (stripeError) {
    // Non-fatal: Tenant wurde erstellt, Stripe Customer wird beim ersten Billing-Zugriff als Fallback erstellt
    console.error(
      '[POST /api/owner/tenants] Stripe Customer Erstellung fehlgeschlagen (non-fatal):',
      stripeError
    )
  }

  const redirectTo = buildTenantUrl(slug, '/reset-password')
  const { data: recoveryLinkData, error: recoveryLinkError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: adminEmail,
      options: {
        redirectTo,
      },
    })

  if (recoveryLinkError) {
    console.error(
      '[POST /api/owner/tenants] Recovery-Link für Willkommens-E-Mail fehlgeschlagen:',
      recoveryLinkError
    )
  } else {
    const actionLink = overrideActionLinkRedirect(
      recoveryLinkData.properties.action_link,
      redirectTo
    )
    const setupUrl = `${buildTenantUrl(slug, '/api/auth/email-link')}?link=${encodeURIComponent(actionLink)}`

    void sendWelcome({
      to: adminEmail,
      tenantName: name,
      tenantSlug: slug,
      setupUrl,
    }).catch((error) => {
      console.error('[POST /api/owner/tenants] Willkommens-E-Mail fehlgeschlagen:', error)
    })
  }

  logAudit('owner_tenant_created', {
    ownerUserId: auth.userId,
    tenantId: (tenant as { id?: string } | null)?.id ?? null,
    slug,
    name,
    adminEmail,
    adminUserId,
    adminUserCreated,
  })
  await recordOwnerAuditLog({
    actorUserId: auth.userId,
    tenantId: (tenant as { id?: string } | null)?.id ?? null,
    targetUserId: adminUserId,
    eventType: 'tenant_created',
    context: {
      name,
      slug,
      adminEmail,
      adminUserCreated,
    },
  })
  return NextResponse.json({ tenant }, { status: 201 })
}
