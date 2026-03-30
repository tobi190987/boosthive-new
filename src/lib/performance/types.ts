export type KPIs = {
  impressions: number | null
  clicks: number | null
  link_clicks: number | null
  spend_eur: number | null
  conversions: number | null
  reach: number | null
  frequency: number | null
  page_interactions: number | null
  likes: number | null
  follows: number | null
  post_comments: number | null
  post_interactions: number | null
  post_reactions: number | null
  saved_posts: number | null
  shared_posts: number | null
  ctr_pct: number | null
  conversion_rate_pct: number | null
  cpc_eur: number | null
  cpm_eur: number | null
  cpa_eur: number | null
}

export type DateRange = { from: string; to: string }

export type ParseMeta = {
  platform: string
  analysis_level: string
  entity_column: string
  entity_label: string
  data_kind: 'ads' | 'content'
  has_time_series: boolean
  date_range: DateRange | null
  kpis: KPIs
  columns: string[]
  rows: number
  campaigns_all: string[]
  campaigns_total: number
  has_status: boolean
  status_values: string[]
}

export type Filters = {
  active_only: boolean
  campaigns: string[]
}

export type PreviewResult = {
  platform: string
  entity_label: string
  entity_column: string
  analysis_level: string
  data_kind: string
  columns: string[]
  rows_total: number
  rows_filtered: number
  rows: Record<string, string | number | null>[]
  kpis: KPIs
  date_range: DateRange | null
  campaigns_all: string[]
  campaigns_total: number
  has_status: boolean
  status_values: string[]
  filters_applied: Record<string, unknown>
}

export type AnalyzeResult = {
  id: string
  client_label: string | null
  analysis: string
  meta: {
    rows: number
    columns: string[]
    platform: string
    analysis_level: string
    entity_label: string
    entity_column: string
    kpis: KPIs
    date_range: DateRange | null
    filters_applied: Record<string, unknown>
  }
}

export type KPIDelta = { a: number | null; b: number | null; diff: number | null; pct: number | null }

export type CompareResult = {
  id: string
  client_label: string | null
  analysis: string
  meta: {
    compare: true
    platform: string
    a: { file_name: string; label: string; rows: number; kpis: KPIs; date_range: DateRange | null }
    b: { file_name: string; label: string; rows: number; kpis: KPIs; date_range: DateRange | null }
    deltas: Record<string, KPIDelta>
  }
}

export type PerformanceAnalysis = {
  id: string
  type: 'analyze' | 'compare'
  client_label: string | null
  platform: string | null
  analysis: string
  meta: AnalyzeResult['meta'] | CompareResult['meta']
  created_at: string
}
