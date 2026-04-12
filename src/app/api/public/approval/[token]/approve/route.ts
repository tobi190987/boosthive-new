import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  buildContentHref,
  createApprovalHistoryEvent,
  ensurePublicApprovalAccess,
  loadApprovalByToken,
  updateContentApprovalStatus,
} from '@/lib/approvals'
import { buildTenantUrl, sendApprovalDecision } from '@/lib/email'
import { updateContentWorkflowStatus } from '@/lib/kanban'
import { createAdminClient } from '@/lib/supabase-admin'

const tokenSchema = z.string().uuid('Ungültiger Freigabe-Token.')

function contentTypeLabel(contentType: string): string {
  switch (contentType) {
    case 'content_brief':
      return 'Content Briefing'
    case 'ad_generation':
      return 'Ad-Text'
    case 'ad_library_asset':
      return 'Ad-Creative'
    case 'social_media_post':
      return 'Social Post'
    default:
      return 'Inhalt'
  }
}

function isMissingNotifyPreferenceColumn(error: { code?: string; message?: string } | null | undefined) {
  return (
    error?.code === '42703' ||
    error?.message?.includes('notify_on_approval_decision') === true ||
    error?.message?.includes("Could not find the 'notify_on_approval_decision' column") === true
  )
}

async function notifyByEmailIfEnabled(params: {
  tenantId: string
  userId: string
  customerName: string
  contentTitle: string
  contentType: string
  contentId: string
}) {
  const admin = createAdminClient()
  const [{ data: profile, error: profileError }, { data: tenant }, userResult] = await Promise.all([
    admin
      .from('user_profiles')
      .select('notify_on_approval_decision')
      .eq('user_id', params.userId)
      .maybeSingle(),
    admin
      .from('tenants')
      .select('name, slug')
      .eq('id', params.tenantId)
      .maybeSingle(),
    admin.auth.admin.getUserById(params.userId),
  ])

  if (isMissingNotifyPreferenceColumn(profileError)) return
  if (!profile?.notify_on_approval_decision) return

  const email = userResult.data.user?.email
  const tenantName = tenant?.name?.trim()
  const tenantSlug = tenant?.slug?.trim()
  if (!email || !tenantName || !tenantSlug) return

  try {
    await sendApprovalDecision({
      to: email,
      tenantName,
      tenantSlug,
      customerName: params.customerName,
      contentTitle: params.contentTitle,
      contentTypeLabel: contentTypeLabel(params.contentType),
      decision: 'approved',
      contentUrl: buildTenantUrl(
        tenantSlug,
        buildContentHref(
          params.contentType as 'content_brief' | 'ad_generation' | 'ad_library_asset' | 'social_media_post',
          params.contentId
        )
      ),
    })
  } catch (error) {
    console.error('[approval-email] Versand für Freigabe fehlgeschlagen:', error)
  }
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

  await updateContentWorkflowStatus({
    tenantId: approval.tenant_id,
    contentType: approval.content_type,
    contentId: approval.content_id,
    status: 'done',
  })

  await createApprovalHistoryEvent({
    approvalRequestId: approval.id,
    tenantId: approval.tenant_id,
    eventType: 'approved',
    statusAfter: 'approved',
    actorLabel: approval.customer_name?.trim() || 'Kunde',
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
    link: buildContentHref(approval.content_type, approval.content_id),
  })

  await notifyByEmailIfEnabled({
    tenantId: approval.tenant_id,
    userId: approval.created_by,
    customerName,
    contentTitle: approval.content_title,
    contentType: approval.content_type,
    contentId: approval.content_id,
  })

  return NextResponse.json({ status: 'approved' })
}
