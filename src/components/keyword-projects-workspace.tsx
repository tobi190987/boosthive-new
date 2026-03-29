'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  Globe,
  Link2,
  Loader2,
  Plus,
  Search,
  Settings,
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

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed (${res.status})`)
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface KeywordProjectsWorkspaceProps {
  role: WorkspaceRole
}

export function KeywordProjectsWorkspace({ role }: KeywordProjectsWorkspaceProps) {
  const [view, setView] = useState<View>({ type: 'list' })

  return (
    <div className="space-y-6">
      {view.type === 'list' && (
        <ProjectList
          role={role}
          onOpenProject={(id) => setView({ type: 'detail', projectId: id })}
        />
      )}
      {view.type === 'detail' && (
        <ProjectDetail
          role={role}
          projectId={view.projectId}
          onBack={() => setView({ type: 'list' })}
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
            <Card key={i} className="rounded-[24px] border border-[#e6ddd0]">
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
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#0d9488]">
            SEO-Analyse
          </p>
          <h1 className="text-2xl font-semibold text-slate-950">Keywordranking</h1>
          <p className="mt-1 text-sm text-slate-500">
            Verwalte Keyword-Projekte als Unterbereich deiner SEO-Analyse.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            variant="outline"
            className="rounded-full border-[#e6ddd0] bg-[#fffaf3] px-3 py-1 text-xs text-slate-600"
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
            Du hast das Maximum von {PROJECT_LIMIT} Projekten erreicht. Loesche ein bestehendes Projekt oder kontaktiere den Support fuer ein Upgrade.
          </AlertDescription>
        </Alert>
      )}

      {/* Empty state */}
      {projects.length === 0 ? (
        <Card className="rounded-[32px] border border-[#e6ddd0] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
          <CardContent className="flex flex-col items-center gap-5 px-6 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-[#edf8f6]">
              <Search className="h-7 w-7 text-[#0d9488]" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-950">Noch keine Projekte</h2>
              <p className="max-w-md text-sm leading-7 text-slate-600">
                Erstelle dein erstes Keyword-Projekt, um Rankings fuer eine Domain zu tracken und mit Wettbewerbern zu vergleichen.
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
              aria-label={`Projekt ${project.name} oeffnen`}
            >
              <Card
                className={cn(
                  'rounded-[24px] border border-[#e6ddd0] bg-white transition-all hover:border-[#0d9488]/30 hover:shadow-md',
                  project.status === 'inactive' && 'opacity-60'
                )}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-semibold text-slate-900 leading-tight">
                      {project.name}
                    </CardTitle>
                    <Badge
                      className={cn(
                        'shrink-0 rounded-full text-xs',
                        project.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-100'
                      )}
                    >
                      {project.status === 'active' ? 'Aktiv' : 'Inaktiv'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Globe className="h-3.5 w-3.5 text-slate-400" />
                    <span className="truncate">{project.target_domain}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span>
                      {LANGUAGES.find((l) => l.code === project.language_code)?.label ?? project.language_code}
                    </span>
                    <span>
                      {COUNTRIES.find((c) => c.code === project.country_code)?.label ?? project.country_code}
                    </span>
                  </div>
                  <Separator className="bg-[#ebe2d5]" />
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span>{project.keyword_count} Keywords</span>
                    <span>{project.competitor_count} Wettbewerber</span>
                  </div>
                  {project.last_tracking_run && (
                    <p className="text-xs text-slate-400">
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
      setFieldError('Bitte eine gueltige Domain eingeben (z. B. example.de).')
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
      <DialogContent className="rounded-[24px] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neues Keyword-Projekt</DialogTitle>
          <DialogDescription>
            Erstelle ein Projekt, um Keywords und Wettbewerber fuer eine Domain zu tracken.
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
            <p className="text-xs text-slate-500">Ohne https:// oder www.</p>
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
  onBack: () => void
}

function ProjectDetail({ role, projectId, onBack }: ProjectDetailProps) {
  const { toast } = useToast()
  const [project, setProject] = useState<KeywordProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('keywords')

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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full rounded-[24px]" />
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
            <h1 className="text-xl font-semibold text-slate-950">{project.name}</h1>
            <div className="flex items-center gap-2 text-sm text-slate-500">
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
              : 'bg-slate-100 text-slate-500 hover:bg-slate-100'
          )}
        >
          {project.status === 'active' ? 'Aktiv' : 'Inaktiv'}
        </Badge>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="rounded-full bg-[#f7f3ed]">
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
// Keywords Tab
// ---------------------------------------------------------------------------

interface KeywordsTabProps {
  projectId: string
  targetDomain: string
}

function KeywordsTab({ projectId }: KeywordsTabProps) {
  const { toast } = useToast()
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newKeyword, setNewKeyword] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const kw = newKeyword.trim()
    if (!kw) return

    try {
      setAdding(true)
      await apiFetch(`${API_BASE}/${projectId}/keywords`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: kw }),
      })
      setNewKeyword('')
      toast({ title: 'Keyword hinzugefuegt', description: `"${kw}" wurde gespeichert.` })
      loadKeywords()
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'Keyword konnte nicht hinzugefuegt werden.',
        variant: 'destructive',
      })
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(kw: Keyword) {
    try {
      setDeletingId(kw.id)
      await apiFetch(`${API_BASE}/${projectId}/keywords/${kw.id}`, {
        method: 'DELETE',
      })
      toast({ title: 'Keyword geloescht', description: `"${kw.keyword}" wurde entfernt.` })
      loadKeywords()
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'Keyword konnte nicht geloescht werden.',
        variant: 'destructive',
      })
    } finally {
      setDeletingId(null)
    }
  }

  const atLimit = keywords.length >= KEYWORD_LIMIT

  if (loading) {
    return (
      <Card className="rounded-[24px] border border-[#e6ddd0]">
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
    <Card className="rounded-[24px] border border-[#e6ddd0] bg-white">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Keywords</CardTitle>
          <Badge
            variant="outline"
            className="rounded-full border-[#e6ddd0] bg-[#fffaf3] text-xs text-slate-600"
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

        {atLimit && (
          <p className="text-xs text-amber-600">
            Keyword-Limit erreicht ({KEYWORD_LIMIT}). Loesche bestehende Keywords, um neue hinzuzufuegen.
          </p>
        )}

        {keywords.length === 0 ? (
          <div className="py-8 text-center">
            <Search className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">Noch keine Keywords hinzugefuegt.</p>
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
                  <TableCell className="hidden text-slate-500 sm:table-cell">
                    {formatDate(kw.created_at)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(kw)}
                      disabled={deletingId === kw.id}
                      className="h-8 w-8 text-slate-400 hover:text-red-600"
                      aria-label={`Keyword "${kw.keyword}" loeschen`}
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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const normalized = normalizeDomain(newDomain)

    if (!isValidDomain(normalized)) {
      toast({
        title: 'Ungueltige Domain',
        description: 'Bitte eine gueltige Domain eingeben (z. B. competitor.de).',
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
      toast({ title: 'Wettbewerber hinzugefuegt', description: `"${normalized}" wurde gespeichert.` })
      loadCompetitors()
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'Wettbewerber konnte nicht hinzugefuegt werden.',
        variant: 'destructive',
      })
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(comp: Competitor) {
    try {
      setDeletingId(comp.id)
      await apiFetch(`${API_BASE}/${projectId}/competitors/${comp.id}`, {
        method: 'DELETE',
      })
      toast({ title: 'Wettbewerber geloescht', description: `"${comp.domain}" wurde entfernt.` })
      loadCompetitors()
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'Wettbewerber konnte nicht geloescht werden.',
        variant: 'destructive',
      })
    } finally {
      setDeletingId(null)
    }
  }

  const atLimit = competitors.length >= COMPETITOR_LIMIT

  if (loading) {
    return (
      <Card className="rounded-[24px] border border-[#e6ddd0]">
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
    <Card className="rounded-[24px] border border-[#e6ddd0] bg-white">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Wettbewerber</CardTitle>
          <Badge
            variant="outline"
            className="rounded-full border-[#e6ddd0] bg-[#fffaf3] text-xs text-slate-600"
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

        {atLimit && (
          <p className="text-xs text-amber-600">
            Wettbewerber-Limit erreicht ({COMPETITOR_LIMIT}). Loesche bestehende Eintraege, um neue hinzuzufuegen.
          </p>
        )}

        {competitors.length === 0 ? (
          <div className="py-8 text-center">
            <Globe className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">Noch keine Wettbewerber hinzugefuegt.</p>
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
                  <TableCell className="hidden text-slate-500 sm:table-cell">
                    {formatDate(comp.created_at)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(comp)}
                      disabled={deletingId === comp.id}
                      className="h-8 w-8 text-slate-400 hover:text-red-600"
                      aria-label={`Wettbewerber "${comp.domain}" loeschen`}
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
    if (editLang === project.language_code && editCountry === project.country_code) return

    try {
      setSavingSettings(true)
      await apiFetch(`${API_BASE}/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language_code: editLang, country_code: editCountry }),
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
      <Card className="rounded-[24px] border border-[#e6ddd0] bg-white">
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
      <Card className="rounded-[24px] border border-[#e6ddd0] bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Sprache & Region</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
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
            </div>
            <Button
              type="submit"
              disabled={
                savingSettings ||
                (editLang === project.language_code && editCountry === project.country_code)
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
        <Card className="rounded-[24px] border border-[#e6ddd0] bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Projektstatus</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">
                {project.status === 'active'
                  ? 'Das Projekt ist aktiv und wird beim naechsten Tracking-Lauf beruecksichtigt.'
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
        <Card className="rounded-[24px] border border-red-200 bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-red-700">Gefahrenzone</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">
                Projekt unwiderruflich loeschen. Alle Keywords, Wettbewerber und historische Ranking-Daten gehen verloren.
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
              className="shrink-0 rounded-full"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Loeschen
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="rounded-[24px] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Projekt loeschen?</DialogTitle>
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
              Endgueltig loeschen
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
        <Badge className="rounded-full bg-slate-100 text-slate-500 hover:bg-slate-100">
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
      <Card className="rounded-[24px] border border-[#e6ddd0] bg-white">
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
      <Card className="rounded-[24px] border border-[#e6ddd0] bg-white">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f7f3ed]">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Google Search Console</CardTitle>
                <p className="text-sm text-slate-500">Ranking-Daten automatisch abrufen</p>
              </div>
            </div>
            <GscStatusBadge status={gscStatus} />
          </div>
        </CardHeader>

        <Separator className="bg-[#ebe2d5]" />

        <CardContent className="pt-5">
          {/* Not connected */}
          {!connection && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50">
                <Link2 className="h-6 w-6 text-slate-400" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-900">
                  Keine Verbindung hergestellt
                </p>
                <p className="max-w-sm text-sm text-slate-500">
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
                    ? 'Das Zugriffstoken fuer die Search Console ist abgelaufen. Bitte verbinde das Google-Konto erneut.'
                    : 'Der Zugriff auf die Search Console wurde widerrufen. Bitte verbinde das Google-Konto erneut.'}
                </AlertDescription>
              </Alert>

              <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-700">Verbundenes Konto</p>
                  <p className="truncate text-sm text-slate-500">{connection.google_email}</p>
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
                  <p className="text-sm font-medium text-slate-700">Verbundenes Google-Konto</p>
                  <p className="truncate text-sm text-slate-500">{connection.google_email}</p>
                </div>
                <p className="shrink-0 text-xs text-slate-400">
                  Verbunden am {formatDate(connection.connected_at)}
                </p>
              </div>

              {/* Property selector */}
              <div className="space-y-2">
                <Label htmlFor="gsc-property-select">Aktive Property</Label>
                {isAdmin ? (
                  <>
                    <p className="text-sm text-slate-500">
                      Waehle die Domain, fuer die Ranking-Daten abgerufen werden sollen.
                    </p>
                    {loadingProperties ? (
                      <div className="flex items-center gap-2 py-2">
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                        <span className="text-sm text-slate-500">Properties werden geladen...</span>
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
                                <Globe className="h-3.5 w-3.5 text-slate-400" />
                                {prop.siteUrl}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {savingProperty && (
                      <p className="flex items-center gap-2 text-xs text-slate-500">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Property wird gespeichert...
                      </p>
                    )}
                  </>
                ) : (
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">
                      {connection.selected_property
                        ? connection.selected_property
                        : 'Es wurde noch keine aktive Property ausgewaehlt.'}
                    </p>
                  </div>
                )}
              </div>

              {isAdmin && <Separator className="bg-[#ebe2d5]" />}

              {/* Disconnect */}
              {isAdmin && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-700">Verbindung trennen</p>
                    <p className="text-sm text-slate-500">
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
        <DialogContent className="rounded-[24px] sm:max-w-md">
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
