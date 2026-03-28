import { NextRequest, NextResponse } from 'next/server'
import { deleteTenantUserForOwner } from '@/lib/owner-tenant-management'
import { recordOwnerAuditLog } from '@/lib/owner-audit'
import { requireOwner } from '@/lib/owner-auth'
import { createAdminClient } from '@/lib/supabase-admin'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: string) {
  return UUID_REGEX.test(value)
}

/**
 * DELETE /api/owner/tenants/[id]/users/[userId]
 * Entfernt einen User aus einem Tenant und löscht verwaiste Auth-Accounts.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const auth = await requireOwner()
  if ('error' in auth) return auth.error

  const { id, userId } = await params

  if (!isUuid(id) || !isUuid(userId)) {
    return NextResponse.json({ error: 'Ungültige ID übergeben.' }, { status: 400 })
  }

  const supabaseAdmin = createAdminClient()

  try {
    const result = await deleteTenantUserForOwner(supabaseAdmin, id, userId)

    if (!result.deleted) {
      if (result.reason === 'last_admin') {
        return NextResponse.json(
          { error: 'Der letzte aktive Admin kann nicht gelöscht werden. Bitte zuerst einen neuen Admin zuweisen.' },
          { status: 422 }
        )
      }

      return NextResponse.json({ error: 'User nicht gefunden.' }, { status: 404 })
    }

    await recordOwnerAuditLog({
      actorUserId: auth.userId,
      tenantId: id,
      targetUserId: result.authDeleted ? null : userId,
      eventType: 'tenant_user_deleted',
      context: {
        authDeleted: result.authDeleted,
        deletedUserId: userId,
      },
    })

    return NextResponse.json({
      success: true,
      authDeleted: result.authDeleted,
    })
  } catch (error) {
    console.error(
      `[DELETE /api/owner/tenants/${id}/users/${userId}] User-Löschung fehlgeschlagen:`,
      error
    )
    return NextResponse.json(
      { error: 'User konnte nicht gelöscht werden.' },
      { status: 500 }
    )
  }
}
