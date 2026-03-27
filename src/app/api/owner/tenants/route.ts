import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/owner-auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { CreateTenantSchema } from '@/lib/schemas/tenant'
import crypto from 'crypto'

/**
 * GET /api/owner/tenants
 * Alle Tenants auflisten (nur fuer Owner).
 */
export async function GET() {
  // Owner-Authentifizierung pruefen
  const auth = await requireOwner()
  if ('error' in auth) return auth.error

  const supabaseAdmin = createAdminClient()

  const { data: tenants, error } = await supabaseAdmin
    .from('tenants')
    .select('id, name, slug, status, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[GET /api/owner/tenants] DB-Fehler:', error)
    return NextResponse.json(
      { error: 'Tenants konnten nicht geladen werden.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ tenants })
}

/**
 * POST /api/owner/tenants
 * Neuen Tenant mit initialem Admin-User atomar anlegen.
 */
export async function POST(request: NextRequest) {
  // Owner-Authentifizierung pruefen
  const auth = await requireOwner()
  if ('error' in auth) return auth.error

  // Request-Body parsen
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Ungueltiger JSON-Body.' },
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

  // 1. Pruefen ob Slug bereits vergeben ist
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
  // Stattdessen: createUser-Fehler fuer doppelte E-Mail abfangen.
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

    // Rollback: Auth-User loeschen, da Tenant-Erstellung fehlgeschlagen
    await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)

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

  // TODO: E-Mail-Einladung hier ausloesen (PROJ-4)
  // Der Admin erhaelt eine Einladungs-E-Mail mit Link zum Passwort-Reset.

  return NextResponse.json({ tenant }, { status: 201 })
}
