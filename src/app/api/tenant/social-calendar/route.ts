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

const createPostSchema = z.object({
  title: z.string().min(1, 'Titel ist erforderlich.').max(500),
  caption: z.string().max(5000).nullable().optional(),
  platforms: z
    .array(z.enum(PLATFORMS))
    .min(1, 'Mindestens eine Plattform erforderlich.'),
  customer_id: z.string().uuid().nullable().optional(),
  scheduled_at: z.string().datetime({ message: 'Ungültiges Datum.' }),
  status: z.enum(STATUSES).optional().default('draft'),
  assignee_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  ad_asset_id: z.string().uuid().nullable().optional(),
  ad_asset_url: z.string().url().nullable().optional(),
  post_format: z.enum(FORMATS).optional().default('instagram_feed'),
})

const uuidSchema = z.string().uuid()

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

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`social-calendar-read:${tenantId}:${getClientIp(request)}`, SOCIAL_CALENDAR_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  if (!(await hasModuleAccess(tenantId))) {
    return NextResponse.json({ error: 'Kein Zugriff auf dieses Modul.' }, { status: 403 })
  }

  const sp = request.nextUrl.searchParams
  const startParam = sp.get('start')
  const endParam = sp.get('end')
  const customerIdParam = sp.get('customer_id')
  const platformParam = sp.get('platform')
  const statusParam = sp.get('status')

  // Validate optional filters
  if (customerIdParam) {
    const parsed = uuidSchema.safeParse(customerIdParam)
    if (!parsed.success) return NextResponse.json({ error: 'Ungültige Kunden-ID.' }, { status: 400 })
  }

  const admin = createAdminClient()

  const selectWithFormat = `id, tenant_id, customer_id, title, caption, platforms, scheduled_at,
       status, assignee_id, notes, ad_asset_id, ad_asset_url, post_format, created_by, created_at, updated_at,
       customer:customers(name)`
  const selectWithoutFormat = `id, tenant_id, customer_id, title, caption, platforms, scheduled_at,
       status, assignee_id, notes, ad_asset_id, ad_asset_url, created_by, created_at, updated_at,
       customer:customers(name)`

  let query = admin
    .from('social_media_posts')
    .select(selectWithFormat)
    .eq('tenant_id', tenantId)
    .order('scheduled_at', { ascending: true })
    .limit(500)

  if (startParam) query = query.gte('scheduled_at', startParam)
  if (endParam) query = query.lte('scheduled_at', endParam)
  if (customerIdParam) query = query.eq('customer_id', customerIdParam)
  if (platformParam) {
    const platforms = platformParam.split(',')
    query = query.overlaps('platforms', platforms)
  }
  if (statusParam) {
    const statuses = statusParam.split(',')
    query = query.in('status', statuses)
  }

  const initialResult = await query
  let data = initialResult.data as Array<Record<string, unknown>> | null
  let error = initialResult.error

  if (isMissingPostFormatColumn(error)) {
    let fallbackQuery = admin
      .from('social_media_posts')
      .select(selectWithoutFormat)
      .eq('tenant_id', tenantId)
      .order('scheduled_at', { ascending: true })
      .limit(500)

    if (startParam) fallbackQuery = fallbackQuery.gte('scheduled_at', startParam)
    if (endParam) fallbackQuery = fallbackQuery.lte('scheduled_at', endParam)
    if (customerIdParam) fallbackQuery = fallbackQuery.eq('customer_id', customerIdParam)
    if (platformParam) {
      const platforms = platformParam.split(',')
      fallbackQuery = fallbackQuery.overlaps('platforms', platforms)
    }
    if (statusParam) {
      const statuses = statusParam.split(',')
      fallbackQuery = fallbackQuery.in('status', statuses)
    }

    const fallbackResult = await fallbackQuery
    data =
      fallbackResult.data?.map((row) => ({
        ...(row as Record<string, unknown>),
        post_format: 'instagram_feed',
      })) ?? null
    error = fallbackResult.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch assignee names separately (assignee_id references auth.users, not user_profiles directly)
  const assigneeIds = [...new Set((data ?? []).map((r) => r.assignee_id).filter(Boolean))]
  const assigneeMap: Record<string, string | null> = {}
  if (assigneeIds.length > 0) {
    const { data: profiles } = await admin
      .from('user_profiles')
      .select('user_id, first_name, last_name')
      .in('user_id', assigneeIds)
    for (const p of profiles ?? []) {
      if (typeof p.user_id === 'string') {
        assigneeMap[p.user_id] = formatAssigneeName(p)
      }
    }
  }

  const posts = (data ?? []).map((row) => ({
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
    assigneeName:
      typeof row.assignee_id === 'string' ? (assigneeMap[row.assignee_id] ?? null) : null,
    notes: row.notes ?? null,
    adAssetId: row.ad_asset_id ?? null,
    adAssetUrl: row.ad_asset_url ?? null,
    postFormat: row.post_format ?? 'instagram_feed',
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  return NextResponse.json({ posts })
}

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`social-calendar-write:${tenantId}:${getClientIp(request)}`, SOCIAL_CALENDAR_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  if (!(await hasModuleAccess(tenantId))) {
    return NextResponse.json({ error: 'Kein Zugriff auf dieses Modul.' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = createPostSchema.safeParse(body)
  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors).flat().find(Boolean)
    return NextResponse.json({ error: firstError ?? 'Validierungsfehler.' }, { status: 400 })
  }

  const d = parsed.data
  const admin = createAdminClient()

  const initialInsert = await admin
    .from('social_media_posts')
    .insert({
      tenant_id: tenantId,
      customer_id: d.customer_id ?? null,
      title: d.title,
      caption: d.caption ?? null,
      platforms: d.platforms,
      scheduled_at: d.scheduled_at,
      status: d.status,
      assignee_id: d.assignee_id ?? null,
      notes: d.notes ?? null,
      ad_asset_id: d.ad_asset_id ?? null,
      ad_asset_url: d.ad_asset_url ?? null,
      post_format: d.post_format,
      created_by: authResult.auth.userId,
    })
    .select('id, tenant_id, customer_id, title, caption, platforms, scheduled_at, status, assignee_id, notes, ad_asset_id, ad_asset_url, post_format, created_by, created_at, updated_at')
    .single()

  let data = initialInsert.data as Record<string, unknown> | null
  let error = initialInsert.error

  if (isMissingPostFormatColumn(error)) {
    const fallbackInsert = await admin
      .from('social_media_posts')
      .insert({
        tenant_id: tenantId,
        customer_id: d.customer_id ?? null,
        title: d.title,
        caption: d.caption ?? null,
        platforms: d.platforms,
        scheduled_at: d.scheduled_at,
        status: d.status,
        assignee_id: d.assignee_id ?? null,
        notes: d.notes ?? null,
        ad_asset_id: d.ad_asset_id ?? null,
        ad_asset_url: d.ad_asset_url ?? null,
        created_by: authResult.auth.userId,
      })
      .select('id, tenant_id, customer_id, title, caption, platforms, scheduled_at, status, assignee_id, notes, ad_asset_id, ad_asset_url, created_by, created_at, updated_at')
      .single()

    data = fallbackInsert.data
      ? { ...(fallbackInsert.data as Record<string, unknown>), post_format: 'instagram_feed' }
      : null
    error = fallbackInsert.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ post: mapPost(data as Record<string, unknown>) }, { status: 201 })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAssigneeName(profile: { first_name?: string; last_name?: string } | null): string | null {
  if (!profile) return null
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ')
  return name || null
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
