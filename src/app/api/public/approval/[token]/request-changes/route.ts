import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  ensurePublicApprovalAccess,
  loadApprovalByToken,
  updateContentApprovalStatus,
} from '@/lib/approvals'
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

  return NextResponse.json({ status: 'changes_requested' })
}
