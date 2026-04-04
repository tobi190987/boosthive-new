import { createAdminClient } from '@/lib/supabase-admin'
import { loadTenantStatusRecord, resolveTenantStatus } from '@/lib/tenant-status'

export const APPROVAL_CONTENT_TYPES = ['content_brief', 'ad_generation'] as const
export type ApprovalContentType = (typeof APPROVAL_CONTENT_TYPES)[number]

export const APPROVAL_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'changes_requested',
] as const

export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]

export interface ApprovalRequestRecord {
  id: string
  tenant_id: string
  content_type: ApprovalContentType
  content_id: string
  public_token: string
  status: Exclude<ApprovalStatus, 'draft'>
  feedback: string | null
  content_title: string
  content_html: string
  customer_id: string | null
  customer_name: string | null
  created_by: string
  created_by_name: string | null
  created_at: string
  decided_at: string | null
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function toParagraphs(raw: string): string {
  return raw
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replaceAll('\n', '<br />')}</p>`)
    .join('')
}

function listItems(values: unknown, className = 'approval-list'): string {
  if (!Array.isArray(values) || values.length === 0) {
    return '<p class="approval-empty">-</p>'
  }

  const items = values
    .map((entry) => {
      if (typeof entry === 'string') return entry
      return JSON.stringify(entry)
    })
    .filter(Boolean)

  if (items.length === 0) return '<p class="approval-empty">-</p>'

  return `<ul class="${className}">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
}

function section(title: string, body: string, tone: 'default' | 'accent' | 'warm' = 'default'): string {
  return [
    `<section class="approval-section approval-section--${tone}">`,
    `<div class="approval-section__header">`,
    `<h3>${escapeHtml(title)}</h3>`,
    `</div>`,
    `<div class="approval-section__body">`,
    body,
    `</div>`,
    `</section>`,
  ].join('')
}

function outlineCard(title: string, description: string, h3s: unknown): string {
  return [
    '<article class="approval-outline-card">',
    `<div class="approval-outline-card__eyebrow">Abschnitt</div>`,
    `<h4>${escapeHtml(title)}</h4>`,
    description ? `<div class="approval-copy">${toParagraphs(description)}</div>` : '',
    listItems(h3s, 'approval-sublist'),
    '</article>',
  ].join('')
}

function adVariantCard(index: number, rows: Array<[string, unknown]>): string {
  const content =
    rows.length === 0
      ? '<p class="approval-empty">-</p>'
      : rows
          .map(([field, value]) => {
            const normalized =
              Array.isArray(value)
                ? value
                    .map((entry) => (typeof entry === 'string' ? entry : JSON.stringify(entry)))
                    .filter(Boolean)
                : [typeof value === 'string' ? value : JSON.stringify(value)]

            const items = normalized
              .filter((entry): entry is string => Boolean(entry))
              .map((entry) => `<li>${escapeHtml(entry)}</li>`)
              .join('')

            return [
              '<div class="approval-ad-field">',
              `<div class="approval-ad-field__label">${escapeHtml(field)}</div>`,
              items ? `<ul class="approval-ad-field__values">${items}</ul>` : '<p class="approval-empty">-</p>',
              '</div>',
            ].join('')
          })
          .join('')

  return [
    '<article class="approval-ad-variant">',
    `<div class="approval-ad-variant__header">Variante ${index}</div>`,
    `<div class="approval-ad-variant__body">${content}</div>`,
    '</article>',
  ].join('')
}

function briefJsonToHtml(briefJson: unknown): string {
  if (!briefJson || typeof briefJson !== 'object') {
    return '<p class="approval-empty">Kein Brief-Inhalt vorhanden.</p>'
  }

  const data = briefJson as Record<string, unknown>

  const intent = (data.search_intent ?? null) as Record<string, unknown> | null
  const intentType = typeof intent?.type === 'string' ? intent.type : null
  const intentReasoning = typeof intent?.reasoning === 'string' ? intent.reasoning : null

  const sections: string[] = []

  if (intentType || intentReasoning) {
    sections.push(
      section(
        'Suchintention',
        [
          intentType
            ? `<div class="approval-pill-row"><span class="approval-pill">${escapeHtml(intentType)}</span></div>`
            : '',
          intentReasoning ? `<div class="approval-copy">${toParagraphs(intentReasoning)}</div>` : '',
        ].join(''),
        'accent'
      )
    )
  }

  sections.push(section('H1 Vorschlaege', listItems(data.h1_titles), 'default'))

  sections.push(section('Meta-Descriptions', listItems(data.meta_descriptions), 'default'))

  const outlineSections: string[] = []
  if (Array.isArray(data.outline) && data.outline.length > 0) {
    const outlineHtml = data.outline
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return ''
        const obj = entry as Record<string, unknown>
        const h2 = typeof obj.h2 === 'string' ? obj.h2 : 'Abschnitt'
        const description = typeof obj.description === 'string' ? obj.description : ''
        return outlineCard(h2, description, obj.h3s)
      })
      .join('')
    outlineSections.push(`<div class="approval-outline-grid">${outlineHtml || '<p class="approval-empty">-</p>'}</div>`)
  } else {
    outlineSections.push('<p class="approval-empty">-</p>')
  }
  sections.push(section('Outline', outlineSections.join(''), 'default'))

  if (Array.isArray(data.keywords) && data.keywords.length > 0) {
    const keywordRows = data.keywords
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return ''
        const keyword = entry as Record<string, unknown>
        const term = typeof keyword.term === 'string' ? keyword.term : 'Keyword'
        const frequency = typeof keyword.frequency === 'string' ? keyword.frequency : '-'
        return [
          '<div class="approval-keyword-row">',
          `<div class="approval-keyword-row__term">${escapeHtml(term)}</div>`,
          `<div class="approval-keyword-row__frequency">${escapeHtml(frequency)}</div>`,
          '</div>',
        ].join('')
      })
      .join('')
    sections.push(
      section(
        'Kern-Keywords',
        `<div class="approval-keyword-table">${keywordRows || '<p class="approval-empty">-</p>'}</div>`,
        'default'
      )
    )
  }

  if (typeof data.competitor_hints === 'string' && data.competitor_hints.trim()) {
    sections.push(
      section(
        'Wettbewerber-Hinweise',
        `<div class="approval-copy">${toParagraphs(data.competitor_hints)}</div>`,
        'warm'
      )
    )
  }

  if (Array.isArray(data.internal_linking_hints) && data.internal_linking_hints.length > 0) {
    sections.push(section('Interne Verlinkung', listItems(data.internal_linking_hints), 'default'))
  }

  if (typeof data.cta_recommendation === 'string' && data.cta_recommendation.trim()) {
    sections.push(
      section(
        'CTA Empfehlung',
        `<div class="approval-copy">${toParagraphs(data.cta_recommendation)}</div>`,
        'accent'
      )
    )
  }

  return `<div class="approval-rich-content approval-rich-content--brief">${sections.join('')}</div>`
}

function adResultToHtml(result: unknown): string {
  if (!result || typeof result !== 'object') {
    return '<p class="approval-empty">Kein Ad-Inhalt vorhanden.</p>'
  }

  const platforms = Object.entries(result as Record<string, unknown>)
  if (platforms.length === 0) {
    return '<p class="approval-empty">Kein Ad-Inhalt vorhanden.</p>'
  }

  const parts: string[] = []

  for (const [platformKey, platformValue] of platforms) {
    const platformSections: string[] = []

    if (!platformValue || typeof platformValue !== 'object') continue

    for (const [adTypeKey, adTypeValue] of Object.entries(platformValue as Record<string, unknown>)) {
      const variants =
        adTypeValue && typeof adTypeValue === 'object'
          ? (adTypeValue as { variants?: unknown[] }).variants
          : undefined

      if (!Array.isArray(variants) || variants.length === 0) {
        platformSections.push(
          [
            '<section class="approval-ad-type">',
            `<div class="approval-ad-type__header"><h4>${escapeHtml(adTypeKey)}</h4></div>`,
            '<div class="approval-ad-type__variants"><p class="approval-empty">-</p></div>',
            '</section>',
          ].join('')
        )
        continue
      }

      const variantCards = variants
        .map((variant, index) => {
          if (!variant || typeof variant !== 'object') {
            return adVariantCard(index + 1, [])
          }
          return adVariantCard(index + 1, Object.entries(variant as Record<string, unknown>))
        })
        .join('')

      platformSections.push(
        [
          '<section class="approval-ad-type">',
          `<div class="approval-ad-type__header"><h4>${escapeHtml(adTypeKey)}</h4></div>`,
          `<div class="approval-ad-type__variants">${variantCards}</div>`,
          '</section>',
        ].join('')
      )
    }

    if (platformSections.length === 0) continue

    parts.push(
      [
        '<section class="approval-platform">',
        `<div class="approval-platform__header"><h3>${escapeHtml(platformKey)}</h3></div>`,
        `<div class="approval-platform__body">${platformSections.join('')}</div>`,
        '</section>',
      ].join('')
    )
  }

  return `<div class="approval-rich-content approval-rich-content--ads">${parts.join('')}</div>`
}

export async function ensurePublicApprovalAccess(tenantId: string): Promise<{
  allowed: boolean
  tenantName: string | null
  tenantLogoUrl: string | null
}> {
  const admin = createAdminClient()
  const tenantResult = await loadTenantStatusRecord(admin, { id: tenantId }, ['name', 'logo_url'])

  if (tenantResult.error || !tenantResult.data) {
    return { allowed: false, tenantName: null, tenantLogoUrl: null }
  }

  const status = resolveTenantStatus(tenantResult.data)
  if (status.blocksProtectedAppAccess) {
    return { allowed: false, tenantName: null, tenantLogoUrl: null }
  }

  return {
    allowed: true,
    tenantName: (tenantResult.data.name as string | null | undefined) ?? null,
    tenantLogoUrl: (tenantResult.data.logo_url as string | null | undefined) ?? null,
  }
}

export async function loadApprovalByToken(token: string): Promise<ApprovalRequestRecord | null> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('approval_requests')
    .select(
      'id, tenant_id, content_type, content_id, public_token, status, feedback, content_title, content_html, customer_id, customer_name, created_by, created_by_name, created_at, decided_at'
    )
    .eq('public_token', token)
    .maybeSingle()

  if (error || !data) return null
  return data as ApprovalRequestRecord
}

export async function loadContentForApproval(input: {
  tenantId: string
  contentType: ApprovalContentType
  contentId: string
}): Promise<
  | {
      found: true
      title: string
      html: string
      approvalStatus: ApprovalStatus
      customerId: string | null
      customerName: string | null
    }
  | { found: false; reason: string }
> {
  const admin = createAdminClient()

  if (input.contentType === 'content_brief') {
    const { data, error } = await admin
      .from('content_briefs')
      .select('id, keyword, brief_json, approval_status, customer_id')
      .eq('tenant_id', input.tenantId)
      .eq('id', input.contentId)
      .maybeSingle()

    if (error || !data) {
      return { found: false, reason: 'Content Brief nicht gefunden.' }
    }

    let customerName: string | null = null
    if (data.customer_id) {
      const customerResult = await admin
        .from('customers')
        .select('name')
        .eq('tenant_id', input.tenantId)
        .eq('id', data.customer_id)
        .maybeSingle()

      customerName = customerResult.data?.name ?? null
    }

    const approvalStatus = (data.approval_status as ApprovalStatus | null | undefined) ?? 'draft'

    return {
      found: true,
      title: data.keyword || 'Content Brief',
      html: briefJsonToHtml(data.brief_json),
      approvalStatus,
      customerId: data.customer_id ?? null,
      customerName,
    }
  }

  try {
    const { data, error } = await admin
      .from('ad_generations')
      .select('id, briefing, result, approval_status, customer_id')
      .eq('tenant_id', input.tenantId)
      .eq('id', input.contentId)
      .maybeSingle()

    if (error || !data) {
      return { found: false, reason: 'Ad-Generierung nicht gefunden.' }
    }

    let customerName: string | null = null
    if (data.customer_id) {
      const customerResult = await admin
        .from('customers')
        .select('name')
        .eq('tenant_id', input.tenantId)
        .eq('id', data.customer_id)
        .maybeSingle()

      customerName = customerResult.data?.name ?? null
    }

    const briefingProduct =
      data.briefing && typeof data.briefing === 'object' && 'product' in data.briefing
        ? (data.briefing as { product?: string }).product
        : null

    const approvalStatus = (data.approval_status as ApprovalStatus | null | undefined) ?? 'draft'

    return {
      found: true,
      title: briefingProduct?.trim() || 'Ad-Generierung',
      html: adResultToHtml(data.result),
      approvalStatus,
      customerId: data.customer_id ?? null,
      customerName,
    }
  } catch {
    return {
      found: false,
      reason: 'Ad-Generator Backend ist noch nicht bereitgestellt.',
    }
  }
}

export async function updateContentApprovalStatus(input: {
  tenantId: string
  contentType: ApprovalContentType
  contentId: string
  status: ApprovalStatus
}): Promise<void> {
  const admin = createAdminClient()

  if (input.contentType === 'content_brief') {
    await admin
      .from('content_briefs')
      .update({ approval_status: input.status })
      .eq('tenant_id', input.tenantId)
      .eq('id', input.contentId)
    return
  }

  try {
    await admin
      .from('ad_generations')
      .update({ approval_status: input.status })
      .eq('tenant_id', input.tenantId)
      .eq('id', input.contentId)
  } catch {
    // Ignore while ad_generator backend is not shipped yet.
  }
}
