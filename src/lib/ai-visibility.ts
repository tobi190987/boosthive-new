/**
 * Types and constants for the AI Visibility Tool (PROJ-12).
 */

// ─── KI-Modelle ───────────────────────────────────────────────
export interface AiModel {
  id: string
  label: string
  provider: string
}

export const DEFAULT_AI_MODEL_IDS = ['openai/gpt-4o']
export const DEFAULT_AI_VISIBILITY_ITERATIONS = 3
export const MIN_AI_VISIBILITY_ITERATIONS = 1
export const MAX_AI_VISIBILITY_ITERATIONS = 5
export const MAX_AI_VISIBILITY_TOTAL_QUERIES = 60

const LEGACY_MODEL_ALIASES: Record<string, string> = {
  'google/gemini-pro-1.5': 'google/gemini-2.5-pro',
}

export const AI_MODELS: AiModel[] = [
  { id: 'openai/gpt-4o', label: 'GPT-4o', provider: 'OpenAI' },
  { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'Google' },
  { id: 'perplexity/llama-3.1-sonar-large-128k-online', label: 'Perplexity Sonar', provider: 'Perplexity' },
]

export function normalizeAiModelId(modelId: string): string {
  return LEGACY_MODEL_ALIASES[modelId] ?? modelId
}

// ─── Wettbewerber ─────────────────────────────────────────────
export interface Competitor {
  name: string
  url: string
}

// ─── Projekt ──────────────────────────────────────────────────
export interface VisibilityProject {
  id: string
  tenant_id: string
  brand_name: string
  website_url: string | null
  competitors: Competitor[]
  keywords: string[]
  created_by: string
  created_at: string
  latest_analysis_status: AnalysisStatus | null
  latest_analysis_at: string | null
  analysis_count: number
}

// ─── Analyse ──────────────────────────────────────────────────
export type AnalysisStatus = 'pending' | 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

export interface VisibilityAnalysis {
  id: string
  project_id: string
  tenant_id: string
  models: string[]
  iterations: number
  status: AnalysisStatus
  error_message?: string | null
  analytics_status?: AnalyticsStatus
  analytics_error_message?: string | null
  progress_done: number
  progress_total: number
  started_at: string | null
  completed_at: string | null
  error_log: AnalysisError[]
  created_by: string
  created_at: string
}

export interface AnalysisError {
  model: string
  keyword: string
  error: string
  timestamp: string
}

// ─── Analyse-Status-Polling ───────────────────────────────────
export interface AnalysisStatusResponse {
  project_id: string
  models: string[]
  iterations: number
  status: AnalysisStatus
  error_message?: string | null
  analytics_status?: AnalyticsStatus
  analytics_error_message?: string | null
  progress_done: number
  progress_total: number
  error_log: AnalysisError[]
  model_progress: ModelProgress[]
}

export type AnalyticsStatus = 'pending' | 'running' | 'done' | 'failed' | 'partial'

export interface ModelProgress {
  model: string
  done: number
  total: number
}

// ─── Kosten-Schätzung ────────────────────────────────────────
export interface CostEstimate {
  total_api_calls: number
  breakdown: {
    keywords: number
    models: number
    iterations: number
    subjects: number // brand + competitors
  }
}

export function getVisibilityQueryLimitError(totalQueries: number): string | null {
  if (totalQueries <= MAX_AI_VISIBILITY_TOTAL_QUERIES) return null

  return `Diese Analyse wuerde ${totalQueries} API-Calls ausloesen. Aktuell sind maximal ${MAX_AI_VISIBILITY_TOTAL_QUERIES} API-Calls pro Lauf erlaubt, damit der Worker nicht ins Timeout laeuft.`
}

export function calculateCostEstimate(
  keywordCount: number,
  modelCount: number,
  iterations: number,
  competitorCount: number
): CostEstimate {
  const subjects = 1 + competitorCount // brand + competitors
  const total = keywordCount * modelCount * iterations * subjects
  return {
    total_api_calls: total,
    breakdown: {
      keywords: keywordCount,
      models: modelCount,
      iterations,
      subjects,
    },
  }
}

// ─── Status-Hilfsfunktionen ──────────────────────────────────
export function statusLabel(status: AnalysisStatus): string {
  const map: Record<AnalysisStatus, string> = {
    pending: 'Wartend',
    queued: 'In Warteschlange',
    running: 'Läuft',
    done: 'Abgeschlossen',
    failed: 'Fehlgeschlagen',
    cancelled: 'Abgebrochen',
  }
  return map[status]
}

export function statusColor(status: AnalysisStatus): string {
  const map: Record<AnalysisStatus, string> = {
    pending: 'bg-slate-100 text-slate-600',
    queued: 'bg-amber-50 text-amber-700',
    running: 'bg-blue-50 text-blue-700',
    done: 'bg-emerald-50 text-emerald-700',
    failed: 'bg-red-50 text-red-700',
    cancelled: 'bg-slate-100 text-slate-500',
  }
  return map[status]
}

export function modelLabel(modelId: string): string {
  const canonicalModelId = normalizeAiModelId(modelId)
  const found = AI_MODELS.find((m) => m.id === canonicalModelId)
  return found?.label ?? modelId
}
