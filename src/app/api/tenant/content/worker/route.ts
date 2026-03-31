import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchPage, buildPageAnalysis } from '@/lib/seo-analysis'

/**
 * PROJ-31: Content Brief Generator — Background Worker
 *
 * Triggered fire-and-forget from POST /api/tenant/content/briefs.
 * Loads the brief record, optionally crawls the target URL,
 * calls OpenRouter to generate a structured content brief, and saves the result.
 *
 * Authentication: Internal only — protected by CONTENT_WORKER_SECRET header.
 */

export const maxDuration = 120

const workerSchema = z.object({
  brief_id: z.string().uuid('Ungültige brief_id.'),
})

// Default model — can be overridden via env var
const DEFAULT_MODEL = 'anthropic/claude-3.5-sonnet'

const MAX_RETRIES = 3
const BASE_BACKOFF_MS = 2000

interface BriefJson {
  search_intent: { type: string; reasoning: string }
  h1_titles: string[]
  meta_descriptions: string[]
  outline: Array<{ h2: string; description: string; h3s: string[] }>
  keywords: Array<{ term: string; frequency: string }>
  competitor_hints: string | null
  internal_linking_hints: string[] | null
  cta_recommendation: string
}

export async function POST(request: NextRequest) {
  // Fail closed: worker secret is mandatory
  const workerSecret = process.env.CONTENT_WORKER_SECRET
  if (!workerSecret) {
    return NextResponse.json({ error: 'Worker-Secret nicht konfiguriert.' }, { status: 500 })
  }
  if (request.headers.get('x-worker-secret') !== workerSecret) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = workerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validierungsfehler.', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { brief_id } = parsed.data
  const admin = createAdminClient()

  // Load brief record
  const { data: brief, error: briefError } = await admin
    .from('content_briefs')
    .select('id, tenant_id, keyword, language, tone, word_count_target, target_url, status')
    .eq('id', brief_id)
    .maybeSingle()

  if (briefError || !brief) {
    return NextResponse.json({ error: 'Brief nicht gefunden.' }, { status: 404 })
  }

  if (brief.status !== 'pending') {
    return NextResponse.json(
      { error: `Brief hat Status '${brief.status}', nicht verarbeitbar.` },
      { status: 400 }
    )
  }

  // Set status to generating
  await admin
    .from('content_briefs')
    .update({ status: 'generating' })
    .eq('id', brief_id)

  const openrouterApiKey = process.env.OPENROUTER_API_KEY
  if (!openrouterApiKey) {
    await setBriefFailed(admin, brief_id, 'OPENROUTER_API_KEY nicht konfiguriert.')
    return NextResponse.json({ error: 'OpenRouter API Key fehlt.' }, { status: 500 })
  }

  try {
    // Optional: crawl target URL for competitor context
    let competitorContext: string | null = null
    if (brief.target_url) {
      competitorContext = await crawlTargetUrl(brief.target_url)
    }

    // Build the KI prompt
    const prompt = buildBriefPrompt({
      keyword: brief.keyword,
      language: brief.language,
      tone: brief.tone,
      wordCountTarget: brief.word_count_target,
      competitorContext,
    })

    const model = process.env.CONTENT_BRIEF_MODEL ?? DEFAULT_MODEL

    // Call OpenRouter
    const rawResponse = await callOpenRouter(openrouterApiKey, model, prompt)

    // Parse the JSON response
    const briefJson = parseJsonResponse(rawResponse)

    // Save result
    await admin
      .from('content_briefs')
      .update({
        status: 'done',
        brief_json: briefJson,
        error_message: null,
      })
      .eq('id', brief_id)

    return NextResponse.json({ status: 'done' })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unbekannter Worker-Fehler'
    await setBriefFailed(admin, brief_id, errorMessage)
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildBriefPrompt(opts: {
  keyword: string
  language: string
  tone: string
  wordCountTarget: number
  competitorContext: string | null
}): string {
  const langLabel = opts.language === 'de' ? 'Deutsch' : opts.language === 'en' ? 'Englisch' : opts.language
  const toneLabel =
    opts.tone === 'informativ'
      ? 'informativ und sachlich'
      : opts.tone === 'werblich'
        ? 'werblich und überzeugend'
        : 'neutral und ausgewogen'

  const competitorSection = opts.competitorContext
    ? `\n\nKontext einer Wettbewerber-Seite (für thematische Lückenanalyse):\n${opts.competitorContext}`
    : ''

  return `Du bist ein erfahrener SEO-Texter und Content-Stratege. Erstelle ein detailliertes Content-Briefing für das folgende Keyword.

Keyword: "${opts.keyword}"
Zielsprache: ${langLabel}
Tonalität: ${toneLabel}
Angestrebte Wortanzahl: ca. ${opts.wordCountTarget} Wörter${competitorSection}

Antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt in exakt folgendem Format (kein Text davor oder danach):

{
  "search_intent": {
    "type": "informational|navigational|transactional|commercial",
    "reasoning": "Kurze Begründung warum dieser Intent-Typ zutrifft (1-2 Sätze)"
  },
  "h1_titles": [
    "Titel-Variante 1",
    "Titel-Variante 2",
    "Titel-Variante 3"
  ],
  "meta_descriptions": [
    "Meta-Description Variante 1 (max. 160 Zeichen, mit Keyword)",
    "Meta-Description Variante 2 (max. 160 Zeichen, mit Keyword)"
  ],
  "outline": [
    {
      "h2": "H2-Überschrift",
      "description": "Kurze Beschreibung was in diesem Abschnitt behandelt werden soll (1-2 Sätze)",
      "h3s": ["H3-Unterabschnitt 1", "H3-Unterabschnitt 2"]
    }
  ],
  "keywords": [
    { "term": "Hauptkeyword", "frequency": "3-5x" },
    { "term": "Verwandtes Keyword / LSI-Begriff", "frequency": "1-2x" }
  ],
  "competitor_hints": "Was Wettbewerber thematisch abdecken oder was im Vergleich fehlt (1-3 Sätze). Null wenn keine Wettbewerber-Daten vorhanden.",
  "internal_linking_hints": [
    "Verlinkung zu einem Artikel über [verwandtes Thema A]",
    "Verlinkung zu einem Artikel über [verwandtes Thema B]"
  ],
  "cta_recommendation": "Empfohlener Call-to-Action passend zur Tonalität und Suchintention (1 Satz)"
}

Wichtige Regeln:
- Alle Texte in ${langLabel}
- outline: mindestens 4, maximal 8 H2-Abschnitte
- keywords: Hauptkeyword + 5-10 LSI-Begriffe
- h1_titles: exakt 3 Varianten, keine Duplikate
- meta_descriptions: exakt 2 Varianten, jeweils max. 160 Zeichen
- competitor_hints: null wenn kein Wettbewerber-Kontext angegeben
- internal_linking_hints: 3-5 thematisch verwandte Artikel-Themen als Platzhalter (keine echten URLs), oder null wenn keine sinnvollen Verlinkungen erkennbar`
}

// ---------------------------------------------------------------------------
// Target URL crawler
// ---------------------------------------------------------------------------

async function crawlTargetUrl(url: string): Promise<string | null> {
  try {
    const pageResult = await fetchPage(url)
    if (!pageResult || 'error' in pageResult) return null

    const analysis = buildPageAnalysis(url, pageResult.html)

    const parts: string[] = [
      `Title: ${analysis.title || '(kein Titel)'}`,
      `Meta: ${analysis.metaDescription || '(keine Meta-Description)'}`,
      `H1: ${analysis.h1s.slice(0, 2).join(', ') || '(kein H1)'}`,
      `H2: ${analysis.h2s.slice(0, 5).join(', ') || '(keine H2s)'}`,
      `Wörter: ~${analysis.wordCount}`,
    ]

    return parts.join('\n')
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// OpenRouter call
// ---------------------------------------------------------------------------

async function callOpenRouter(apiKey: string, model: string, prompt: string): Promise<string> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt - 1))
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 80_000)

    let response: Response
    try {
      response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
          max_tokens: 3000,
          temperature: 0.3,
        }),
      })
    } finally {
      clearTimeout(timeout)
    }

    if (response.status === 429) {
      lastError = new Error('Rate-Limit von OpenRouter erreicht.')
      continue
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      throw new Error(`OpenRouter API Fehler ${response.status}: ${errorBody.slice(0, 200)}`)
    }

    interface OpenRouterResponse {
      choices: Array<{ message: { content: string } }>
    }
    const data = (await response.json()) as OpenRouterResponse
    const text = data.choices?.[0]?.message?.content ?? ''

    if (!text) throw new Error('Leere Antwort von OpenRouter.')

    return text
  }

  throw lastError ?? new Error('Max retries erreicht.')
}

// ---------------------------------------------------------------------------
// JSON parser — strips markdown code fences if present
// ---------------------------------------------------------------------------

function parseJsonResponse(raw: string): BriefJson {
  // Strip markdown code blocks if the model wrapped the JSON
  let cleaned = raw.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`KI-Antwort ist kein valides JSON. Antwort (Anfang): ${cleaned.slice(0, 200)}`)
  }

  // Basic shape validation
  const obj = parsed as Record<string, unknown>
  if (!obj.search_intent || !Array.isArray(obj.h1_titles) || !Array.isArray(obj.outline)) {
    throw new Error('KI-Antwort hat unerwartete Struktur — fehlende Pflichtfelder.')
  }

  return parsed as BriefJson
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setBriefFailed(
  admin: ReturnType<typeof createAdminClient>,
  briefId: string,
  errorMessage: string
): Promise<void> {
  await admin
    .from('content_briefs')
    .update({ status: 'failed', error_message: errorMessage })
    .eq('id', briefId)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
