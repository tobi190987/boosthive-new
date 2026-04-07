import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { getActiveModuleCodes } from '@/lib/module-access'
import { submitContentForApproval, type ApprovalContentType } from '@/lib/approvals'
import { KANBAN_WORKFLOW_STATUSES } from '@/lib/kanban-shared'
import {
  loadKanbanItem,
  loadKanbanItems,
  updateContentWorkflowStatus,
} from '@/lib/kanban'
import { createAdminClient } from '@/lib/supabase-admin'

const patchSchema = z.object({
  content_type: z.enum(['content_brief', 'ad_generation', 'ad_library_asset']),
  content_id: z.string().uuid('Ungültige Content-ID.'),
  workflow_status: z.enum(KANBAN_WORKFLOW_STATUSES),
})

function canAccessContentType(activeModuleCodes: string[], contentType: ApprovalContentType) {
  if (activeModuleCodes.includes('all')) return true
  if (contentType === 'content_brief') return activeModuleCodes.includes('content_briefs')
  return activeModuleCodes.includes('ad_generator')
}

function filterItemsByModules<T extends { content_type: ApprovalContentType }>(
  items: T[],
  activeModuleCodes: string[]
) {
  return items.filter((item) => canAccessContentType(activeModuleCodes, item.content_type))
}

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const activeModuleCodes = await getActiveModuleCodes(tenantId)
  const items = await loadKanbanItems(tenantId)

  return NextResponse.json({
    items: filterItemsByModules(items, activeModuleCodes),
  })
}

export async function PATCH(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors
    const firstDetail = Object.values(details).flat().find(Boolean)
    return NextResponse.json({ error: firstDetail ?? 'Validierungsfehler.', details }, { status: 400 })
  }

  const activeModuleCodes = await getActiveModuleCodes(tenantId)
  if (!canAccessContentType(activeModuleCodes, parsed.data.content_type)) {
    return NextResponse.json({ error: 'Für diesen Inhalt fehlt der Modulzugriff.' }, { status: 403 })
  }

  const currentItem = await loadKanbanItem(tenantId, parsed.data.content_type, parsed.data.content_id)
  if (!currentItem) {
    return NextResponse.json({ error: 'Element nicht gefunden.' }, { status: 404 })
  }

  if (currentItem.workflow_status === parsed.data.workflow_status) {
    return NextResponse.json({ item: currentItem })
  }

  if (
    currentItem.workflow_status === 'client_review' &&
    parsed.data.workflow_status === 'done' &&
    currentItem.approval_status !== 'approved'
  ) {
    return NextResponse.json(
      { error: 'Nach "Beim Kunden" kann erst nach Freigabe auf "Fertig" verschoben werden.' },
      { status: 400 }
    )
  }

  if (parsed.data.workflow_status === 'client_review') {
    if (!currentItem.customer_id) {
      return NextResponse.json(
        { error: 'Für "Beim Kunden" muss dem Element ein Kunde zugeordnet sein.' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()
    const { data: customer } = await admin
      .from('customers')
      .select('contact_email')
      .eq('tenant_id', tenantId)
      .eq('id', currentItem.customer_id)
      .maybeSingle()

    if (!customer?.contact_email?.trim()) {
      return NextResponse.json(
        { error: 'Der Kunde benötigt eine Kontakt-E-Mail, bevor eine Freigabe angefragt werden kann.' },
        { status: 400 }
      )
    }

    const approvalResult = await submitContentForApproval({
      tenantId,
      userId: authResult.auth.userId,
      contentType: parsed.data.content_type,
      contentId: parsed.data.content_id,
      origin: request.nextUrl.origin,
    })

    if (!approvalResult.ok) {
      return NextResponse.json({ error: approvalResult.error }, { status: approvalResult.status })
    }
  }

  await updateContentWorkflowStatus({
    tenantId,
    contentType: parsed.data.content_type,
    contentId: parsed.data.content_id,
    status: parsed.data.workflow_status,
  })

  const updatedItem = await loadKanbanItem(tenantId, parsed.data.content_type, parsed.data.content_id)
  if (!updatedItem) {
    return NextResponse.json({ error: 'Element konnte nicht aktualisiert werden.' }, { status: 500 })
  }

  return NextResponse.json({ item: updatedItem })
}
