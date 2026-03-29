'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  Calculator,
  ChevronRight,
  Clock,
  Eye,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import {
  AI_MODELS,
  calculateCostEstimate,
  modelLabel,
  type AnalyticsStatus,
  statusColor,
  statusLabel,
  type AiModel,
  type AnalysisError,
  type AnalysisStatus,
  type AnalysisStatusResponse,
  type Competitor,
  type CostEstimate,
  type ModelProgress,
  type VisibilityAnalysis,
  type VisibilityProject,
} from '@/lib/ai-visibility'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { AiVisibilityReport } from '@/components/ai-visibility-report'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

type WorkspaceRole = 'admin' | 'member'

type View =
  | { type: 'list' }
  | { type: 'detail'; projectId: string; analysisId?: string | null }
  | { type: 'progress'; projectId: string; analysisId: string }

interface AiVisibilityWorkspaceProps {
  role: WorkspaceRole
}

// ─── Formatierungshilfen ──────────────────────────────────────

function formatDate(value: string) {
  return new Date(value).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function analyticsStatusLabel(status: AnalyticsStatus) {
  const map: Record<AnalyticsStatus, string> = {
    pending: 'Analytics ausstehend',
    running: 'Analytics laufen',
    done: 'Analytics bereit',
    failed: 'Analytics fehlgeschlagen',
    partial: 'Teilweise bereit',
  }

  return map[status]
}

function analyticsStatusColor(status: AnalyticsStatus) {
  const map: Record<AnalyticsStatus, string> = {
    pending: 'bg-slate-100 text-slate-600',
    running: 'bg-blue-50 text-blue-700',
    done: 'bg-emerald-50 text-emerald-700',
    failed: 'bg-red-50 text-red-700',
    partial: 'bg-amber-50 text-amber-700',
  }

  return map[status]
}

// ─── Hauptkomponente ──────────────────────────────────────────

export function AiVisibilityWorkspace({ role }: AiVisibilityWorkspaceProps) {
  const [view, setView] = useState<View>({ type: 'list' })
  const { toast } = useToast()

  // ── Projekte ────────────────────────────────────────────────
  const [projects, setProjects] = useState<VisibilityProject[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [projectError, setProjectError] = useState<string | null>(null)

  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true)
    setProjectError(null)
    try {
      const res = await fetch('/api/tenant/visibility/projects')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Fehler ${res.status}`)
      }
      const data = await res.json()
      setProjects(data.projects ?? [])
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : 'Projekte konnten nicht geladen werden.')
    } finally {
      setLoadingProjects(false)
    }
  }, [])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  // ── Navigation ──────────────────────────────────────────────

  function goToList() {
    setView({ type: 'list' })
    fetchProjects()
  }

  function goToDetail(projectId: string, analysisId?: string | null) {
    setView({ type: 'detail', projectId, analysisId: analysisId ?? null })
  }

  function goToProgress(projectId: string, analysisId: string) {
    setView({ type: 'progress', projectId, analysisId })
  }

  // ── Views ───────────────────────────────────────────────────

  if (view.type === 'list') {
    return (
      <ProjectListView
        role={role}
        projects={projects}
        loading={loadingProjects}
        error={projectError}
        onRetry={fetchProjects}
        onOpenProject={goToDetail}
        onProjectCreated={(projectId, analysisId) => {
          if (analysisId) {
            goToProgress(projectId, analysisId)
          } else {
            goToDetail(projectId)
          }
        }}
      />
    )
  }

  if (view.type === 'detail') {
    const project = projects.find((p) => p.id === view.projectId)
    return (
      <ProjectDetailView
        role={role}
        projectId={view.projectId}
        cachedProject={project ?? null}
        initialSelectedAnalysisId={view.analysisId ?? null}
        onBack={goToList}
        onOpenProgress={(analysisId) => goToProgress(view.projectId, analysisId)}
        onOpenReport={(analysisId) => goToDetail(view.projectId, analysisId)}
        onProjectDeleted={goToList}
      />
    )
  }

  if (view.type === 'progress') {
    return (
      <AnalysisProgressView
        analysisId={view.analysisId}
        onOpenProgress={(analysisId) => goToProgress(view.projectId, analysisId)}
        onOpenReport={(analysisId) => goToDetail(view.projectId, analysisId)}
        onBack={() => goToDetail(view.projectId)}
      />
    )
  }

  return null
}

// ═══════════════════════════════════════════════════════════════
// ProjectListView
// ═══════════════════════════════════════════════════════════════

interface ProjectListViewProps {
  role: WorkspaceRole
  projects: VisibilityProject[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onOpenProject: (id: string) => void
  onProjectCreated: (projectId: string, analysisId: string | null) => void
}

function ProjectListView({
  role,
  projects,
  loading,
  error,
  onRetry,
  onOpenProject,
  onProjectCreated,
}: ProjectListViewProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  // ── Loading ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 rounded-[24px]" />
          ))}
        </div>
      </div>
    )
  }

  // ── Error ───────────────────────────────────────────────────
  if (error) {
    return (
      <Alert variant="destructive" className="rounded-[24px]">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Fehler beim Laden</AlertTitle>
        <AlertDescription className="flex items-center gap-3">
          {error}
          <Button variant="outline" size="sm" onClick={onRetry} className="ml-auto rounded-full">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Erneut versuchen
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Analyse-Projekte</h2>
          <p className="text-sm text-slate-500">
            {projects.length === 0
              ? 'Erstelle dein erstes Projekt, um die KI-Sichtbarkeit zu messen.'
              : `${projects.length} Projekt${projects.length !== 1 ? 'e' : ''}`}
          </p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Neues Projekt
        </Button>
      </div>

      {/* ── Empty State ────────────────────────────────────── */}
      {projects.length === 0 && (
        <Card className="rounded-[32px] border border-[#e6ddd0] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
          <CardContent className="flex flex-col items-center gap-5 px-6 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-[#edf8f6]">
              <Eye className="h-7 w-7 text-[#0d9488]" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-slate-900">Noch keine Projekte</h3>
              <p className="max-w-md text-sm leading-7 text-slate-500">
                Erstelle ein Analyse-Projekt mit Brand-Name, Keywords und Wettbewerbern, um zu messen, wie sichtbar dein Kunde in KI-Antworten ist.
              </p>
            </div>
            <Button
              onClick={() => setDialogOpen(true)}
              className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Erstes Projekt erstellen
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Projekte Grid ──────────────────────────────────── */}
      {projects.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} onClick={() => onOpenProject(project.id)} />
          ))}
        </div>
      )}

      {/* ── Create Dialog ──────────────────────────────────── */}
      <CreateProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={onProjectCreated}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// ProjectCard
// ═══════════════════════════════════════════════════════════════

function ProjectCard({
  project,
  onClick,
}: {
  project: VisibilityProject
  onClick: () => void
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={`Projekt ${project.brand_name} öffnen`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className="group cursor-pointer rounded-[24px] border border-[#e6ddd0] bg-white shadow-sm transition hover:border-[#d7ccbc] hover:shadow-md"
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base font-semibold text-slate-900">
              {project.brand_name}
            </CardTitle>
            {project.website_url && (
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-400">
                <Globe className="h-3 w-3 shrink-0" />
                {project.website_url}
              </p>
            )}
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-slate-500" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="flex flex-wrap gap-1.5">
          {project.keywords.slice(0, 3).map((kw) => (
            <Badge
              key={kw}
              className="rounded-full bg-[#f7f3ed] px-2.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-[#f7f3ed]"
            >
              {kw}
            </Badge>
          ))}
          {project.keywords.length > 3 && (
            <Badge className="rounded-full bg-[#f7f3ed] px-2.5 py-0.5 text-[11px] font-medium text-slate-400 hover:bg-[#f7f3ed]">
              +{project.keywords.length - 3}
            </Badge>
          )}
        </div>

        <Separator className="bg-[#ebe2d5]" />

        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDate(project.created_at)}
          </span>
          {project.latest_analysis_status && (
            <Badge className={cn('rounded-full px-2 py-0.5 text-[11px]', statusColor(project.latest_analysis_status))}>
              {statusLabel(project.latest_analysis_status)}
            </Badge>
          )}
          {!project.latest_analysis_status && (
            <span className="italic text-slate-300">Keine Analyse</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// CreateProjectDialog
// ═══════════════════════════════════════════════════════════════

interface CreateProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (projectId: string, analysisId: string | null) => void
}

function CreateProjectDialog({ open, onOpenChange, onCreated }: CreateProjectDialogProps) {
  const { toast } = useToast()

  // ── Form-State ──────────────────────────────────────────────
  const [brandName, setBrandName] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [competitors, setCompetitors] = useState<Competitor[]>([{ name: '', url: '' }])
  const [keywords, setKeywords] = useState<string[]>([''])
  const [selectedModels, setSelectedModels] = useState<string[]>(AI_MODELS.map((m) => m.id))
  const [iterations, setIterations] = useState(5)
  const [submitting, setSubmitting] = useState(false)
  const [step, setStep] = useState<'form' | 'review'>('form')

  // ── Reset ───────────────────────────────────────────────────
  function resetForm() {
    setBrandName('')
    setWebsiteUrl('')
    setCompetitors([{ name: '', url: '' }])
    setKeywords([''])
    setSelectedModels(AI_MODELS.map((m) => m.id))
    setIterations(5)
    setStep('form')
    setSubmitting(false)
  }

  // ── Competitors ─────────────────────────────────────────────
  function addCompetitor() {
    if (competitors.length < 3) {
      setCompetitors([...competitors, { name: '', url: '' }])
    }
  }

  function updateCompetitor(index: number, field: keyof Competitor, value: string) {
    const next = [...competitors]
    next[index] = { ...next[index], [field]: value }
    setCompetitors(next)
  }

  function removeCompetitor(index: number) {
    setCompetitors(competitors.filter((_, i) => i !== index))
  }

  // ── Keywords ────────────────────────────────────────────────
  function addKeyword() {
    if (keywords.length < 10) {
      setKeywords([...keywords, ''])
    }
  }

  function updateKeyword(index: number, value: string) {
    const next = [...keywords]
    next[index] = value
    setKeywords(next)
  }

  function removeKeyword(index: number) {
    if (keywords.length > 1) {
      setKeywords(keywords.filter((_, i) => i !== index))
    }
  }

  // ── Model Toggle ────────────────────────────────────────────
  function toggleModel(modelId: string) {
    setSelectedModels((prev) =>
      prev.includes(modelId) ? prev.filter((m) => m !== modelId) : [...prev, modelId]
    )
  }

  // ── Validation ──────────────────────────────────────────────
  const cleanKeywords = keywords.filter((k) => k.trim().length > 0)
  const cleanCompetitors = competitors.filter((c) => c.name.trim().length > 0)

  const isValid =
    brandName.trim().length > 0 && cleanKeywords.length >= 1 && selectedModels.length >= 1

  const brandGenericWarning =
    brandName.trim().length > 0 &&
    brandName.trim().length <= 4 &&
    !websiteUrl.trim()

  // ── Cost Estimate ───────────────────────────────────────────
  const estimate: CostEstimate = calculateCostEstimate(
    cleanKeywords.length || 1,
    selectedModels.length || 1,
    iterations,
    cleanCompetitors.length
  )

  // ── Submit ──────────────────────────────────────────────────
  async function handleSubmit() {
    if (!isValid || submitting) return
    setSubmitting(true)

    try {
      // 1. Projekt erstellen
      const projectRes = await fetch('/api/tenant/visibility/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_name: brandName.trim(),
          website_url: websiteUrl.trim() || null,
          competitors: cleanCompetitors.map((c) => ({
            name: c.name.trim(),
            url: c.url.trim() || null,
          })),
          keywords: cleanKeywords.map((k) => k.trim()),
        }),
      })

      if (!projectRes.ok) {
        const body = await projectRes.json().catch(() => ({}))
        throw new Error(body.error ?? `Fehler ${projectRes.status}`)
      }

      const { project } = await projectRes.json()

      // 2. Analyse starten
      const analysisRes = await fetch('/api/tenant/visibility/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          models: selectedModels,
          iterations,
        }),
      })

      let analysisId: string | null = null
      if (analysisRes.ok) {
        const { analysis } = await analysisRes.json()
        analysisId = analysis.id
      }

      toast({
        title: 'Projekt erstellt',
        description: analysisId
          ? 'Analyse wurde gestartet.'
          : 'Projekt erstellt, aber Analyse konnte nicht gestartet werden.',
      })

      resetForm()
      onOpenChange(false)
      onCreated(project.id, analysisId)
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'Projekt konnte nicht erstellt werden.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) resetForm()
        onOpenChange(val)
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Neues Analyse-Projekt</DialogTitle>
          <DialogDescription>
            Lege ein Projekt an und starte die erste KI-Sichtbarkeitsanalyse.
          </DialogDescription>
        </DialogHeader>

        {step === 'form' && (
          <div className="space-y-6">
            {/* ── Brand ──────────────────────────────────────── */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-slate-900">Brand</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="brand-name">Brand-Name *</Label>
                  <Input
                    id="brand-name"
                    placeholder="z.B. Mustermann GmbH"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    maxLength={100}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="website-url">Website-URL</Label>
                  <Input
                    id="website-url"
                    placeholder="https://mustermann.de"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    type="url"
                  />
                </div>
              </div>
              {brandGenericWarning && (
                <p className="text-xs text-amber-600">
                  Der Name ist kurz und möglicherweise mehrdeutig. Füge eine URL oder Branche hinzu, um die Ergebnisse zu verbessern.
                </p>
              )}
            </fieldset>

            <Separator />

            {/* ── Wettbewerber ────────────────────────────────── */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-slate-900">
                Wettbewerber{' '}
                <span className="font-normal text-slate-400">(optional, max. 3)</span>
              </legend>
              <div className="space-y-2">
                {competitors.map((comp, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="grid flex-1 gap-2 sm:grid-cols-2">
                      <Input
                        placeholder="Name"
                        value={comp.name}
                        onChange={(e) => updateCompetitor(i, 'name', e.target.value)}
                        maxLength={100}
                        aria-label={`Wettbewerber ${i + 1} Name`}
                      />
                      <Input
                        placeholder="URL (optional)"
                        value={comp.url}
                        onChange={(e) => updateCompetitor(i, 'url', e.target.value)}
                        type="url"
                        aria-label={`Wettbewerber ${i + 1} URL`}
                      />
                    </div>
                    {competitors.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeCompetitor(i)}
                        aria-label={`Wettbewerber ${i + 1} entfernen`}
                        className="mt-0.5 shrink-0 text-slate-400 hover:text-red-500"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {competitors.length < 3 && (
                <Button variant="outline" size="sm" onClick={addCompetitor} className="rounded-full">
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Wettbewerber hinzufügen
                </Button>
              )}
            </fieldset>

            <Separator />

            {/* ── Keywords ────────────────────────────────────── */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-slate-900">
                Keywords / Prompts *{' '}
                <span className="font-normal text-slate-400">({keywords.length}/10)</span>
              </legend>
              <p className="text-xs text-slate-500">
                Formuliere die Suchanfragen so, wie Nutzer sie einer KI stellen würden.
              </p>
              <div className="space-y-2">
                {keywords.map((kw, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      placeholder={`z.B. "Welche Marketing-Agentur in Hamburg empfiehlst du?"`}
                      value={kw}
                      onChange={(e) => updateKeyword(i, e.target.value)}
                      maxLength={200}
                      aria-label={`Keyword ${i + 1}`}
                    />
                    {keywords.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeKeyword(i)}
                        aria-label={`Keyword ${i + 1} entfernen`}
                        className="shrink-0 text-slate-400 hover:text-red-500"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {keywords.length < 10 && (
                <Button variant="outline" size="sm" onClick={addKeyword} className="rounded-full">
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Keyword hinzufügen
                </Button>
              )}
            </fieldset>

            <Separator />

            {/* ── Modell-Auswahl ──────────────────────────────── */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-slate-900">KI-Modelle *</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {AI_MODELS.map((model) => (
                  <label
                    key={model.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition',
                      selectedModels.includes(model.id)
                        ? 'border-[#0d9488] bg-[#edf8f6]'
                        : 'border-[#e6ddd0] bg-white hover:border-[#d7ccbc]'
                    )}
                  >
                    <Checkbox
                      checked={selectedModels.includes(model.id)}
                      onCheckedChange={() => toggleModel(model.id)}
                      aria-label={model.label}
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-900">{model.label}</p>
                      <p className="text-xs text-slate-400">{model.provider}</p>
                    </div>
                  </label>
                ))}
              </div>
              {selectedModels.length === 0 && (
                <p className="text-xs text-red-500">Mindestens ein Modell muss ausgewaehlt sein.</p>
              )}
            </fieldset>

            <Separator />

            {/* ── Analyse-Einstellungen ────────────────────────── */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-slate-900">Analyse-Einstellungen</legend>
              <div className="max-w-xs space-y-1.5">
                <Label htmlFor="iterations">Iterationen pro Keyword/Modell</Label>
                <Select value={String(iterations)} onValueChange={(v) => setIterations(Number(v))}>
                  <SelectTrigger id="iterations">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[5, 6, 7, 8, 9, 10].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} Iterationen
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-400">
                  Mehr Iterationen = genauere Ergebnisse, aber mehr API-Calls.
                </p>
              </div>
            </fieldset>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-5">
            {/* ── Zusammenfassung ─────────────────────────────── */}
            <div className="rounded-xl border border-[#e6ddd0] bg-[#fffaf3] p-4 space-y-3">
              <h4 className="text-sm font-semibold text-slate-900">Zusammenfassung</h4>

              <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-slate-400">Brand:</span>{' '}
                  <span className="font-medium text-slate-900">{brandName}</span>
                </div>
                {websiteUrl && (
                  <div>
                    <span className="text-slate-400">Website:</span>{' '}
                    <span className="text-slate-700">{websiteUrl}</span>
                  </div>
                )}
                <div>
                  <span className="text-slate-400">Keywords:</span>{' '}
                  <span className="font-medium text-slate-900">{cleanKeywords.length}</span>
                </div>
                <div>
                  <span className="text-slate-400">Wettbewerber:</span>{' '}
                  <span className="font-medium text-slate-900">{cleanCompetitors.length}</span>
                </div>
                <div>
                  <span className="text-slate-400">Modelle:</span>{' '}
                  <span className="font-medium text-slate-900">{selectedModels.length}</span>
                </div>
                <div>
                  <span className="text-slate-400">Iterationen:</span>{' '}
                  <span className="font-medium text-slate-900">{iterations}</span>
                </div>
              </div>
            </div>

            {/* ── Kosten-Schaetzung ──────────────────────────── */}
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-blue-600" />
                <h4 className="text-sm font-semibold text-blue-900">Geschätzte API-Calls</h4>
              </div>
              <p className="text-2xl font-bold text-blue-700">{estimate.total_api_calls}</p>
              <p className="text-xs text-blue-600">
                {estimate.breakdown.keywords} Keywords x {estimate.breakdown.models} Modelle x{' '}
                {estimate.breakdown.iterations} Iterationen x {estimate.breakdown.subjects} Subjekt
                {estimate.breakdown.subjects !== 1 ? 'e' : ''} (Brand
                {estimate.breakdown.subjects > 1
                  ? ` + ${estimate.breakdown.subjects - 1} Wettbewerber`
                  : ''}
                )
              </p>
            </div>

            {/* ── Keywords-Liste ──────────────────────────────── */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-900">Keywords</h4>
              <div className="flex flex-wrap gap-1.5">
                {cleanKeywords.map((kw, i) => (
                  <Badge
                    key={i}
                    className="rounded-full bg-[#f7f3ed] px-2.5 py-0.5 text-xs text-slate-600 hover:bg-[#f7f3ed]"
                  >
                    {kw}
                  </Badge>
                ))}
              </div>
            </div>

            {/* ── Modelle-Liste ────────────────────────────────── */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-900">Ausgewählte Modelle</h4>
              <div className="flex flex-wrap gap-1.5">
                {selectedModels.map((id) => (
                  <Badge
                    key={id}
                    className="rounded-full bg-[#edf8f6] px-2.5 py-0.5 text-xs text-[#0d9488] hover:bg-[#edf8f6]"
                  >
                    {modelLabel(id)}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 'form' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full">
                Abbrechen
              </Button>
              <Button
                onClick={() => setStep('review')}
                disabled={!isValid}
                className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
              >
                Weiter zur Übersicht
              </Button>
            </>
          )}

          {step === 'review' && (
            <>
              <Button variant="outline" onClick={() => setStep('form')} className="rounded-full">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Zurück
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-full bg-[#0d9488] text-white hover:bg-[#0d7d73]"
              >
                {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Analyse starten
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═══════════════════════════════════════════════════════════════
// ProjectDetailView
// ═══════════════════════════════════════════════════════════════

interface ProjectDetailViewProps {
  role: WorkspaceRole
  projectId: string
  cachedProject: VisibilityProject | null
  initialSelectedAnalysisId: string | null
  onBack: () => void
  onOpenProgress: (analysisId: string) => void
  onOpenReport: (analysisId: string) => void
  onProjectDeleted: () => void
}

function ProjectDetailView({
  role,
  projectId,
  cachedProject,
  initialSelectedAnalysisId,
  onBack,
  onOpenProgress,
  onOpenReport,
  onProjectDeleted,
}: ProjectDetailViewProps) {
  const { toast } = useToast()
  const [project, setProject] = useState<VisibilityProject | null>(cachedProject)
  const [analyses, setAnalyses] = useState<VisibilityAnalysis[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [startingAnalysis, setStartingAnalysis] = useState(false)
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(initialSelectedAnalysisId)

  // ── Dialog State fuer Neue Analyse ──────────────────────────
  const [newAnalysisOpen, setNewAnalysisOpen] = useState(false)
  const [newAnalysisModels, setNewAnalysisModels] = useState<string[]>(AI_MODELS.map((m) => m.id))
  const [newAnalysisIterations, setNewAnalysisIterations] = useState(5)

  const fetchDetail = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [projectRes, analysesRes] = await Promise.all([
        fetch(`/api/tenant/visibility/projects/${projectId}`),
        fetch(`/api/tenant/visibility/analyses?project_id=${projectId}`),
      ])
      if (!projectRes.ok) {
        const body = await projectRes.json().catch(() => ({}))
        throw new Error(body.error ?? `Fehler ${projectRes.status}`)
      }
      if (!analysesRes.ok) {
        const body = await analysesRes.json().catch(() => ({}))
        throw new Error(body.error ?? `Fehler ${analysesRes.status}`)
      }
      const projectData = await projectRes.json()
      const analysesData = await analysesRes.json()
      setProject(projectData.project)
      setAnalyses(analysesData.analyses ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Projektdaten konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  useEffect(() => {
    setSelectedAnalysisId(initialSelectedAnalysisId)
  }, [initialSelectedAnalysisId])

  // ── Projekt loeschen ────────────────────────────────────────
  async function handleDelete() {
    if (!window.confirm('Projekt und alle Analysen unwiderruflich loeschen?')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/tenant/visibility/projects/${projectId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Fehler ${res.status}`)
      }
      toast({ title: 'Projekt geloescht' })
      onProjectDeleted()
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'Loeschen fehlgeschlagen.',
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
    }
  }

  // ── Neue Analyse starten ────────────────────────────────────
  async function handleStartAnalysis() {
    if (startingAnalysis) return
    setStartingAnalysis(true)
    try {
      const res = await fetch('/api/tenant/visibility/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          models: newAnalysisModels,
          iterations: newAnalysisIterations,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Fehler ${res.status}`)
      }
      const { analysis } = await res.json()
      toast({ title: 'Analyse gestartet' })
      setNewAnalysisOpen(false)
      onOpenProgress(analysis.id)
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'Analyse konnte nicht gestartet werden.',
        variant: 'destructive',
      })
    } finally {
      setStartingAnalysis(false)
    }
  }

  // ── Loading ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 rounded-[24px]" />
        <Skeleton className="h-60 rounded-[24px]" />
      </div>
    )
  }

  // ── Error ───────────────────────────────────────────────────
  if (error || !project) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={onBack} className="rounded-full">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Zurück
        </Button>
        <Alert variant="destructive" className="rounded-[24px]">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Fehler</AlertTitle>
          <AlertDescription>{error ?? 'Projekt nicht gefunden.'}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const runningCount = analyses.filter((a) => a.status === 'running' || a.status === 'pending').length
  const reportableAnalyses = analyses.filter(
    (analysis) =>
      analysis.status === 'done' &&
      (analysis.analytics_status === 'done' || analysis.analytics_status === 'partial')
  )

  const selectedAnalysis =
    analyses.find((analysis) => analysis.id === selectedAnalysisId) ?? reportableAnalyses[0] ?? null

  return (
    <div className="space-y-5">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="mt-0.5 shrink-0 rounded-full">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{project.brand_name}</h2>
            {project.website_url && (
              <p className="flex items-center gap-1 text-sm text-slate-400">
                <Globe className="h-3.5 w-3.5" />
                {project.website_url}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-full text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            {deleting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
            Loeschen
          </Button>
          <Button
            onClick={() => setNewAnalysisOpen(true)}
            className="rounded-full bg-[#0d9488] text-white hover:bg-[#0d7d73]"
            size="sm"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Neue Analyse
          </Button>
        </div>
      </div>

      {/* ── Projekt-Info ──────────────────────────────────── */}
      <Card className="rounded-[24px] border border-[#e6ddd0] bg-white shadow-sm">
        <CardContent className="space-y-4 p-5">
          {/* Wettbewerber */}
          {project.competitors.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Wettbewerber
              </h4>
              <div className="flex flex-wrap gap-2">
                {project.competitors.map((c, i) => (
                  <Badge
                    key={i}
                    className="rounded-full bg-[#fff1e8] px-2.5 py-0.5 text-xs text-[#a35a34] hover:bg-[#fff1e8]"
                  >
                    {c.name}
                    {c.url ? ` (${c.url})` : ''}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {/* Keywords */}
          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Keywords
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {project.keywords.map((kw, i) => (
                <Badge
                  key={i}
                  className="rounded-full bg-[#f7f3ed] px-2.5 py-0.5 text-xs text-slate-600 hover:bg-[#f7f3ed]"
                >
                  {kw}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Analyse-History ───────────────────────────────── */}
      <Card className="rounded-[24px] border border-[#e6ddd0] bg-white shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-slate-900">Analysen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {analyses.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">
              Noch keine Analysen durchgefuehrt.
            </p>
          )}
          {analyses.map((analysis) => (
            <AnalysisRow
              key={analysis.id}
              analysis={analysis}
              isSelected={analysis.id === selectedAnalysis?.id}
              onClick={() => {
                if (analysis.status === 'running' || analysis.status === 'pending' || analysis.status === 'queued') {
                  onOpenProgress(analysis.id)
                  return
                }

                setSelectedAnalysisId(analysis.id)
                onOpenReport(analysis.id)
              }}
            />
          ))}
        </CardContent>
      </Card>

      <AiVisibilityReport
        project={project}
        analyses={analyses}
        selectedAnalysisId={selectedAnalysis?.id ?? selectedAnalysisId}
        onSelectAnalysis={setSelectedAnalysisId}
      />

      {/* ── Neue Analyse Dialog ────────────────────────────── */}
      <Dialog open={newAnalysisOpen} onOpenChange={setNewAnalysisOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Neue Analyse starten</DialogTitle>
            <DialogDescription>
              Starte eine neue Analyse für &quot;{project.brand_name}&quot;.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Modelle */}
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-slate-900">KI-Modelle</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {AI_MODELS.map((model) => (
                  <label
                    key={model.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition',
                      newAnalysisModels.includes(model.id)
                        ? 'border-[#0d9488] bg-[#edf8f6]'
                        : 'border-[#e6ddd0] bg-white hover:border-[#d7ccbc]'
                    )}
                  >
                    <Checkbox
                      checked={newAnalysisModels.includes(model.id)}
                      onCheckedChange={() =>
                        setNewAnalysisModels((prev) =>
                          prev.includes(model.id) ? prev.filter((m) => m !== model.id) : [...prev, model.id]
                        )
                      }
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-900">{model.label}</p>
                      <p className="text-xs text-slate-400">{model.provider}</p>
                    </div>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Iterationen */}
            <div className="max-w-xs space-y-1.5">
              <Label htmlFor="new-iterations">Iterationen</Label>
              <Select
                value={String(newAnalysisIterations)}
                onValueChange={(v) => setNewAnalysisIterations(Number(v))}
              >
                <SelectTrigger id="new-iterations">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[5, 6, 7, 8, 9, 10].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} Iterationen
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Kosten */}
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-900">
                  {calculateCostEstimate(
                    project.keywords.length,
                    newAnalysisModels.length,
                    newAnalysisIterations,
                    project.competitors.length
                  ).total_api_calls}{' '}
                  API-Calls
                </span>
              </div>
            </div>

            {runningCount >= 2 && (
              <Alert className="rounded-xl">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Es laufen bereits {runningCount} Analysen. Neue Analyse wird in die Warteschlange gestellt.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewAnalysisOpen(false)} className="rounded-full">
              Abbrechen
            </Button>
            <Button
              onClick={handleStartAnalysis}
              disabled={startingAnalysis || newAnalysisModels.length === 0}
              className="rounded-full bg-[#0d9488] text-white hover:bg-[#0d7d73]"
            >
              {startingAnalysis && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Analyse starten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// AnalysisRow
// ═══════════════════════════════════════════════════════════════

function AnalysisRow({
  analysis,
  isSelected,
  onClick,
}: {
  analysis: VisibilityAnalysis
  isSelected?: boolean
  onClick: () => void
}) {
  const isActive = analysis.status === 'running' || analysis.status === 'pending' || analysis.status === 'queued'
  const hasReport = analysis.status === 'done' && (analysis.analytics_status === 'done' || analysis.analytics_status === 'partial')
  const progressPercent =
    analysis.progress_total > 0
      ? Math.round((analysis.progress_done / analysis.progress_total) * 100)
      : 0

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-4 rounded-xl border border-[#e6ddd0] p-3 text-left transition',
        isActive
          ? 'cursor-pointer bg-white hover:border-[#d7ccbc] hover:shadow-sm'
          : hasReport || analysis.analytics_status === 'pending' || analysis.analytics_status === 'running'
            ? 'cursor-pointer bg-white hover:border-[#d7ccbc] hover:shadow-sm'
            : 'cursor-default bg-[#fafaf9]',
        isSelected && 'border-[#0d9488] bg-[#f2fbfa]'
      )}
      aria-label={`Analyse vom ${formatDate(analysis.created_at)}, Status: ${statusLabel(analysis.status)}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={cn('rounded-full px-2 py-0.5 text-[11px]', statusColor(analysis.status))}>
            {statusLabel(analysis.status)}
          </Badge>
          {analysis.analytics_status && (
            <Badge
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px]',
                analyticsStatusColor(analysis.analytics_status)
              )}
            >
              {analyticsStatusLabel(analysis.analytics_status)}
            </Badge>
          )}
          <span className="text-xs text-slate-400">{formatDate(analysis.created_at)}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {analysis.models.map((m) => (
            <Badge
              key={m}
              className="rounded-full bg-[#f7f3ed] px-2 py-0 text-[10px] text-slate-500 hover:bg-[#f7f3ed]"
            >
              {modelLabel(m)}
            </Badge>
          ))}
          <span className="text-[10px] text-slate-400">{analysis.iterations}x</span>
        </div>
        {isActive && analysis.progress_total > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <Progress value={progressPercent} className="h-1.5 flex-1" />
            <span className="text-[11px] text-slate-400">{progressPercent}%</span>
          </div>
        )}
      </div>
      {(isActive || hasReport || analysis.analytics_status === 'pending' || analysis.analytics_status === 'running') && (
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
      )}
    </button>
  )
}

// ═══════════════════════════════════════════════════════════════
// AnalysisProgressView
// ═══════════════════════════════════════════════════════════════

interface AnalysisProgressViewProps {
  analysisId: string
  onOpenProgress: (analysisId: string) => void
  onOpenReport?: (analysisId: string) => void
  onBack: () => void
}

function AnalysisProgressView({ analysisId, onOpenProgress, onOpenReport, onBack }: AnalysisProgressViewProps) {
  const { toast } = useToast()
  const [status, setStatus] = useState<AnalysisStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/tenant/visibility/analyses/${analysisId}/status`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Fehler ${res.status}`)
      }
      const data: AnalysisStatusResponse = await res.json()
      setStatus(data)
      setError(null)

      // Polling stoppen wenn fertig
      if (data.status === 'done' || data.status === 'failed' || data.status === 'cancelled') {
        if (pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status konnte nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [analysisId])

  // ── Polling ─────────────────────────────────────────────────
  useEffect(() => {
    fetchStatus()
    pollingRef.current = setInterval(fetchStatus, 3000)

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [fetchStatus])

  // ── Analyse abbrechen ───────────────────────────────────────
  async function handleCancel() {
    if (!window.confirm('Analyse wirklich abbrechen?')) return
    setCancelling(true)
    try {
      const res = await fetch(`/api/tenant/visibility/analyses/${analysisId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Fehler ${res.status}`)
      }
      toast({ title: 'Analyse abgebrochen' })
      fetchStatus()
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'Abbrechen fehlgeschlagen.',
        variant: 'destructive',
      })
    } finally {
      setCancelling(false)
    }
  }

  async function handleRetry() {
    if (!status || retrying) return
    setRetrying(true)
    try {
      const res = await fetch('/api/tenant/visibility/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: status.project_id,
          models: status.models,
          iterations: status.iterations,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Fehler ${res.status}`)
      }

      const { analysis } = await res.json()
      toast({ title: 'Analyse erneut gestartet' })
      onOpenProgress(analysis.id)
    } catch (err) {
      toast({
        title: 'Fehler',
        description:
          err instanceof Error ? err.message : 'Analyse konnte nicht erneut gestartet werden.',
        variant: 'destructive',
      })
    } finally {
      setRetrying(false)
    }
  }

  // ── Loading ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-full rounded-full" />
        <Skeleton className="h-40 rounded-[24px]" />
      </div>
    )
  }

  // ── Error ───────────────────────────────────────────────────
  if (error && !status) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={onBack} className="rounded-full">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Zurück
        </Button>
        <Alert variant="destructive" className="rounded-[24px]">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Fehler</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!status) return null

  const progressPercent =
    status.progress_total > 0
      ? Math.round((status.progress_done / status.progress_total) * 100)
      : 0

  const isActive = status.status === 'running' || status.status === 'pending' || status.status === 'queued'
  const isDone = status.status === 'done'
  const isFailed = status.status === 'failed'

  return (
    <div className="space-y-5">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 rounded-full">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Analyse-Fortschritt</h2>
            <Badge className={cn('mt-1 rounded-full px-2.5 py-0.5', statusColor(status.status))}>
              {statusLabel(status.status)}
            </Badge>
          </div>
        </div>
        {isActive && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={cancelling}
            className="rounded-full text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            {cancelling ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <XCircle className="mr-1.5 h-3.5 w-3.5" />
            )}
            Abbrechen
          </Button>
        )}
      </div>

      {/* ── Gesamtfortschritt ─────────────────────────────── */}
      <Card className="rounded-[24px] border border-[#e6ddd0] bg-white shadow-sm">
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Gesamtfortschritt</span>
            <span className="text-sm font-semibold text-slate-900">
              {status.progress_done} / {status.progress_total}
            </span>
          </div>
          <Progress
            value={progressPercent}
            className={cn(
              'h-3',
              isDone && '[&>div]:bg-emerald-500',
              isFailed && '[&>div]:bg-red-500'
            )}
          />
          <p className="text-right text-xs text-slate-400">{progressPercent}%</p>
        </CardContent>
      </Card>

      {/* ── Modell-Fortschritt ─────────────────────────────── */}
      {status.model_progress.length > 0 && (
        <Card className="rounded-[24px] border border-[#e6ddd0] bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-slate-900">
              Fortschritt pro Modell
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {status.model_progress.map((mp) => {
              const pct = mp.total > 0 ? Math.round((mp.done / mp.total) * 100) : 0
              return (
                <div key={mp.model} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">{modelLabel(mp.model)}</span>
                    <span className="text-xs text-slate-400">
                      {mp.done}/{mp.total}
                    </span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* ── Fertig-Meldung ─────────────────────────────────── */}
      {isDone && (
        <Alert className="rounded-[24px] border-emerald-200 bg-emerald-50">
          <Search className="h-4 w-4 text-emerald-600" />
          <AlertTitle className="text-emerald-800">Analyse abgeschlossen</AlertTitle>
          <AlertDescription className="text-emerald-700">
            Alle Abfragen wurden erfolgreich verarbeitet. Die Ergebnisse stehen in der Auswertung zur Verfügung.
          </AlertDescription>
        </Alert>
      )}

      {isDone && (status.analytics_status === 'done' || status.analytics_status === 'partial') && (
        <div className="flex justify-end">
          <Button
            onClick={() => onOpenReport?.(analysisId)}
            className="rounded-full bg-[#0d9488] text-white hover:bg-[#0d7d73]"
          >
            Zur Auswertung
          </Button>
        </div>
      )}

      {/* ── Fehler-Meldung ─────────────────────────────────── */}
      {isFailed && (
        <Alert variant="destructive" className="rounded-[24px]">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Analyse fehlgeschlagen</AlertTitle>
          <AlertDescription>
            Die Analyse konnte nicht vollständig abgeschlossen werden. Prüfe das Fehler-Log unten
            oder starte sie mit denselben Einstellungen erneut.
          </AlertDescription>
        </Alert>
      )}

      {isFailed && (
        <div className="flex justify-end">
          <Button
            onClick={handleRetry}
            disabled={retrying}
            className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
          >
            {retrying && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Analyse erneut starten
          </Button>
        </div>
      )}

      {/* ── Fehler-Log ─────────────────────────────────────── */}
      {status.error_log.length > 0 && (
        <Card className="rounded-[24px] border border-[#e6ddd0] bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              Fehler-Log
              <Badge className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700 hover:bg-amber-50">
                {status.error_log.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-60 space-y-2 overflow-y-auto">
              {status.error_log.map((err, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-amber-100 bg-amber-50/50 p-3 text-xs"
                >
                  <div className="flex flex-wrap gap-2">
                    <Badge className="rounded-full bg-amber-100 px-2 py-0 text-[10px] text-amber-700 hover:bg-amber-100">
                      {modelLabel(err.model)}
                    </Badge>
                    <span className="text-amber-600">{err.keyword}</span>
                  </div>
                  <p className="mt-1 text-amber-800">{err.error}</p>
                  <p className="mt-0.5 text-amber-400">{formatDate(err.timestamp)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
