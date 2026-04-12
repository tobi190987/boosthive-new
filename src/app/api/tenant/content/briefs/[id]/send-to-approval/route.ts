import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import { submitContentForApproval } from '@/lib/approvals'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  CONTENT_BRIEFS_WRITE,
} from '@/lib/rate-limit'

const idSchema = z.string().uuid('Ungueltige Brief-ID.')

// POST: Send a content brief to approval + set workflow_status to 'client_review'
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`content-briefs-write:${tenantId}:${getClientIp(request)}`, CONTENT_BRIEFS_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'content_briefs')
  if ('error' in moduleAccess) return moduleAccess.error

  const { id } = await params
  const idParsed = idSchema.safeParse(id)
  if (!idParsed.success) return NextResponse.json({ error: 'Ungueltige Brief-ID.' }, { status: 400 })

  const admin = createAdminClient()

  // Load brief to check it exists and has the right status
  const { data: brief } = await admin
    .from('content_briefs')
    .select('id, status, workflow_status, approval_status, customer_id')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()

  if (!brief) {
    return NextResponse.json({ error: 'Brief nicht gefunden.' }, { status: 404 })
  }

  if (brief.status !== 'done') {
    return NextResponse.json(
      { error: 'Nur fertig generierte Briefs koennen zur Freigabe gesendet werden.' },
      { status: 400 }
    )
  }

  if (brief.approval_status === 'pending_approval') {
    return NextResponse.json(
      { error: 'Freigabe wurde bereits angefordert.' },
      { status: 400 }
    )
  }

  if (brief.approval_status === 'approved') {
    return NextResponse.json(
      { error: 'Dieser Brief wurde bereits freigegeben.' },
      { status: 400 }
    )
  }

  if (!brief.customer_id) {
    return NextResponse.json(
      { error: 'Bitte weise dem Brief zuerst einen Kunden zu, bevor du ihn zur Freigabe sendest.' },
      { status: 400 }
    )
  }

  // Check that customer has contact email
  const { data: customer } = await admin
    .from('customers')
    .select('contact_email')
    .eq('tenant_id', tenantId)
    .eq('id', brief.customer_id)
    .maybeSingle()

  if (!customer?.contact_email?.trim()) {
    return NextResponse.json(
      { error: 'Der Kunde benoetigt eine Kontakt-E-Mail, bevor eine Freigabe angefragt werden kann.' },
      { status: 400 }
    )
  }

  // Submit to approval system
  const approvalResult = await submitContentForApproval({
    tenantId,
    userId: authResult.auth.userId,
    contentType: 'content_brief',
    contentId: id,
    origin: request.nextUrl.origin,
  })

  if (!approvalResult.ok) {
    return NextResponse.json({ error: approvalResult.error }, { status: approvalResult.status })
  }

  // Update workflow_status to client_review
  await admin
    .from('content_briefs')
    .update({
      workflow_status: 'client_review',
      workflow_status_changed_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', id)

  return NextResponse.json({
    success: true,
    approval_status: approvalResult.approvalStatus,
    approval_link: approvalResult.approvalLink,
    workflow_status: 'client_review',
  })
}
