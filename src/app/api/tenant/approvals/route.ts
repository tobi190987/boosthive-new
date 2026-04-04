import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  APPROVAL_CONTENT_TYPES,
  loadContentForApproval,
  updateContentApprovalStatus,
} from '@/lib/approvals'

const statusFilterSchema = z.enum(['pending_approval', 'approved', 'changes_requested'])
const contentTypeFilterSchema = z.enum(APPROVAL_CONTENT_TYPES)
const idSchema = z.string().uuid('Ungültige ID.')

const createApprovalSchema = z.object({
  content_type: z.enum(APPROVAL_CONTENT_TYPES),
  content_id: z.string().uuid('Ungültige Content-ID.'),
})

function buildApprovalLink(request: NextRequest, token: string): string {
  const origin = request.nextUrl.origin
  return `${origin}/approval/${token}`
}

function buildDisplayName(profile: { first_name: string | null; last_name: string | null } | null): string {
  const first = profile?.first_name?.trim() ?? ''
  const last = profile?.last_name?.trim() ?? ''
  const full = `${first} ${last}`.trim()
  return full || 'Teammitglied'
}

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

  return NextResponse.json({ approvals: data ?? [] })
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

  const { content_type, content_id } = parsed.data

  const content = await loadContentForApproval({
    tenantId,
    contentType: content_type,
    contentId: content_id,
  })

  if (!content.found) {
    return NextResponse.json({ error: content.reason }, { status: 404 })
  }

  if (content.approvalStatus === 'approved') {
    return NextResponse.json(
      { error: 'Dieses Element wurde bereits freigegeben und kann nicht erneut eingereicht werden.' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('user_profiles')
    .select('first_name, last_name')
    .eq('user_id', authResult.auth.userId)
    .maybeSingle()

  const createdByName = buildDisplayName(profile)

  const { data: existing, error: existingError } = await admin
    .from('approval_requests')
    .select('id, public_token, status')
    .eq('tenant_id', tenantId)
    .eq('content_type', content_type)
    .eq('content_id', content_id)
    .maybeSingle()

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }

  if (existing?.status === 'approved') {
    return NextResponse.json(
      { error: 'Dieses Element wurde bereits final freigegeben.' },
      { status: 400 }
    )
  }

  if (existing) {
    const { data: updated, error } = await admin
      .from('approval_requests')
      .update({
        status: 'pending_approval',
        feedback: null,
        decided_at: null,
        content_title: content.title,
        content_html: content.html,
        customer_id: content.customerId,
        customer_name: content.customerName,
        created_by: authResult.auth.userId,
        created_by_name: createdByName,
      })
      .eq('id', existing.id)
      .select('id, public_token, status')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await updateContentApprovalStatus({
      tenantId,
      contentType: content_type,
      contentId: content_id,
      status: 'pending_approval',
    })

    return NextResponse.json({
      approval_id: updated.id,
      approval_status: 'pending_approval',
      approval_link: buildApprovalLink(request, updated.public_token),
    })
  }

  const { data: inserted, error: insertError } = await admin
    .from('approval_requests')
    .insert({
      tenant_id: tenantId,
      content_type,
      content_id,
      status: 'pending_approval',
      feedback: null,
      created_by: authResult.auth.userId,
      created_by_name: createdByName,
      content_title: content.title,
      content_html: content.html,
      customer_id: content.customerId,
      customer_name: content.customerName,
    })
    .select('id, public_token, status')
    .single()

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  await updateContentApprovalStatus({
    tenantId,
    contentType: content_type,
    contentId: content_id,
    status: 'pending_approval',
  })

  return NextResponse.json(
    {
      approval_id: inserted.id,
      approval_status: 'pending_approval',
      approval_link: buildApprovalLink(request, inserted.public_token),
    },
    { status: 201 }
  )
}
