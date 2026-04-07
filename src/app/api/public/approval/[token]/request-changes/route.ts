import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createApprovalHistoryEvent,
  ensurePublicApprovalAccess,
  loadApprovalByToken,
  updateContentApprovalStatus,
} from '@/lib/approvals'
import { buildTenantUrl, sendApprovalDecision } from '@/lib/email'
import { createAdminClient } from '@/lib/supabase-admin'

const tokenSchema = z.string().uuid('Ungültiger Freigabe-Token.')

const requestChangesSchema = z.object({
  feedback: z
    .string()
    .trim()
    .min(10, 'Feedback muss mindestens 10 Zeichen haben.')
    .max(5000, 'Feedback darf maximal 5000 Zeichen haben.'),
})

function contentLink(contentType: string, contentId: string): string {
  switch (contentType) {
    case 'content_brief':
      return `/tools/content-briefs?briefId=${contentId}`
    case 'ad_generation':
      return `/tools/ad-generator?id=${contentId}`
    case 'ad_library_asset':
      return `/tools/ads-library?assetId=${contentId}`
    default:
      return '/tools/approvals'
  }
}

function contentTypeLabel(contentType: string): string {
  switch (contentType) {
    case 'content_brief':
      return 'Content Briefing'
    case 'ad_generation':
      return 'Ad-Text'
    case 'ad_library_asset':
      return 'Ad-Creative'
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
  feedback: string
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
      decision: 'changes_requested',
      feedback: params.feedback,
      contentUrl: buildTenantUrl(tenantSlug, contentLink(params.contentType, params.contentId)),
    })
  } catch (error) {
    console.error('[approval-email] Versand für Korrekturwunsch fehlgeschlagen:', error)
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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = requestChangesSchema.safeParse(body)
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors
    const firstDetail = Object.values(details).flat().find(Boolean)
    return NextResponse.json(
      { error: firstDetail ?? 'Validierungsfehler.', details },
      { status: 400 }
    )
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
      status: 'changes_requested',
      feedback: parsed.data.feedback,
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
    status: 'changes_requested',
  })

  await createApprovalHistoryEvent({
    approvalRequestId: approval.id,
    tenantId: approval.tenant_id,
    eventType: 'changes_requested',
    statusAfter: 'changes_requested',
    feedback: parsed.data.feedback,
    actorLabel: approval.customer_name?.trim() || 'Kunde',
  })

  const customerName = approval.customer_name?.trim() || 'Ihr Kunde'
  const title = 'Korrektur angefragt'
  const bodyText = `${customerName} hat Korrekturen zu ${approval.content_title} angefragt.`

  await admin.from('notifications').insert({
    tenant_id: approval.tenant_id,
    user_id: approval.created_by,
    type: 'approval_changes_requested',
    title,
    body: bodyText,
    link: contentLink(approval.content_type, approval.content_id),
  })

  await notifyByEmailIfEnabled({
    tenantId: approval.tenant_id,
    userId: approval.created_by,
    customerName,
    contentTitle: approval.content_title,
    contentType: approval.content_type,
    contentId: approval.content_id,
    feedback: parsed.data.feedback,
  })

  return NextResponse.json({ status: 'changes_requested' })
}
