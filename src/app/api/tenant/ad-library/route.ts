import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  AD_GENERATOR_READ,
  AD_GENERATOR_WRITE,
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from '@/lib/rate-limit'

const ALLOWED_TYPES: Record<string, { extension: string; mediaType: 'image' | 'video' }> = {
  'image/jpeg': { extension: 'jpg', mediaType: 'image' },
  'image/png': { extension: 'png', mediaType: 'image' },
  'image/webp': { extension: 'webp', mediaType: 'image' },
  'image/gif': { extension: 'gif', mediaType: 'image' },
  'video/mp4': { extension: 'mp4', mediaType: 'video' },
  'video/webm': { extension: 'webm', mediaType: 'video' },
  'video/quicktime': { extension: 'mov', mediaType: 'video' },
}

const MAX_FILE_SIZE = 100 * 1024 * 1024

const listQuerySchema = z.object({
  customer_id: z.string().uuid().optional(),
  media_type: z.enum(['image', 'video']).optional(),
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})

function buildUploaderName(profile: { first_name: string | null; last_name: string | null } | null) {
  const first = profile?.first_name?.trim() ?? ''
  const last = profile?.last_name?.trim() ?? ''
  const fullName = [first, last].filter(Boolean).join(' ').trim()
  return fullName || 'Teammitglied'
}

function parseNumber(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function slugifyFileName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function fileTitleFromName(name: string) {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
  return base || 'Anzeige'
}

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`ad-library-read:${tenantId}:${getClientIp(request)}`, AD_GENERATOR_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'ad_generator')
  if ('error' in moduleAccess) return moduleAccess.error

  const parsed = listQuerySchema.safeParse({
    customer_id: request.nextUrl.searchParams.get('customer_id') ?? undefined,
    media_type: request.nextUrl.searchParams.get('media_type') ?? undefined,
    search: request.nextUrl.searchParams.get('search') ?? undefined,
    limit: request.nextUrl.searchParams.get('limit') ?? undefined,
    offset: request.nextUrl.searchParams.get('offset') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: 'Ungültige Filter.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { limit, offset } = parsed.data
  let query = admin
    .from('ad_library_assets')
    .select(
      `
      id,
      customer_id,
      created_by,
      title,
      media_type,
      mime_type,
      file_format,
      width_px,
      height_px,
      duration_seconds,
      file_size_bytes,
      public_url,
      aspect_ratio,
      approval_status,
      notes,
      created_at,
      updated_at
    `,
      { count: 'exact' }
    )
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (parsed.data.customer_id) {
    query = query.eq('customer_id', parsed.data.customer_id)
  }

  if (parsed.data.media_type) {
    query = query.eq('media_type', parsed.data.media_type)
  }

  if (parsed.data.search) {
    query = query.ilike('title', `%${parsed.data.search}%`)
  }

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const creatorIds = [...new Set((data ?? []).map((asset) => asset.created_by).filter(Boolean))]
  const uploaderMap = new Map<string, string>()

  if (creatorIds.length > 0) {
    const { data: profiles } = await admin
      .from('user_profiles')
      .select('user_id, first_name, last_name')
      .in('user_id', creatorIds)

    for (const profile of profiles ?? []) {
      uploaderMap.set(profile.user_id, buildUploaderName(profile))
    }
  }

  return NextResponse.json({
    assets: (data ?? []).map((asset) => ({
      ...asset,
      uploader_name: uploaderMap.get(asset.created_by) ?? 'Teammitglied',
    })),
    total: count ?? 0,
  })
}

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`ad-library-write:${tenantId}:${getClientIp(request)}`, AD_GENERATOR_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'ad_generator')
  if ('error' in moduleAccess) return moduleAccess.error

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Ungültige FormData.' }, { status: 400 })
  }

  const file = formData.get('file')
  const customerId = formData.get('customer_id')
  const title = typeof formData.get('title') === 'string' ? formData.get('title')?.toString().trim() : ''
  const notes = typeof formData.get('notes') === 'string' ? formData.get('notes')?.toString().trim() : ''

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Keine Datei hochgeladen.' }, { status: 400 })
  }

  if (typeof customerId !== 'string' || !customerId) {
    return NextResponse.json({ error: 'Bitte wähle einen Kunden.' }, { status: 400 })
  }

  const allowed = ALLOWED_TYPES[file.type]
  if (!allowed) {
    return NextResponse.json({
      error: 'Ungültiges Dateiformat. Erlaubt sind JPG, PNG, WebP, GIF, MP4, WebM und MOV.',
    }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Datei zu groß. Maximal 100 MB.' }, { status: 400 })
  }

  const widthPx = parseNumber(formData.get('width_px'))
  const heightPx = parseNumber(formData.get('height_px'))
  const durationSeconds = parseNumber(formData.get('duration_seconds'))
  const fileSizeBytes = parseNumber(formData.get('file_size_bytes')) ?? file.size

  if (!widthPx || !heightPx) {
    return NextResponse.json({ error: 'Breite und Höhe konnten nicht erkannt werden.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: customer, error: customerError } = await admin
    .from('customers')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', customerId)
    .is('deleted_at', null)
    .single()

  if (customerError || !customer) {
    return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(2, 10)
  const fileStem = slugifyFileName(file.name.replace(/\.[^.]+$/, '')) || 'ad'
  const storagePath = `${tenantId}/${customerId}/${timestamp}-${random}-${fileStem}.${allowed.extension}`

  const { error: uploadError } = await admin.storage
    .from('ad-library-assets')
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: 'Fehler beim Hochladen der Anzeige.' }, { status: 500 })
  }

  const { data: publicUrlData } = admin.storage.from('ad-library-assets').getPublicUrl(storagePath)
  const assetTitle = title || fileTitleFromName(file.name)

  const { data, error } = await admin
    .from('ad_library_assets')
    .insert({
      tenant_id: tenantId,
      customer_id: customerId,
      created_by: authResult.auth.userId,
      title: assetTitle.slice(0, 200),
      media_type: allowed.mediaType,
      mime_type: file.type,
      file_format: allowed.extension.toUpperCase(),
      width_px: Math.round(widthPx),
      height_px: Math.round(heightPx),
      duration_seconds: allowed.mediaType === 'video' && durationSeconds ? durationSeconds : null,
      file_size_bytes: Math.round(fileSizeBytes),
      storage_path: storagePath,
      public_url: publicUrlData.publicUrl,
      aspect_ratio: widthPx / heightPx,
      notes: notes ? notes.slice(0, 2000) : null,
    })
    .select(`
      id,
      customer_id,
      created_by,
      title,
      media_type,
      mime_type,
      file_format,
      width_px,
      height_px,
      duration_seconds,
      file_size_bytes,
      public_url,
      aspect_ratio,
      approval_status,
      notes,
      created_at,
      updated_at
    `)
    .single()

  if (error) {
    await admin.storage.from('ad-library-assets').remove([storagePath])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: profile } = await admin
    .from('user_profiles')
    .select('first_name, last_name')
    .eq('user_id', authResult.auth.userId)
    .maybeSingle()

  return NextResponse.json({
    asset: {
      ...data,
      uploader_name: buildUploaderName(profile),
    },
  }, { status: 201 })
}
