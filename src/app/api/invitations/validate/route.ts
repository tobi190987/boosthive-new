import { NextRequest, NextResponse } from 'next/server'
import { deriveInvitationStatus, hashInvitationToken } from '@/lib/invitations'
import { createAdminClient } from '@/lib/supabase-admin'

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ valid: false, reason: 'invalid' }, { status: 400 })
  }

  const token = request.nextUrl.searchParams.get('token')?.trim()
  if (!token) {
    return NextResponse.json({ valid: false, reason: 'invalid' }, { status: 400 })
  }

  const supabaseAdmin = createAdminClient()
  const { data: invitation, error } = await supabaseAdmin
    .from('tenant_invitations')
    .select('email, role, accepted_at, revoked_at, expires_at, tenants(name, slug)')
    .eq('tenant_id', tenantId)
    .eq('token_hash', hashInvitationToken(token))
    .maybeSingle()

  if (error) {
    console.error('[GET /api/invitations/validate] Laden fehlgeschlagen:', error)
    return NextResponse.json({ valid: false, reason: 'invalid' }, { status: 500 })
  }

  if (!invitation) {
    return NextResponse.json({ valid: false, reason: 'invalid' }, { status: 404 })
  }

  const status = deriveInvitationStatus(invitation)
  const tenant = Array.isArray(invitation.tenants) ? invitation.tenants[0] : invitation.tenants

  if (status !== 'pending') {
    return NextResponse.json({
      valid: false,
      reason: status === 'accepted' ? 'accepted' : invitation.revoked_at ? 'revoked' : 'expired',
      tenantName: tenant?.name ?? null,
      tenantSlug: tenant?.slug ?? null,
      email: invitation.email,
    })
  }

  return NextResponse.json({
    valid: true,
    tenantName: tenant?.name ?? null,
    tenantSlug: tenant?.slug ?? null,
    email: invitation.email,
    role: invitation.role,
  })
}
