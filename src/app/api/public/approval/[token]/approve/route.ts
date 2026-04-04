import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  ensurePublicApprovalAccess,
  loadApprovalByToken,
  updateContentApprovalStatus,
} from '@/lib/approvals'
import { createAdminClient } from '@/lib/supabase-admin'

const tokenSchema = z.string().uuid('Ungültiger Freigabe-Token.')

function contentLink(contentType: string, contentId: string): string {
  return contentType === 'content_brief'
    ? `/tools/content-briefs?briefId=${contentId}`
    : `/tools/ad-generator?id=${contentId}`
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const tokenParsed = tokenSchema.safeParse(token)

  if (!tokenParsed.success) {
    return NextResponse.json({ error: 'Ungültiger Freigabe-Link.' }, { status: 404 })
  }

  const approval = await loadApprovalByToken(tokenParsed.data)
  if (!approval) return NextResponse.json({ error: 'Freigabe nicht gefunden.' }, { status: 404 })

  const tenantHeader = request.headers.get('x-tenant-id')
  if (tenantHeader && tenantHeader !== 'local-dev-fallback' && tenantHeader !== approval.tenant_id) {
    return NextResponse.json({ error: 'Freigabe nicht gefunden.' }, { status: 404 })
  }

  const tenantAccess = await ensurePublicApprovalAccess(approval.tenant_id)
  if (!tenantAccess.allowed) {
    return NextResponse.json({ error: 'Dieser Tenant ist aktuell nicht verfügbar.' }, { status: 403 })
  }

  if (approval.status !== 'pending_approval') {
    return NextResponse.json({ error: 'Freigabe wurde bereits entschieden.' }, { status: 409 })
  }

  const admin = createAdminClient()

  const { data: updated, error } = await admin
    .from('approval_requests')
    .update({
      status: 'approved',
      feedback: null,
      decided_at: new Date().toISOString(),
    })
    .eq('id', approval.id)
    .eq('status', 'pending_approval')
    .select('id, status')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!updated) return NextResponse.json({ error: 'Freigabe wurde bereits entschieden.' }, { status: 409 })

  await updateContentApprovalStatus({
    tenantId: approval.tenant_id,
    contentType: approval.content_type,
    contentId: approval.content_id,
    status: 'approved',
  })

  const customerName = approval.customer_name?.trim() || 'Ihr Kunde'
  const title = 'Element freigegeben'
  const body = `${customerName} hat ${approval.content_title} freigegeben.`

  await admin.from('notifications').insert({
    tenant_id: approval.tenant_id,
    user_id: approval.created_by,
    type: 'approval_approved',
    title,
    body,
    link: contentLink(approval.content_type, approval.content_id),
  })

  return NextResponse.json({ status: 'approved' })
}
