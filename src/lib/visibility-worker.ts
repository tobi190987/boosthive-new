import { createAdminClient } from '@/lib/supabase-admin'
import { dispatchAnalyticsWorker } from '@/lib/visibility-analytics'
import { normalizeAiModelId } from '@/lib/ai-visibility'

interface OpenRouterResponse {
  choices: Array<{ message: { content: string } }>
  usage?: { total_tokens: number }
}

interface Competitor {
  name: string
  url?: string
}

const WORKER_TIMEOUT_MS = 270 * 1000
const MAX_RETRIES = 3
const BASE_BACKOFF_MS = 2000

export async function runVisibilityWorker(
  analysisId: string,
  options?: { baseUrl?: string }
): Promise<void> {
  const admin = createAdminClient()

  const { data: analysis, error: analysisError } = await admin
    .from('visibility_analyses')
    .select('id, project_id, tenant_id, models, iterations, status')
    .eq('id', analysisId)
    .maybeSingle()

  if (analysisError || !analysis) {
    throw new Error('Analyse nicht gefunden.')
  }

  if (analysis.status !== 'pending' && analysis.status !== 'queued') {
    throw new Error(`Analyse hat Status '${analysis.status}', nicht verarbeitbar.`)
  }

  const { data: project, error: projectError } = await admin
    .from('visibility_projects')
    .select('id, brand_name, website_url, competitors, keywords')
    .eq('id', analysis.project_id)
    .maybeSingle()

  if (projectError || !project) {
    await setAnalysisFailed(admin, analysisId, 'Projekt nicht gefunden.')
    throw new Error('Projekt nicht gefunden.')
  }

  await admin
    .from('visibility_analyses')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', analysisId)

  const startTime = Date.now()
  let completedQueries = 0
  let totalCost = 0
  const errorLog: Array<{ model: string; keyword: string; error: string; timestamp: string }> = []

  const keywords: string[] = project.keywords ?? []
  const models: string[] = ((analysis.models ?? []) as string[]).map((model: string) =>
    normalizeAiModelId(model)
  )
  const iterations: number = analysis.iterations ?? 5
  const brandName: string = project.brand_name
  const competitors: Competitor[] = (project.competitors as Competitor[]) ?? []
  const subjects = [
    { type: 'brand', name: brandName },
    ...competitors.map((c, i) => ({ type: `competitor_${i}`, name: c.name })),
  ]

  const openrouterApiKey = process.env.OPENROUTER_API_KEY
  if (!openrouterApiKey) {
    await setAnalysisFailed(admin, analysisId, 'OPENROUTER_API_KEY nicht konfiguriert.')
    throw new Error('OpenRouter API Key fehlt.')
  }

  try {
    for (const keyword of keywords) {
      for (const aiModel of models) {
        for (let iter = 0; iter < iterations; iter++) {
          for (const subject of subjects) {
            if (Date.now() - startTime > WORKER_TIMEOUT_MS) {
              await setAnalysisFailed(admin, analysisId, 'Timeout nach 10 Minuten.', errorLog)
              await triggerNextQueued(analysis.tenant_id, options?.baseUrl)
              return
            }

            const { data: currentStatus } = await admin
              .from('visibility_analyses')
              .select('status')
              .eq('id', analysisId)
              .maybeSingle()

            if (currentStatus?.status === 'cancelled') {
              await triggerNextQueued(analysis.tenant_id, options?.baseUrl)
              return
            }

            const prompt = buildPrompt(keyword, subject.name)

            try {
              const result = await callOpenRouter(openrouterApiKey, aiModel, prompt)
              const responseText = result.text
              const tokensUsed = result.tokensUsed
              const { mentioned, position } = analyzeBrandMention(responseText, brandName)
              const competitorMentions = competitors.map((c) => ({
                name: c.name,
                mentioned: responseText.toLowerCase().includes(c.name.toLowerCase()),
              }))
              const queryCost = (tokensUsed / 1000) * 0.001
              totalCost += queryCost

              await admin.from('visibility_raw_results').insert({
                analysis_id: analysisId,
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

              await admin.from('visibility_raw_results').insert({
                analysis_id: analysisId,
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

            await admin
              .from('visibility_analyses')
              .update({
                progress_done: completedQueries,
                error_log: errorLog,
              })
              .eq('id', analysisId)
          }
        }
      }
    }

    await admin
      .from('visibility_analyses')
      .update({
        status: 'done',
        progress_done: completedQueries,
        actual_cost: totalCost,
        error_log: errorLog,
        completed_at: new Date().toISOString(),
        analytics_status: 'pending',
        analytics_error_message: null,
      })
      .eq('id', analysisId)

    void dispatchAnalyticsWorker(analysisId, { baseUrl: options?.baseUrl }).catch((err) => {
      console.error('[visibility-worker] Failed to trigger analytics worker:', err)
    })

    await triggerNextQueued(analysis.tenant_id, options?.baseUrl)
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unbekannter Worker-Fehler'
    await setAnalysisFailed(admin, analysisId, errorMessage, errorLog)
    await triggerNextQueued(analysis.tenant_id, options?.baseUrl)
    throw err
  }
}

function buildPrompt(keyword: string, _subjectName: string): string {
  return `Welche Anbieter, Tools oder Marken würdest du für "${keyword}" empfehlen? Nenne die Top 5 mit kurzer Begründung und bleibe dabei möglichst neutral.`
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

  const lines = responseText.split('\n')
  let position = 0
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^[\d#]+[.):\s]/.test(trimmed) || /^\*\*\d+/.test(trimmed)) {
      position++
      if (trimmed.toLowerCase().includes(lowerBrand)) {
        return { mentioned: true, position }
      }
    }
  }

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
      await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt - 1))
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

async function triggerNextQueued(tenantId: string, baseUrl?: string): Promise<void> {
  const admin = createAdminClient()
  const { data: queued } = await admin
    .from('visibility_analyses')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!queued) return

  await admin
    .from('visibility_analyses')
    .update({ status: 'pending' })
    .eq('id', queued.id)

  void runVisibilityWorker(queued.id, { baseUrl }).catch((err) => {
    console.error('[visibility-worker] Failed to start queued analysis:', err)
  })
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
