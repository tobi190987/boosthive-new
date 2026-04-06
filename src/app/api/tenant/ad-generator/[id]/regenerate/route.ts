import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  AD_PLATFORMS_MAP,
  type AdFieldConfig,
  type AdTypeConfig,
  type PlatformId,
} from '@/lib/ad-limits'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  AD_GENERATOR_WRITE,
} from '@/lib/rate-limit'

export const maxDuration = 60

const DEFAULT_MODEL = 'openai/gpt-4o'

const idSchema = z.string().uuid()
const requestSchema = z.object({
  platformId: z.enum(['facebook', 'linkedin', 'tiktok', 'google']),
  adTypeId: z.string().min(1),
  variantIndex: z.number().int().min(0).max(2),
})

type FieldValue = string | string[]
type VariantFields = Record<string, FieldValue>

const VARIANT_STYLES = [
  { label: 'nutzenorientiert', instruction: 'Diese Variante soll direkt und nutzenorientiert sein: Zeige klar den konkreten Mehrwert des Produkts.' },
  { label: 'hook-lastig', instruction: 'Diese Variante soll neugierig machend und hook-lastig sein: Beginne mit einem aufmerksamkeitsstarken Einstieg oder einer provokanten Frage.' },
  { label: 'vertrauensbasiert', instruction: 'Diese Variante soll vertrauens- und proof-orientiert sein: Nutze Social Proof, Qualitätssignale oder eine beruhigende, seriöse Sprache.' },
]

export async function POST(
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

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ungültige Parameter.' }, { status: 400 })
  }

  const { platformId, adTypeId, variantIndex } = parsed.data

  const platformConfig = AD_PLATFORMS_MAP[platformId as PlatformId]
  const adType = platformConfig?.adTypes.find((at) => at.id === adTypeId)
  if (!platformConfig || !adType) {
    return NextResponse.json({ error: 'Unbekannte Plattform oder Anzeigentyp.' }, { status: 400 })
  }

  const openrouterApiKey = process.env.OPENROUTER_API_KEY
  if (!openrouterApiKey) {
    return NextResponse.json({ error: 'OPENROUTER_API_KEY nicht konfiguriert.' }, { status: 500 })
  }

  const admin = createAdminClient()
  const { data: generation, error: fetchError } = await admin
    .from('ad_generations')
    .select('id, briefing, result')
    .eq('tenant_id', tenantId)
    .eq('id', parsedId.data)
    .maybeSingle()

  if (fetchError || !generation) {
    return NextResponse.json({ error: 'Generierung nicht gefunden.' }, { status: 404 })
  }

  const briefing = isRecord(generation.briefing) ? generation.briefing : {}
  const result = isRecord(generation.result) ? generation.result : {}

  const prompt = buildRegeneratePrompt(briefing, platformId, adType, variantIndex)
  const model = process.env.AD_GENERATOR_MODEL ?? DEFAULT_MODEL

  let rawResponse: string
  try {
    rawResponse = await callOpenRouter(openrouterApiKey, model, prompt)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OpenRouter nicht erreichbar.'
    return NextResponse.json({ error: message }, { status: 502 })
  }

  let variant: VariantFields
  try {
    variant = parseVariantResponse(rawResponse, adType)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'KI-Antwort konnte nicht verarbeitet werden.'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  variant = clampVariantToLimits(variant, adType)

  // Update the specific variant in the stored result
  const updatedResult = updateVariantInResult(result, platformId, adTypeId, variantIndex, variant)

  const { error: updateError } = await admin
    .from('ad_generations')
    .update({ result: updatedResult })
    .eq('tenant_id', tenantId)
    .eq('id', parsedId.data)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ variant })
}

function buildRegeneratePrompt(
  briefing: Record<string, unknown>,
  platformId: string,
  adType: AdTypeConfig,
  variantIndex: number
): string {
  const product = typeof briefing.product === 'string' ? briefing.product : 'Unbekanntes Produkt'
  const audience = typeof briefing.audience === 'string' && briefing.audience ? briefing.audience : 'nicht angegeben'
  const usp = typeof briefing.usp === 'string' && briefing.usp ? briefing.usp : 'nicht angegeben'

  const goalMap: Record<string, string> = { awareness: 'Awareness', conversion: 'Conversion', traffic: 'Traffic' }
  const toneMap: Record<string, string> = { professional: 'professionell', casual: 'locker', emotional: 'emotional' }
  const goal = goalMap[String(briefing.goal ?? '')] ?? 'nicht spezifiziert'
  const tone = toneMap[String(briefing.tone ?? '')] ?? 'neutral'

  const style = VARIANT_STYLES[variantIndex]
  const fieldsBlock = adType.fields
    .map((field) => {
      if (field.multiple) return `- ${field.name}: Array mit ${field.multiple} Einträgen, je max ${field.limit} Zeichen`
      return `- ${field.name}: max ${field.limit} Zeichen`
    })
    .join('\n')

  return `Du bist ein Performance-Marketing-Copywriter.
Erstelle EINE einzige Ad-Text-Variante für ${platformId} > ${adType.label}.
Stil dieser Variante: ${style.label}
${style.instruction}

Briefing:
- Produkt/Stichwort: ${product}
- Zielgruppe: ${audience}
- Kampagnenziel: ${goal}
- USP: ${usp}
- Tonalität: ${tone}

Felder und Zeichenlimits:
${fieldsBlock}

Antwortformat: Nur JSON, kein Markdown, kein Erklärtext.
Schema: { "<fieldName>": "text oder string-array bei multiple-Feldern" }

Regeln:
- Sprache ausschliesslich Deutsch.
- Zeichenlimits strikt einhalten.
- Keine abgeschnittenen Halbsätze.
- Bei Feldern mit multiple ein Array in der geforderten Länge liefern.
- JSON muss gültig parsebar sein.`
}

async function callOpenRouter(apiKey: string, model: string, prompt: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 55_000)

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://boost-hive.de',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.85,
        max_tokens: 1500,
      }),
    })

    if (!response.ok) {
      const err = await response.text().catch(() => 'Unknown error')
      throw new Error(`OpenRouter API Fehler ${response.status}: ${err.slice(0, 220)}`)
    }

    interface OpenRouterResponse {
      choices?: Array<{ message?: { content?: string } }>
    }
    const data = (await response.json()) as OpenRouterResponse
    const text = data.choices?.[0]?.message?.content?.trim() ?? ''
    if (!text) throw new Error('Leere Antwort von OpenRouter.')
    return text
  } finally {
    clearTimeout(timeout)
  }
}

function parseVariantResponse(raw: string, adType: AdTypeConfig): VariantFields {
  let cleaned = raw.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  }
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`KI-Antwort ist kein valides JSON. Beginn: ${cleaned.slice(0, 200)}`)
  }

  if (!isRecord(parsed)) throw new Error('KI-Antwort ist kein Objekt.')

  const variant: VariantFields = {}
  const product = 'Produkt'

  for (const field of adType.fields) {
    const rawValue = parsed[field.name]
    if (field.multiple) {
      let values: string[] = []
      if (Array.isArray(rawValue)) {
        values = rawValue.map((item) => String(item ?? '').trim()).filter(Boolean)
      } else if (typeof rawValue === 'string' && rawValue.trim()) {
        values = [rawValue.trim()]
      }
      while (values.length < field.multiple) {
        values.push(fallbackText(product, field, values.length + 1))
      }
      variant[field.name] = values.slice(0, field.multiple)
    } else {
      const text = typeof rawValue === 'string' && rawValue.trim() ? rawValue.trim() : fallbackText(product, field, 1)
      variant[field.name] = text
    }
  }

  return variant
}

function clampVariantToLimits(variant: VariantFields, adType: AdTypeConfig): VariantFields {
  const result: VariantFields = { ...variant }
  for (const field of adType.fields) {
    const value = result[field.name]
    if (Array.isArray(value)) {
      result[field.name] = value.map((entry) => clampText(entry, field.limit))
    } else if (typeof value === 'string') {
      result[field.name] = clampText(value, field.limit)
    }
  }
  return result
}

function clampText(text: string, limit: number): string {
  const normalized = text.trim()
  if ([...normalized].length <= limit) return normalized
  const chars = [...normalized]
  let candidate = chars.slice(0, limit).join('').trim()
  const lastWhitespace = candidate.search(/\s+\S*$/)
  if (lastWhitespace > Math.floor(limit * 0.55)) {
    candidate = candidate.slice(0, lastWhitespace).trim()
  }
  return candidate.replace(/[,\s;:]+$/g, '').trim()
}

function updateVariantInResult(
  result: Record<string, unknown>,
  platformId: string,
  adTypeId: string,
  variantIndex: number,
  variant: VariantFields
): Record<string, unknown> {
  const cloned = JSON.parse(JSON.stringify(result)) as Record<string, unknown>
  if (!isRecord(cloned[platformId])) cloned[platformId] = {}
  const platform = cloned[platformId] as Record<string, unknown>
  if (!isRecord(platform[adTypeId])) platform[adTypeId] = {}
  const adTypeResult = platform[adTypeId] as Record<string, unknown>
  if (!Array.isArray(adTypeResult.variants) || adTypeResult.variants.length !== 3) return cloned
  const variants = [...adTypeResult.variants] as VariantFields[]
  variants[variantIndex] = variant
  adTypeResult.variants = variants
  return cloned
}

function fallbackText(product: string, field: AdFieldConfig, index: number): string {
  if (field.name.toLowerCase().includes('cta')) return 'Jetzt entdecken'
  if (field.name.toLowerCase().includes('headline')) return `${product} entdecken`
  if (field.name.toLowerCase().includes('description')) return `Mehr zu ${product}`
  return `${product} Variante ${index}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
