/**
 * Types and constants for the AI Visibility Tool (PROJ-12).
 */

// ─── KI-Modelle ───────────────────────────────────────────────
export interface AiModel {
  id: string
  label: string
  provider: string
}

export const AI_MODELS: AiModel[] = [
  { id: 'openai/gpt-4o', label: 'GPT-4o', provider: 'OpenAI' },
  { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { id: 'google/gemini-pro-1.5', label: 'Gemini 1.5 Pro', provider: 'Google' },
  { id: 'perplexity/llama-3.1-sonar-large-128k-online', label: 'Perplexity Sonar', provider: 'Perplexity' },
]

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
  status: AnalysisStatus
  progress_done: number
  progress_total: number
  error_log: AnalysisError[]
  model_progress: ModelProgress[]
}

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
  const found = AI_MODELS.find((m) => m.id === modelId)
  return found?.label ?? modelId
}
