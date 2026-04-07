import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { deleteTenantUserForOwner } from '@/lib/owner-tenant-management'
import { createAdminClient } from '@/lib/supabase-admin'
import { recordTenantDataAuditLog } from '@/lib/tenant-data-audit'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const { id } = await params
  const supabaseAdmin = createAdminClient()

  try {
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('tenant_members')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle()

    if (membershipError) {
      throw membershipError
    }

    if (!membership?.user_id) {
      return NextResponse.json({ error: 'User nicht gefunden.' }, { status: 404 })
    }

    const result = await deleteTenantUserForOwner(supabaseAdmin, tenantId, membership.user_id)

    if (!result.deleted) {
      if (result.reason === 'last_admin') {
        return NextResponse.json(
          {
            error:
              'Der letzte aktive Admin kann nicht gelöscht werden. Bitte zuerst einen neuen Admin zuweisen.',
          },
          { status: 422 }
        )
      }

      return NextResponse.json({ error: 'User nicht gefunden.' }, { status: 404 })
    }

    await recordTenantDataAuditLog({
      tenantId,
      actorUserId: authResult.auth.userId,
      actionType: 'data_delete',
      resourceType: 'tenant_member',
      resourceId: membership.user_id,
      context: { auth_deleted: result.authDeleted },
    })

    return NextResponse.json({
      success: true,
      authDeleted: result.authDeleted,
    })
  } catch (error) {
    console.error(`[DELETE /api/tenant/members/${id}] User-Löschung fehlgeschlagen:`, error)
    return NextResponse.json({ error: 'User konnte nicht gelöscht werden.' }, { status: 500 })
  }
}
