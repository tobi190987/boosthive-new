import { createAdminClient } from '@/lib/supabase-admin'
import {
  getAdFieldDisplayLabel,
  getAdTypeDisplayLabel,
  getPlatformDisplayLabel,
} from '@/lib/ad-limits'
import { sendApprovalRequest } from '@/lib/email'
import {
  SOCIAL_PLATFORM_META,
  SOCIAL_POST_FORMAT_META,
  socialPostFormatLabel,
  type SocialPlatformId,
  type SocialPostFormat,
} from '@/lib/social-calendar'
import { loadTenantStatusRecord, resolveTenantStatus } from '@/lib/tenant-status'

export const APPROVAL_CONTENT_TYPES = [
  'content_brief',
  'ad_generation',
  'ad_library_asset',
  'social_media_post',
] as const
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

export interface ApprovalHistoryEvent {
  id: string
  approval_request_id: string
  tenant_id: string
  event_type: 'submitted' | 'resubmitted' | 'approved' | 'changes_requested' | 'content_updated'
  status_after: Exclude<ApprovalStatus, 'draft'>
  feedback: string | null
  actor_label: string | null
  created_at: string
}

function buildApprovalLink(origin: string, token: string): string {
  return `${origin}/approval/${token}`
}

export function buildContentHref(contentType: ApprovalContentType, contentId: string): string {
  switch (contentType) {
    case 'content_brief':
      return `/tools/content-briefs?briefId=${contentId}`
    case 'ad_generation':
      return `/tools/ad-generator?id=${contentId}`
    case 'ad_library_asset':
      return `/tools/ads-library?assetId=${contentId}`
    case 'social_media_post':
      return `/tools/social-calendar?postId=${contentId}`
    default:
      return '/tools/approvals'
  }
}

export function approvalContentTypeLabel(contentType: ApprovalContentType): string {
  switch (contentType) {
    case 'content_brief':
      return 'Content Brief'
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

function buildDisplayName(profile: { first_name: string | null; last_name: string | null } | null): string {
  const first = profile?.first_name?.trim() ?? ''
  const last = profile?.last_name?.trim() ?? ''
  const full = `${first} ${last}`.trim()
  return full || 'Teammitglied'
}

async function tryNotifyCustomerByEmail(params: {
  tenantId: string
  customerId: string | null
  contentTitle: string
  contentType: ApprovalContentType
  approvalLink: string
}): Promise<void> {
  if (!params.customerId) return

  const admin = createAdminClient()

  try {
    const [customerResult, tenantResult] = await Promise.all([
      admin.from('customers').select('contact_email, name').eq('id', params.customerId).maybeSingle(),
      admin.from('tenants').select('name, slug').eq('id', params.tenantId).maybeSingle(),
    ])

    const customer = customerResult.data
    const tenant = tenantResult.data

    if (!customer?.contact_email || !tenant) return

    void sendApprovalRequest({
      to: customer.contact_email,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      customerName: customer.name,
      contentTitle: params.contentTitle,
      contentTypeLabel: approvalContentTypeLabel(params.contentType),
      approvalLink: params.approvalLink,
    }).catch((err) => console.error('[approval] Kunden-E-Mail konnte nicht gesendet werden:', err))
  } catch (err) {
    console.error('[approval] Fehler beim Laden der Kunden-E-Mail:', err)
  }
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

function adVariantCardForType(
  platformKey: string,
  adTypeKey: string,
  index: number,
  rows: Array<[string, unknown]>
): string {
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
              `<div class="approval-ad-field__label">${escapeHtml(getAdFieldDisplayLabel(platformKey, adTypeKey, field))}</div>`,
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
            `<div class="approval-ad-type__header"><h4>${escapeHtml(getAdTypeDisplayLabel(platformKey, adTypeKey))}</h4></div>`,
            '<div class="approval-ad-type__variants"><p class="approval-empty">-</p></div>',
            '</section>',
          ].join('')
        )
        continue
      }

      const variantCards = variants
        .map((variant, index) => {
          if (!variant || typeof variant !== 'object') {
            return adVariantCardForType(platformKey, adTypeKey, index + 1, [])
          }
          return adVariantCardForType(
            platformKey,
            adTypeKey,
            index + 1,
            Object.entries(variant as Record<string, unknown>)
          )
        })
        .join('')

      platformSections.push(
        [
          '<section class="approval-ad-type">',
          `<div class="approval-ad-type__header"><h4>${escapeHtml(getAdTypeDisplayLabel(platformKey, adTypeKey))}</h4></div>`,
          `<div class="approval-ad-type__variants">${variantCards}</div>`,
          '</section>',
        ].join('')
      )
    }

    if (platformSections.length === 0) continue

    parts.push(
      [
        '<section class="approval-platform">',
        `<div class="approval-platform__header"><h3>${escapeHtml(getPlatformDisplayLabel(platformKey))}</h3></div>`,
        `<div class="approval-platform__body">${platformSections.join('')}</div>`,
        '</section>',
      ].join('')
    )
  }

  return `<div class="approval-rich-content approval-rich-content--ads">${parts.join('')}</div>`
}

function adLibraryAssetToHtml(asset: {
  title: string
  mediaType: 'image' | 'video'
  publicUrl: string
  fileFormat: string
  mimeType: string
  widthPx: number
  heightPx: number
  durationSeconds: number | null
  fileSizeBytes: number
  notes: string | null
}): string {
  const preview =
    asset.mediaType === 'image'
      ? `<img src="${escapeHtml(asset.publicUrl)}" alt="${escapeHtml(asset.title)}" style="width:100%;height:auto;display:block;border-radius:24px;" />`
      : `<video src="${escapeHtml(asset.publicUrl)}" controls playsinline preload="metadata" style="width:100%;height:auto;display:block;border-radius:24px;background:#0f172a;"></video>`

  const details = [
    ['Typ', asset.mediaType === 'image' ? 'Bild' : 'Video'],
    ['Format', asset.fileFormat],
    ['Aufloesung', `${asset.widthPx} x ${asset.heightPx} px`],
    ['MIME', asset.mimeType],
    ['Dateigroesse', `${Math.round(asset.fileSizeBytes / 1024)} KB`],
    ['Laufzeit', asset.mediaType === 'video' && asset.durationSeconds ? `${Math.round(asset.durationSeconds)} Sek.` : '-'],
  ]

  return [
    '<div class="approval-rich-content approval-rich-content--asset">',
    section('Asset Vorschau', preview, 'accent'),
    section(
      'Asset Details',
      `<div class="approval-keyword-table">${details
        .map(
          ([label, value]) =>
            `<div class="approval-keyword-row"><div class="approval-keyword-row__term">${escapeHtml(label)}</div><div class="approval-keyword-row__frequency">${escapeHtml(value)}</div></div>`
        )
        .join('')}</div>`,
      'default'
    ),
    section(
      'Notizen',
      asset.notes?.trim()
        ? `<div class="approval-copy">${toParagraphs(asset.notes)}</div>`
        : '<p class="approval-empty">Keine Notizen vorhanden.</p>',
      'warm'
    ),
    '</div>',
  ].join('')
}

function isMissingPostFormatColumn(error: { code?: string; message?: string } | null) {
  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    error?.message?.includes('post_format') === true
  )
}

function socialMediaPostToHtml(post: {
  title: string
  caption: string | null
  publicUrl: string | null
  postFormat: string
  scheduledAt: string
  customerName: string | null
  platforms: string[]
  notes: string | null
}) {
  const formatId = (post.postFormat as SocialPostFormat) || 'instagram_feed'
  const formatMeta = SOCIAL_POST_FORMAT_META[formatId]
  const platformIds = post.platforms.filter((entry): entry is SocialPlatformId =>
    entry in SOCIAL_PLATFORM_META
  )
  const primaryPlatform = platformIds[0] ?? formatMeta.platformId
  const scheduledLabel = new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(post.scheduledAt))
  const activePlatforms = platformIds.length > 0 ? platformIds : [primaryPlatform]
  const primaryMeta = SOCIAL_PLATFORM_META[primaryPlatform]
  const mediaAspectRatio =
    formatId === 'instagram_reel' || formatId === 'tiktok_video'
      ? '9 / 16'
      : formatId === 'linkedin_post'
        ? '1.91 / 1'
        : '1 / 1'
  const mediaPreview = post.publicUrl
    ? /\.(mp4|mov|webm)(\?|$)/i.test(post.publicUrl)
      ? `<video src="${escapeHtml(post.publicUrl)}" controls playsinline preload="metadata" style="display:block;width:100%;aspect-ratio:${mediaAspectRatio};object-fit:cover;background:#0f172a;"></video>`
      : `<img src="${escapeHtml(post.publicUrl)}" alt="${escapeHtml(post.title)}" style="display:block;width:100%;aspect-ratio:${mediaAspectRatio};object-fit:cover;background:#f3f4f6;" />`
    : `<div style="display:flex;align-items:center;justify-content:center;width:100%;aspect-ratio:${mediaAspectRatio};background:#f3f4f6;color:#64748b;font-size:14px;">Noch kein Bild oder Video hinterlegt</div>`
  const platformPills = activePlatforms
    .map(
      (platformId) =>
        `<span style="display:inline-flex;align-items:center;border:1px solid #dbe3f0;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:600;color:#334155;background:#f8fafc;">${escapeHtml(SOCIAL_PLATFORM_META[platformId].label)}</span>`
    )
    .join('')
  const details = [
    ['Format', socialPostFormatLabel(formatId)],
    [
      'Ausspielung',
      (platformIds.length > 0 ? platformIds : [primaryPlatform])
        .map((platformId) => SOCIAL_PLATFORM_META[platformId].label)
        .join(', '),
    ],
    ['Medientyp', formatMeta.mediaLabel],
    ['Geplant', scheduledLabel],
    ['Kunde', post.customerName ?? '-'],
  ]

  return [
    '<div class="approval-rich-content approval-rich-content--asset" data-render-version="social-v4">',
    section(
      'So erscheint der Post auf den Plattformen',
      [
        '<div style="display:flex;justify-content:center;">',
        '<article style="width:100%;max-width:340px;overflow:hidden;border:1px solid #e2e8f0;border-radius:24px;background:#ffffff;box-shadow:0 18px 45px -34px rgba(15,23,42,0.35);">',
        '<div style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #eef2f7;">',
        `<div style="display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:999px;background:#0f172a;color:#fff;font-size:13px;font-weight:700;">${escapeHtml(primaryMeta.short)}</div>`,
        '<div style="min-width:0;flex:1;">',
        `<div style="font-size:14px;font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(post.customerName ?? 'Kundenprofil')}</div>`,
        `<div style="margin-top:2px;font-size:12px;color:#64748b;">${escapeHtml(primaryMeta.label)} • ${escapeHtml(socialPostFormatLabel(formatId))}</div>`,
        '</div>',
        `<div style="font-size:11px;color:#64748b;">${escapeHtml(formatTimeLabel(primaryPlatform))}</div>`,
        '</div>',
        mediaPreview,
        '<div style="padding:14px 16px;">',
        `<div style="font-size:14px;font-weight:700;color:#0f172a;">${escapeHtml(post.title)}</div>`,
        post.caption?.trim()
          ? `<div style="margin-top:10px;font-size:14px;line-height:1.55;color:#334155;">${toParagraphs(post.caption)}</div>`
          : '<p style="margin-top:10px;font-size:14px;color:#94a3b8;">Keine Caption hinterlegt.</p>',
        `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">${platformPills}</div>`,
        '<div style="display:flex;gap:18px;margin-top:14px;padding-top:12px;border-top:1px solid #eef2f7;font-size:12px;font-weight:600;color:#94a3b8;">',
        '<span>Gefällt mir</span><span>Kommentieren</span><span>Teilen</span>',
        '</div>',
        '</div>',
        '</article>',
        '</div>',
      ].join(''),
      'accent'
    ),
    section(
      'Post Überblick',
      `<div class="approval-keyword-table">${details
        .map(
          ([label, value]) =>
            `<div class="approval-keyword-row"><div class="approval-keyword-row__term">${escapeHtml(label)}</div><div class="approval-keyword-row__frequency">${escapeHtml(value)}</div></div>`
        )
        .join('')}</div>`,
      'default'
    ),
    section(
      'Interne Notiz',
      post.notes?.trim()
        ? `<div class="approval-copy">${toParagraphs(post.notes)}</div>`
        : '<p class="approval-empty">Keine Notiz vorhanden.</p>',
      'warm'
    ),
    '</div>',
  ].join('')
}

function formatTimeLabel(platformId: SocialPlatformId) {
  switch (platformId) {
    case 'instagram':
      return 'Feed'
    case 'facebook':
      return 'Timeline'
    case 'linkedin':
      return 'Netzwerk'
    case 'tiktok':
      return 'For You'
    default:
      return 'Social'
  }
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

export async function loadApprovalHistory(approvalRequestId: string): Promise<ApprovalHistoryEvent[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('approval_request_events')
    .select('id, approval_request_id, tenant_id, event_type, status_after, feedback, actor_label, created_at')
    .eq('approval_request_id', approvalRequestId)
    .order('created_at', { ascending: true })

  if (error || !data) return []
  return data as ApprovalHistoryEvent[]
}

export async function createApprovalHistoryEvent(input: {
  approvalRequestId: string
  tenantId: string
  eventType: ApprovalHistoryEvent['event_type']
  statusAfter: Exclude<ApprovalStatus, 'draft'>
  feedback?: string | null
  actorLabel?: string | null
}): Promise<void> {
  const admin = createAdminClient()
  await admin.from('approval_request_events').insert({
    approval_request_id: input.approvalRequestId,
    tenant_id: input.tenantId,
    event_type: input.eventType,
    status_after: input.statusAfter,
    feedback: input.feedback ?? null,
    actor_label: input.actorLabel ?? null,
  })
}

export async function submitContentForApproval(input: {
  tenantId: string
  userId: string
  contentType: ApprovalContentType
  contentId: string
  origin: string
}): Promise<
  | {
      ok: true
      approvalId: string
      approvalStatus: Exclude<ApprovalStatus, 'draft'>
      approvalLink: string
      created: boolean
    }
  | { ok: false; status: 400 | 404 | 500; error: string }
> {
  const content = await loadContentForApproval({
    tenantId: input.tenantId,
    contentType: input.contentType,
    contentId: input.contentId,
  })

  if (!content.found) {
    return { ok: false, status: 404, error: content.reason }
  }

  if (content.approvalStatus === 'approved') {
    return {
      ok: false,
      status: 400,
      error: 'Dieses Element wurde bereits freigegeben und kann nicht erneut eingereicht werden.',
    }
  }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('user_profiles')
    .select('first_name, last_name')
    .eq('user_id', input.userId)
    .maybeSingle()

  const createdByName = buildDisplayName(profile)

  const { data: existing, error: existingError } = await admin
    .from('approval_requests')
    .select('id, public_token, status')
    .eq('tenant_id', input.tenantId)
    .eq('content_type', input.contentType)
    .eq('content_id', input.contentId)
    .maybeSingle()

  if (existingError) {
    return { ok: false, status: 500, error: existingError.message }
  }

  if (existing?.status === 'approved') {
    return {
      ok: false,
      status: 400,
      error: 'Dieses Element wurde bereits final freigegeben.',
    }
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
        created_by: input.userId,
        created_by_name: createdByName,
      })
      .eq('id', existing.id)
      .select('id, public_token, status')
      .single()

    if (error) {
      return { ok: false, status: 500, error: error.message }
    }

    await createApprovalHistoryEvent({
      approvalRequestId: updated.id,
      tenantId: input.tenantId,
      eventType: 'resubmitted',
      statusAfter: 'pending_approval',
      actorLabel: createdByName,
    })

    await updateContentApprovalStatus({
      tenantId: input.tenantId,
      contentType: input.contentType,
      contentId: input.contentId,
      status: 'pending_approval',
    })

    const approvalLink = buildApprovalLink(input.origin, updated.public_token)
    void tryNotifyCustomerByEmail({
      tenantId: input.tenantId,
      customerId: content.customerId,
      contentTitle: content.title,
      contentType: input.contentType,
      approvalLink,
    })

    return {
      ok: true,
      approvalId: updated.id,
      approvalStatus: 'pending_approval',
      approvalLink,
      created: false,
    }
  }

  const { data: inserted, error: insertError } = await admin
    .from('approval_requests')
    .insert({
      tenant_id: input.tenantId,
      content_type: input.contentType,
      content_id: input.contentId,
      status: 'pending_approval',
      feedback: null,
      created_by: input.userId,
      created_by_name: createdByName,
      content_title: content.title,
      content_html: content.html,
      customer_id: content.customerId,
      customer_name: content.customerName,
    })
    .select('id, public_token, status')
    .single()

  if (insertError) {
    return { ok: false, status: 500, error: insertError.message }
  }

  await createApprovalHistoryEvent({
    approvalRequestId: inserted.id,
    tenantId: input.tenantId,
    eventType: 'submitted',
    statusAfter: 'pending_approval',
    actorLabel: createdByName,
  })

  await updateContentApprovalStatus({
    tenantId: input.tenantId,
    contentType: input.contentType,
    contentId: input.contentId,
    status: 'pending_approval',
  })

  const approvalLink = buildApprovalLink(input.origin, inserted.public_token)
  void tryNotifyCustomerByEmail({
    tenantId: input.tenantId,
    customerId: content.customerId,
    contentTitle: content.title,
    contentType: input.contentType,
    approvalLink,
  })

  return {
    ok: true,
    approvalId: inserted.id,
    approvalStatus: 'pending_approval',
    approvalLink,
    created: true,
  }
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

  if (input.contentType === 'ad_library_asset') {
    const { data, error } = await admin
      .from('ad_library_assets')
      .select(
        'id, title, media_type, public_url, file_format, mime_type, width_px, height_px, duration_seconds, file_size_bytes, notes, approval_status, customer_id'
      )
      .eq('tenant_id', input.tenantId)
      .eq('id', input.contentId)
      .is('deleted_at', null)
      .maybeSingle()

    if (error || !data) {
      return { found: false, reason: 'Ad Asset nicht gefunden.' }
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
      title: data.title || 'Ad Asset',
      html: adLibraryAssetToHtml({
        title: data.title || 'Ad Asset',
        mediaType: data.media_type as 'image' | 'video',
        publicUrl: data.public_url,
        fileFormat: data.file_format,
        mimeType: data.mime_type,
        widthPx: data.width_px,
        heightPx: data.height_px,
        durationSeconds: data.duration_seconds,
        fileSizeBytes: data.file_size_bytes,
        notes: data.notes,
      }),
      approvalStatus,
      customerId: data.customer_id ?? null,
      customerName,
    }
  }

  if (input.contentType === 'social_media_post') {
    type SocialPostApprovalRow = {
      id: string
      title: string | null
      caption: string | null
      platforms: unknown
      scheduled_at: string
      status: string
      customer_id: string | null
      notes: string | null
      ad_asset_url: string | null
      post_format?: string | null
    }

    const initialResult = await admin
      .from('social_media_posts')
      .select('id, title, caption, platforms, scheduled_at, status, customer_id, notes, ad_asset_url, post_format')
      .eq('tenant_id', input.tenantId)
      .eq('id', input.contentId)
      .maybeSingle()

    let data = initialResult.data as SocialPostApprovalRow | null
    let error = initialResult.error

    if (isMissingPostFormatColumn(error)) {
      const fallbackResult = await admin
        .from('social_media_posts')
        .select('id, title, caption, platforms, scheduled_at, status, customer_id, notes, ad_asset_url')
        .eq('tenant_id', input.tenantId)
        .eq('id', input.contentId)
        .maybeSingle()

      data = fallbackResult.data
        ? { ...(fallbackResult.data as SocialPostApprovalRow), post_format: 'instagram_feed' }
        : null
      error = fallbackResult.error
    }

    if (error || !data) {
      return { found: false, reason: 'Social Post nicht gefunden.' }
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

    const approvalStatus: ApprovalStatus =
      data.status === 'approved'
        ? 'approved'
        : data.status === 'review'
          ? 'pending_approval'
          : data.status === 'in_progress'
            ? 'changes_requested'
            : 'draft'

    return {
      found: true,
      title: data.title || 'Social Post',
      html: socialMediaPostToHtml({
        title: data.title || 'Social Post',
        caption: data.caption ?? null,
        publicUrl: data.ad_asset_url ?? null,
        postFormat: data.post_format ?? 'instagram_feed',
        scheduledAt: data.scheduled_at,
        customerName,
        platforms: Array.isArray(data.platforms) ? data.platforms.map((entry) => String(entry)) : [],
        notes: data.notes ?? null,
      }),
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

  if (input.contentType === 'ad_library_asset') {
    await admin
      .from('ad_library_assets')
      .update({ approval_status: input.status })
      .eq('tenant_id', input.tenantId)
      .eq('id', input.contentId)
    return
  }

  if (input.contentType === 'social_media_post') {
    const socialStatus =
      input.status === 'approved'
        ? 'approved'
        : input.status === 'pending_approval'
          ? 'review'
          : input.status === 'changes_requested'
            ? 'in_progress'
            : 'draft'

    await admin
      .from('social_media_posts')
      .update({ status: socialStatus })
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
