import { NextRequest, NextResponse } from 'next/server'
import { buildTenantUrl, sendWelcome } from '@/lib/email'
import { requireOwner } from '@/lib/owner-auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { CreateTenantSchema } from '@/lib/schemas/tenant'
import crypto from 'crypto'

type TenantStatusFilter = 'active' | 'inactive' | 'all'

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
  const page = parsePositiveInteger(searchParams.get('page'), 1)
  const requestedPageSize = parsePositiveInteger(searchParams.get('pageSize'), 20)
  const pageSize = Math.min(requestedPageSize, 50)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const supabaseAdmin = createAdminClient()

  let countQuery = supabaseAdmin
    .from('tenants')
    .select('id', { count: 'exact', head: true })

  let dataQuery = supabaseAdmin
    .from('tenants')
    .select('id, name, slug, status, created_at')
    .order('created_at', { ascending: false })

  if (status !== 'all') {
    countQuery = countQuery.eq('status', status)
    dataQuery = dataQuery.eq('status', status)
  }

  if (query.length > 0) {
    const escapedQuery = query.replace(/[%_]/g, '\\$&')
    const pattern = `%${escapedQuery}%`
    countQuery = countQuery.or(`name.ilike.${pattern},slug.ilike.${pattern}`)
    dataQuery = dataQuery.or(`name.ilike.${pattern},slug.ilike.${pattern}`)
  }

  const [{ count, error: countError }, { data: tenants, error }] = await Promise.all([
    countQuery,
    dataQuery.range(from, to),
  ])

  if (countError) {
    console.error('[GET /api/owner/tenants] Count-Fehler:', countError)
    return NextResponse.json(
      { error: 'Tenants konnten nicht geladen werden.' },
      { status: 500 }
    )
  }

  if (error) {
    console.error('[GET /api/owner/tenants] DB-Fehler:', error)
    return NextResponse.json(
      { error: 'Tenants konnten nicht geladen werden.' },
      { status: 500 }
    )
  }

  const tenantIds = (tenants ?? []).map((tenant) => tenant.id)
  let memberCountMap = new Map<string, number>()

  if (tenantIds.length > 0) {
    const { data: members, error: membersError } = await supabaseAdmin
      .from('tenant_members')
      .select('tenant_id')
      .in('tenant_id', tenantIds)
      .eq('status', 'active')

    if (membersError) {
      console.error('[GET /api/owner/tenants] Member-Count-Fehler:', membersError)
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

  const enrichedTenants = (tenants ?? []).map((tenant) => ({
    ...tenant,
    memberCount: memberCountMap.get(tenant.id) ?? 0,
  }))

  return NextResponse.json({
    tenants: enrichedTenants,
    pagination: {
      page,
      pageSize,
      total: count ?? 0,
      totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
    },
    filters: {
      q: query,
      status,
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

  if (createUserError) {
    // Supabase meldet doppelte E-Mail mit "already been registered" oder Status 422
    const isDuplicate =
      createUserError.message?.toLowerCase().includes('already been registered') ||
      createUserError.message?.toLowerCase().includes('already exists') ||
      (createUserError as { status?: number }).status === 422
    if (isDuplicate) {
      return NextResponse.json(
        { error: `Ein User mit der E-Mail "${adminEmail}" existiert bereits im System.` },
        { status: 409 }
      )
    }
    console.error('[POST /api/owner/tenants] User-Erstellung fehlgeschlagen:', createUserError)
    return NextResponse.json(
      { error: 'Admin-User konnte nicht erstellt werden.' },
      { status: 500 }
    )
  }

  if (!newUser?.user) {
    return NextResponse.json(
      { error: 'Admin-User konnte nicht erstellt werden.' },
      { status: 500 }
    )
  }

  // 4. Tenant + Admin-Membership atomar erstellen via RPC
  const { data: tenant, error: rpcError } = await supabaseAdmin.rpc(
    'create_tenant_with_admin',
    {
      p_tenant_name: name,
      p_slug: slug,
      p_admin_user_id: newUser.user.id,
    }
  )

  if (rpcError) {
    console.error('[POST /api/owner/tenants] RPC-Fehler:', rpcError)

    // Rollback: Auth-User löschen, da Tenant-Erstellung fehlgeschlagen
    const { error: rollbackError } = await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
    if (rollbackError) {
      console.error(
        '[POST /api/owner/tenants] ROLLBACK FEHLGESCHLAGEN — Verwaister Auth-User:',
        newUser.user.id,
        rollbackError
      )
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
    const actionLink = recoveryLinkData.properties.action_link
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

  return NextResponse.json({ tenant }, { status: 201 })
}
