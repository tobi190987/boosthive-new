import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { getActiveModuleCodes } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  SOCIAL_CALENDAR_READ,
  SOCIAL_CALENDAR_WRITE,
} from '@/lib/rate-limit'

const PLATFORMS = ['instagram', 'linkedin', 'facebook', 'tiktok'] as const
const STATUSES = ['draft', 'in_progress', 'review', 'approved', 'published'] as const
const FORMATS = [
  'instagram_feed',
  'instagram_reel',
  'facebook_post',
  'linkedin_post',
  'tiktok_video',
] as const

const updatePostSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  caption: z.string().max(5000).nullable().optional(),
  platforms: z.array(z.enum(PLATFORMS)).min(1).optional(),
  customer_id: z.string().uuid().nullable().optional(),
  scheduled_at: z.string().datetime().optional(),
  status: z.enum(STATUSES).optional(),
  assignee_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  ad_asset_id: z.string().uuid().nullable().optional(),
  ad_asset_url: z.string().url().nullable().optional(),
  post_format: z.enum(FORMATS).optional(),
})

const idSchema = z.string().uuid('Ungültige Post-ID.')

function isMissingPostFormatColumn(error: { code?: string; message?: string } | null) {
  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    error?.message?.includes('post_format') === true
  )
}

async function hasModuleAccess(tenantId: string) {
  const codes = await getActiveModuleCodes(tenantId)
  return codes.includes('social_calendar') || codes.includes('all')
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`social-calendar-read:${tenantId}:${getClientIp(request)}`, SOCIAL_CALENDAR_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  if (!(await hasModuleAccess(tenantId))) {
    return NextResponse.json({ error: 'Kein Zugriff auf dieses Modul.' }, { status: 403 })
  }

  const { id } = await params
  const idParsed = idSchema.safeParse(id)
  if (!idParsed.success) return NextResponse.json({ error: 'Ungültige Post-ID.' }, { status: 400 })

  const admin = createAdminClient()
  const selectWithFormat = `id, tenant_id, customer_id, title, caption, platforms, scheduled_at,
       status, assignee_id, notes, ad_asset_id, ad_asset_url, post_format, created_by, created_at, updated_at,
       customer:customers(name)`
  const selectWithoutFormat = `id, tenant_id, customer_id, title, caption, platforms, scheduled_at,
       status, assignee_id, notes, ad_asset_id, ad_asset_url, created_by, created_at, updated_at,
       customer:customers(name)`

  const initialResult = await admin
    .from('social_media_posts')
    .select(selectWithFormat)
    .eq('tenant_id', tenantId)
    .eq('id', idParsed.data)
    .single()

  let data = initialResult.data as Record<string, unknown> | null
  let error = initialResult.error

  if (isMissingPostFormatColumn(error)) {
    const fallbackResult = await admin
      .from('social_media_posts')
      .select(selectWithoutFormat)
      .eq('tenant_id', tenantId)
      .eq('id', idParsed.data)
      .single()

    data = fallbackResult.data
      ? { ...(fallbackResult.data as Record<string, unknown>), post_format: 'instagram_feed' }
      : null
    error = fallbackResult.error
  }

  if (error) {
    if (error.code === 'PGRST116') return NextResponse.json({ error: 'Post nicht gefunden.' }, { status: 404 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Post nicht gefunden.' }, { status: 404 })
  }

  // Fetch assignee name separately (assignee_id references auth.users, not user_profiles directly)
  let assigneeName: string | null = null
  if (data.assignee_id) {
    const { data: profile } = await admin
      .from('user_profiles')
      .select('first_name, last_name')
      .eq('user_id', data.assignee_id)
      .single()
    assigneeName = formatAssigneeName(profile)
  }

  return NextResponse.json({ post: mapPostWithRelations(data, assigneeName) })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`social-calendar-write:${tenantId}:${getClientIp(request)}`, SOCIAL_CALENDAR_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  if (!(await hasModuleAccess(tenantId))) {
    return NextResponse.json({ error: 'Kein Zugriff auf dieses Modul.' }, { status: 403 })
  }

  const { id } = await params
  const idParsed = idSchema.safeParse(id)
  if (!idParsed.success) return NextResponse.json({ error: 'Ungültige Post-ID.' }, { status: 400 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = updatePostSchema.safeParse(body)
  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors).flat().find(Boolean)
    return NextResponse.json({ error: firstError ?? 'Validierungsfehler.' }, { status: 400 })
  }

  const d = parsed.data
  const updateData: Record<string, unknown> = {}
  if (d.title !== undefined) updateData.title = d.title
  if (d.caption !== undefined) updateData.caption = d.caption
  if (d.platforms !== undefined) updateData.platforms = d.platforms
  if ('customer_id' in d) updateData.customer_id = d.customer_id ?? null
  if (d.scheduled_at !== undefined) updateData.scheduled_at = d.scheduled_at
  if (d.status !== undefined) updateData.status = d.status
  if ('assignee_id' in d) updateData.assignee_id = d.assignee_id ?? null
  if (d.notes !== undefined) updateData.notes = d.notes
  if ('ad_asset_id' in d) updateData.ad_asset_id = d.ad_asset_id ?? null
  if ('ad_asset_url' in d) updateData.ad_asset_url = d.ad_asset_url ?? null
  if (d.post_format !== undefined) updateData.post_format = d.post_format

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Keine Änderungen übergeben.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const initialUpdate = await admin
    .from('social_media_posts')
    .update(updateData)
    .eq('tenant_id', tenantId)
    .eq('id', idParsed.data)
    .select('id, tenant_id, customer_id, title, caption, platforms, scheduled_at, status, assignee_id, notes, ad_asset_id, ad_asset_url, post_format, created_by, created_at, updated_at')
    .single()

  let data = initialUpdate.data as Record<string, unknown> | null
  let error = initialUpdate.error

  if (isMissingPostFormatColumn(error)) {
    const { post_format: _postFormat, ...fallbackUpdateData } = updateData
    const fallbackUpdate = await admin
      .from('social_media_posts')
      .update(fallbackUpdateData)
      .eq('tenant_id', tenantId)
      .eq('id', idParsed.data)
      .select('id, tenant_id, customer_id, title, caption, platforms, scheduled_at, status, assignee_id, notes, ad_asset_id, ad_asset_url, created_by, created_at, updated_at')
      .single()

    data = fallbackUpdate.data
      ? { ...(fallbackUpdate.data as Record<string, unknown>), post_format: 'instagram_feed' }
      : null
    error = fallbackUpdate.error
  }

  if (error) {
    if (error.code === 'PGRST116') return NextResponse.json({ error: 'Post nicht gefunden.' }, { status: 404 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Post nicht gefunden.' }, { status: 404 })
  }

  return NextResponse.json({ post: mapPost(data) })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`social-calendar-write:${tenantId}:${getClientIp(request)}`, SOCIAL_CALENDAR_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  if (!(await hasModuleAccess(tenantId))) {
    return NextResponse.json({ error: 'Kein Zugriff auf dieses Modul.' }, { status: 403 })
  }

  const { id } = await params
  const idParsed = idSchema.safeParse(id)
  if (!idParsed.success) return NextResponse.json({ error: 'Ungültige Post-ID.' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('social_media_posts')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', idParsed.data)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAssigneeName(profile: { first_name?: string; last_name?: string } | null): string | null {
  if (!profile) return null
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ')
  return name || null
}

function mapPostWithRelations(row: Record<string, unknown>, assigneeName: string | null = null) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    customerId: row.customer_id ?? null,
    customerName: (row.customer as { name?: string } | null)?.name ?? null,
    title: row.title,
    caption: row.caption ?? null,
    platforms: row.platforms ?? [],
    scheduledAt: row.scheduled_at,
    status: row.status,
    assigneeId: row.assignee_id ?? null,
    assigneeName,
    notes: row.notes ?? null,
    adAssetId: row.ad_asset_id ?? null,
    adAssetUrl: row.ad_asset_url ?? null,
    postFormat: row.post_format ?? 'instagram_feed',
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapPost(row: Record<string, unknown>) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    customerId: row.customer_id ?? null,
    customerName: null,
    title: row.title,
    caption: row.caption ?? null,
    platforms: row.platforms ?? [],
    scheduledAt: row.scheduled_at,
    status: row.status,
    assigneeId: row.assignee_id ?? null,
    assigneeName: null,
    notes: row.notes ?? null,
    adAssetId: row.ad_asset_id ?? null,
    adAssetUrl: row.ad_asset_url ?? null,
    postFormat: row.post_format ?? 'instagram_feed',
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
