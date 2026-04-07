import { createAdminClient } from '@/lib/supabase-admin'
import type { ApprovalContentType, ApprovalStatus } from '@/lib/approvals'
import { type KanbanWorkflowStatus } from '@/lib/kanban-shared'

export interface KanbanItem {
  id: string
  content_type: ApprovalContentType
  title: string
  customer_id: string | null
  customer_name: string | null
  workflow_status: KanbanWorkflowStatus
  approval_status: ApprovalStatus
  source_status: string
  href: string
  created_at: string
  updated_at: string
}

export function buildKanbanItemHref(contentType: ApprovalContentType, contentId: string): string {
  switch (contentType) {
    case 'content_brief':
      return `/tools/content-briefs?briefId=${contentId}`
    case 'ad_generation':
      return `/tools/ad-generator?id=${contentId}`
    case 'ad_library_asset':
      return `/tools/ads-library?assetId=${contentId}`
    default:
      return '/tools/kanban'
  }
}

export function kanbanContentTypeLabel(contentType: ApprovalContentType): string {
  switch (contentType) {
    case 'content_brief':
      return 'Content Brief'
    case 'ad_generation':
      return 'Ad-Text'
    case 'ad_library_asset':
      return 'Creative'
    default:
      return contentType
  }
}

function normalizeWorkflowStatus(value: string | null | undefined): KanbanWorkflowStatus {
  if (value === 'in_progress' || value === 'client_review' || value === 'done') {
    return value
  }

  return 'none'
}

function normalizeApprovalStatus(value: string | null | undefined): ApprovalStatus {
  if (value === 'pending_approval' || value === 'approved' || value === 'changes_requested') {
    return value
  }

  return 'draft'
}

async function loadCustomerNames(tenantId: string, customerIds: string[]): Promise<Map<string, string>> {
  const admin = createAdminClient()
  const customerMap = new Map<string, string>()

  if (customerIds.length === 0) return customerMap

  const { data } = await admin
    .from('customers')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .in('id', customerIds)

  for (const customer of data ?? []) {
    customerMap.set(customer.id, customer.name)
  }

  return customerMap
}

export async function loadKanbanItems(tenantId: string): Promise<KanbanItem[]> {
  const admin = createAdminClient()

  const [briefResult, generationResult, assetResult] = await Promise.all([
    admin
      .from('content_briefs')
      .select('id, keyword, customer_id, status, approval_status, workflow_status, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false })
      .limit(200),
    admin
      .from('ad_generations')
      .select('id, briefing, customer_id, status, approval_status, workflow_status, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false })
      .limit(200),
    admin
      .from('ad_library_assets')
      .select('id, title, customer_id, approval_status, workflow_status, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(200),
  ])

  const customerIds = [
    ...(briefResult.data ?? []).map((item) => item.customer_id).filter(Boolean),
    ...(generationResult.data ?? []).map((item) => item.customer_id).filter(Boolean),
    ...(assetResult.data ?? []).map((item) => item.customer_id).filter(Boolean),
  ] as string[]

  const customerNames = await loadCustomerNames(tenantId, [...new Set(customerIds)])

  const briefs: KanbanItem[] = (briefResult.data ?? []).map((brief) => ({
    id: brief.id,
    content_type: 'content_brief',
    title: brief.keyword || 'Content Brief',
    customer_id: brief.customer_id ?? null,
    customer_name: brief.customer_id ? customerNames.get(brief.customer_id) ?? null : null,
    workflow_status: normalizeWorkflowStatus(brief.workflow_status),
    approval_status: normalizeApprovalStatus(brief.approval_status),
    source_status: brief.status,
    href: buildKanbanItemHref('content_brief', brief.id),
    created_at: brief.created_at,
    updated_at: brief.updated_at,
  }))

  const generations: KanbanItem[] = (generationResult.data ?? []).map((generation) => {
    const briefing =
      generation.briefing && typeof generation.briefing === 'object'
        ? (generation.briefing as Record<string, unknown>)
        : null

    return {
      id: generation.id,
      content_type: 'ad_generation',
      title:
        typeof briefing?.product === 'string' && briefing.product.trim()
          ? briefing.product.trim()
          : 'Ad-Generierung',
      customer_id: generation.customer_id ?? null,
      customer_name: generation.customer_id ? customerNames.get(generation.customer_id) ?? null : null,
      workflow_status: normalizeWorkflowStatus(generation.workflow_status),
      approval_status: normalizeApprovalStatus(generation.approval_status),
      source_status: generation.status,
      href: buildKanbanItemHref('ad_generation', generation.id),
      created_at: generation.created_at,
      updated_at: generation.updated_at,
    }
  })

  const assets: KanbanItem[] = (assetResult.data ?? []).map((asset) => ({
    id: asset.id,
    content_type: 'ad_library_asset',
    title: asset.title || 'Ad Asset',
    customer_id: asset.customer_id ?? null,
    customer_name: asset.customer_id ? customerNames.get(asset.customer_id) ?? null : null,
    workflow_status: normalizeWorkflowStatus(asset.workflow_status),
    approval_status: normalizeApprovalStatus(asset.approval_status),
    source_status: 'stored',
    href: buildKanbanItemHref('ad_library_asset', asset.id),
    created_at: asset.created_at,
    updated_at: asset.updated_at,
  }))

  return [...briefs, ...generations, ...assets].sort((a, b) =>
    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  )
}

export async function loadKanbanItem(
  tenantId: string,
  contentType: ApprovalContentType,
  contentId: string
): Promise<KanbanItem | null> {
  const items = await loadKanbanItems(tenantId)
  return items.find((item) => item.content_type === contentType && item.id === contentId) ?? null
}

export async function updateContentWorkflowStatus(input: {
  tenantId: string
  contentType: ApprovalContentType
  contentId: string
  status: KanbanWorkflowStatus
}): Promise<void> {
  const admin = createAdminClient()
  const payload = {
    workflow_status: input.status,
    workflow_status_changed_at: new Date().toISOString(),
  }

  if (input.contentType === 'content_brief') {
    await admin
      .from('content_briefs')
      .update(payload)
      .eq('tenant_id', input.tenantId)
      .eq('id', input.contentId)
    return
  }

  if (input.contentType === 'ad_library_asset') {
    await admin
      .from('ad_library_assets')
      .update(payload)
      .eq('tenant_id', input.tenantId)
      .eq('id', input.contentId)
    return
  }

  await admin
    .from('ad_generations')
    .update(payload)
    .eq('tenant_id', input.tenantId)
    .eq('id', input.contentId)
}
