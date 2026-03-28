import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { listTenantUsers } from '@/lib/owner-tenant-management'
import { createAdminClient } from '@/lib/supabase-admin'

function compareEntries(
  left: { status: 'active' | 'inactive' | 'pending'; name: string | null; email: string | null },
  right: { status: 'active' | 'inactive' | 'pending'; name: string | null; email: string | null }
) {
  const rank = {
    active: 0,
    inactive: 1,
    pending: 2,
  } as const

  const statusDiff = rank[left.status] - rank[right.status]
  if (statusDiff !== 0) {
    return statusDiff
  }

  const leftLabel = (left.name ?? left.email ?? '').toLocaleLowerCase('de-DE')
  const rightLabel = (right.name ?? right.email ?? '').toLocaleLowerCase('de-DE')

  return leftLabel.localeCompare(rightLabel, 'de-DE')
}

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const supabaseAdmin = createAdminClient()

  try {
    const [members, invitationResult] = await Promise.all([
      listTenantUsers(supabaseAdmin, tenantId),
      supabaseAdmin
        .from('tenant_invitations')
        .select('id, email, role, created_at')
        .eq('tenant_id', tenantId)
        .is('accepted_at', null)
        .is('revoked_at', null)
        .order('created_at', { ascending: false }),
    ])

    if (invitationResult.error) {
      throw invitationResult.error
    }

    const activeEmails = new Set(
      members
        .map((member) => member.email?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email))
    )

    const latestOpenInvitations = new Map<
      string,
      {
        id: string
        email: string
        role: 'admin' | 'member'
        created_at: string
      }
    >()

    for (const invitation of invitationResult.data ?? []) {
      const email = invitation.email.trim().toLowerCase()
      if (activeEmails.has(email) || latestOpenInvitations.has(email)) {
        continue
      }

      latestOpenInvitations.set(email, invitation)
    }

    const entries = [
      ...members.map((member) => ({
        id: member.memberId,
        kind: 'member' as const,
        userId: member.userId,
        email: member.email,
        name: member.name,
        role: member.role,
        status: member.status,
        invitedAt: member.invitedAt,
        joinedAt: member.joinedAt,
      })),
      ...Array.from(latestOpenInvitations.values()).map((invitation) => ({
        id: invitation.id,
        kind: 'invitation' as const,
        userId: null,
        email: invitation.email,
        name: null,
        role: invitation.role,
        status: 'pending' as const,
        invitedAt: invitation.created_at,
        joinedAt: null,
      })),
    ].sort(compareEntries)

    return NextResponse.json({ entries })
  } catch (error) {
    console.error('[GET /api/tenant/members] Teamübersicht konnte nicht geladen werden:', error)
    return NextResponse.json(
      { error: 'Teamübersicht konnte nicht geladen werden.' },
      { status: 500 }
    )
  }
}
