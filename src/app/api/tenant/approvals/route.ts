import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  APPROVAL_CONTENT_TYPES,
  createApprovalHistoryEvent,
  submitContentForApproval,
} from '@/lib/approvals'

const statusFilterSchema = z.enum(['pending_approval', 'approved', 'changes_requested'])
const contentTypeFilterSchema = z.enum(APPROVAL_CONTENT_TYPES)
const idSchema = z.string().uuid('Ungültige ID.')

const createApprovalSchema = z.object({
  content_type: z.enum(APPROVAL_CONTENT_TYPES),
  content_id: z.string().uuid('Ungültige Content-ID.'),
})

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const statusParam = request.nextUrl.searchParams.get('status')
  const typeParam = request.nextUrl.searchParams.get('content_type')
  const contentIdParam = request.nextUrl.searchParams.get('content_id')
  const customerIdParam = request.nextUrl.searchParams.get('customer_id')

  const statusParsed = statusParam ? statusFilterSchema.safeParse(statusParam) : null
  if (statusParam && !statusParsed?.success) {
    return NextResponse.json({ error: 'Ungültiger Status-Filter.' }, { status: 400 })
  }

  const typeParsed = typeParam ? contentTypeFilterSchema.safeParse(typeParam) : null
  if (typeParam && !typeParsed?.success) {
    return NextResponse.json({ error: 'Ungültiger Typ-Filter.' }, { status: 400 })
  }

  const contentIdParsed = contentIdParam ? idSchema.safeParse(contentIdParam) : null
  if (contentIdParam && !contentIdParsed?.success) {
    return NextResponse.json({ error: 'Ungültige Content-ID.' }, { status: 400 })
  }

  const customerIdParsed = customerIdParam ? idSchema.safeParse(customerIdParam) : null
  if (customerIdParam && !customerIdParsed?.success) {
    return NextResponse.json({ error: 'Ungültige Kunden-ID.' }, { status: 400 })
  }

  const admin = createAdminClient()

  let query = admin
    .from('approval_requests')
    .select(
      'id, content_type, content_id, public_token, status, feedback, customer_name, content_title, created_by_name, created_at, decided_at'
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (statusParsed?.success) query = query.eq('status', statusParsed.data)
  if (typeParsed?.success) query = query.eq('content_type', typeParsed.data)
  if (contentIdParsed?.success) query = query.eq('content_id', contentIdParsed.data)
  if (customerIdParsed?.success) query = query.eq('customer_id', customerIdParsed.data)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const approvals = data ?? []
  const approvalIds = approvals.map((entry) => entry.id)

  const historyMap = new Map<string, Array<{
    id: string
    event_type: 'submitted' | 'resubmitted' | 'approved' | 'changes_requested' | 'content_updated'
    status_after: 'pending_approval' | 'approved' | 'changes_requested'
    feedback: string | null
    actor_label: string | null
    created_at: string
  }>>()

  if (approvalIds.length > 0) {
    const { data: events } = await admin
      .from('approval_request_events')
      .select('id, approval_request_id, event_type, status_after, feedback, actor_label, created_at')
      .in('approval_request_id', approvalIds)
      .order('created_at', { ascending: true })

    for (const event of events ?? []) {
      const current = historyMap.get(event.approval_request_id) ?? []
      current.push({
        id: event.id,
        event_type: event.event_type as 'submitted' | 'resubmitted' | 'approved' | 'changes_requested' | 'content_updated',
        status_after: event.status_after as 'pending_approval' | 'approved' | 'changes_requested',
        feedback: event.feedback ?? null,
        actor_label: event.actor_label ?? null,
        created_at: event.created_at,
      })
      historyMap.set(event.approval_request_id, current)
    }
  }

  return NextResponse.json({
    approvals: approvals.map((entry) => ({
      ...entry,
      history: historyMap.get(entry.id) ?? [],
    })),
  })
}

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  if (authResult.auth.role !== 'admin' && authResult.auth.role !== 'member') {
    return NextResponse.json({ error: 'Keine Berechtigung für Freigaben.' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = createApprovalSchema.safeParse(body)
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors
    const firstDetail = Object.values(details).flat().find(Boolean)
    return NextResponse.json(
      { error: firstDetail ?? 'Validierungsfehler.', details },
      { status: 400 }
    )
  }

  const result = await submitContentForApproval({
    tenantId,
    userId: authResult.auth.userId,
    contentType: parsed.data.content_type,
    contentId: parsed.data.content_id,
    origin: request.nextUrl.origin,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json(
    {
      approval_id: result.approvalId,
      approval_status: result.approvalStatus,
      approval_link: result.approvalLink,
    },
    { status: result.created ? 201 : 200 }
  )
}
