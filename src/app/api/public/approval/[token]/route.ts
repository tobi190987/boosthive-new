import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  ensurePublicApprovalAccess,
  loadApprovalHistory,
  loadApprovalByToken,
  loadContentForApproval,
} from '@/lib/approvals'

const tokenSchema = z.string().uuid('Ungültiger Freigabe-Token.')

export async function GET(
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

  const latestContent = await loadContentForApproval({
    tenantId: approval.tenant_id,
    contentType: approval.content_type,
    contentId: approval.content_id,
  })

  const contentTitle = latestContent.found ? latestContent.title : approval.content_title
  const contentHtml = latestContent.found ? latestContent.html : approval.content_html
  const history = await loadApprovalHistory(approval.id)

  return NextResponse.json({
    tenant_name: tenantAccess.tenantName ?? 'Tenant',
    tenant_logo_url: tenantAccess.tenantLogoUrl,
    content_type: approval.content_type,
    content_title: contentTitle,
    status: approval.status,
    content_html: contentHtml,
    feedback: approval.feedback,
    decided_at: approval.decided_at,
    history,
  })
}
