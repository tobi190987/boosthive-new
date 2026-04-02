import { createAdminClient } from '@/lib/supabase-admin'
import { decryptToken, encryptToken } from '@/lib/gsc-crypto'
import {
  querySearchAnalytics,
  refreshAccessToken,
  TokenRevokedError,
} from '@/lib/gsc-oauth'

type TriggerType = 'manual' | 'cron' | 'internal'
type RunStatus = 'queued' | 'running' | 'success' | 'failed' | 'skipped'
type ProjectTrackingStatus = 'idle' | 'queued' | 'running' | 'success' | 'failed'

interface ProjectRecord {
  id: string
  tenant_id: string
  status: 'active' | 'inactive'
  country_code: string
  tracking_interval: 'daily' | 'weekly'
  last_tracking_run: string | null
}

interface ConnectionRecord {
  id: string
  project_id: string
  tenant_id: string
  encrypted_access_token: string
  encrypted_refresh_token: string
  token_expires_at: string
  selected_property: string | null
  status: 'connected' | 'expired' | 'revoked'
}

interface KeywordRecord {
  id: string
  keyword: string
  created_at: string
}

interface RunRecord {
  id: string
  tenant_id: string
  project_id: string
  trigger_type: TriggerType
  status: RunStatus
  created_at: string
}

interface RankingSnapshotInsert {
  run_id: string
  tenant_id: string
  project_id: string
  keyword_id: string | null
  keyword_label: string
  position: number | null
  best_url: string | null
  clicks: number | null
  impressions: number | null
  source: 'gsc'
  tracked_at: string
}

export interface CreateRankingRunInput {
  tenantId: string
  projectId: string
  triggerType: TriggerType
}

export interface RankingRunResult {
  runId: string
  status: RunStatus
  keywordCount: number
  trackedAt: string | null
  errorMessage: string | null
}

export interface RankingsDashboardRow {
  keywordId: string
  keyword: string
  currentPosition: number | null
  previousPosition: number | null
  delta: number | null
  lastTrackedAt: string | null
  bestUrl: string | null
}

export interface RankingsDashboardResponse {
  summary: {
    status: ProjectTrackingStatus
    lastTrackedAt: string | null
    lastSuccessfulRunAt: string | null
    lastRunStartedAt: string | null
    lastRunCompletedAt: string | null
    lastError: string | null
    trackingInterval: 'daily' | 'weekly'
    refreshAvailableAt: string | null
    competitorsAvailable?: boolean
  }
  rows: RankingsDashboardRow[]
}

export interface RankingHistoryResponse {
  keyword: { id: string; keyword: string }
  summary: Record<string, never>
  series: Array<{
    label: string
    domain: string | null
    color: string | null
    points: Array<{
      trackedAt: string
      position: number | null
      domain: string | null
      source: string | null
    }>
  }>
}

const GSC_REFRESH_BUFFER_MS = 60_000
const MANUAL_REFRESH_COOLDOWN_MS = 60 * 60 * 1000
const CRON_BATCH_LIMIT = 25
const SNAPSHOT_RETENTION_DAYS = 365

const COUNTRY_ALPHA3: Record<string, string> = {
  DE: 'DEU',
  AT: 'AUT',
  CH: 'CHE',
  US: 'USA',
  GB: 'GBR',
  FR: 'FRA',
  ES: 'ESP',
  IT: 'ITA',
  NL: 'NLD',
  PL: 'POL',
}

function getAdmin() {
  return createAdminClient()
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function getQueryDateRange() {
  const end = new Date()
  end.setUTCDate(end.getUTCDate() - 1)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 6)
  return {
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
  }
}

function getCountryFilter(countryCode: string) {
  return COUNTRY_ALPHA3[countryCode.toUpperCase()] ?? null
}

function addMs(value: string, ms: number) {
  return new Date(new Date(value).getTime() + ms).toISOString()
}

function computeDelta(currentPosition: number | null, previousPosition: number | null) {
  if (currentPosition == null || previousPosition == null) return null
  return Number((currentPosition - previousPosition).toFixed(2))
}

async function loadProject(projectId: string, tenantId: string) {
  const admin = getAdmin()
  const { data, error } = await admin
    .from('keyword_projects')
    .select(
      'id, tenant_id, status, country_code, tracking_interval, last_tracking_run, last_tracking_status, last_tracking_error'
    )
    .eq('id', projectId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as (ProjectRecord & {
    last_tracking_status: ProjectTrackingStatus
    last_tracking_error: string | null
  }) | null
}

async function loadConnection(projectId: string, tenantId: string) {
  const admin = getAdmin()
  const { data, error } = await admin
    .from('gsc_connections')
    .select(
      'id, project_id, tenant_id, encrypted_access_token, encrypted_refresh_token, token_expires_at, selected_property, status'
    )
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as ConnectionRecord | null
}

async function loadKeywords(projectId: string, tenantId: string) {
  const admin = getAdmin()
  const { data, error } = await admin
    .from('keywords')
    .select('id, keyword, created_at')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as KeywordRecord[]
}

async function updateProjectTrackingState(
  projectId: string,
  tenantId: string,
  input: Partial<{
    last_tracking_run: string | null
    last_tracking_status: ProjectTrackingStatus
    last_tracking_error: string | null
  }>
) {
  const admin = getAdmin()
  const { error } = await admin
    .from('keyword_projects')
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId)
    .eq('tenant_id', tenantId)

  if (error) throw new Error(error.message)
}

async function updateRun(
  runId: string,
  input: Partial<{
    status: RunStatus
    started_at: string | null
    completed_at: string | null
    error_message: string | null
    keyword_count: number
  }>
) {
  const admin = getAdmin()
  const { error } = await admin.from('keyword_ranking_runs').update(input).eq('id', runId)
  if (error) throw new Error(error.message)
}

async function ensureAccessToken(connection: ConnectionRecord) {
  const admin = getAdmin()

  if (connection.status === 'revoked') {
    throw new TokenRevokedError('GSC-Verbindung wurde widerrufen.')
  }

  let accessToken = decryptToken(connection.encrypted_access_token)
  const expiresAt = new Date(connection.token_expires_at).getTime()

  if (Date.now() <= expiresAt - GSC_REFRESH_BUFFER_MS) {
    return accessToken
  }

  try {
    const refreshToken = decryptToken(connection.encrypted_refresh_token)
    const refreshed = await refreshAccessToken(refreshToken)
    accessToken = refreshed.access_token

    const { error } = await admin
      .from('gsc_connections')
      .update({
        encrypted_access_token: encryptToken(refreshed.access_token),
        token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        status: 'connected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id)

    if (error) throw new Error(error.message)
    return accessToken
  } catch (error) {
    if (error instanceof TokenRevokedError) {
      await admin
        .from('gsc_connections')
        .update({
          status: 'revoked',
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id)
    }
    throw error
  }
}

async function queryKeywordSnapshot(
  accessToken: string,
  project: ProjectRecord,
  selectedProperty: string,
  keyword: KeywordRecord,
  trackedAt: string,
  runId: string
): Promise<RankingSnapshotInsert> {
  const dateRange = getQueryDateRange()
  const country = getCountryFilter(project.country_code)

  const rows = await querySearchAnalytics(accessToken, {
    siteUrl: selectedProperty,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    dimensions: ['page'],
    rowLimit: 25,
    country: country ?? undefined,
    query: keyword.keyword,
  })

  const bestRow =
    rows
      .filter((row) => typeof row.position === 'number')
      .sort((a, b) => (a.position ?? Number.POSITIVE_INFINITY) - (b.position ?? Number.POSITIVE_INFINITY))[0] ??
    null

  return {
    run_id: runId,
    tenant_id: project.tenant_id,
    project_id: project.id,
    keyword_id: keyword.id,
    keyword_label: keyword.keyword,
    position: bestRow?.position != null ? Number(bestRow.position.toFixed(2)) : null,
    best_url: bestRow?.keys?.[0] ?? null,
    clicks: bestRow?.clicks != null ? Number(bestRow.clicks.toFixed(2)) : null,
    impressions: bestRow?.impressions != null ? Number(bestRow.impressions.toFixed(2)) : null,
    source: 'gsc',
    tracked_at: trackedAt,
  }
}

export async function createRankingRun(input: CreateRankingRunInput) {
  const admin = getAdmin()
  const { data, error } = await admin
    .from('keyword_ranking_runs')
    .insert({
      tenant_id: input.tenantId,
      project_id: input.projectId,
      trigger_type: input.triggerType,
      status: 'queued',
    })
    .select('id, tenant_id, project_id, trigger_type, status, created_at')
    .single()

  if (error) throw new Error(error.message)

  await updateProjectTrackingState(input.projectId, input.tenantId, {
    last_tracking_status: 'queued',
  })

  return data as RunRecord
}

export async function assertManualRefreshAllowed(projectId: string, tenantId: string) {
  const admin = getAdmin()

  const { data: runningRun, error: runningError } = await admin
    .from('keyword_ranking_runs')
    .select('id')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .in('status', ['queued', 'running'])
    .limit(1)
    .maybeSingle()

  if (runningError) throw new Error(runningError.message)
  if (runningRun) {
    throw new Error('Für dieses Projekt läuft bereits ein Tracking-Job.')
  }

  const cooldownThreshold = new Date(Date.now() - MANUAL_REFRESH_COOLDOWN_MS).toISOString()
  const { data: recentRun, error: recentError } = await admin
    .from('keyword_ranking_runs')
    .select('created_at')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .eq('trigger_type', 'manual')
    .eq('status', 'success')
    .gte('created_at', cooldownThreshold)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (recentError) throw new Error(recentError.message)
  if (recentRun) {
    const { data: latestKeyword, error: latestKeywordError } = await admin
      .from('keywords')
      .select('created_at')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestKeywordError) throw new Error(latestKeywordError.message)
    if (latestKeyword?.created_at && latestKeyword.created_at > recentRun.created_at) {
      return
    }

    throw new Error(
      `Manuelle Aktualisierung ist erst wieder ${addMs(recentRun.created_at, MANUAL_REFRESH_COOLDOWN_MS)} moeglich.`
    )
  }
}

export async function processRankingRun(runId: string): Promise<RankingRunResult> {
  const admin = getAdmin()
  const { data: run, error: runError } = await admin
    .from('keyword_ranking_runs')
    .select('id, tenant_id, project_id, trigger_type, status, created_at')
    .eq('id', runId)
    .maybeSingle()

  if (runError || !run) {
    throw new Error('Ranking-Run nicht gefunden.')
  }

  const typedRun = run as RunRecord
  const project = await loadProject(typedRun.project_id, typedRun.tenant_id)
  if (!project) {
    throw new Error('Keyword-Projekt nicht gefunden.')
  }

  const startedAt = new Date().toISOString()
  await updateRun(runId, {
    status: 'running',
    started_at: startedAt,
    completed_at: null,
    error_message: null,
  })
  await updateProjectTrackingState(project.id, project.tenant_id, {
    last_tracking_status: 'running',
    last_tracking_error: null,
  })

  try {
    if (project.status !== 'active') {
      await updateRun(runId, {
        status: 'skipped',
        completed_at: new Date().toISOString(),
        error_message: 'Projekt ist inaktiv.',
      })
      await updateProjectTrackingState(project.id, project.tenant_id, {
        last_tracking_status: 'success',
      })
      return {
        runId,
        status: 'skipped',
        keywordCount: 0,
        trackedAt: null,
        errorMessage: 'Projekt ist inaktiv.',
      }
    }

    const connection = await loadConnection(project.id, project.tenant_id)
    if (!connection || !connection.selected_property || connection.status !== 'connected') {
      const message = 'Keine aktive GSC-Property für dieses Projekt konfiguriert.'
      await updateRun(runId, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: message,
      })
      await updateProjectTrackingState(project.id, project.tenant_id, {
        last_tracking_status: 'failed',
        last_tracking_error: message,
      })
      return {
        runId,
        status: 'failed',
        keywordCount: 0,
        trackedAt: null,
        errorMessage: message,
      }
    }

    const keywords = await loadKeywords(project.id, project.tenant_id)
    if (keywords.length === 0) {
      const completedAt = new Date().toISOString()
      await updateRun(runId, {
        status: 'success',
        completed_at: completedAt,
        keyword_count: 0,
      })
      await updateProjectTrackingState(project.id, project.tenant_id, {
        last_tracking_run: completedAt,
        last_tracking_status: 'success',
        last_tracking_error: null,
      })
      return {
        runId,
        status: 'success',
        keywordCount: 0,
        trackedAt: completedAt,
        errorMessage: null,
      }
    }

    const accessToken = await ensureAccessToken(connection)
    const trackedAt = new Date().toISOString()
    const snapshots: RankingSnapshotInsert[] = []

    for (const keyword of keywords) {
      const snapshot = await queryKeywordSnapshot(
        accessToken,
        project,
        connection.selected_property,
        keyword,
        trackedAt,
        runId
      )
      snapshots.push(snapshot)
    }

    const { error: insertError } = await admin.from('keyword_ranking_snapshots').insert(snapshots)
    if (insertError) throw new Error(insertError.message)

    const completedAt = new Date().toISOString()
    await updateRun(runId, {
      status: 'success',
      completed_at: completedAt,
      keyword_count: snapshots.length,
      error_message: null,
    })
    await updateProjectTrackingState(project.id, project.tenant_id, {
      last_tracking_run: trackedAt,
      last_tracking_status: 'success',
      last_tracking_error: null,
    })

    return {
      runId,
      status: 'success',
      keywordCount: snapshots.length,
      trackedAt,
      errorMessage: null,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Keyword-Ranking-Tracking fehlgeschlagen.'
    const completedAt = new Date().toISOString()
    await updateRun(runId, {
      status: 'failed',
      completed_at: completedAt,
      error_message: message,
    })
    await updateProjectTrackingState(project.id, project.tenant_id, {
      last_tracking_status: 'failed',
      last_tracking_error: message,
    })
    throw error
  }
}

export async function getRankingsDashboard(
  tenantId: string,
  projectId: string
): Promise<RankingsDashboardResponse> {
  const admin = getAdmin()
  const [project, keywords] = await Promise.all([
    loadProject(projectId, tenantId),
    loadKeywords(projectId, tenantId),
  ])

  if (!project) {
    throw new Error('Projekt nicht gefunden.')
  }

  const { data: runs, error: runsError } = await admin
    .from('keyword_ranking_runs')
    .select('status, started_at, completed_at, error_message, created_at, trigger_type')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(10)

  if (runsError) throw new Error(runsError.message)

  const { data: snapshots, error: snapshotsError } = await admin
    .from('keyword_ranking_snapshots')
    .select('keyword_id, position, best_url, tracked_at')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .order('tracked_at', { ascending: false })

  if (snapshotsError) throw new Error(snapshotsError.message)

  const snapshotMap = new Map<
    string,
    Array<{ position: number | null; best_url: string | null; tracked_at: string }>
  >()

  for (const snapshot of snapshots ?? []) {
    const list = snapshotMap.get(snapshot.keyword_id) ?? []
    list.push({
      position:
        typeof snapshot.position === 'number'
          ? Number(snapshot.position.toFixed(2))
          : snapshot.position != null
            ? Number(snapshot.position)
            : null,
      best_url: snapshot.best_url,
      tracked_at: snapshot.tracked_at,
    })
    snapshotMap.set(snapshot.keyword_id, list)
  }

  const rows: RankingsDashboardRow[] = keywords
    .map((keyword) => {
      const history = snapshotMap.get(keyword.id) ?? []
      const latest = history[0]
      const previous = history[1]
      return {
        keywordId: keyword.id,
        keyword: keyword.keyword,
        currentPosition: latest?.position ?? null,
        previousPosition: previous?.position ?? null,
        delta: computeDelta(latest?.position ?? null, previous?.position ?? null),
        lastTrackedAt: latest?.tracked_at ?? null,
        bestUrl: latest?.best_url ?? null,
      }
    })
    .sort((a, b) => {
      if (a.currentPosition == null && b.currentPosition == null) {
        return a.keyword.localeCompare(b.keyword, 'de')
      }
      if (a.currentPosition == null) return 1
      if (b.currentPosition == null) return -1
      if (a.currentPosition !== b.currentPosition) {
        return a.currentPosition - b.currentPosition
      }
      return a.keyword.localeCompare(b.keyword, 'de')
    })

  const lastRun = (runs ?? [])[0] as
    | {
        status: RunStatus
        started_at: string | null
        completed_at: string | null
        error_message: string | null
        created_at: string
        trigger_type: TriggerType
      }
    | undefined

  const lastSuccessfulRun = (runs ?? []).find((run) => run.status === 'success')
  const latestManualSuccess = (runs ?? []).find(
    (run) => run.status === 'success' && run.trigger_type === 'manual'
  )
  const latestKeywordCreatedAt = keywords.reduce<string | null>((latest, keyword) => {
    if (!latest || keyword.created_at > latest) return keyword.created_at
    return latest
  }, null)
  const manualRefreshBypass =
    Boolean(latestManualSuccess?.created_at) &&
    Boolean(latestKeywordCreatedAt) &&
    (latestKeywordCreatedAt as string) > (latestManualSuccess?.created_at as string)

  return {
    summary: {
      status: (project.last_tracking_status ?? 'idle') as ProjectTrackingStatus,
      lastTrackedAt: project.last_tracking_run,
      lastSuccessfulRunAt: lastSuccessfulRun?.completed_at ?? project.last_tracking_run,
      lastRunStartedAt: lastRun?.started_at ?? null,
      lastRunCompletedAt: lastRun?.completed_at ?? null,
      lastError: project.last_tracking_error ?? lastRun?.error_message ?? null,
      trackingInterval: project.tracking_interval,
      refreshAvailableAt: latestManualSuccess && !manualRefreshBypass
        ? addMs(latestManualSuccess.created_at, MANUAL_REFRESH_COOLDOWN_MS)
        : null,
    },
    rows,
  }
}

export async function getRankingHistory(
  tenantId: string,
  projectId: string,
  keywordId: string,
  days: number
): Promise<RankingHistoryResponse> {
  const admin = getAdmin()
  const [keywordResult, snapshotsResult] = await Promise.all([
    admin
      .from('keywords')
      .select('id, keyword')
      .eq('id', keywordId)
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    admin
      .from('keyword_ranking_snapshots')
      .select('tracked_at, position, source')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId)
      .eq('keyword_id', keywordId)
      .gte(
        'tracked_at',
        new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString()
      )
      .order('tracked_at', { ascending: true }),
  ])

  if (keywordResult.error) throw new Error(keywordResult.error.message)
  if (!keywordResult.data) throw new Error('Keyword nicht gefunden.')
  if (snapshotsResult.error) throw new Error(snapshotsResult.error.message)

  return {
    keyword: {
      id: keywordResult.data.id,
      keyword: keywordResult.data.keyword,
    },
    summary: {},
    series: [
      {
        label: 'Eigene Domain',
        domain: null,
        color: '#2563eb',
        points: (snapshotsResult.data ?? []).map((snapshot) => ({
          trackedAt: snapshot.tracked_at,
          position:
            typeof snapshot.position === 'number'
              ? Number(snapshot.position.toFixed(2))
              : snapshot.position != null
                ? Number(snapshot.position)
                : null,
          domain: null,
          source: snapshot.source ?? null,
        })),
      },
    ],
  }
}

export async function listDueProjects() {
  const admin = getAdmin()
  const { data, error } = await admin
    .from('keyword_projects')
    .select('id, tenant_id, tracking_interval, last_tracking_run, status')
    .eq('status', 'active')
    .order('last_tracking_run', { ascending: true, nullsFirst: true })
    .limit(CRON_BATCH_LIMIT * 4)

  if (error) throw new Error(error.message)

  const activeProjects = (data ?? []) as Array<{
    id: string
    tenant_id: string
    tracking_interval: 'daily' | 'weekly'
    last_tracking_run: string | null
    status: 'active' | 'inactive'
  }>

  // Reset stuck runs (older than 30 min in queued/running) so they don't block forever
  const stuckCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  await admin
    .from('keyword_ranking_runs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: 'Timeout: Run wurde automatisch zurückgesetzt.',
    })
    .in('status', ['queued', 'running'])
    .lt('created_at', stuckCutoff)

  const { data: runningRuns, error: runsError } = await admin
    .from('keyword_ranking_runs')
    .select('project_id')
    .in('status', ['queued', 'running'])

  if (runsError) throw new Error(runsError.message)

  const blockedProjects = new Set((runningRuns ?? []).map((run) => run.project_id))
  const now = Date.now()

  return activeProjects
    .filter((project) => {
      if (blockedProjects.has(project.id)) return false
      if (!project.last_tracking_run) return true

      const lastRunAt = new Date(project.last_tracking_run).getTime()
      const thresholdMs =
        project.tracking_interval === 'weekly'
          ? 7 * 24 * 60 * 60 * 1000
          : 24 * 60 * 60 * 1000

      return now - lastRunAt >= thresholdMs
    })
    .slice(0, CRON_BATCH_LIMIT)
}

export async function cleanupOldRankingData() {
  const admin = getAdmin()
  const threshold = new Date(
    Date.now() - SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  const [{ error: snapshotsError }, { error: runsError }] = await Promise.all([
    admin.from('keyword_ranking_snapshots').delete().lt('tracked_at', threshold),
    admin.from('keyword_ranking_runs').delete().lt('created_at', threshold),
  ])

  if (snapshotsError) throw new Error(snapshotsError.message)
  if (runsError) throw new Error(runsError.message)

  return { deletedBefore: threshold }
}
