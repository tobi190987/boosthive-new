import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase-admin'

/**
 * PROJ-12: AI Visibility Background Worker
 *
 * This route processes visibility analysis jobs. It is triggered fire-and-forget
 * from the analyses POST route and runs sequentially through all keyword x model
 * x iteration x subject combinations, calling OpenRouter for each.
 *
 * Authentication: Optional VISIBILITY_WORKER_SECRET header check (not user auth,
 * since this is an internal-only endpoint).
 */

const workerSchema = z.object({
  analysis_id: z.string().uuid('Ungueltige analysis_id.'),
})

// Timeout: 10 minutes maximum
const WORKER_TIMEOUT_MS = 10 * 60 * 1000

// Retry config for OpenRouter rate limits
const MAX_RETRIES = 3
const BASE_BACKOFF_MS = 2000

interface OpenRouterResponse {
  choices: Array<{ message: { content: string } }>
  usage?: { total_tokens: number }
}

interface Competitor {
  name: string
  url?: string
}

export const maxDuration = 300 // Vercel function timeout: 5 min (pro plan allows up to 300s)

export async function POST(request: NextRequest) {
  // Mandatory secret check — fail closed if secret is not configured
  const workerSecret = process.env.VISIBILITY_WORKER_SECRET
  if (!workerSecret) {
    return NextResponse.json({ error: 'Worker-Secret nicht konfiguriert.' }, { status: 500 })
  }
  const headerSecret = request.headers.get('x-worker-secret')
  if (headerSecret !== workerSecret) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungueltiger JSON-Body.' }, { status: 400 })
  }

  const parsed = workerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validierungsfehler.', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { analysis_id } = parsed.data
  const admin = createAdminClient()

  // Load analysis
  const { data: analysis, error: analysisError } = await admin
    .from('visibility_analyses')
    .select('id, project_id, tenant_id, models, iterations, status')
    .eq('id', analysis_id)
    .maybeSingle()

  if (analysisError || !analysis) {
    return NextResponse.json({ error: 'Analyse nicht gefunden.' }, { status: 404 })
  }

  // Only process pending or queued analyses
  if (analysis.status !== 'pending' && analysis.status !== 'queued') {
    return NextResponse.json({ error: `Analyse hat Status '${analysis.status}', nicht verarbeitbar.` }, { status: 400 })
  }

  // Load project
  const { data: project, error: projectError } = await admin
    .from('visibility_projects')
    .select('id, brand_name, website_url, competitors, keywords')
    .eq('id', analysis.project_id)
    .maybeSingle()

  if (projectError || !project) {
    await setAnalysisFailed(admin, analysis_id, 'Projekt nicht gefunden.')
    return NextResponse.json({ error: 'Projekt nicht gefunden.' }, { status: 404 })
  }

  // Set status to running
  await admin
    .from('visibility_analyses')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', analysis_id)

  const startTime = Date.now()
  let completedQueries = 0
  let totalCost = 0
  const errorLog: Array<{ model: string; keyword: string; error: string; timestamp: string }> = []

  const keywords: string[] = project.keywords ?? []
  const models: string[] = analysis.models ?? []
  const iterations: number = analysis.iterations ?? 5
  const brandName: string = project.brand_name
  const competitors: Competitor[] = (project.competitors as Competitor[]) ?? []

  // Build subject list: brand first, then competitors
  const subjects = [
    { type: 'brand', name: brandName },
    ...competitors.map((c, i) => ({ type: `competitor_${i}`, name: c.name })),
  ]

  const openrouterApiKey = process.env.OPENROUTER_API_KEY
  if (!openrouterApiKey) {
    await setAnalysisFailed(admin, analysis_id, 'OPENROUTER_API_KEY nicht konfiguriert.')
    return NextResponse.json({ error: 'OpenRouter API Key fehlt.' }, { status: 500 })
  }

  try {
    for (const keyword of keywords) {
      for (const aiModel of models) {
        for (let iter = 0; iter < iterations; iter++) {
          for (const subject of subjects) {
            // Check timeout
            if (Date.now() - startTime > WORKER_TIMEOUT_MS) {
              await setAnalysisFailed(admin, analysis_id, 'Timeout nach 10 Minuten.', errorLog)
              await triggerNextQueued(admin, analysis.tenant_id, workerSecret)
              return NextResponse.json({ status: 'timeout' })
            }

            // Check if analysis was cancelled
            const { data: currentStatus } = await admin
              .from('visibility_analyses')
              .select('status')
              .eq('id', analysis_id)
              .maybeSingle()

            if (currentStatus?.status === 'cancelled') {
              await triggerNextQueued(admin, analysis.tenant_id, workerSecret)
              return NextResponse.json({ status: 'cancelled' })
            }

            const prompt = buildPrompt(keyword, subject.name)

            try {
              const result = await callOpenRouter(openrouterApiKey, aiModel, prompt)
              const responseText = result.text
              const tokensUsed = result.tokensUsed

              // Analyze brand mention
              const { mentioned, position } = analyzeBrandMention(responseText, brandName)

              // Analyze competitor mentions
              const competitorMentions = competitors.map((c) => ({
                name: c.name,
                mentioned: responseText.toLowerCase().includes(c.name.toLowerCase()),
              }))

              // Calculate cost approximation
              const queryCost = (tokensUsed / 1000) * 0.001
              totalCost += queryCost

              // Save raw result
              await admin.from('visibility_raw_results').insert({
                analysis_id,
                tenant_id: analysis.tenant_id,
                keyword,
                model_name: aiModel,
                prompt,
                response: responseText,
                brand_mentioned: mentioned,
                brand_position: position,
                competitor_mentions: competitorMentions,
                tokens_used: tokensUsed,
                cost: queryCost,
                error_flag: false,
              })

              completedQueries++
            } catch (err) {
              const errorMessage = err instanceof Error ? err.message : 'Unbekannter Fehler'
              errorLog.push({
                model: aiModel,
                keyword,
                error: errorMessage,
                timestamp: new Date().toISOString(),
              })

              // Save failed result
              await admin.from('visibility_raw_results').insert({
                analysis_id,
                tenant_id: analysis.tenant_id,
                keyword,
                model_name: aiModel,
                prompt,
                response: '',
                brand_mentioned: false,
                error_flag: true,
                error_text: errorMessage,
              })

              completedQueries++
            }

            // Update progress
            await admin
              .from('visibility_analyses')
              .update({
                progress_done: completedQueries,
                error_log: errorLog,
              })
              .eq('id', analysis_id)
          }
        }
      }
    }

    // All done - set completed
    await admin
      .from('visibility_analyses')
      .update({
        status: 'done',
        progress_done: completedQueries,
        actual_cost: totalCost,
        error_log: errorLog,
        completed_at: new Date().toISOString(),
      })
      .eq('id', analysis_id)

    // Trigger next queued analysis for this tenant (if any)
    await triggerNextQueued(admin, analysis.tenant_id, workerSecret)

    return NextResponse.json({ status: 'done', completed_queries: completedQueries })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unbekannter Worker-Fehler'
    await setAnalysisFailed(admin, analysis_id, errorMessage, errorLog)
    // Still attempt to unblock the queue even on failure
    await triggerNextQueued(admin, analysis.tenant_id, workerSecret)
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function buildPrompt(keyword: string, subjectName: string): string {
  return `Welche Anbieter, Tools oder Marken würdest du für "${keyword}" empfehlen? Nenne die Top 5 mit kurzer Begründung. Berücksichtige dabei besonders Anbieter wie ${subjectName}.`
}

function analyzeBrandMention(
  responseText: string,
  brandName: string
): { mentioned: boolean; position: number | null } {
  const lowerResponse = responseText.toLowerCase()
  const lowerBrand = brandName.toLowerCase()

  if (!lowerResponse.includes(lowerBrand)) {
    return { mentioned: false, position: null }
  }

  // Try to determine position by splitting on numbered list patterns
  const lines = responseText.split('\n')
  let position = 0
  for (const line of lines) {
    const trimmed = line.trim()
    // Match numbered list items: "1.", "1)", "1:", "#1"
    if (/^[\d#]+[.):\s]/.test(trimmed) || /^\*\*\d+/.test(trimmed)) {
      position++
      if (trimmed.toLowerCase().includes(lowerBrand)) {
        return { mentioned: true, position }
      }
    }
  }

  // Brand found but not in a numbered list position
  return { mentioned: true, position: null }
}

async function callOpenRouter(
  apiKey: string,
  model: string,
  prompt: string
): Promise<{ text: string; tokensUsed: number }> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff
      const delay = BASE_BACKOFF_MS * Math.pow(2, attempt - 1)
      await sleep(delay)
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://boost-hive.de',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
      }),
    })

    if (response.status === 429) {
      // Rate limited - retry with backoff
      lastError = new Error(`Rate limited (429) bei Modell ${model}`)
      continue
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      throw new Error(`OpenRouter API Fehler ${response.status}: ${errorBody.slice(0, 200)}`)
    }

    const data = (await response.json()) as OpenRouterResponse
    const text = data.choices?.[0]?.message?.content ?? ''
    const tokensUsed = data.usage?.total_tokens ?? 0

    if (!text) {
      throw new Error(`Leere Antwort von Modell ${model}`)
    }

    return { text, tokensUsed }
  }

  throw lastError ?? new Error(`Max retries erreicht für Modell ${model}`)
}

async function setAnalysisFailed(
  admin: ReturnType<typeof createAdminClient>,
  analysisId: string,
  errorMessage: string,
  errorLog?: Array<{ model: string; keyword: string; error: string; timestamp: string }>
): Promise<void> {
  await admin
    .from('visibility_analyses')
    .update({
      status: 'failed',
      error_message: errorMessage,
      ...(errorLog ? { error_log: errorLog } : {}),
      completed_at: new Date().toISOString(),
    })
    .eq('id', analysisId)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function triggerNextQueued(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  workerSecret: string
): Promise<void> {
  // Find the oldest queued analysis for this tenant
  const { data: queued } = await admin
    .from('visibility_analyses')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!queued) return

  // Promote to pending so the worker can pick it up
  await admin
    .from('visibility_analyses')
    .update({ status: 'pending' })
    .eq('id', queued.id)

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  fetch(`${baseUrl}/api/tenant/visibility/worker`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-worker-secret': workerSecret,
    },
    body: JSON.stringify({ analysis_id: queued.id }),
  }).catch((err) => {
    console.error('[visibility-worker] Failed to trigger queued analysis:', err)
  })
}
