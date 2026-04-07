import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import { AD_PLATFORMS_MAP, type AdTypeConfig } from '@/lib/ad-limits'
import { recordTenantDataAuditLog } from '@/lib/tenant-data-audit'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  AD_GENERATOR_READ,
} from '@/lib/rate-limit'

const idSchema = z.string().uuid('Ungültige Generierungs-ID.')
const platformSchema = z.enum(['facebook', 'linkedin', 'tiktok', 'google'])

type FieldValue = string | string[]
type VariantFields = Record<string, FieldValue>
interface AdTypeResult {
  variants: VariantFields[]
}
type PlatformResult = Record<string, AdTypeResult>
type GenerationResult = Record<string, PlatformResult>

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
    .select('id, briefing, result, created_at')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'Generierung nicht gefunden.' }, { status: 404 })
  }

  if (!isRecord(data.result)) {
    return NextResponse.json({ error: 'Kein Ergebnis für Export vorhanden.' }, { status: 400 })
  }

  const rows = flattenRows(data.result as GenerationResult)
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Keine Exportdaten vorhanden.' }, { status: 400 })
  }

  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Ads')

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer
  const bytes = new Uint8Array(buffer)

  const briefing = isRecord(data.briefing) ? data.briefing : {}
  const product =
    typeof briefing.product === 'string' && briefing.product.trim()
      ? briefing.product.trim()
      : 'produkt'
  const date = new Date(data.created_at).toISOString().slice(0, 10)
  const fileName = `ads_${slugify(product)}_${date}.xlsx`

  await recordTenantDataAuditLog({
    tenantId,
    actorUserId: authResult.auth.userId,
    actionType: 'data_export',
    resourceType: 'ad_generation_export',
    resourceId: id,
    context: { file_name: fileName },
  })

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  })
}

function flattenRows(result: GenerationResult): Array<Record<string, string | number>> {
  const rows: Array<Record<string, string | number>> = []

  for (const [platformIdRaw, platformResult] of Object.entries(result)) {
    const parsedPlatform = platformSchema.safeParse(platformIdRaw)
    if (!parsedPlatform.success || !isRecord(platformResult)) continue

    const platformId = parsedPlatform.data
    const platformConfig = AD_PLATFORMS_MAP[platformId]
    const platformLabel = platformConfig?.label ?? platformId

    for (const [adTypeId, adTypeResult] of Object.entries(platformResult)) {
      if (!isRecord(adTypeResult) || !Array.isArray(adTypeResult.variants)) continue

      const adTypeConfig = platformConfig?.adTypes.find((adType) => adType.id === adTypeId)
      const adTypeLabel = adTypeConfig?.label ?? adTypeId

      adTypeResult.variants.forEach((variantRaw, variantIndex) => {
        if (!isRecord(variantRaw)) return

        const row: Record<string, string | number> = {
          Plattform: platformLabel,
          Anzeigentyp: adTypeLabel,
          Variante: variantIndex + 1,
        }

        appendVariantFields(row, variantRaw, adTypeConfig)
        rows.push(row)
      })
    }
  }

  return rows
}

function appendVariantFields(
  row: Record<string, string | number>,
  variantRaw: Record<string, unknown>,
  adTypeConfig?: AdTypeConfig
): void {
  if (!adTypeConfig) {
    for (const [key, value] of Object.entries(variantRaw)) {
      if (Array.isArray(value)) {
        value.forEach((entry, index) => {
          row[`${key} ${index + 1}`] = String(entry ?? '')
        })
      } else {
        row[key] = String(value ?? '')
      }
    }
    return
  }

  for (const field of adTypeConfig.fields) {
    const value = variantRaw[field.name]
    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        row[`${field.label} ${index + 1}`] = String(entry ?? '')
      })
    } else {
      row[field.label] = typeof value === 'string' ? value : ''
    }
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'produkt'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
