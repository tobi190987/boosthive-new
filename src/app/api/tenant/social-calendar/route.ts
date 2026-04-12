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
})

const uuidSchema = z.string().uuid()

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

  let query = admin
    .from('social_media_posts')
    .select(
      `id, tenant_id, customer_id, title, caption, platforms, scheduled_at,
       status, assignee_id, notes, created_by, created_at, updated_at,
       customer:customers(name),
       assignee:profiles!social_media_posts_assignee_id_fkey(first_name, last_name)`
    )
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

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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
    assigneeName: formatAssigneeName(row.assignee as { first_name?: string; last_name?: string } | null),
    notes: row.notes ?? null,
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

  const { data, error } = await admin
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
      created_by: authResult.auth.userId,
    })
    .select('id, tenant_id, customer_id, title, caption, platforms, scheduled_at, status, assignee_id, notes, created_by, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ post: mapPost(data) }, { status: 201 })
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
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
