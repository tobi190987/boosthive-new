import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  AD_PLATFORMS_MAP,
  getAdTypesForPlatforms,
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

export const maxDuration = 120

const DEFAULT_MODEL = 'openai/gpt-4o'
const MAX_API_RETRIES = 2

type FieldValue = string | string[]
type VariantFields = Record<string, FieldValue>
interface AdTypeResult {
  variants: [VariantFields, VariantFields, VariantFields]
}
type PlatformResult = Record<string, AdTypeResult>
type GenerationResult = Record<string, PlatformResult>

interface SelectedAdType {
  platformId: PlatformId
  adTypeId: string
}

interface BriefingInput {
  product: string
  audience: string
  goal: 'awareness' | 'conversion' | 'traffic' | ''
  usp: string
  tone: 'professional' | 'casual' | 'emotional' | ''
  platforms: PlatformId[]
  categories: 'social' | 'paid' | 'both'
  selectedAdTypes: SelectedAdType[]
}

interface SelectedConfig {
  platformId: PlatformId
  adType: AdTypeConfig
}

const platformSchema = z.enum(['facebook', 'linkedin', 'tiktok', 'google'])

const briefingSchema = z.object({
  product: z.string().trim().min(2, 'Produkt muss mindestens 2 Zeichen haben.').max(200),
  audience: z.string().trim().max(500).optional().default(''),
  goal: z.enum(['awareness', 'conversion', 'traffic', '']).default(''),
  usp: z.string().trim().max(1000).optional().default(''),
  tone: z.enum(['professional', 'casual', 'emotional', '']).default(''),
  platforms: z.array(platformSchema).min(1, 'Mindestens eine Plattform ist erforderlich.'),
  categories: z.enum(['social', 'paid', 'both']).default('both'),
  selectedAdTypes: z
    .array(
      z.object({
        platformId: platformSchema,
        adTypeId: z.string().trim().min(1),
      })
    )
    .min(1, 'Mindestens ein Anzeigentyp ist erforderlich.'),
})

const requestSchema = z.object({
  briefing: briefingSchema,
  customerId: z.string().uuid().nullable().optional().transform((value) => value ?? null),
})

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`ad-generator-write:${tenantId}:${getClientIp(request)}`, AD_GENERATOR_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'ad_generator')
  if ('error' in moduleAccess) return moduleAccess.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors
    const firstDetail = Object.values(details).flat().find(Boolean)
    return NextResponse.json(
      { error: firstDetail ?? 'Validierungsfehler.', details },
      { status: 400 }
    )
  }

  const briefing = parsed.data.briefing as BriefingInput
  const customerId = parsed.data.customerId

  const selectedConfigs = getSelectedConfigs(briefing)
  if (selectedConfigs.length === 0) {
    return NextResponse.json({ error: 'Keine gültigen Anzeigentypen ausgewählt.' }, { status: 400 })
  }

  const openrouterApiKey = process.env.OPENROUTER_API_KEY
  if (!openrouterApiKey) {
    return NextResponse.json({ error: 'OPENROUTER_API_KEY nicht konfiguriert.' }, { status: 500 })
  }

  const admin = createAdminClient()

  if (customerId) {
    const { data: customer } = await admin
      .from('customers')
      .select('id')
      .eq('id', customerId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!customer) {
      return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })
    }
  }

  const { data: generation, error: insertError } = await admin
    .from('ad_generations')
    .insert({
      tenant_id: tenantId,
      customer_id: customerId,
      created_by: authResult.auth.userId,
      briefing,
      status: 'pending',
      result: null,
      error_message: null,
    })
    .select('id')
    .single()

  if (insertError || !generation) {
    return NextResponse.json({ error: insertError?.message ?? 'Generierung konnte nicht gespeichert werden.' }, { status: 500 })
  }

  try {
    const model = process.env.AD_GENERATOR_MODEL ?? DEFAULT_MODEL
    const prompt = buildGenerationPrompt(briefing, selectedConfigs, false)
    const raw = await callOpenRouter(openrouterApiKey, model, prompt)
    const parsedResponse = parseJsonResponse(raw)
    let result = normalizeGenerationResult(parsedResponse, briefing, selectedConfigs)

    if (hasLimitViolations(result, selectedConfigs) || hasDuplicateVariants(result, selectedConfigs)) {
      const strictPrompt = buildGenerationPrompt(briefing, selectedConfigs, true)
      const strictRaw = await callOpenRouter(openrouterApiKey, model, strictPrompt)
      const strictParsed = parseJsonResponse(strictRaw)
      result = normalizeGenerationResult(strictParsed, briefing, selectedConfigs)
    }

    const emojiSafeResult = applyEmojiPolicy(result, selectedConfigs)
    const clampedResult = clampResultToLimits(emojiSafeResult, selectedConfigs)

    const { error: updateError } = await admin
      .from('ad_generations')
      .update({
        status: 'completed',
        result: clampedResult,
        error_message: null,
      })
      .eq('id', generation.id)
      .eq('tenant_id', tenantId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      id: generation.id,
      result: clampedResult,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler bei der Generierung.'

    await admin
      .from('ad_generations')
      .update({ status: 'failed', error_message: message })
      .eq('id', generation.id)
      .eq('tenant_id', tenantId)

    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function getSelectedConfigs(briefing: BriefingInput): SelectedConfig[] {
  const allowed = getAdTypesForPlatforms(briefing.platforms, briefing.categories)
  const allowedMap = new Map<string, SelectedConfig>()

  for (const item of allowed) {
    allowedMap.set(`${item.platform.id}:${item.adType.id}`, {
      platformId: item.platform.id,
      adType: item.adType,
    })
  }

  const deduped = new Set<string>()
  const selected: SelectedConfig[] = []

  for (const entry of briefing.selectedAdTypes) {
    const key = `${entry.platformId}:${entry.adTypeId}`
    if (deduped.has(key)) continue
    const config = allowedMap.get(key)
    if (!config) continue
    deduped.add(key)
    selected.push(config)
  }

  return selected
}

function buildGenerationPrompt(
  briefing: BriefingInput,
  selectedConfigs: SelectedConfig[],
  strictMode: boolean
): string {
  const toneLabel =
    briefing.tone === 'professional'
      ? 'professionell'
      : briefing.tone === 'casual'
        ? 'locker'
        : briefing.tone === 'emotional'
          ? 'emotional'
          : 'neutral'

  const goalLabel =
    briefing.goal === 'awareness'
      ? 'Awareness'
      : briefing.goal === 'conversion'
        ? 'Conversion'
        : briefing.goal === 'traffic'
          ? 'Traffic'
          : 'nicht spezifiziert'

  const adTypeBlock = selectedConfigs
    .map(({ platformId, adType }) => {
      const fields = adType.fields
        .map((field) => {
          if (field.multiple) {
            return `- ${field.name}: ${field.multiple} Einträge, je max ${field.limit} Zeichen`
          }
          return `- ${field.name}: max ${field.limit} Zeichen`
        })
        .join('\n')

      const variationRules = getVariantInstruction(platformId, adType)
      const emojiRules = getEmojiInstruction(platformId, adType)

      return `${platformId} > ${adType.id} (${adType.label})\n${fields}\n${variationRules}\n${emojiRules}`
    })
    .join('\n\n')

  const strictSection = strictMode
    ? `\nKRITISCH: Es gab zuvor Zeichenlimit-Überschreitungen oder zu ähnliche Varianten. Diesmal ALLE Limits strikt einhalten und die 3 Varianten klar voneinander unterscheiden.`
    : ''

  return `Du bist ein Performance-Marketing-Copywriter.
Erstelle deutschsprachige Ad-Texte für die gewünschten Plattformen und Anzeigentypen.
Liefere exakt 3 Varianten pro Anzeigentyp.
${strictSection}

Briefing:
- Produkt/Stichwort: ${briefing.product}
- Zielgruppe: ${briefing.audience || 'nicht angegeben'}
- Kampagnenziel: ${goalLabel}
- USP: ${briefing.usp || 'nicht angegeben'}
- Tonalität: ${toneLabel}

Auszugebende Plattformen und Anzeigentypen:
${adTypeBlock}

Antwortformat:
Nur JSON, kein Markdown, kein Erklärtext.
Schema:
{
  "result": {
    "<platformId>": {
      "<adTypeId>": {
        "variants": [
          { "<fieldName>": "text oder string-array bei multiple-feldern" },
          { ... },
          { ... }
        ]
      }
    }
  }
}

Regeln:
- Sprache ausschliesslich Deutsch.
- Pro Anzeigentyp genau 3 Varianten.
- Variante 1 muss direkt und nutzenorientiert sein.
- Variante 2 muss neugierig machend und hook-lastig sein.
- Variante 3 muss vertrauens- oder proof-orientiert sein.
- Die 3 Varianten dürfen nicht dieselbe Formulierung, denselben Einstieg oder dieselbe CTA-Struktur wiederholen.
- Keine Felder auslassen.
- Bei Feldern mit "multiple" ein Array in der geforderten Länge liefern.
- Zeichenlimits strikt beachten.
- Keine abgeschnittenen Halbsätze.
- JSON muss gültig parsebar sein.`
}

async function callOpenRouter(apiKey: string, model: string, prompt: string): Promise<string> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_API_RETRIES; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 90_000)

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
          temperature: 0.8,
          max_tokens: 5000,
        }),
      })

      if (response.status === 429) {
        lastError = new Error('Rate-Limit bei OpenRouter erreicht.')
        await sleep(1500 * (attempt + 1))
        continue
      }

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
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('OpenRouter Request fehlgeschlagen.')
      if (attempt < MAX_API_RETRIES) {
        await sleep(1200 * (attempt + 1))
        continue
      }
      throw lastError
    } finally {
      clearTimeout(timeout)
    }
  }

  throw lastError ?? new Error('OpenRouter Aufruf fehlgeschlagen.')
}

function parseJsonResponse(raw: string): unknown {
  let cleaned = raw.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  }

  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1)
  }

  try {
    return JSON.parse(cleaned)
  } catch {
    throw new Error(`KI-Antwort ist kein valides JSON. Beginn: ${cleaned.slice(0, 200)}`)
  }
}

function normalizeGenerationResult(
  raw: unknown,
  briefing: BriefingInput,
  selectedConfigs: SelectedConfig[]
): GenerationResult {
  const rootCandidate: Record<string, unknown> =
    isRecord(raw) && isRecord(raw.result) ? raw.result : isRecord(raw) ? raw : {}

  const result: GenerationResult = {}
  const product = briefing.product

  for (const selected of selectedConfigs) {
    const platformId = selected.platformId
    const adType = selected.adType
    const platformRaw: Record<string, unknown> = isRecord(rootCandidate[platformId]) ? rootCandidate[platformId] : {}
    let adTypeRaw: Record<string, unknown> = {}
    if (isRecord(platformRaw[adType.id])) {
      adTypeRaw = platformRaw[adType.id] as Record<string, unknown>
    }
    const variantsRaw = Array.isArray(adTypeRaw.variants) ? adTypeRaw.variants : []

    if (!result[platformId]) result[platformId] = {}

    const normalizedVariants: [VariantFields, VariantFields, VariantFields] = [0, 1, 2].map((index) => {
      const source = isRecord(variantsRaw[index]) ? variantsRaw[index] : {}
      return normalizeVariant(source, adType.fields, product)
    }) as [VariantFields, VariantFields, VariantFields]

    result[platformId][adType.id] = { variants: normalizedVariants }
  }

  return result
}

function normalizeVariant(
  source: Record<string, unknown>,
  fields: AdFieldConfig[],
  product: string
): VariantFields {
  const normalized: VariantFields = {}

  for (const field of fields) {
    const rawValue = source[field.name]

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

      normalized[field.name] = values.slice(0, field.multiple)
      continue
    }

    const text =
      typeof rawValue === 'string' && rawValue.trim()
        ? rawValue.trim()
        : fallbackText(product, field, 1)

    normalized[field.name] = text
  }

  return normalized
}

function hasDuplicateVariants(result: GenerationResult, selectedConfigs: SelectedConfig[]): boolean {
  for (const { platformId, adType } of selectedConfigs) {
    const variants = result[platformId]?.[adType.id]?.variants
    if (!variants) continue

    const seen = new Set<string>()
    for (const variant of variants) {
      const signature = createVariantSignature(variant)
      if (seen.has(signature)) return true
      seen.add(signature)
    }
  }

  return false
}

function createVariantSignature(variant: VariantFields): string {
  return Object.entries(variant)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}:${value.map(normalizeComparableText).join('|')}`
      }
      return `${key}:${normalizeComparableText(value)}`
    })
    .join('||')
}

function normalizeComparableText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[!?.:,;'"“”‘’()\-_/\\]+/g, '')
    .trim()
}

function hasLimitViolations(result: GenerationResult, selectedConfigs: SelectedConfig[]): boolean {
  for (const { platformId, adType } of selectedConfigs) {
    const platform = result[platformId]
    const adTypeResult = platform?.[adType.id]
    if (!adTypeResult) continue

    for (const variant of adTypeResult.variants) {
      for (const field of adType.fields) {
        const value = variant[field.name]
        if (Array.isArray(value)) {
          if (value.some((entry) => charCount(entry) > field.limit)) return true
        } else if (typeof value === 'string' && charCount(value) > field.limit) {
          return true
        }
      }
    }
  }
  return false
}

function applyEmojiPolicy(result: GenerationResult, selectedConfigs: SelectedConfig[]): GenerationResult {
  const cloned: GenerationResult = JSON.parse(JSON.stringify(result)) as GenerationResult

  for (const { platformId, adType } of selectedConfigs) {
    const platform = cloned[platformId]
    const adTypeResult = platform?.[adType.id]
    if (!adTypeResult) continue

    const emojiAllowed = isEmojiAllowed(platformId, adType)
    if (emojiAllowed) continue

    adTypeResult.variants = adTypeResult.variants.map((variant) => {
      const updated: VariantFields = { ...variant }

      for (const field of adType.fields) {
        const value = updated[field.name]
        if (Array.isArray(value)) {
          updated[field.name] = value.map((entry) => stripEmoji(entry))
        } else if (typeof value === 'string') {
          updated[field.name] = stripEmoji(value)
        }
      }

      return updated
    }) as [VariantFields, VariantFields, VariantFields]
  }

  return cloned
}

function clampResultToLimits(result: GenerationResult, selectedConfigs: SelectedConfig[]): GenerationResult {
  const cloned: GenerationResult = JSON.parse(JSON.stringify(result)) as GenerationResult

  for (const { platformId, adType } of selectedConfigs) {
    const platform = cloned[platformId]
    const adTypeResult = platform?.[adType.id]
    if (!adTypeResult) continue

    adTypeResult.variants = adTypeResult.variants.map((variant) => {
      const updated: VariantFields = { ...variant }

      for (const field of adType.fields) {
        const value = updated[field.name]
        if (Array.isArray(value)) {
          updated[field.name] = value.map((entry) => clampText(entry, field.limit))
        } else if (typeof value === 'string') {
          updated[field.name] = clampText(value, field.limit)
        }
      }

      return updated
    }) as [VariantFields, VariantFields, VariantFields]
  }

  return cloned
}

function clampText(text: string, limit: number): string {
  const normalized = text.trim()
  if (charCount(normalized) <= limit) return normalized

  const chars = [...normalized]
  let candidate = chars.slice(0, limit).join('').trim()
  const lastWhitespace = candidate.search(/\s+\S*$/)
  if (lastWhitespace > Math.floor(limit * 0.55)) {
    candidate = candidate.slice(0, lastWhitespace).trim()
  }

  return candidate.replace(/[,\s;:]+$/g, '').trim()
}

function fallbackText(product: string, field: AdFieldConfig, index: number): string {
  if (field.name.toLowerCase().includes('cta')) return 'Jetzt entdecken'
  if (field.name.toLowerCase().includes('headline')) return `${product} entdecken`
  if (field.name.toLowerCase().includes('description')) return `Mehr zu ${product}`
  return `${product} Variante ${index}`
}

function getVariantInstruction(platformId: PlatformId, adType: AdTypeConfig): string {
  const platformLabel = AD_PLATFORMS_MAP[platformId]?.label ?? platformId

  if (platformId === 'google') {
    return `Variationslogik: Die 3 Varianten müssen unterschiedliche Suchmotive innerhalb von ${platformLabel} ${adType.label} abdecken: Nutzen, Dringlichkeit, Vertrauen.`
  }

  if (platformId === 'linkedin') {
    return `Variationslogik: Schreibe für ${platformLabel} ${adType.label} drei klar unterschiedliche Winkel: business outcome, pain point, social proof.`
  }

  if (platformId === 'tiktok') {
    return `Variationslogik: Schreibe für ${platformLabel} ${adType.label} drei unterschiedliche Hooks: scroll-stop opener, trendiger angle, challenge/community angle.`
  }

  return `Variationslogik: Schreibe für ${platformLabel} ${adType.label} drei unterschiedliche Winkel: direkter Nutzen, neugieriger Hook, vertrauensbildender Proof.`
}

function getEmojiInstruction(platformId: PlatformId, adType: AdTypeConfig): string {
  if (isEmojiAllowed(platformId, adType)) {
    return 'Emoji-Regel: Emojis sind erlaubt. Nutze sparsam 1 bis 2 passende Emojis in textnahen Feldern, nur wenn sie die Aufmerksamkeit verbessern und nicht billig wirken.'
  }

  return 'Emoji-Regel: Keine Emojis verwenden.'
}

function isEmojiAllowed(platformId: PlatformId, adType: AdTypeConfig): boolean {
  if (platformId === 'facebook' || platformId === 'tiktok') return true

  if (platformId === 'linkedin') {
    return adType.id === 'li_message'
  }

  return false
}

function stripEmoji(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function charCount(value: string): number {
  return [...value].length
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
