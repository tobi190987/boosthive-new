import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'

const UpdateRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
})

/**
 * PATCH /api/tenant/members/[id]/role
 *
 * Aendert die Rolle eines Members innerhalb des eigenen Tenants.
 * Nur Admins duerfen diese Route aufrufen.
 *
 * Edge Cases:
 * - Letzter Admin kann nicht degradiert werden
 * - Admin kann nicht die eigene Rolle aendern
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: targetMemberId } = await params

  // 1. Tenant-ID aus Header lesen (vom Proxy injiziert)
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  // 2. Nur Admins des selben Tenants duerfen Rollen aendern
  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const { userId: requestingUserId } = authResult.auth

  // 3. Request-Body parsen + validieren
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body.' }, { status: 400 })
  }

  const parsed = UpdateRoleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Ungültige Rolle. Erlaubt: admin, member.' },
      { status: 400 }
    )
  }

  const { role: newRole } = parsed.data
  const supabaseAdmin = createAdminClient()

  const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('set_tenant_member_role', {
    p_member_id: targetMemberId,
    p_tenant_id: tenantId,
    p_new_role: newRole,
    p_requesting_user_id: requestingUserId,
  })

  if (rpcError) {
    const message = rpcError.message ?? ''

    if (message.includes('member_not_found')) {
      return NextResponse.json(
        { error: 'Member nicht gefunden oder nicht in diesem Tenant.' },
        { status: 404 }
      )
    }

    if (message.includes('cannot_change_own_role')) {
      return NextResponse.json(
        { error: 'Du kannst deine eigene Rolle nicht ändern.' },
        { status: 422 }
      )
    }

    if (message.includes('cannot_demote_last_admin')) {
      return NextResponse.json(
        { error: 'Kann den letzten Admin nicht degradieren. Mindestens ein Admin muss verbleiben.' },
        { status: 422 }
      )
    }

    console.error('[PATCH /api/tenant/members/[id]/role] Rollen-Update fehlgeschlagen:', rpcError)
    return NextResponse.json({ error: 'Rollen-Update fehlgeschlagen.' }, { status: 500 })
  }

  const targetUserId = rpcData?.user_id as string | undefined
  if (!targetUserId) {
    console.error('[PATCH /api/tenant/members/[id]/role] RPC lieferte keine user_id zurueck.')
    return NextResponse.json({ error: 'Rollen-Update fehlgeschlagen.' }, { status: 500 })
  }

  // JWT app_metadata des Zielmembers aktualisieren.
  // Sicherheitsrelevante Checks lesen Rolle jetzt aus der DB, nicht mehr aus dem JWT.
  const { error: claimError } = await supabaseAdmin.auth.admin.updateUserById(
    targetUserId,
    {
      app_metadata: { role: newRole, tenant_id: tenantId },
    }
  )

  if (claimError) {
    console.error('[PATCH /api/tenant/members/[id]/role] JWT-Claim-Update fehlgeschlagen:', claimError)
    // Nicht kritisch — DB ist bereits aktuell, JWT wird beim naechsten Login korrigiert
  }

  return NextResponse.json({ success: true, role: newRole })
}
