import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/owner-auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { UpdateTenantStatusSchema } from '@/lib/schemas/tenant'

/**
 * PATCH /api/owner/tenants/[id]
 * Tenant-Status aendern (active <-> inactive). Nur fuer Owner.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Owner-Authentifizierung pruefen
  const auth = await requireOwner()
  if ('error' in auth) return auth.error

  const { id } = await params

  // UUID-Format pruefen
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json(
      { error: 'Ungueltige Tenant-ID.' },
      { status: 400 }
    )
  }

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
  const parsed = UpdateTenantStatusSchema.safeParse(body)
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors
    return NextResponse.json(
      { error: 'Validierungsfehler.', details: fieldErrors },
      { status: 400 }
    )
  }

  const { status } = parsed.data
  const supabaseAdmin = createAdminClient()

  // Tenant-Status aktualisieren
  const { data: tenant, error } = await supabaseAdmin
    .from('tenants')
    .update({ status })
    .eq('id', id)
    .select('id, name, slug, status, created_at')
    .single()

  if (error) {
    console.error(`[PATCH /api/owner/tenants/${id}] DB-Fehler:`, error)
    return NextResponse.json(
      { error: 'Tenant-Status konnte nicht aktualisiert werden.' },
      { status: 500 }
    )
  }

  if (!tenant) {
    return NextResponse.json(
      { error: 'Tenant nicht gefunden.' },
      { status: 404 }
    )
  }

  return NextResponse.json({ tenant })
}
