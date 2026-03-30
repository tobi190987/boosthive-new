'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  BarChart3,
  AlertCircle,
  ArrowLeft,
  Clock3,
  ExternalLink,
  Globe,
  Link2,
  Loader2,
  Minus,
  Plus,
  RefreshCcw,
  Search,
  Settings,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trash2,
  Unlink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KeywordProject {
  id: string
  name: string
  target_domain: string
  language_code: string
  country_code: string
  tracking_interval?: 'daily' | 'weekly'
  status: 'active' | 'inactive'
  created_at: string
  keyword_count: number
  competitor_count: number
  last_tracking_run: string | null
}

interface Keyword {
  id: string
  keyword: string
  created_at: string
}

interface Competitor {
  id: string
  domain: string
  created_at: string
}

interface SuggestedKeyword {
  keyword: string
  reason: string
}

interface SuggestedCompetitor {
  domain: string
  reason: string
}

interface ProjectSuggestionsResponse {
  source: 'anthropic' | 'fallback'
  page: {
    url: string
    title: string
  }
  keywords: SuggestedKeyword[]
  competitors: SuggestedCompetitor[]
}

type GscStatus = 'connected' | 'expired' | 'revoked' | 'not_connected'

interface GscConnection {
  id: string
  project_id: string
  google_email: string
  selected_property: string | null
  status: 'connected' | 'expired' | 'revoked'
  connected_at: string
  token_expires_at?: string
}

interface GscProperty {
  siteUrl: string
  permissionLevel: string
}

function formatGscPermissionLevel(permissionLevel: string): string {
  switch (permissionLevel) {
    case 'siteOwner':
      return 'Eigentuemer'
    case 'siteFullUser':
      return 'Vollzugriff'
    case 'siteRestrictedUser':
      return 'Eingeschraenkt'
    case 'siteUnverifiedUser':
      return 'Nicht verifiziert'
    default:
      return permissionLevel
  }
}

type RankingRunStatus = 'idle' | 'queued' | 'running' | 'success' | 'failed'

interface RankingsSummary {
  status?: RankingRunStatus
  lastTrackedAt?: string | null
  lastSuccessfulRunAt?: string | null
  lastRunStartedAt?: string | null
  lastRunCompletedAt?: string | null
  lastError?: string | null
  trackingInterval?: 'daily' | 'weekly' | null
  refreshAvailableAt?: string | null
}

interface RankingRow {
  keywordId: string
  keyword: string
  currentPosition: number | null
  previousPosition?: number | null
  delta?: number | null
  lastTrackedAt?: string | null
  bestUrl?: string | null
}

interface RankingsResponse {
  summary?: RankingsSummary
  rows?: RankingRow[]
}

interface RankingHistoryPoint {
  trackedAt: string
  position: number | null
  domain?: string | null
  source?: string | null
}

interface RankingHistorySeries {
  label: string
  domain?: string | null
  color?: string | null
  points: RankingHistoryPoint[]
}

interface RankingHistoryResponse {
  keyword?: { id: string; keyword: string }
  summary?: Record<string, never>
  series?: RankingHistorySeries[]
}

type View =
  | { type: 'list' }
  | { type: 'detail'; projectId: string }

type WorkspaceRole = 'admin' | 'member'

const PROJECT_LIMIT = 5
const KEYWORD_LIMIT = 50
const COMPETITOR_LIMIT = 5

const LANGUAGES = [
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Francais' },
  { code: 'es', label: 'Espanol' },
  { code: 'it', label: 'Italiano' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'pt', label: 'Portugues' },
  { code: 'pl', label: 'Polski' },
]

const COUNTRIES = [
  { code: 'DE', label: 'Deutschland' },
  { code: 'AT', label: 'Oesterreich' },
  { code: 'CH', label: 'Schweiz' },
  { code: 'US', label: 'USA' },
  { code: 'GB', label: 'Grossbritannien' },
  { code: 'FR', label: 'Frankreich' },
  { code: 'ES', label: 'Spanien' },
  { code: 'IT', label: 'Italien' },
  { code: 'NL', label: 'Niederlande' },
  { code: 'PL', label: 'Polen' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(value: string) {
  return new Date(value).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatRelativeTime(value: string | null | undefined) {
  if (!value) return 'Noch nie'

  const target = new Date(value).getTime()
  if (Number.isNaN(target)) return formatDate(value)

  const diffMs = target - Date.now()
  const diffMinutes = Math.round(diffMs / 60000)
  const absMinutes = Math.abs(diffMinutes)

  if (absMinutes < 1) return 'Gerade eben'
  if (absMinutes < 60) return diffMinutes >= 0 ? `in ${absMinutes} Min.` : `vor ${absMinutes} Min.`

  const absHours = Math.round(absMinutes / 60)
  if (absHours < 24) return diffMinutes >= 0 ? `in ${absHours} Std.` : `vor ${absHours} Std.`

  const absDays = Math.round(absHours / 24)
  return diffMinutes >= 0 ? `in ${absDays} Tagen` : `vor ${absDays} Tagen`
}

function formatPosition(position: number | null | undefined) {
  if (position == null) return 'Keine Daten'
  if (position > 100) return 'Nicht gefunden'
  const hasDecimals = Number(position) % 1 !== 0
  const formatted = Number(position)
    .toFixed(hasDecimals ? 2 : 0)
    .replace('.', ',')
  return `#${formatted}`
}

function getDeltaTone(delta: number | null | undefined) {
  if (delta == null || delta === 0) {
    return {
      label: 'Kein Vergleich',
      className: 'bg-slate-100 dark:bg-[#1e2635] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#252d3a]',
      icon: Minus,
    }
  }

  if (delta < 0) {
    return {
      label: `${Math.abs(delta)} besser`,
      className: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50',
      icon: TrendingUp,
    }
  }

  return {
    label: `${delta} schlechter`,
    className: 'bg-red-50 text-red-700 hover:bg-red-50',
    icon: TrendingDown,
  }
}

function formatDelta(delta: number | null | undefined) {
  if (delta == null) return 'Neu'
  if (delta === 0) return '0'
  return delta < 0 ? `+${Math.abs(delta)}` : `-${delta}`
}

function normalizeDomain(raw: string): string {
  let d = raw.trim()
  d = d.replace(/^https?:\/\//, '')
  d = d.replace(/^www\./, '')
  d = d.replace(/\/+$/, '')
  return d.toLowerCase()
}

function isValidDomain(d: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const API_BASE = '/api/tenant/keywords/projects'

class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(body.error || `Request failed (${res.status})`, res.status)
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface KeywordProjectsWorkspaceProps {
  role: WorkspaceRole
  initialProjectId?: string | null
  initialTab?: string | null
}

function buildKeywordProjectUrl(projectId: string, tab: string) {
  if (tab === 'rankings') {
    return `/tools/keywords/${projectId}/rankings`
  }

  const params = new URLSearchParams({
    project: projectId,
    tab,
  })
  return `/tools/keywords?${params.toString()}`
}

export function KeywordProjectsWorkspace({
  role,
  initialProjectId = null,
  initialTab = null,
}: KeywordProjectsWorkspaceProps) {
  const [view, setView] = useState<View>(() => {
    if (initialProjectId) {
      return { type: 'detail', projectId: initialProjectId }
    }

    if (typeof window === 'undefined') return { type: 'list' }

    const params = new URLSearchParams(window.location.search)
    const projectId = params.get('project')
    return projectId ? { type: 'detail', projectId } : { type: 'list' }
  })

  return (
    <div className="space-y-6">
      {view.type === 'list' && (
        <ProjectList
          role={role}
          onOpenProject={(id) => {
            setView({ type: 'detail', projectId: id })
            if (typeof window !== 'undefined') {
              window.history.replaceState({}, '', buildKeywordProjectUrl(id, 'rankings'))
            }
          }}
        />
      )}
      {view.type === 'detail' && (
        <ProjectDetail
          role={role}
          projectId={view.projectId}
          initialTab={initialProjectId === view.projectId ? initialTab : null}
          onBack={() => {
            setView({ type: 'list' })
            if (typeof window !== 'undefined') {
              window.history.replaceState({}, '', '/tools/keywords')
            }
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Project List View
// ---------------------------------------------------------------------------

interface ProjectListProps {
  role: WorkspaceRole
  onOpenProject: (id: string) => void
}

function ProjectList({ role, onOpenProject }: ProjectListProps) {
  const { toast } = useToast()
  const [projects, setProjects] = useState<KeywordProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await apiFetch<{ projects: KeywordProject[] }>(API_BASE)
      setProjects(data.projects)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Projekte konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const isAdmin = role === 'admin'
  const atLimit = projects.length >= PROJECT_LIMIT

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="rounded-2xl border border-slate-100 dark:border-[#252d3a]">
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-36" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <Alert variant="destructive" className="rounded-2xl">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Fehler</AlertTitle>
        <AlertDescription className="flex items-center justify-between">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={loadProjects}>
            Erneut versuchen
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
            SEO-Analyse
          </p>
          <h1 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">Keywordranking</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Verwalte Keyword-Projekte als Unterbereich deiner SEO-Analyse.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            variant="outline"
            className="rounded-full border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] px-3 py-1 text-xs text-slate-600 dark:text-slate-300"
          >
            {projects.length}/{PROJECT_LIMIT} Projekte
          </Badge>
          {isAdmin && (
            <Button
              onClick={() => setCreateOpen(true)}
              disabled={atLimit}
              className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
              aria-label="Neues Keyword-Projekt erstellen"
            >
              <Plus className="mr-2 h-4 w-4" />
              Neues Projekt
            </Button>
          )}
        </div>
      </div>

      {/* Limit warning */}
      {atLimit && isAdmin && (
        <Alert className="rounded-2xl border-amber-200 bg-amber-50">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">Projektlimit erreicht</AlertTitle>
          <AlertDescription className="text-amber-700">
            Du hast das Maximum von {PROJECT_LIMIT} Projekten erreicht. Lösche ein bestehendes Projekt oder kontaktiere den Support für ein Upgrade.
          </AlertDescription>
        </Alert>
      )}

      {/* Empty state */}
      {projects.length === 0 ? (
        <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
          <CardContent className="flex flex-col items-center gap-5 px-6 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
              <Search className="h-7 w-7 text-blue-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">Noch keine Projekte</h2>
              <p className="max-w-md text-sm leading-7 text-slate-600 dark:text-slate-300">
                Erstelle dein erstes Keyword-Projekt, um Rankings für eine Domain zu tracken und mit Wettbewerbern zu vergleichen.
              </p>
            </div>
            {isAdmin && (
              <Button
                onClick={() => setCreateOpen(true)}
                className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
              >
                <Plus className="mr-2 h-4 w-4" />
                Erstes Projekt erstellen
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Project cards */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => onOpenProject(project.id)}
              className="text-left"
              aria-label={`Projekt ${project.name} öffnen`}
            >
              <Card
                className={cn(
                  'rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] transition-all hover:border-blue-600/30 hover:shadow-md',
                  project.status === 'inactive' && 'opacity-60'
                )}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                      {project.name}
                    </CardTitle>
                    <Badge
                      className={cn(
                        'shrink-0 rounded-full text-xs',
                        project.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50'
                          : 'bg-slate-100 dark:bg-[#1e2635] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#252d3a]'
                      )}
                    >
                      {project.status === 'active' ? 'Aktiv' : 'Inaktiv'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <Globe className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                    <span className="truncate">{project.target_domain}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                    <span>
                      {LANGUAGES.find((l) => l.code === project.language_code)?.label ?? project.language_code}
                    </span>
                    <span>
                      {COUNTRIES.find((c) => c.code === project.country_code)?.label ?? project.country_code}
                    </span>
                  </div>
                  <Separator className="bg-slate-100 dark:bg-[#1e2635]" />
                  <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                    <span>{project.keyword_count} Keywords</span>
                    <span>{project.competitor_count} Wettbewerber</span>
                  </div>
                  {project.last_tracking_run && (
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      Letzter Lauf: {formatDate(project.last_tracking_run)}
                    </p>
                  )}
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}

      {/* Create project dialog */}
      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setCreateOpen(false)
          loadProjects()
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create Project Dialog
// ---------------------------------------------------------------------------

interface CreateProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

function CreateProjectDialog({ open, onOpenChange, onCreated }: CreateProjectDialogProps) {
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [language, setLanguage] = useState('de')
  const [country, setCountry] = useState('DE')
  const [saving, setSaving] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)

  function reset() {
    setName('')
    setDomain('')
    setLanguage('de')
    setCountry('DE')
    setFieldError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFieldError(null)

    const trimmedName = name.trim()
    if (!trimmedName) {
      setFieldError('Bitte einen Projektnamen eingeben.')
      return
    }

    const normalized = normalizeDomain(domain)
    if (!isValidDomain(normalized)) {
      setFieldError('Bitte eine gültige Domain eingeben (z. B. example.de).')
      return
    }

    try {
      setSaving(true)
      await apiFetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          target_domain: normalized,
          language_code: language,
          country_code: country,
        }),
      })
      toast({ title: 'Projekt erstellt', description: `"${trimmedName}" wurde angelegt.` })
      reset()
      onCreated()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Projekt konnte nicht erstellt werden.'
      setFieldError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neues Keyword-Projekt</DialogTitle>
          <DialogDescription>
            Erstelle ein Projekt, um Keywords und Wettbewerber für eine Domain zu tracken.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Projektname</Label>
            <Input
              id="project-name"
              placeholder="z. B. Kunde Mueller GmbH"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="target-domain">Ziel-Domain</Label>
            <Input
              id="target-domain"
              placeholder="example.de"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              disabled={saving}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">Ohne https:// oder www.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="language">Sprache</Label>
              <Select value={language} onValueChange={setLanguage} disabled={saving}>
                <SelectTrigger id="language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Land/Region</Label>
              <Select value={country} onValueChange={setCountry} disabled={saving}>
                <SelectTrigger id="country">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {fieldError && (
            <Alert variant="destructive" className="rounded-xl">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{fieldError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="rounded-full"
            >
              Abbrechen
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Erstellen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Project Detail View
// ---------------------------------------------------------------------------

interface ProjectDetailProps {
  role: WorkspaceRole
  projectId: string
  initialTab?: string | null
  onBack: () => void
}

function ProjectDetail({ role, projectId, initialTab = null, onBack }: ProjectDetailProps) {
  const { toast } = useToast()
  const [project, setProject] = useState<KeywordProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState(() => {
    if (initialTab) return initialTab
    if (typeof window === 'undefined') return 'rankings'

    const params = new URLSearchParams(window.location.search)
    const tab = params.get('tab')
    const projectFromUrl = params.get('project')
    return projectFromUrl === projectId && tab ? tab : 'rankings'
  })

  const loadProject = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await apiFetch<{ project: KeywordProject }>(`${API_BASE}/${projectId}`)
      setProject(data.project)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Projekt konnte nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    loadProject()
  }, [loadProject])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.history.replaceState({}, '', buildKeywordProjectUrl(projectId, activeTab))
  }, [activeTab, projectId])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={onBack} className="rounded-full">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurueck
        </Button>
        <Alert variant="destructive" className="rounded-2xl">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Fehler</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{error ?? 'Projekt nicht gefunden.'}</span>
            <Button variant="outline" size="sm" onClick={loadProject}>
              Erneut versuchen
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full" aria-label="Zurueck zur Projektliste">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold text-slate-950 dark:text-slate-50">{project.name}</h1>
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Globe className="h-3.5 w-3.5" />
              <span>{project.target_domain}</span>
              <span className="text-slate-300">|</span>
              <span>
                {LANGUAGES.find((l) => l.code === project.language_code)?.label ?? project.language_code}
              </span>
              <span className="text-slate-300">|</span>
              <span>
                {COUNTRIES.find((c) => c.code === project.country_code)?.label ?? project.country_code}
              </span>
            </div>
          </div>
        </div>
        <Badge
          className={cn(
            'w-fit rounded-full text-xs',
            project.status === 'active'
              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50'
              : 'bg-slate-100 dark:bg-[#1e2635] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#252d3a]'
          )}
        >
          {project.status === 'active' ? 'Aktiv' : 'Inaktiv'}
        </Badge>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-full bg-slate-50 dark:bg-[#151c28] p-1">
          <TabsTrigger value="rankings" className="rounded-full data-[state=active]:bg-white">
            <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
            Rankings
          </TabsTrigger>
          <TabsTrigger value="keywords" className="rounded-full data-[state=active]:bg-white">
            Keywords
          </TabsTrigger>
          <TabsTrigger value="competitors" className="rounded-full data-[state=active]:bg-white">
            Wettbewerber
          </TabsTrigger>
          <TabsTrigger value="settings" className="rounded-full data-[state=active]:bg-white">
            <Settings className="mr-1.5 h-3.5 w-3.5" />
            Einstellungen
          </TabsTrigger>
          <TabsTrigger value="integrations" className="rounded-full data-[state=active]:bg-white">
            <Link2 className="mr-1.5 h-3.5 w-3.5" />
            Integrationen
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rankings" className="mt-4">
          <RankingsTab
            project={project}
            projectId={projectId}
            role={role}
            onOpenIntegrations={() => setActiveTab('integrations')}
          />
        </TabsContent>

        <TabsContent value="keywords" className="mt-4">
          <KeywordsTab projectId={projectId} targetDomain={project.target_domain} />
        </TabsContent>

        <TabsContent value="competitors" className="mt-4">
          <CompetitorsTab projectId={projectId} targetDomain={project.target_domain} />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <SettingsTab
            project={project}
            role={role}
            onUpdated={loadProject}
            onDeleted={onBack}
          />
        </TabsContent>

        <TabsContent value="integrations" className="mt-4">
          <IntegrationsTab projectId={projectId} role={role} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rankings Tab
// ---------------------------------------------------------------------------

interface RankingsTabProps {
  project: KeywordProject
  projectId: string
  role: WorkspaceRole
  onOpenIntegrations: () => void
}

function RankingsTab({ project, projectId, role, onOpenIntegrations }: RankingsTabProps) {
  const { toast } = useToast()
  const isAdmin = role === 'admin'
  const [rows, setRows] = useState<RankingRow[]>([])
  const [summary, setSummary] = useState<RankingsSummary | null>(null)
  const [connection, setConnection] = useState<GscConnection | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [backendUnavailable, setBackendUnavailable] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const [selectedRow, setSelectedRow] = useState<RankingRow | null>(null)
  const [historyRange, setHistoryRange] = useState<'30' | '90'>('30')
  const [historySeries, setHistorySeries] = useState<RankingHistorySeries[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyUnavailable, setHistoryUnavailable] = useState(false)
  const rankingsBase = `${API_BASE}/${projectId}/rankings`
  const gscStatusUrl = `${API_BASE}/${projectId}/gsc/status`

  const loadRankings = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      setBackendUnavailable(false)

      const [connectionResult, rankingsResult] = await Promise.allSettled([
        apiFetch<{ connection: GscConnection | null }>(gscStatusUrl),
        apiFetch<RankingsResponse>(rankingsBase),
      ])

      if (connectionResult.status === 'fulfilled') {
        setConnection(connectionResult.value.connection)
      } else {
        throw connectionResult.reason
      }

      if (rankingsResult.status === 'fulfilled') {
        setRows(rankingsResult.value.rows ?? [])
        setSummary(rankingsResult.value.summary ?? null)
      } else if (
        rankingsResult.reason instanceof ApiError &&
        rankingsResult.reason.status === 404
      ) {
        setBackendUnavailable(true)
        setRows([])
        setSummary(null)
      } else {
        throw rankingsResult.reason
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ranking-Daten konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [gscStatusUrl, rankingsBase])

  useEffect(() => {
    loadRankings()
  }, [loadRankings])

  const loadHistory = useCallback(
    async (row: RankingRow, range: '30' | '90') => {
      try {
        setHistoryLoading(true)
        setHistoryError(null)
        setHistoryUnavailable(false)

        const params = new URLSearchParams({
          keyword_id: row.keywordId,
          days: range,
        })

        const data = await apiFetch<RankingHistoryResponse>(`${rankingsBase}/history?${params.toString()}`)
        setHistorySeries(data.series ?? [])
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setHistoryUnavailable(true)
          setHistorySeries([])
          return
        }

        setHistoryError(
          err instanceof Error ? err.message : 'Verlauf konnte nicht geladen werden.'
        )
      } finally {
        setHistoryLoading(false)
      }
    },
    [rankingsBase]
  )

  useEffect(() => {
    if (!selectedRow) return
    loadHistory(selectedRow, historyRange)
  }, [historyRange, loadHistory, selectedRow])

  async function handleRefresh() {
    try {
      setRefreshing(true)
      await apiFetch(`${rankingsBase}/refresh`, { method: 'POST' })
      toast({
        title: 'Tracking gestartet',
        description: 'Die Aktualisierung wurde angestossen und erscheint nach Abschluss automatisch im Dashboard.',
      })
      loadRankings()
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        toast({
          title: 'Backend noch nicht bereit',
          description: 'Der Refresh-Endpunkt für PROJ-27 ist noch nicht implementiert.',
          variant: 'destructive',
        })
        return
      }

      toast({
        title: 'Fehler',
        description:
          err instanceof Error ? err.message : 'Tracking konnte nicht gestartet werden.',
        variant: 'destructive',
      })
    } finally {
      setRefreshing(false)
    }
  }

  function openDetails(row: RankingRow) {
    setSelectedRow(row)
    setHistoryRange('30')
    setHistorySeries([])
    setHistoryError(null)
    setHistoryUnavailable(false)
  }

  const effectiveLastTrackedAt =
    summary?.lastTrackedAt ?? summary?.lastSuccessfulRunAt ?? project.last_tracking_run ?? null
  const status = summary?.status ?? (effectiveLastTrackedAt ? 'success' : 'idle')
  const gscReady = Boolean(connection && connection.status === 'connected' && connection.selected_property)

  if (loading) {
    return (
      <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28]">
        <CardContent className="space-y-4 p-6">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive" className="rounded-2xl">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Fehler</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={loadRankings}>
            Erneut versuchen
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (!gscReady) {
    return (
      <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28]">
        <CardContent className="flex flex-col items-center gap-5 px-6 py-14 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 dark:bg-[#151c28]">
            <Link2 className="h-7 w-7 text-slate-400 dark:text-slate-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">
              Search Console noch nicht eingerichtet
            </h2>
            <p className="max-w-xl text-sm leading-7 text-slate-600 dark:text-slate-300">
              Bevor Rankings geladen werden können, braucht dieses Projekt eine verbundene Google-Search-Console-Property.
            </p>
          </div>
          <Button
            onClick={onOpenIntegrations}
            className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
          >
            Zu den Integrationen
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (backendUnavailable) {
    return (
      <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold">Rankings</CardTitle>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Die UI ist vorbereitet, die neuen PROJ-27-Read-Endpunkte fehlen noch.
              </p>
            </div>
            <RankingsStatusBadge status="idle" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="rounded-2xl border-amber-200 bg-amber-50">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800">Backend noch ausstehend</AlertTitle>
            <AlertDescription className="text-amber-700">
              Sobald die Endpunkte fuer `GET /rankings`, `GET /rankings/history` und `POST /rankings/refresh` vorhanden sind, zeigt dieser Tab die Snapshot-Daten direkt an.
            </AlertDescription>
          </Alert>

          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard
              label="Keywords im Projekt"
              value={String(project.keyword_count)}
              hint="Bereits fuer Tracking vorbereitet"
            />
            <MetricCard
              label="Tracking-Intervall"
              value={project.tracking_interval === 'weekly' ? 'Wöchentlich' : 'Täglich'}
              hint="Kann im Einstellungen-Tab angepasst werden"
            />
            <MetricCard
              label="Letzter Lauf"
              value={effectiveLastTrackedAt ? formatRelativeTime(effectiveLastTrackedAt) : 'Ausstehend'}
              hint={effectiveLastTrackedAt ? formatDate(effectiveLastTrackedAt) : 'Noch kein Snapshot'}
            />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="space-y-4">
        <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28]">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-base font-semibold">Rankings</CardTitle>
                  <RankingsStatusBadge status={status} />
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock3 className="h-3.5 w-3.5" />
                    Zuletzt aktualisiert: {effectiveLastTrackedAt ? formatRelativeTime(effectiveLastTrackedAt) : 'Ausstehend'}
                  </span>
                  {summary?.trackingInterval && (
                    <span>Intervall: {summary.trackingInterval === 'daily' ? 'Täglich' : 'Wöchentlich'}</span>
                  )}
                  {connection?.selected_property && (
                    <span className="truncate">Property: {connection.selected_property}</span>
                  )}
                </div>
              </div>
              {isAdmin && (
                <Button
                  onClick={handleRefresh}
                  disabled={refreshing || status === 'running' || status === 'queued'}
                  className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
                >
                  {refreshing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="mr-2 h-4 w-4" />
                  )}
                  Jetzt aktualisieren
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard
                label="Getrackte Keywords"
                value={String(rows.length)}
                hint={rows.length > 0 ? 'Aktuelle Snapshot-Zeilen' : 'Noch keine Messwerte'}
              />
              <MetricCard
                label="Bestes Ranking"
                value={
                  rows
                    .map((row) => row.currentPosition)
                    .filter((value): value is number => value != null)
                    .sort((a, b) => a - b)[0] != null
                    ? formatPosition(
                        rows
                          .map((row) => row.currentPosition)
                          .filter((value): value is number => value != null)
                          .sort((a, b) => a - b)[0]
                      )
                    : 'Keine Daten'
                }
                hint="Niedrigere Position ist besser"
              />
              <MetricCard
                label="Tracking-Intervall"
                value={summary?.trackingInterval === 'weekly' ? 'Wöchentlich' : 'Täglich'}
                hint="Steuert den automatischen Cron-Lauf"
              />
            </div>

            {summary?.lastError && (
              <Alert className="rounded-2xl border-amber-200 bg-amber-50">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800">Letzter Lauf mit Hinweis</AlertTitle>
                <AlertDescription className="text-amber-700">
                  {summary.lastError}
                </AlertDescription>
              </Alert>
            )}

            {rows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] px-6 py-12 text-center">
                <BarChart3 className="mx-auto h-10 w-10 text-blue-600" />
                <h3 className="mt-4 text-lg font-semibold text-slate-950 dark:text-slate-50">
                  Erstes Tracking ausstehend
                </h3>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-7 text-slate-600 dark:text-slate-300">
                  Sobald der erste Snapshot gespeichert wurde, erscheinen hier Positionen, Deltas und der Detailverlauf je Keyword.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-100 dark:border-[#252d3a]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-white dark:bg-[#151c28]">
                      <TableHead>Keyword</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Delta</TableHead>
                      <TableHead className="hidden md:table-cell">Aktualisiert</TableHead>
                      <TableHead className="hidden lg:table-cell">Top-URL</TableHead>
                      <TableHead className="w-24 text-right">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.keywordId}>
                        <TableCell className="font-medium text-slate-900 dark:text-slate-100">{row.keyword}</TableCell>
                        <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                          {formatPosition(row.currentPosition)}
                        </TableCell>
                        <TableCell>
                          <PositionDeltaBadge delta={row.delta} />
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-slate-500 dark:text-slate-400">
                          {row.lastTrackedAt ? formatRelativeTime(row.lastTrackedAt) : 'Ausstehend'}
                        </TableCell>
                        <TableCell className="hidden max-w-[260px] truncate lg:table-cell text-slate-500 dark:text-slate-400">
                          {row.bestUrl ?? 'Keine URL'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full"
                            onClick={() => openDetails(row)}
                          >
                            Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Sheet
        open={selectedRow !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRow(null)
            setHistorySeries([])
            setHistoryError(null)
            setHistoryUnavailable(false)
          }
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto border-l-slate-100 p-0 sm:max-w-2xl">
          {selectedRow && (
            <div className="flex h-full flex-col">
              <SheetHeader className="border-b border-slate-100 dark:border-[#252d3a] px-6 py-5">
                <SheetTitle>{selectedRow.keyword}</SheetTitle>
                <SheetDescription>
                  Verlauf fuer {historyRange} Tage mit aktueller Position {formatPosition(selectedRow.currentPosition)}.
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-5 p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <PositionDeltaBadge delta={selectedRow.delta} />
                  <Badge variant="outline" className="rounded-full border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] text-slate-600 dark:text-slate-300">
                    Letzte Messung: {selectedRow.lastTrackedAt ? formatDate(selectedRow.lastTrackedAt) : 'Ausstehend'}
                  </Badge>
                  <div className="ml-auto flex rounded-full bg-slate-50 dark:bg-[#151c28] p-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={cn(
                        'rounded-full px-4',
                        historyRange === '30' && 'bg-white dark:bg-[#151c28] shadow-sm'
                      )}
                      onClick={() => setHistoryRange('30')}
                    >
                      30 Tage
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={cn(
                        'rounded-full px-4',
                        historyRange === '90' && 'bg-white dark:bg-[#151c28] shadow-sm'
                      )}
                      onClick={() => setHistoryRange('90')}
                    >
                      90 Tage
                    </Button>
                  </div>
                </div>

                {historyLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-[260px] w-full rounded-2xl" />
                    <Skeleton className="h-16 w-full rounded-2xl" />
                  </div>
                ) : historyError ? (
                  <Alert variant="destructive" className="rounded-2xl">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Fehler</AlertTitle>
                    <AlertDescription>{historyError}</AlertDescription>
                  </Alert>
                ) : historyUnavailable ? (
                  <Alert className="rounded-2xl border-amber-200 bg-amber-50">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertTitle className="text-amber-800">Verlauf folgt mit Backend</AlertTitle>
                    <AlertDescription className="text-amber-700">
                      Der History-Endpunkt für PROJ-27 ist noch nicht vorhanden. Das Sheet ist bereits vorbereitet und verwendet die Live-Daten, sobald der Read-Endpoint geliefert wird.
                    </AlertDescription>
                  </Alert>
                ) : historySeries.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] px-6 py-12 text-center">
                    <Search className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                      Fuer dieses Keyword liegen in dem Zeitraum noch keine Verlaufspunkte vor.
                    </p>
                  </div>
                ) : (
                  <>
                    <RankingTrendChart
                      title="Positionsverlauf"
                      description="Je niedriger die Zahl, desto besser die Google-Position."
                      series={historySeries}
                    />

                    <MetricCard
                      label="Aktuelle Position"
                      value={formatPosition(selectedRow.currentPosition)}
                      hint="Aus dem neuesten Snapshot"
                    />
                  </>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

function RankingsStatusBadge({ status }: { status: RankingRunStatus }) {
  switch (status) {
    case 'running':
      return (
        <Badge className="rounded-full bg-sky-50 text-sky-700 hover:bg-sky-50">
          Laufend
        </Badge>
      )
    case 'queued':
      return (
        <Badge className="rounded-full bg-slate-100 dark:bg-[#1e2635] text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-[#252d3a]">
          Geplant
        </Badge>
      )
    case 'failed':
      return (
        <Badge className="rounded-full bg-red-50 text-red-700 hover:bg-red-50">
          Fehler
        </Badge>
      )
    case 'success':
      return (
        <Badge className="rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
          Bereit
        </Badge>
      )
    case 'idle':
    default:
      return (
        <Badge className="rounded-full bg-slate-100 dark:bg-[#1e2635] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#252d3a]">
          Ausstehend
        </Badge>
      )
  }
}

function PositionDeltaBadge({ delta }: { delta: number | null | undefined }) {
  const tone = getDeltaTone(delta)
  const Icon = tone.icon

  return (
    <Badge className={cn('rounded-full', tone.className)}>
      <Icon className="mr-1 h-3.5 w-3.5" />
      {formatDelta(delta)}
    </Badge>
  )
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="rounded-xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">{value}</p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
  )
}

function RankingTrendChart({
  title,
  description,
  series,
}: {
  title: string
  description: string
  series: RankingHistorySeries[]
}) {
  const width = 760
  const height = 260
  const padding = 28
  const yMin = 1
  const yMax = 100

  const maxLength = Math.max(...series.map((item) => item.points.length), 0)
  const ticks = [1, 10, 25, 50, 75, 100]

  function xForIndex(index: number, count: number) {
    if (count <= 1) return width / 2
    return padding + (index / (count - 1)) * (width - padding * 2)
  }

  function yForPosition(position: number) {
    const clamped = Math.min(Math.max(position, yMin), yMax)
    return padding + ((clamped - yMin) / (yMax - yMin)) * (height - padding * 2)
  }

  function buildPath(points: RankingHistoryPoint[]) {
    let path = ''
    let hasOpenSegment = false

    points.forEach((point, index) => {
      if (point.position == null) {
        hasOpenSegment = false
        return
      }

      const x = xForIndex(index, points.length)
      const y = yForPosition(point.position)
      path += `${hasOpenSegment ? ' L' : 'M'} ${x} ${y}`
      hasOpenSegment = true
    })

    return path.trim()
  }

  return (
    <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28]">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] p-4">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-[260px] w-full"
            role="img"
            aria-label={title}
          >
            {ticks.map((tick) => {
              const y = yForPosition(tick)
              return (
                <g key={tick}>
                  <line
                    x1={padding}
                    x2={width - padding}
                    y1={y}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeDasharray="4 4"
                  />
                  <text x={8} y={y + 4} fontSize="11" fill="#64748b">
                    {tick}
                  </text>
                </g>
              )
            })}

            {series.map((item, index) => {
              const color = item.color ?? ['#2563eb', '#f97316', '#2563eb', '#dc2626'][index % 4]
              return (
                <g key={`${item.label}-${index}`}>
                  <path
                    d={buildPath(item.points)}
                    fill="none"
                    stroke={color}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {item.points.map((point, pointIndex) => {
                    if (point.position == null) return null
                    return (
                      <circle
                        key={`${item.label}-${pointIndex}`}
                        cx={xForIndex(pointIndex, item.points.length)}
                        cy={yForPosition(point.position)}
                        r="4"
                        fill={color}
                      />
                    )
                  })}
                </g>
              )
            })}
          </svg>
        </div>

        <div className="flex flex-wrap gap-2">
          {series.map((item, index) => {
            const color = item.color ?? ['#2563eb', '#f97316', '#2563eb', '#dc2626'][index % 4]
            return (
              <div
                key={`${item.label}-${index}-legend`}
                className="inline-flex items-center gap-2 rounded-full border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                {item.label}
              </div>
            )
          })}
        </div>

        {maxLength > 0 && (
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{series[0]?.points[0]?.trackedAt ? formatDate(series[0].points[0].trackedAt) : ''}</span>
            <span>
              {series[0]?.points[maxLength - 1]?.trackedAt
                ? formatDate(series[0].points[maxLength - 1].trackedAt)
                : ''}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Keywords Tab
// ---------------------------------------------------------------------------

interface KeywordsTabProps {
  projectId: string
  targetDomain: string
}

function KeywordsTab({ projectId, targetDomain }: KeywordsTabProps) {
  const { toast } = useToast()
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newKeyword, setNewKeyword] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<SuggestedKeyword[]>([])
  const [suggestionSource, setSuggestionSource] = useState<'anthropic' | 'fallback' | null>(null)
  const [suggestionUrl, setSuggestionUrl] = useState<string | null>(null)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [addingSuggestedKeyword, setAddingSuggestedKeyword] = useState<string | null>(null)

  const loadKeywords = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await apiFetch<{ keywords: Keyword[] }>(
        `${API_BASE}/${projectId}/keywords`
      )
      setKeywords(data.keywords)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Keywords konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    loadKeywords()
  }, [loadKeywords])

  async function addKeyword(kw: string) {
    if (!kw) return

    try {
      setAdding(true)
      await apiFetch(`${API_BASE}/${projectId}/keywords`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: kw }),
      })
      setNewKeyword('')
      toast({ title: 'Keyword hinzugefügt', description: `"${kw}" wurde gespeichert.` })
      setSuggestions((current) => current.filter((item) => item.keyword.toLowerCase() !== kw.toLowerCase()))
      loadKeywords()
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'Keyword konnte nicht hinzugefügt werden.',
        variant: 'destructive',
      })
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const kw = newKeyword.trim()
    if (!kw) return

    try {
      await addKeyword(kw)
    } finally {
      setAdding(false)
    }
  }

  async function loadSuggestions() {
    try {
      setLoadingSuggestions(true)
      const data = await apiFetch<ProjectSuggestionsResponse>(`${API_BASE}/${projectId}/suggestions`)
      setSuggestions(data.keywords)
      setSuggestionSource(data.source)
      setSuggestionUrl(data.page.url)
      if (data.keywords.length === 0) {
        toast({
          title: 'Keine Keyword-Vorschläge gefunden',
          description: 'Auf Basis der aktuellen Domain konnten keine neuen Keywords abgeleitet werden.',
        })
      }
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'Keyword-Vorschläge konnten nicht geladen werden.',
        variant: 'destructive',
      })
    } finally {
      setLoadingSuggestions(false)
    }
  }

  async function handleAddSuggestion(keyword: string) {
    try {
      setAddingSuggestedKeyword(keyword)
      await addKeyword(keyword)
    } finally {
      setAdding(false)
      setAddingSuggestedKeyword(null)
    }
  }

  async function handleDelete(kw: Keyword) {
    try {
      setDeletingId(kw.id)
      await apiFetch(`${API_BASE}/${projectId}/keywords/${kw.id}`, {
        method: 'DELETE',
      })
      toast({ title: 'Keyword gelöscht', description: `"${kw.keyword}" wurde entfernt.` })
      loadKeywords()
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'Keyword konnte nicht gelöscht werden.',
        variant: 'destructive',
      })
    } finally {
      setDeletingId(null)
    }
  }

  const atLimit = keywords.length >= KEYWORD_LIMIT

  if (loading) {
    return (
      <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a]">
        <CardContent className="space-y-3 p-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive" className="rounded-2xl">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Fehler</AlertTitle>
        <AlertDescription>
          {error}
          <Button variant="outline" size="sm" onClick={loadKeywords} className="ml-3">
            Erneut versuchen
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Keywords</CardTitle>
          <Badge
            variant="outline"
            className="rounded-full border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] text-xs text-slate-600 dark:text-slate-300"
          >
            {keywords.length}/{KEYWORD_LIMIT}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add keyword form */}
        <form onSubmit={handleAdd} className="flex gap-2">
          <Input
            placeholder="Keyword eingeben..."
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            disabled={adding || atLimit}
            className="flex-1"
            aria-label="Neues Keyword"
          />
          <Button
            type="submit"
            disabled={adding || atLimit || !newKeyword.trim()}
            className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
          >
            {adding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </form>

        <div className="rounded-xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                <Sparkles className="h-4 w-4 text-blue-600" />
                Keyword-Vorschläge
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Generiere passende Suchbegriffe direkt aus dem Inhalt von {targetDomain}.
              </p>
              {suggestionUrl && (
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Quelle: {suggestionUrl} {suggestionSource === 'anthropic' ? '· KI-gestützt' : '· heuristisch'}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadSuggestions()}
              disabled={loadingSuggestions}
              className="rounded-full"
            >
              {loadingSuggestions ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Vorschläge laden
            </Button>
          </div>

          {suggestions.length > 0 && (
            <div className="mt-4 grid gap-3">
              {suggestions.map((item) => (
                <div
                  key={item.keyword}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{item.keyword}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{item.reason}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleAddSuggestion(item.keyword)}
                    disabled={atLimit || addingSuggestedKeyword === item.keyword}
                    className="shrink-0 rounded-full"
                  >
                    {addingSuggestedKeyword === item.keyword ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    Übernehmen
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {atLimit && (
          <p className="text-xs text-amber-600">
            Keyword-Limit erreicht ({KEYWORD_LIMIT}). Lösche bestehende Keywords, um neue hinzuzufügen.
          </p>
        )}

        {keywords.length === 0 ? (
          <div className="py-8 text-center">
            <Search className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Noch keine Keywords hinzugefügt.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Keyword</TableHead>
                <TableHead className="hidden sm:table-cell">Hinzugefuegt</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keywords.map((kw) => (
                <TableRow key={kw.id}>
                  <TableCell className="font-medium">{kw.keyword}</TableCell>
                  <TableCell className="hidden text-slate-500 dark:text-slate-400 sm:table-cell">
                    {formatDate(kw.created_at)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(kw)}
                      disabled={deletingId === kw.id}
                      className="h-8 w-8 text-slate-400 dark:text-slate-500 hover:text-red-600"
                      aria-label={`Keyword "${kw.keyword}" löschen`}
                    >
                      {deletingId === kw.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Competitors Tab
// ---------------------------------------------------------------------------

interface CompetitorsTabProps {
  projectId: string
  targetDomain: string
}

function CompetitorsTab({ projectId, targetDomain }: CompetitorsTabProps) {
  const { toast } = useToast()
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newDomain, setNewDomain] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<SuggestedCompetitor[]>([])
  const [suggestionSource, setSuggestionSource] = useState<'anthropic' | 'fallback' | null>(null)
  const [suggestionUrl, setSuggestionUrl] = useState<string | null>(null)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [addingSuggestedDomain, setAddingSuggestedDomain] = useState<string | null>(null)

  const loadCompetitors = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await apiFetch<{ competitors: Competitor[] }>(
        `${API_BASE}/${projectId}/competitors`
      )
      setCompetitors(data.competitors)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wettbewerber konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    loadCompetitors()
  }, [loadCompetitors])

  async function addCompetitor(normalized: string) {
    if (!isValidDomain(normalized)) {
      toast({
        title: 'Ungültige Domain',
        description: 'Bitte eine gültige Domain eingeben (z. B. competitor.de).',
        variant: 'destructive',
      })
      return
    }

    const normalizedTarget = normalizeDomain(targetDomain)
    if (normalized === normalizedTarget) {
      toast({
        title: 'Gleiche Domain',
        description: 'Die Wettbewerber-Domain darf nicht mit der Ziel-Domain identisch sein.',
        variant: 'destructive',
      })
      return
    }

    try {
      setAdding(true)
      await apiFetch(`${API_BASE}/${projectId}/competitors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: normalized }),
      })
      setNewDomain('')
      toast({ title: 'Wettbewerber hinzugefügt', description: `"${normalized}" wurde gespeichert.` })
      setSuggestions((current) => current.filter((item) => normalizeDomain(item.domain) !== normalized))
      loadCompetitors()
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'Wettbewerber konnte nicht hinzugefügt werden.',
        variant: 'destructive',
      })
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const normalized = normalizeDomain(newDomain)

    try {
      await addCompetitor(normalized)
    } finally {
      setAdding(false)
    }
  }

  async function loadSuggestions() {
    try {
      setLoadingSuggestions(true)
      const data = await apiFetch<ProjectSuggestionsResponse>(`${API_BASE}/${projectId}/suggestions`)
      setSuggestions(data.competitors)
      setSuggestionSource(data.source)
      setSuggestionUrl(data.page.url)
      if (data.competitors.length === 0) {
        toast({
          title: 'Keine Wettbewerber-Vorschläge gefunden',
          description: 'Die Domain liefert aktuell keine sicheren Wettbewerber-Vorschläge.',
        })
      }
    } catch (err) {
      toast({
        title: 'Fehler',
        description:
          err instanceof Error ? err.message : 'Wettbewerber-Vorschläge konnten nicht geladen werden.',
        variant: 'destructive',
      })
    } finally {
      setLoadingSuggestions(false)
    }
  }

  async function handleAddSuggestion(domain: string) {
    try {
      setAddingSuggestedDomain(domain)
      await addCompetitor(domain)
    } finally {
      setAdding(false)
      setAddingSuggestedDomain(null)
    }
  }

  async function handleDelete(comp: Competitor) {
    try {
      setDeletingId(comp.id)
      await apiFetch(`${API_BASE}/${projectId}/competitors/${comp.id}`, {
        method: 'DELETE',
      })
      toast({ title: 'Wettbewerber gelöscht', description: `"${comp.domain}" wurde entfernt.` })
      loadCompetitors()
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'Wettbewerber konnte nicht gelöscht werden.',
        variant: 'destructive',
      })
    } finally {
      setDeletingId(null)
    }
  }

  const atLimit = competitors.length >= COMPETITOR_LIMIT

  if (loading) {
    return (
      <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a]">
        <CardContent className="space-y-3 p-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive" className="rounded-2xl">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Fehler</AlertTitle>
        <AlertDescription>
          {error}
          <Button variant="outline" size="sm" onClick={loadCompetitors} className="ml-3">
            Erneut versuchen
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Wettbewerber</CardTitle>
          <Badge
            variant="outline"
            className="rounded-full border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] text-xs text-slate-600 dark:text-slate-300"
          >
            {competitors.length}/{COMPETITOR_LIMIT}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add competitor form */}
        <form onSubmit={handleAdd} className="flex gap-2">
          <Input
            placeholder="Wettbewerber-Domain eingeben..."
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            disabled={adding || atLimit}
            className="flex-1"
            aria-label="Neue Wettbewerber-Domain"
          />
          <Button
            type="submit"
            disabled={adding || atLimit || !newDomain.trim()}
            className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
          >
            {adding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </form>

        <div className="rounded-xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                <Sparkles className="h-4 w-4 text-blue-600" />
                Wettbewerber-Vorschläge
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Leite potenzielle Wettbewerber aus Angebot und Positionierung von {targetDomain} ab.
              </p>
              {suggestionUrl && (
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Quelle: {suggestionUrl} {suggestionSource === 'anthropic' ? '· KI-gestützt' : '· heuristisch'}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadSuggestions()}
              disabled={loadingSuggestions}
              className="rounded-full"
            >
              {loadingSuggestions ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Vorschläge laden
            </Button>
          </div>

          {suggestions.length > 0 && (
            <div className="mt-4 grid gap-3">
              {suggestions.map((item) => (
                <div
                  key={item.domain}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{item.domain}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{item.reason}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleAddSuggestion(item.domain)}
                    disabled={atLimit || addingSuggestedDomain === item.domain}
                    className="shrink-0 rounded-full"
                  >
                    {addingSuggestedDomain === item.domain ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    Übernehmen
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {atLimit && (
          <p className="text-xs text-amber-600">
            Wettbewerber-Limit erreicht ({COMPETITOR_LIMIT}). Lösche bestehende Einträge, um neue hinzuzufügen.
          </p>
        )}

        {competitors.length === 0 ? (
          <div className="py-8 text-center">
            <Globe className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Noch keine Wettbewerber hinzugefügt.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead className="hidden sm:table-cell">Hinzugefuegt</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {competitors.map((comp) => (
                <TableRow key={comp.id}>
                  <TableCell className="font-medium">{comp.domain}</TableCell>
                  <TableCell className="hidden text-slate-500 dark:text-slate-400 sm:table-cell">
                    {formatDate(comp.created_at)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(comp)}
                      disabled={deletingId === comp.id}
                      className="h-8 w-8 text-slate-400 dark:text-slate-500 hover:text-red-600"
                      aria-label={`Wettbewerber "${comp.domain}" löschen`}
                    >
                      {deletingId === comp.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Settings Tab
// ---------------------------------------------------------------------------

interface SettingsTabProps {
  project: KeywordProject
  role: WorkspaceRole
  onUpdated: () => void
  onDeleted: () => void
}

function SettingsTab({ project, role, onUpdated, onDeleted }: SettingsTabProps) {
  const { toast } = useToast()
  const isAdmin = role === 'admin'

  // Rename
  const [editName, setEditName] = useState(project.name)
  const [savingName, setSavingName] = useState(false)

  // Language / Country
  const [editLang, setEditLang] = useState(project.language_code)
  const [editCountry, setEditCountry] = useState(project.country_code)
  const [editTrackingInterval, setEditTrackingInterval] = useState(
    project.tracking_interval ?? 'daily'
  )
  const [savingSettings, setSavingSettings] = useState(false)

  // Status toggle
  const [togglingStatus, setTogglingStatus] = useState(false)

  // Delete
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleRename(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = editName.trim()
    if (!trimmed || trimmed === project.name) return

    try {
      setSavingName(true)
      await apiFetch(`${API_BASE}/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      toast({ title: 'Projekt umbenannt' })
      onUpdated()
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'Umbenennung fehlgeschlagen.',
        variant: 'destructive',
      })
    } finally {
      setSavingName(false)
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault()
    if (
      editLang === project.language_code &&
      editCountry === project.country_code &&
      editTrackingInterval === (project.tracking_interval ?? 'daily')
    ) {
      return
    }

    try {
      setSavingSettings(true)
      await apiFetch(`${API_BASE}/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language_code: editLang,
          country_code: editCountry,
          tracking_interval: editTrackingInterval,
        }),
      })
      toast({ title: 'Einstellungen gespeichert' })
      onUpdated()
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'Speichern fehlgeschlagen.',
        variant: 'destructive',
      })
    } finally {
      setSavingSettings(false)
    }
  }

  async function handleToggleStatus() {
    const newStatus = project.status === 'active' ? 'inactive' : 'active'
    try {
      setTogglingStatus(true)
      await apiFetch(`${API_BASE}/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      toast({
        title: newStatus === 'active' ? 'Projekt aktiviert' : 'Projekt deaktiviert',
      })
      onUpdated()
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'Statusaenderung fehlgeschlagen.',
        variant: 'destructive',
      })
    } finally {
      setTogglingStatus(false)
    }
  }

  async function handleDelete() {
    try {
      setDeleting(true)
      await apiFetch(`${API_BASE}/${project.id}`, {
        method: 'DELETE',
      })
      toast({ title: 'Projekt geloescht', description: `"${project.name}" wurde entfernt.` })
      setDeleteOpen(false)
      onDeleted()
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'Projekt konnte nicht geloescht werden.',
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Rename */}
      <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Projektname</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRename} className="flex gap-2">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              disabled={savingName}
              className="flex-1"
              aria-label="Projektname aendern"
            />
            <Button
              type="submit"
              disabled={savingName || editName.trim() === project.name || !editName.trim()}
              className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
            >
              {savingName && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Speichern
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Language / Country */}
      <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Sprache, Region & Intervall</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="settings-language">Sprache</Label>
                <Select value={editLang} onValueChange={setEditLang} disabled={savingSettings}>
                  <SelectTrigger id="settings-language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l.code} value={l.code}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-country">Land/Region</Label>
                <Select value={editCountry} onValueChange={setEditCountry} disabled={savingSettings}>
                  <SelectTrigger id="settings-country">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-tracking-interval">Tracking-Intervall</Label>
                <Select
                  value={editTrackingInterval}
                  onValueChange={(value) => setEditTrackingInterval(value as 'daily' | 'weekly')}
                  disabled={savingSettings || !isAdmin}
                >
                  <SelectTrigger id="settings-tracking-interval">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Taeglich</SelectItem>
                    <SelectItem value="weekly">Woechentlich</SelectItem>
                  </SelectContent>
                </Select>
                {!isAdmin && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Das Tracking-Intervall kann nur von Admins geaendert werden.
                  </p>
                )}
              </div>
            </div>
            <Button
              type="submit"
              disabled={
                savingSettings ||
                (!isAdmin && editTrackingInterval !== (project.tracking_interval ?? 'daily')) ||
                (editLang === project.language_code &&
                  editCountry === project.country_code &&
                  editTrackingInterval === (project.tracking_interval ?? 'daily'))
              }
              className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
            >
              {savingSettings && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Speichern
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Status toggle */}
      {isAdmin && (
        <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Projektstatus</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {project.status === 'active'
                  ? 'Das Projekt ist aktiv und wird beim nächsten Tracking-Lauf berücksichtigt.'
                  : 'Das Projekt ist deaktiviert und wird nicht getrackt.'}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleToggleStatus}
              disabled={togglingStatus}
              className="shrink-0 rounded-full"
            >
              {togglingStatus && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {project.status === 'active' ? 'Deaktivieren' : 'Aktivieren'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Delete */}
      {isAdmin && (
        <Card className="rounded-2xl border border-red-200 bg-white dark:bg-[#151c28]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-red-700">Gefahrenzone</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Projekt unwiderruflich löschen. Alle Keywords, Wettbewerber und historische Ranking-Daten gehen verloren.
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
              className="shrink-0 rounded-full"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Löschen
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Projekt löschen?</DialogTitle>
            <DialogDescription>
              Das Projekt <strong>&quot;{project.name}&quot;</strong> wird unwiderruflich geloescht. Alle zugehoerigen Keywords, Wettbewerber und historische Ranking-Daten werden ebenfalls entfernt. Diese Aktion kann nicht rueckgaengig gemacht werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
              className="rounded-full"
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-full"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Endgültig löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Integrations Tab (Admin only)
// ---------------------------------------------------------------------------

interface IntegrationsTabProps {
  projectId: string
  role: WorkspaceRole
}

function GscStatusBadge({ status }: { status: GscStatus }) {
  switch (status) {
    case 'connected':
      return (
        <Badge className="rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
          Verbunden
        </Badge>
      )
    case 'expired':
      return (
        <Badge className="rounded-full bg-amber-50 text-amber-700 hover:bg-amber-50">
          Token abgelaufen
        </Badge>
      )
    case 'revoked':
      return (
        <Badge className="rounded-full bg-red-50 text-red-700 hover:bg-red-50">
          Zugriff widerrufen
        </Badge>
      )
    case 'not_connected':
    default:
      return (
        <Badge className="rounded-full bg-slate-100 dark:bg-[#1e2635] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#252d3a]">
          Nicht verbunden
        </Badge>
      )
  }
}

function IntegrationsTab({ projectId, role }: IntegrationsTabProps) {
  const { toast } = useToast()
  const isAdmin = role === 'admin'
  const [connection, setConnection] = useState<GscConnection | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Properties
  const [properties, setProperties] = useState<GscProperty[]>([])
  const [loadingProperties, setLoadingProperties] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState<string>('')
  const [savingProperty, setSavingProperty] = useState(false)

  // Disconnect
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  // Connecting (OAuth redirect)
  const [connecting, setConnecting] = useState(false)

  const gscBase = `${API_BASE}/${projectId}/gsc`

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await apiFetch<{ connection: GscConnection | null }>(`${gscBase}/status`)
      setConnection(data.connection)
      if (data.connection?.selected_property) {
        setSelectedProperty(data.connection.selected_property)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'GSC-Status konnte nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [gscBase])

  const loadProperties = useCallback(async () => {
    try {
      setLoadingProperties(true)
      const data = await apiFetch<{ properties: GscProperty[] }>(`${gscBase}/properties`)
      setProperties(data.properties)
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'Properties konnten nicht geladen werden.',
        variant: 'destructive',
      })
    } finally {
      setLoadingProperties(false)
    }
  }, [gscBase, toast])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  // Load properties when connected
  useEffect(() => {
    if (isAdmin && connection && connection.status === 'connected') {
      loadProperties()
    }
  }, [connection, isAdmin, loadProperties])

  // Check for OAuth callback result in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const gscResult = params.get('gsc')
    const gscError = params.get('gsc_error')

    if (gscResult === 'connected') {
      toast({ title: 'Google Search Console verbunden' })
      // Clean URL
      const url = new URL(window.location.href)
      url.searchParams.delete('gsc')
      window.history.replaceState({}, '', url.toString())
      loadStatus()
    } else if (gscError) {
      toast({
        title: 'Verbindung fehlgeschlagen',
        description: decodeURIComponent(gscError),
        variant: 'destructive',
      })
      const url = new URL(window.location.href)
      url.searchParams.delete('gsc_error')
      window.history.replaceState({}, '', url.toString())
    }
  }, [toast, loadStatus])

  async function handleConnect() {
    try {
      setConnecting(true)
      const data = await apiFetch<{ url: string }>(`${gscBase}/connect`, {
        method: 'POST',
      })
      // Redirect to Google OAuth
      window.location.href = data.url
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'OAuth-Flow konnte nicht gestartet werden.',
        variant: 'destructive',
      })
      setConnecting(false)
    }
  }

  async function handleSelectProperty(value: string) {
    setSelectedProperty(value)
    try {
      setSavingProperty(true)
      await apiFetch(`${gscBase}/property`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_property: value }),
      })
      toast({ title: 'Property gespeichert', description: value })
      loadStatus()
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'Property konnte nicht gespeichert werden.',
        variant: 'destructive',
      })
    } finally {
      setSavingProperty(false)
    }
  }

  async function handleDisconnect() {
    try {
      setDisconnecting(true)
      await apiFetch(`${gscBase}/disconnect`, {
        method: 'DELETE',
      })
      toast({ title: 'Verbindung getrennt', description: 'Die GSC-Verbindung wurde entfernt.' })
      setConnection(null)
      setProperties([])
      setSelectedProperty('')
      setDisconnectOpen(false)
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'Verbindung konnte nicht getrennt werden.',
        variant: 'destructive',
      })
    } finally {
      setDisconnecting(false)
    }
  }

  // Loading skeleton
  if (loading) {
    return (
      <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28]">
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-10 w-48" />
        </CardContent>
      </Card>
    )
  }

  // Error state
  if (error) {
    return (
      <Alert variant="destructive" className="rounded-2xl">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Fehler</AlertTitle>
        <AlertDescription className="flex items-center justify-between">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={loadStatus}>
            Erneut versuchen
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  const gscStatus: GscStatus = connection?.status ?? 'not_connected'
  const isConnected = connection && connection.status === 'connected'
  const isExpiredOrRevoked = connection && (connection.status === 'expired' || connection.status === 'revoked')

  return (
    <div className="space-y-6">
      {/* GSC Integration Card */}
      <Card className="rounded-2xl border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 dark:bg-[#151c28]">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Google Search Console</CardTitle>
                <p className="text-sm text-slate-500 dark:text-slate-400">Ranking-Daten automatisch abrufen</p>
              </div>
            </div>
            <GscStatusBadge status={gscStatus} />
          </div>
        </CardHeader>

        <Separator className="bg-slate-100 dark:bg-[#1e2635]" />

        <CardContent className="pt-5">
          {/* Not connected */}
          {!connection && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 dark:bg-[#151c28]">
                <Link2 className="h-6 w-6 text-slate-400 dark:text-slate-500" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Keine Verbindung hergestellt
                </p>
                <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
                  Verbinde ein Google-Konto, um Ranking-Daten aus der Search Console automatisch abzurufen.
                </p>
              </div>
              {isAdmin ? (
                <Button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
                >
                  {connecting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="mr-2 h-4 w-4" />
                  )}
                  Google Search Console verbinden
                </Button>
              ) : (
                <Alert className="max-w-md rounded-2xl text-left">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Nicht verbunden</AlertTitle>
                  <AlertDescription>
                    Fuer dieses Projekt ist noch keine Google-Search-Console-Verbindung eingerichtet. Bitte informiere einen Admin.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Expired / Revoked — reconnect prompt */}
          {isExpiredOrRevoked && connection && (
            <div className="space-y-4">
              <Alert className="rounded-2xl border-amber-200 bg-amber-50">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800">
                  {connection.status === 'expired'
                    ? 'Token abgelaufen'
                    : 'Zugriff widerrufen'}
                </AlertTitle>
                <AlertDescription className="text-amber-700">
                  {connection.status === 'expired'
                    ? 'Das Zugriffstoken für die Search Console ist abgelaufen. Bitte verbinde das Google-Konto erneut.'
                    : 'Der Zugriff auf die Search Console wurde widerrufen. Bitte verbinde das Google-Konto erneut.'}
                </AlertDescription>
              </Alert>

              <div className="flex items-center gap-3 rounded-xl bg-slate-50 dark:bg-[#151c28] p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Verbundenes Konto</p>
                  <p className="truncate text-sm text-slate-500 dark:text-slate-400">{connection.google_email}</p>
                </div>
              </div>

              {isAdmin ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    onClick={handleConnect}
                    disabled={connecting}
                    className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
                  >
                    {connecting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ExternalLink className="mr-2 h-4 w-4" />
                    )}
                    Erneut verbinden
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setDisconnectOpen(true)}
                    className="rounded-full text-red-600 hover:text-red-700"
                  >
                    <Unlink className="mr-2 h-4 w-4" />
                    Verbindung trennen
                  </Button>
                </div>
              ) : (
                <Alert className="rounded-2xl border-amber-200 bg-amber-50">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-amber-800">Admin erforderlich</AlertTitle>
                  <AlertDescription className="text-amber-700">
                    Die Verbindung muss von einem Admin erneut hergestellt werden.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Connected */}
          {isConnected && connection && (
            <div className="space-y-5">
              {/* Connected account info */}
              <div className="flex items-center gap-3 rounded-xl bg-emerald-50/50 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Verbundenes Google-Konto</p>
                  <p className="truncate text-sm text-slate-500 dark:text-slate-400">{connection.google_email}</p>
                </div>
                <p className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                  Verbunden am {formatDate(connection.connected_at)}
                </p>
              </div>

              {/* Property selector */}
              <div className="space-y-2">
                <Label htmlFor="gsc-property-select">Aktive Property</Label>
                {isAdmin ? (
                  <>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Wähle die Domain, für die Ranking-Daten abgerufen werden sollen.
                    </p>
                    {loadingProperties ? (
                      <div className="flex items-center gap-2 py-2">
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400 dark:text-slate-500" />
                        <span className="text-sm text-slate-500 dark:text-slate-400">Properties werden geladen...</span>
                      </div>
                    ) : properties.length === 0 ? (
                      <Alert className="rounded-2xl">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Keine Properties gefunden</AlertTitle>
                        <AlertDescription>
                          Dieses Google-Konto hat keine verifizierten Properties in der Search Console. Stelle sicher, dass die Domain in der Google Search Console hinzugefuegt und verifiziert wurde.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <Select
                        value={selectedProperty}
                        onValueChange={handleSelectProperty}
                        disabled={savingProperty}
                      >
                        <SelectTrigger id="gsc-property-select" className="w-full sm:w-96">
                          <SelectValue placeholder="Property auswaehlen..." />
                        </SelectTrigger>
                        <SelectContent>
                          {properties.map((prop) => (
                            <SelectItem key={prop.siteUrl} value={prop.siteUrl}>
                              <span className="flex items-center gap-2">
                                <Globe className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                                <span>{prop.siteUrl}</span>
                                <span className="text-xs text-slate-400 dark:text-slate-500">
                                  ({formatGscPermissionLevel(prop.permissionLevel)})
                                </span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {properties.some((prop) => prop.permissionLevel === 'siteUnverifiedUser') && (
                      <p className="text-xs text-amber-700">
                        Einige Properties wurden von Google als nicht verifiziert markiert. Diese können in der Regel keine Ranking-Daten liefern.
                      </p>
                    )}
                    {savingProperty && (
                      <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Property wird gespeichert...
                      </p>
                    )}
                  </>
                ) : (
                  <div className="rounded-xl bg-slate-50 dark:bg-[#151c28] p-4">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {connection.selected_property
                        ? connection.selected_property
                        : 'Es wurde noch keine aktive Property ausgewaehlt.'}
                    </p>
                  </div>
                )}
              </div>

              {isAdmin && <Separator className="bg-slate-100 dark:bg-[#1e2635]" />}

              {/* Disconnect */}
              {isAdmin && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Verbindung trennen</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Entfernt die Google-Verbindung und loescht alle gespeicherten Tokens.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setDisconnectOpen(true)}
                    className="shrink-0 rounded-full text-red-600 hover:text-red-700"
                  >
                    <Unlink className="mr-2 h-4 w-4" />
                    Trennen
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disconnect confirmation dialog */}
      <Dialog open={isAdmin && disconnectOpen} onOpenChange={setDisconnectOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Verbindung trennen?</DialogTitle>
            <DialogDescription>
              Die Verbindung zur Google Search Console wird getrennt. Alle gespeicherten Tokens werden geloescht. Ranking-Daten, die bereits abgerufen wurden, bleiben erhalten.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDisconnectOpen(false)}
              disabled={disconnecting}
              className="rounded-full"
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="rounded-full"
            >
              {disconnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verbindung trennen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
