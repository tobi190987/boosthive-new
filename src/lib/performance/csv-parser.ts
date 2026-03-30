import type { KPIs, ParseMeta, Filters } from './types'

// Column mapping (German/English → internal)
const COLUMN_MAP: Record<string, string> = {
  'Kampagne': 'campaign', 'Campaign': 'campaign', 'Kampagnenname': 'campaign',
  'Campaign name': 'campaign', 'Name der Kampagne': 'campaign',
  'Werbeanzeigen': 'campaign', 'Name der Anzeige': 'campaign',
  'Name der Anzeigengruppe': 'campaign',
  'Anzeigengruppe': 'ad_group', 'Anzeigengruppe (Name)': 'ad_group',
  'Ad group': 'ad_group', 'Ad group name': 'ad_group',
  'Anzeige': 'ad', 'Anzeigenname': 'ad', 'Ad': 'ad', 'Ad name': 'ad',
  'Asset-Gruppe': 'asset_group', 'Asset-Gruppe (Name)': 'asset_group',
  'Asset group': 'asset_group', 'Asset group name': 'asset_group',
  'Kampagnenstatus': 'status', 'Campaign status': 'status', 'Status': 'status',
  'Auslieferungsstatus': 'status', 'Status der Asset-Gruppe': 'status',
  'Reichweite': 'reach', 'Reach': 'reach',
  'Impressionen': 'impressions', 'Impressions': 'impressions',
  'Frequenz': 'frequency', 'Frequency': 'frequency',
  'Klicks': 'clicks', 'Klicks (alle)': 'clicks', 'Link-Klicks': 'link_clicks',
  'Link clicks': 'link_clicks', 'Clicks': 'clicks', 'Interaktionen': 'clicks',
  'Kosten': 'spend', 'Cost': 'spend',
  'Seiteninteraktionen': 'page_interactions', 'Page engagements': 'page_interactions',
  '\u201eGef\u00e4llt mir\u201c-Angaben auf Facebook': 'likes', 'Gef\u00e4llt mir-Angaben auf Facebook': 'likes',
  'Facebook likes': 'likes', 'Follows auf Instagram': 'follows',
  'Instagram follows': 'follows', 'Beitragskommentare': 'post_comments',
  'Post comments': 'post_comments', 'Beitragsinteraktionen': 'post_interactions',
  'Post interactions': 'post_interactions', 'Beitragsreaktionen': 'post_reactions',
  'Post reactions': 'post_reactions', 'Gespeicherte Beitr\u00e4ge': 'saved_posts',
  'Saved posts': 'saved_posts', 'Geteilte Beitr\u00e4ge': 'shared_posts',
  'Shared posts': 'shared_posts', 'Ausgegebener Betrag (EUR)': 'spend',
  'Amount spent (EUR)': 'spend', 'Amount spent': 'spend',
  'Ergebnisse': 'conversions', 'Results': 'conversions', 'Conversions': 'conversions',
  'CTR (alle)': 'ctr', 'CTR (All)': 'ctr', 'CTR': 'ctr',
  'Interaktionsrate': 'ctr', 'Klickrate': 'ctr',
  'CPC (alle)': 'cpc', 'CPC (All)': 'cpc', 'CPC': 'cpc',
  'Durchschn. CPC': 'cpc', 'Avg. CPC': 'cpc',
  'Kosten pro Ergebnis': 'cost_per_conversion', 'Cost per result': 'cost_per_conversion',
  'Kosten/Conv.': 'cost_per_conversion', 'Cost / conv.': 'cost_per_conversion',
  'Kosten/Conv. (EUR)': 'cost_per_conversion',
  'Conv.-Rate': 'conversion_rate', 'Conv. rate': 'conversion_rate',
  'ROAS': 'roas',
}

type Row = Record<string, string | number | null>

function detectDelimiter(line: string): string {
  const candidates = [',', ';', '\t', '|']
  let best = ','
  let bestCount = 0
  for (const d of candidates) {
    // Count only unquoted occurrences to avoid counting commas inside quoted fields
    const count = splitCsvLine(line, d).length - 1
    if (count > bestCount) { bestCount = count; best = d }
  }
  return best
}

function parseNumber(val: string): number | null {
  if (!val || val.trim() === '' || val.trim() === '--' || val.trim() === '-') return null
  let s = val.trim()
    .replace(/%/g, '').replace(/€/g, '').replace(/\xa0/g, '')
    .replace(/> 90/g, '90').trim()

  const hasComma = s.includes(',')
  const looksDeThousands = /^\d{1,3}(\.\d{3})+$/.test(s)

  if (hasComma) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (looksDeThousands) {
    s = s.replace(/\./g, '')
  }

  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

function detectPlatform(columns: string[], sampleText: string = ''): string {
  const cols = columns.map(c => c.toLowerCase())
  const text = sampleText.toLowerCase()

  function hits(markers: string[]): number {
    return markers.reduce((n, m) => n + (cols.some(c => c.includes(m)) || text.includes(m) ? 1 : 0), 0)
  }

  const contentMarkers = ['published time', 'post type', 'post url', 'post id', 'link clicks', 'link ctr', 'engagement rate', 'video view rate', 'network', 'page name']
  const tiktokMarkers = ['tiktok', 'spark', 'werbeziel', 'ad group', 'video views', 'vtr', 'cpv']
  const metaMarkers = ['meta', 'facebook', 'instagram', 'ad set', 'publisher platform', 'placement', 'link-klicks', 'amount spent', 'kosten pro ergebnis']
  const googleMarkers = ['google', 'kampagnentyp', 'campaign type', 'interaktionen', 'durchschn. cpc', 'avg. cpc', 'search', 'shopping', 'display', 'youtube']

  const contentH = hits(contentMarkers)
  const tiktokH = hits(tiktokMarkers)
  const metaH = hits(metaMarkers)
  const googleH = hits(googleMarkers)

  if (contentH >= 3 && contentH >= Math.max(metaH, googleH, tiktokH)) return 'Meta Content'
  if (tiktokH >= 2 && tiktokH > Math.max(metaH, googleH)) return 'TikTok Ads'
  if (metaH >= 2 && metaH > googleH) {
    if (text.includes('instagram') || cols.some(c => c.includes('instagram'))) return 'Instagram Ads'
    return 'Facebook Ads'
  }
  if (googleH >= 2) return 'Google Ads'
  if (tiktokH >= 2) return 'TikTok Ads'
  if (metaH >= 2) return 'Facebook Ads'
  return 'Unbekannt'
}

function computeKPIs(rows: Row[]): KPIs {
  function sum(key: string): number | null {
    const vals = rows.map(r => r[key]).filter((v): v is number => v != null && typeof v === 'number' && !isNaN(v))
    if (!vals.length) return null
    return vals.reduce((a, b) => a + b, 0)
  }

  const impressions = sum('impressions')
  const clicks_raw = sum('clicks')
  const link_clicks = sum('link_clicks')
  const clicks = clicks_raw !== null ? clicks_raw : link_clicks
  const spend = sum('spend')
  const conversions = sum('conversions')
  const reach = sum('reach')

  let frequency: number | null = null
  if (impressions !== null && reach !== null && reach > 0) {
    frequency = impressions / reach
  }

  let ctr_pct: number | null = null
  if (impressions && impressions > 0 && clicks !== null) ctr_pct = (clicks / impressions) * 100

  let cpc_eur: number | null = null
  if (clicks && clicks > 0 && spend !== null) cpc_eur = spend / clicks

  let cpm_eur: number | null = null
  if (impressions && impressions > 0 && spend !== null) cpm_eur = (spend / impressions) * 1000

  let cpa_eur: number | null = null
  if (conversions && conversions > 0 && spend !== null) cpa_eur = spend / conversions

  let conversion_rate_pct: number | null = null
  if (clicks && clicks > 0 && conversions !== null) conversion_rate_pct = (conversions / clicks) * 100

  return {
    impressions, clicks, link_clicks, spend_eur: spend, conversions, reach, frequency,
    page_interactions: sum('page_interactions'), likes: sum('likes'), follows: sum('follows'),
    post_comments: sum('post_comments'), post_interactions: sum('post_interactions'),
    post_reactions: sum('post_reactions'), saved_posts: sum('saved_posts'),
    shared_posts: sum('shared_posts'),
    ctr_pct, conversion_rate_pct, cpc_eur, cpm_eur, cpa_eur,
  }
}

function isActiveStatus(val: string | null | undefined): boolean {
  if (!val) return false
  const s = String(val).toLowerCase().trim()
  if (!s || s === 'nan') return false
  const neg = ['paused', 'pausiert', 'disabled', 'deaktiv', 'inaktiv', 'not_delivering', 'removed', 'archiv', 'deleted', 'stop', 'ended', 'beendet']
  if (neg.some(k => s.includes(k))) return false
  return true
}

export function applyFilters(rows: Row[], filters: Filters, entityCol: string): { rows: Row[]; applied: Record<string, unknown> } {
  let out = [...rows]
  const applied: Record<string, unknown> = {
    active_only_requested: filters.active_only,
    active_only_applied: false,
    campaigns_requested: filters.campaigns.length,
    campaigns_applied: 0,
  }

  if (filters.campaigns.length > 0) {
    const allow = new Set(filters.campaigns)
    out = out.filter(r => allow.has(String(r[entityCol] ?? '')))
    applied.campaigns_applied = filters.campaigns.length
  }

  if (filters.active_only) {
    const filtered = out.filter(r => isActiveStatus(String(r.status ?? '')))
    if (filtered.length > 0) { out = filtered; applied.active_only_applied = true }
  }

  return { rows: out, applied }
}

function extractDateRange(rows: Row[]): { date_range: { from: string; to: string } | null; date_column: string | null } {
  if (!rows.length) return { date_range: null, date_column: null }

  const dateMarkers = ['date', 'datum', 'tag', 'day', 'timestamp', 'zeitraum', 'periode', 'period', 'reporting', 'start', 'end']
  const cols = Object.keys(rows[0])

  for (const col of cols) {
    const lc = col.toLowerCase()
    if (!dateMarkers.some(m => lc.includes(m))) continue

    const vals = rows.map(r => String(r[col] ?? '').trim()).filter(Boolean)
    if (!vals.length) continue

    const dates: Date[] = []
    for (const v of vals.slice(0, 50)) {
      if (/^\d{8}$/.test(v)) {
        const d = new Date(v.slice(0, 4) + '-' + v.slice(4, 6) + '-' + v.slice(6, 8))
        if (!isNaN(d.getTime())) dates.push(d)
        continue
      }
      const d = new Date(v)
      if (!isNaN(d.getTime()) && d.getFullYear() >= 1995 && d.getFullYear() <= 2105) {
        dates.push(d)
      }
    }

    if (dates.length < vals.length * 0.6) continue

    const min = new Date(Math.min(...dates.map(d => d.getTime())))
    const max = new Date(Math.max(...dates.map(d => d.getTime())))

    const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
    return { date_range: { from: fmt(min), to: fmt(max) }, date_column: col }
  }

  return { date_range: null, date_column: null }
}

function detectAnalysisLevel(cols: string[]): { level: string; column: string; label: string } {
  if (cols.includes('asset_group')) return { level: 'asset_group', column: 'asset_group', label: 'Asset-Gruppe' }
  if (cols.includes('ad_group')) return { level: 'ad_group', column: 'ad_group', label: 'Anzeigengruppe' }
  if (cols.includes('ad')) return { level: 'ad', column: 'ad', label: 'Anzeige' }
  return { level: 'campaign', column: 'campaign', label: 'Kampagne' }
}

function splitCsvLine(line: string, sep: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === sep && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

function parseCsvText(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  if (!lines.length) throw new Error('Datei ist leer.')

  let start = 0
  if (lines[0].trim().toLowerCase().startsWith('sep=')) start = 1

  const keywords = ['kampagne', 'campaign', 'impressionen', 'impressions', 'kampagnenname', 'klicks', 'clicks', 'kosten', 'cost', 'amount spent', 'results', 'ergebnisse', 'conversions']
  let headerIdx = start
  let bestScore = -1

  for (let i = start; i < Math.min(lines.length, start + 20); i++) {
    const l = lines[i].toLowerCase()
    const kwHits = keywords.filter(k => l.includes(k)).length
    if (kwHits > bestScore) { bestScore = kwHits; headerIdx = i }
  }

  const cleanLines = lines.slice(headerIdx).filter(l => !l.startsWith('Gesamt:') && !l.startsWith('Total:'))
  if (!cleanLines.length) throw new Error('Keine Daten gefunden.')

  const sep = detectDelimiter(cleanLines[0])
  const headers = splitCsvLine(cleanLines[0], sep)

  const rows: Record<string, string>[] = []
  for (const line of cleanLines.slice(1)) {
    if (!line.trim()) continue
    const parts = splitCsvLine(line, sep)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = parts[i] ?? '' })
    rows.push(row)
  }

  return { headers, rows }
}

export function parseCSV(fileContent: string): { rows: Row[]; meta: ParseMeta } {
  const { headers, rows: rawRows } = parseCsvText(fileContent)

  const mappedHeaders: string[] = headers.map(h => COLUMN_MAP[h] ?? h)
  const knownCols = new Set(['campaign', 'ad_group', 'asset_group', 'ad', 'status', 'reach', 'impressions', 'frequency', 'clicks', 'link_clicks', 'page_interactions', 'likes', 'follows', 'post_comments', 'post_interactions', 'post_reactions', 'saved_posts', 'shared_posts', 'spend', 'conversions', 'conversion_rate', 'ctr', 'cpc', 'cost_per_conversion', 'roas'])

  const colMap: Record<string, string> = {}
  headers.forEach((orig, i) => { colMap[orig] = mappedHeaders[i] })

  const usedCols = [...new Set(mappedHeaders.filter(c => knownCols.has(c)))]
  if (!usedCols.length) throw new Error('Keine bekannten Spalten gefunden. Bitte \u00fcberpr\u00fcfe das CSV-Format.')

  const nonNumeric = new Set(['campaign', 'ad_group', 'asset_group', 'ad', 'status'])

  const rows: Row[] = rawRows
    .map(rawRow => {
      const row: Row = {}
      for (const [orig, mapped] of Object.entries(colMap)) {
        if (!usedCols.includes(mapped)) continue
        if (nonNumeric.has(mapped)) {
          row[mapped] = String(rawRow[orig] ?? '').trim() || null
        } else {
          row[mapped] = parseNumber(rawRow[orig] ?? '')
        }
      }
      return row
    })
    .filter(r => {
      const camp = String(r.campaign ?? '')
      return !camp.startsWith('Gesamt') && !camp.startsWith('Total')
    })

  if (!rows.length) throw new Error('Keine Datenzeilen gefunden.')

  const { level, column: entityCol, label: entityLabel } = detectAnalysisLevel(usedCols)
  const { date_range } = extractDateRange(rows)
  const platform = detectPlatform(headers, fileContent.slice(0, 2000))

  const campaigns_all = entityCol && usedCols.includes(entityCol)
    ? [...new Set(rows.map(r => String(r[entityCol] ?? '')).filter(s => s && s !== 'nan').sort())]
    : []

  const status_values = usedCols.includes('status')
    ? [...new Set(rows.map(r => String(r.status ?? '')).filter(s => s && s !== 'nan').sort())]
    : []

  const timeMarkers = ['date', 'datum', 'tag', 'day', 'woche', 'week', 'monat', 'month', 'timestamp', 'time']
  const has_time_series = !!date_range || headers.some(h => timeMarkers.some(m => h.toLowerCase().includes(m)))

  const kpis = computeKPIs(rows)

  const meta: ParseMeta = {
    platform,
    analysis_level: level,
    entity_column: entityCol,
    entity_label: entityLabel,
    data_kind: 'ads',
    has_time_series,
    date_range,
    kpis,
    columns: usedCols,
    rows: rows.length,
    campaigns_all,
    campaigns_total: campaigns_all.length,
    has_status: usedCols.includes('status'),
    status_values,
  }

  return { rows, meta }
}

export function buildLLMContext(rows: Row[], meta: ParseMeta): string {
  const MAX_ROWS = 50
  const MAX_COLS = 18

  const preferred = [meta.entity_column, 'impressions', 'clicks', 'link_clicks', 'spend', 'conversions', 'ctr', 'cpc', 'cpm_eur', 'cpa_eur', 'reach', 'frequency'].filter(c => meta.columns.includes(c))
  const remaining = meta.columns.filter(c => !preferred.includes(c))
  const cols = [...preferred, ...remaining].slice(0, MAX_COLS)

  const entityRows = meta.campaigns_total > 1
    ? aggregateByEntity(rows, meta.entity_column, cols)
    : rows

  const displayRows = entityRows.slice(0, MAX_ROWS)

  const header = cols.join(' | ')
  const separator = cols.map(c => '-'.repeat(c.length)).join('-|-')
  const dataRows = displayRows.map(r => cols.map(c => {
    const v = r[c]
    if (v === null || v === undefined) return '\u2014'
    if (typeof v === 'number') return isNaN(v) ? '\u2014' : v.toFixed(2)
    return String(v)
  }).join(' | '))

  return [header, separator, ...dataRows].join('\n')
}

function aggregateByEntity(rows: Row[], entityCol: string, cols: string[]): Row[] {
  const grouped = new Map<string, Row[]>()
  for (const row of rows) {
    const key = String(row[entityCol] ?? '')
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(row)
  }

  const numericCols = cols.filter(c => !['campaign', 'ad_group', 'asset_group', 'ad', 'status'].includes(c))

  return [...grouped.entries()].map(([key, group]) => {
    const agg: Row = { [entityCol]: key }
    for (const col of numericCols) {
      if (!cols.includes(col)) continue
      const vals = group.map(r => r[col]).filter(v => v !== null && !isNaN(Number(v))) as number[]
      agg[col] = vals.length ? vals.reduce((a, b) => a + b, 0) : null
    }
    return agg
  })
}

export function computeKPIDeltas(kpisA: KPIs, kpisB: KPIs): Record<string, { a: number | null; b: number | null; diff: number | null; pct: number | null }> {
  const keys = Object.keys(kpisA) as (keyof KPIs)[]
  const out: Record<string, { a: number | null; b: number | null; diff: number | null; pct: number | null }> = {}
  for (const k of keys) {
    const a = kpisA[k] as number | null
    const b = kpisB[k] as number | null
    let diff: number | null = null
    let pct: number | null = null
    if (a !== null && b !== null) {
      diff = b - a
      pct = a !== 0 ? (diff / a) * 100 : null
    }
    out[k] = { a, b, diff, pct }
  }
  return out
}
