import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createApprovalHistoryEvent } from '@/lib/approvals'
import { createAdminClient } from '@/lib/supabase-admin'
import { AD_PLATFORMS_MAP, type PlatformId } from '@/lib/ad-limits'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  AD_GENERATOR_READ,
  AD_GENERATOR_WRITE,
} from '@/lib/rate-limit'

const idSchema = z.string().uuid('Ungültige Generierungs-ID.')
const fieldValueSchema = z.union([z.string(), z.array(z.string())])
const updateSchema = z.object({
  result: z.record(z.string(), z.record(z.string(), z.object({
    variants: z.array(z.record(z.string(), fieldValueSchema)).length(3),
  }))),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`ad-generator-read:${tenantId}:${getClientIp(request)}`, AD_GENERATOR_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'ad_generator')
  if ('error' in moduleAccess) return moduleAccess.error

  const { id } = await params
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'Ungültige Generierungs-ID.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ad_generations')
    .select('id, briefing, result, customer_id, status, created_at, customers(name)')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'Generierung nicht gefunden.' }, { status: 404 })
  }

  return NextResponse.json({
    generation: {
      id: data.id,
      briefing: isRecord(data.briefing) ? data.briefing : {},
      result: isRecord(data.result) ? data.result : {},
      customer_id: data.customer_id ?? null,
      customer_name: extractCustomerName(data.customers),
      created_at: data.created_at,
      status: data.status,
    },
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`ad-generator-write:${tenantId}:${getClientIp(request)}`, AD_GENERATOR_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'ad_generator')
  if ('error' in moduleAccess) return moduleAccess.error

  const { id } = await params
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'Ungültige Generierungs-ID.' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsedBody = updateSchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'Ungültige Ergebnisdaten.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: generation, error } = await admin
    .from('ad_generations')
    .select('id, briefing, approval_status')
    .eq('tenant_id', tenantId)
    .eq('id', parsedId.data)
    .maybeSingle()

  if (error || !generation) {
    return NextResponse.json({ error: 'Generierung nicht gefunden.' }, { status: 404 })
  }

  const validationError = validateGenerationResult(parsedBody.data.result, generation.briefing)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const { error: updateError } = await admin
    .from('ad_generations')
    .update({
      result: parsedBody.data.result,
      approval_status: generation.approval_status === 'approved' ? 'approved' : generation.approval_status,
    })
    .eq('tenant_id', tenantId)
    .eq('id', parsedId.data)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  const { data: approvalRequest } = await admin
    .from('approval_requests')
    .select('id, tenant_id')
    .eq('tenant_id', tenantId)
    .eq('content_type', 'ad_generation')
    .eq('content_id', parsedId.data)
    .maybeSingle()

  if (approvalRequest) {
    await createApprovalHistoryEvent({
      approvalRequestId: approvalRequest.id,
      tenantId: approvalRequest.tenant_id,
      eventType: 'content_updated',
      statusAfter:
        generation.approval_status === 'approved' ? 'approved' : generation.approval_status === 'changes_requested'
          ? 'changes_requested'
          : 'pending_approval',
      actorLabel: 'Agentur',
    })
  }

  return NextResponse.json({ success: true })
}

function extractCustomerName(value: unknown): string | null {
  if (Array.isArray(value)) {
    const first = value[0]
    if (isRecord(first) && typeof first.name === 'string' && first.name.trim()) return first.name.trim()
    return null
  }
  if (isRecord(value) && typeof value.name === 'string' && value.name.trim()) {
    return value.name.trim()
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateGenerationResult(result: Record<string, unknown>, briefing: unknown): string | null {
  if (!isRecord(briefing)) return 'Briefing der Generierung ist ungültig.'

  const selected = Array.isArray(briefing.selectedAdTypes) ? briefing.selectedAdTypes : []
  for (const selectedType of selected) {
    if (!isRecord(selectedType)) continue
    const platformId = selectedType.platformId
    const adTypeId = selectedType.adTypeId
    if (typeof platformId !== 'string' || typeof adTypeId !== 'string') continue

    const platformConfig = AD_PLATFORMS_MAP[platformId as PlatformId]
    const adTypeConfig = platformConfig?.adTypes.find((entry) => entry.id === adTypeId)
    if (!platformConfig || !adTypeConfig) continue

    const platformResult = result[platformId]
    if (!isRecord(platformResult)) return `${platformConfig.label}: Ergebnis fehlt.`
    const adTypeResult = platformResult[adTypeId]
    if (!isRecord(adTypeResult) || !Array.isArray(adTypeResult.variants) || adTypeResult.variants.length !== 3) {
      return `${adTypeConfig.label}: Es werden genau 3 Varianten benötigt.`
    }

    for (const variant of adTypeResult.variants) {
      if (!isRecord(variant)) return `${adTypeConfig.label}: Ungültige Variantendaten.`
      for (const field of adTypeConfig.fields) {
        const value = variant[field.name]
        if (field.multiple) {
          if (!Array.isArray(value)) return `${adTypeConfig.label}: ${field.label} muss mehrere Einträge enthalten.`
          if (value.length > field.multiple) return `${adTypeConfig.label}: ${field.label} hat zu viele Einträge.`
          for (const entry of value) {
            if (typeof entry !== 'string') return `${adTypeConfig.label}: ${field.label} enthält einen ungültigen Eintrag.`
            if ([...entry].length > field.limit) return `${adTypeConfig.label}: ${field.label} überschreitet das Zeichenlimit.`
          }
        } else {
          if (typeof value !== 'string') return `${adTypeConfig.label}: ${field.label} muss ein Text sein.`
          if ([...value].length > field.limit) return `${adTypeConfig.label}: ${field.label} überschreitet das Zeichenlimit.`
        }
      }
    }
  }

  return null
}
