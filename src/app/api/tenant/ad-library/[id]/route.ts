import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import { recordTenantDataAuditLog } from '@/lib/tenant-data-audit'
import {
  AD_GENERATOR_READ,
  AD_GENERATOR_WRITE,
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from '@/lib/rate-limit'

function buildUploaderName(profile: { first_name: string | null; last_name: string | null } | null) {
  const first = profile?.first_name?.trim() ?? ''
  const last = profile?.last_name?.trim() ?? ''
  const fullName = [first, last].filter(Boolean).join(' ').trim()
  return fullName || 'Teammitglied'
}

function isMissingApprovalStatusColumn(error: { code?: string; message?: string } | null) {
  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    error?.message?.includes('approval_status') === true
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`ad-library-read:${tenantId}:${getClientIp(request)}`, AD_GENERATOR_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'ad_generator')
  if ('error' in moduleAccess) return moduleAccess.error

  const { id } = await params
  const admin = createAdminClient()

  const initialResult = await admin
    .from('ad_library_assets')
    .select(
      'id, customer_id, created_by, title, media_type, mime_type, file_format, width_px, height_px, duration_seconds, file_size_bytes, public_url, aspect_ratio, approval_status, notes, created_at, updated_at'
    )
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  let asset = initialResult.data as Record<string, unknown> | null
  let error = initialResult.error

  if (isMissingApprovalStatusColumn(error)) {
    const fallbackResult = await admin
      .from('ad_library_assets')
      .select(
        'id, customer_id, created_by, title, media_type, mime_type, file_format, width_px, height_px, duration_seconds, file_size_bytes, public_url, aspect_ratio, notes, created_at, updated_at'
      )
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()

    asset = fallbackResult.data
      ? { ...(fallbackResult.data as Record<string, unknown>), approval_status: 'draft' }
      : null
    error = fallbackResult.error
  }

  if (error || !asset) {
    return NextResponse.json({ error: 'Anzeige nicht gefunden.' }, { status: 404 })
  }

  const { data: profile } = asset.created_by
    ? await admin
        .from('user_profiles')
        .select('first_name, last_name')
        .eq('user_id', asset.created_by)
        .maybeSingle()
    : { data: null }

  return NextResponse.json({
    asset: {
      ...asset,
      uploader_name: buildUploaderName(profile),
    },
  })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`ad-library-delete:${tenantId}:${getClientIp(request)}`, AD_GENERATOR_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'ad_generator')
  if ('error' in moduleAccess) return moduleAccess.error

  const { id } = await params
  const admin = createAdminClient()

  const { data: asset, error: fetchError } = await admin
    .from('ad_library_assets')
    .select('id, storage_path')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (fetchError || !asset) {
    return NextResponse.json({ error: 'Anzeige nicht gefunden.' }, { status: 404 })
  }

  const { error: deleteError } = await admin
    .from('ad_library_assets')
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  await admin.storage.from('ad-library-assets').remove([asset.storage_path])

  await recordTenantDataAuditLog({
    tenantId,
    actorUserId: authResult.auth.userId,
    actionType: 'data_delete',
    resourceType: 'ad_library_asset',
    resourceId: id,
  })

  return new NextResponse(null, { status: 204 })
}
