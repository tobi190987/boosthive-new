'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  FileText,
  Link,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
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
import { useActiveCustomer } from '@/lib/active-customer-context'
import { ApprovalSubmitPanel } from '@/components/approval-submit-panel'
import type { ApprovalStatus } from '@/components/approval-status-badge'
import { readSessionCache, writeSessionCache } from '@/lib/client-cache'
import { NoCustomerSelected } from '@/components/no-customer-selected'

// ─── Types ───────────────────────────────────────────────────────────────────

interface BriefSummary {
  id: string
  keyword: string
  language: string
  tone: string
  word_count_target: number
  target_url: string | null
  status: 'pending' | 'generating' | 'done' | 'failed'
  error_message: string | null
  created_at: string
  updated_at: string
}

interface BriefOutlineItem {
  h2: string
  description: string
  h3s: string[]
}

interface BriefKeyword {
  term: string
  frequency: string
}

interface BriefJson {
  search_intent: { type: string; reasoning: string }
  h1_titles: string[]
  meta_descriptions: string[]
  outline: BriefOutlineItem[]
  keywords: BriefKeyword[]
  competitor_hints: string | null
  internal_linking_hints: string[] | null
  cta_recommendation: string
}

interface BriefDetail extends BriefSummary {
  brief_json: BriefJson | null
}

interface ApprovalInfo {
  status: ApprovalStatus
  link: string | null
  feedback: string | null
}

interface KeywordProject {
  id: string
  name: string
  target_domain: string
  keyword_count: number
}

interface ProjectKeyword {
  id: string
  keyword: string
}

type View =
  | { type: 'list' }
  | { type: 'detail'; briefId: string }

const BRIEF_LIST_CACHE_PREFIX = 'content-briefs:list:'
const BRIEF_DETAIL_CACHE_PREFIX = 'content-briefs:detail:'

// ─── Status helpers ──────────────────────────────────────────────────────────

function statusBadge(status: BriefSummary['status']) {
  switch (status) {
    case 'pending':
      return <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-400">Wartend</Badge>
    case 'generating':
      return <Badge variant="outline" className="rounded-full border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-400"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Generiert...</Badge>
    case 'done':
      return <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400">Fertig</Badge>
    case 'failed':
      return <Badge variant="outline" className="rounded-full border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400">Fehlgeschlagen</Badge>
  }
}

function toneLabel(tone: string) {
  switch (tone) {
    case 'informativ': return 'Informativ'
    case 'werblich': return 'Werblich'
    case 'neutral': return 'Neutral'
    default: return tone
  }
}

function langLabel(lang: string) {
  switch (lang) {
    case 'de': return 'Deutsch'
    case 'en': return 'Englisch'
    case 'fr': return 'Französisch'
    case 'es': return 'Spanisch'
    case 'it': return 'Italienisch'
    default: return lang
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── Markdown export ─────────────────────────────────────────────────────────

function briefToMarkdown(brief: BriefDetail): string {
  const b = brief.brief_json
  if (!b) return ''

  const lines: string[] = []
  lines.push(`# Content Brief: ${brief.keyword}`)
  lines.push('')
  lines.push(`**Sprache:** ${langLabel(brief.language)} | **Tonalität:** ${toneLabel(brief.tone)} | **Wortanzahl-Ziel:** ${brief.word_count_target}`)
  if (brief.target_url) lines.push(`**Ziel-URL:** ${brief.target_url}`)
  lines.push('')

  // Search Intent
  lines.push(`## Suchintention`)
  lines.push(`**Typ:** ${b.search_intent.type}`)
  lines.push('')
  lines.push(b.search_intent.reasoning)
  lines.push('')

  // H1 Titles
  lines.push(`## Empfohlene H1-Titel`)
  b.h1_titles.forEach((t, i) => lines.push(`${i + 1}. ${t}`))
  lines.push('')

  // Meta Descriptions
  lines.push(`## Meta-Description Vorschläge`)
  b.meta_descriptions.forEach((m, i) => lines.push(`${i + 1}. ${m}`))
  lines.push('')

  // Outline
  lines.push(`## Gliederung`)
  b.outline.forEach((section) => {
    lines.push(`### ${section.h2}`)
    lines.push(section.description)
    if (section.h3s && section.h3s.length > 0) {
      section.h3s.forEach((sub) => {
        lines.push(`#### ${sub}`)
      })
    }
    lines.push('')
  })

  // Keywords
  lines.push(`## Kern-Keywords`)
  lines.push(`| Keyword | Empfohlene Häufigkeit |`)
  lines.push(`|---------|----------------------|`)
  b.keywords.forEach((kw) => lines.push(`| ${kw.term} | ${kw.frequency} |`))
  lines.push('')

  // Internal Linking Hints
  if (b.internal_linking_hints && b.internal_linking_hints.length > 0) {
    lines.push(`## Interne Verlinkungsvorschläge`)
    b.internal_linking_hints.forEach((hint) => lines.push(`- ${hint}`))
    lines.push('')
  }

  // Competitor Hints
  if (b.competitor_hints) {
    lines.push(`## Wettbewerber-Hinweise`)
    lines.push(b.competitor_hints)
    lines.push('')
  }

  // CTA
  lines.push(`## Call-to-Action Empfehlung`)
  lines.push(b.cta_recommendation)
  lines.push('')

  return lines.join('\n')
}

function downloadMarkdown(brief: BriefDetail) {
  const md = briefToMarkdown(brief)
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `content-brief-${brief.keyword.replace(/\s+/g, '-').toLowerCase()}.md`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Main component ─────────────────────────────────────────────────────────

export function ContentBriefsWorkspace() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { activeCustomer } = useActiveCustomer()
  const { toast } = useToast()

  const [view, setView] = useState<View>({ type: 'list' })
  const [briefs, setBriefs] = useState<BriefSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Detail view
  const [detail, setDetail] = useState<BriefDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [approvalInfo, setApprovalInfo] = useState<ApprovalInfo | null>(null)

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [createStep, setCreateStep] = useState<1 | 2>(1)
  const [creating, setCreating] = useState(false)

  // Create form
  const [keyword, setKeyword] = useState('')
  const [keywordSource, setKeywordSource] = useState<'manual' | 'project'>('manual')
  const [language, setLanguage] = useState('de')
  const [tone, setTone] = useState('informativ')
  const [wordCount, setWordCount] = useState('1000')
  const [targetUrl, setTargetUrl] = useState('')

  // Keyword project import
  const [kwProjects, setKwProjects] = useState<KeywordProject[]>([])
  const [kwProjectsLoading, setKwProjectsLoading] = useState(false)
  const [kwProjectsUnavailable, setKwProjectsUnavailable] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [selectedKeywordFromProject, setSelectedKeywordFromProject] = useState<string>('')
  const [kwKeywords, setKwKeywords] = useState<ProjectKeyword[]>([])
  const [kwKeywordsLoading, setKwKeywordsLoading] = useState(false)

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Polling ref
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const customerId = activeCustomer?.id ?? null
  const briefsCacheKey = `${BRIEF_LIST_CACHE_PREFIX}${customerId ?? 'all'}`

  // ── Fetch briefs ──────────────────────────────────────────────────────────

  const fetchBriefs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = customerId
        ? `/api/tenant/content/briefs?customer_id=${customerId}`
        : `/api/tenant/content/briefs`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Briefs konnten nicht geladen werden.')
      const data = await res.json()
      setBriefs(data.briefs ?? [])
      writeSessionCache(briefsCacheKey, data.briefs ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [briefsCacheKey, customerId])

  useEffect(() => {
    const cachedBriefs = readSessionCache<BriefSummary[]>(briefsCacheKey)
    if (cachedBriefs) {
      setBriefs(cachedBriefs)
      setLoading(false)
    }
    fetchBriefs()
  }, [briefsCacheKey, fetchBriefs])

  // ── Fetch detail ──────────────────────────────────────────────────────────

  const fetchDetail = useCallback(async (briefId: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/tenant/content/briefs/${briefId}`)
      if (!res.ok) throw new Error('Brief konnte nicht geladen werden.')
      const data = await res.json()
      setDetail(data.brief ?? null)
      if (data.brief) {
        writeSessionCache(`${BRIEF_DETAIL_CACHE_PREFIX}${briefId}`, data.brief)
      }
    } catch (err) {
      toast({ title: 'Fehler', description: err instanceof Error ? err.message : 'Fehler beim Laden', variant: 'destructive' })
    } finally {
      setDetailLoading(false)
    }
  }, [toast])

  const fetchApprovalInfo = useCallback(async (briefId: string) => {
    try {
      const params = new URLSearchParams({
        content_type: 'content_brief',
        content_id: briefId,
      })
      const res = await fetch(`/api/tenant/approvals?${params.toString()}`)
      if (!res.ok) return
      const data = await res.json()
      const first = Array.isArray(data.approvals) ? data.approvals[0] : null
      if (!first) {
        setApprovalInfo({ status: 'draft', link: null, feedback: null })
        return
      }
      setApprovalInfo({
        status: first.status as ApprovalStatus,
        link: `${window.location.origin}/approval/${first.public_token}`,
        feedback: first.feedback ?? null,
      })
    } catch {
      // optional UI fetch
    }
  }, [])

  useEffect(() => {
    const briefIdFromUrl = searchParams.get('briefId')
    if (!briefIdFromUrl) {
      if (view.type !== 'list') {
        setView({ type: 'list' })
        setDetail(null)
      }
      return
    }

    if (view.type !== 'detail' || view.briefId !== briefIdFromUrl) {
      setView({ type: 'detail', briefId: briefIdFromUrl })
      const cachedDetail = readSessionCache<BriefDetail>(`${BRIEF_DETAIL_CACHE_PREFIX}${briefIdFromUrl}`)
      if (cachedDetail) {
        setDetail(cachedDetail)
      }
      fetchDetail(briefIdFromUrl)
    }
  }, [fetchDetail, searchParams, view])

  useEffect(() => {
    if (view.type === 'detail') {
      fetchApprovalInfo(view.briefId)
    } else {
      setApprovalInfo(null)
    }
  }, [view, fetchApprovalInfo])

  // ── Polling for generating briefs ─────────────────────────────────────────

  useEffect(() => {
    if (view.type !== 'detail' || !detail) return
    if (detail.status !== 'pending' && detail.status !== 'generating') return

    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/tenant/content/briefs/${detail.id}/status`)
        if (!res.ok) return
        const data = await res.json()
        if (data.status === 'done' || data.status === 'failed') {
          clearInterval(poll)
          // Reload full detail
          fetchDetail(detail.id)
          // Also refresh list
          fetchBriefs()
        } else if (data.status !== detail.status) {
          setDetail((prev) => prev ? { ...prev, status: data.status } : prev)
        }
      } catch {
        // ignore polling errors
      }
    }, 3000)

    pollingRef.current = poll
    return () => clearInterval(poll)
  }, [view, detail, fetchDetail, fetchBriefs])

  if (!activeCustomer) {
    return <NoCustomerSelected toolName="Content Briefs" />
  }

  // ── Create brief ──────────────────────────────────────────────────────────

  const resetCreateForm = () => {
    setKeyword('')
    setKeywordSource('manual')
    setLanguage('de')
    setTone('informativ')
    setWordCount('1000')
    setTargetUrl('')
    setSelectedProjectId('')
    setSelectedKeywordFromProject('')
    setKwKeywords([])
    setCreateStep(1)
  }

  const handleCreateOpen = () => {
    resetCreateForm()
    setCreateOpen(true)
  }

  const handleCreateClose = () => {
    setCreateOpen(false)
    resetCreateForm()
  }

  // Load keyword projects when switching to project source
  useEffect(() => {
    if (keywordSource !== 'project' || kwProjects.length > 0 || kwProjectsLoading || kwProjectsUnavailable) return
    setKwProjectsLoading(true)
    fetch(`/api/tenant/keywords/projects?customer_id=${customerId}`)
      .then(async (res) => {
        if (res.status === 403) { setKwProjectsUnavailable(true); return }
        if (!res.ok) throw new Error('Projekte konnten nicht geladen werden.')
        const data = await res.json()
        setKwProjects(data.projects ?? [])
      })
      .catch(() => {
        toast({ title: 'Fehler', description: 'Keyword-Projekte konnten nicht geladen werden.', variant: 'destructive' })
      })
      .finally(() => setKwProjectsLoading(false))
  }, [keywordSource, kwProjects.length, kwProjectsLoading, kwProjectsUnavailable, customerId, toast])

  // Load keywords when a project is selected
  useEffect(() => {
    if (!selectedProjectId) { setKwKeywords([]); return }
    setKwKeywordsLoading(true)
    setSelectedKeywordFromProject('')
    fetch(`/api/tenant/keywords/projects/${selectedProjectId}/keywords`)
      .then(async (res) => {
        if (!res.ok) throw new Error()
        const data = await res.json()
        setKwKeywords(data.keywords ?? [])
      })
      .catch(() => setKwKeywords([]))
      .finally(() => setKwKeywordsLoading(false))
  }, [selectedProjectId])

  const selectedProject = kwProjects.find((p) => p.id === selectedProjectId)

  const effectiveKeyword = keywordSource === 'project' ? selectedKeywordFromProject : keyword

  const canProceedStep1 = effectiveKeyword.trim().length >= 2
  const canCreate = canProceedStep1

  const handleCreate = async () => {
    if (!canCreate || !customerId) return
    setCreating(true)
    try {
      const res = await fetch('/api/tenant/content/briefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId,
          keyword: effectiveKeyword.trim(),
          language,
          tone,
          word_count_target: parseInt(wordCount, 10),
          target_url: targetUrl.trim() || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Brief konnte nicht erstellt werden.')
      }
      const data = await res.json()
      toast({ title: 'Brief wird generiert', description: `Content Brief für "${effectiveKeyword}" wird erstellt.` })
      handleCreateClose()
      fetchBriefs()
      // Navigate to the new brief
      if (data.brief?.id) {
        router.replace(`${pathname}?briefId=${data.brief.id}`, { scroll: false })
      }
    } catch (err) {
      toast({ title: 'Fehler', description: err instanceof Error ? err.message : 'Fehler beim Erstellen', variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  // ── Delete brief ──────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/tenant/content/briefs/${deleteId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Brief konnte nicht gelöscht werden.')
      toast({ title: 'Gelöscht', description: 'Content Brief wurde entfernt.' })
      setDeleteId(null)
      if (view.type === 'detail' && view.briefId === deleteId) {
        setView({ type: 'list' })
        setDetail(null)
        router.replace(pathname, { scroll: false })
      }
      fetchBriefs()
    } catch (err) {
      toast({ title: 'Fehler', description: err instanceof Error ? err.message : 'Fehler beim Löschen', variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  // ── Retry failed brief ───────────────────────────────────────────────────

  const handleRetry = async (briefId: string) => {
    try {
      const res = await fetch(`/api/tenant/content/briefs/${briefId}/retry`, { method: 'POST' })
      if (!res.ok) throw new Error('Retry fehlgeschlagen.')
      toast({ title: 'Erneuter Versuch', description: 'Brief-Generierung wird wiederholt.' })
      fetchDetail(briefId)
      fetchBriefs()
    } catch (err) {
      toast({ title: 'Fehler', description: err instanceof Error ? err.message : 'Retry fehlgeschlagen', variant: 'destructive' })
    }
  }

  // ── Detail view ───────────────────────────────────────────────────────────

  if (view.type === 'detail') {
    return (
      <div className="space-y-6">
        {/* Back button */}
        <Button
          variant="ghost"
          size="sm"
                    onClick={() => {
                      setView({ type: 'list' })
                      setDetail(null)
                      router.replace(pathname, { scroll: false })
                    }}
          className="gap-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zur Übersicht
        </Button>

        {detailLoading && !detail ? (
          <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
            <CardContent className="p-8 space-y-6">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        ) : detail ? (
          <>
            {/* Header */}
            <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
              <CardContent className="p-6 md:p-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">{detail.keyword}</h1>
                      {statusBadge(detail.status)}
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm text-slate-500 dark:text-slate-400">
                      <span>{langLabel(detail.language)}</span>
                      <span className="text-slate-300 dark:text-slate-600">|</span>
                      <span>{toneLabel(detail.tone)}</span>
                      <span className="text-slate-300 dark:text-slate-600">|</span>
                      <span>{detail.word_count_target} Wörter</span>
                      {detail.target_url && (
                        <>
                          <span className="text-slate-300 dark:text-slate-600">|</span>
                          <span className="truncate max-w-[200px]">{detail.target_url}</span>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Erstellt: {formatDate(detail.created_at)}</p>
                    {detail.status === 'done' && approvalInfo && (
                      <div className="pt-1">
                        <ApprovalSubmitPanel
                          contentType="content_brief"
                          contentId={detail.id}
                          approvalStatus={approvalInfo.status}
                          approvalLink={approvalInfo.link}
                          feedback={approvalInfo.feedback}
                          onStatusChange={(newStatus, link) => {
                            setApprovalInfo((prev) => ({
                              status: newStatus,
                              link: link ?? prev?.link ?? null,
                              feedback: newStatus === 'changes_requested' ? prev?.feedback ?? null : null,
                            }))
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {detail.status === 'done' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadMarkdown(detail)}
                          className="gap-2 rounded-full"
                        >
                          <Download className="h-4 w-4" />
                          Markdown
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.print()}
                          className="gap-2 rounded-full"
                        >
                          <Printer className="h-4 w-4" />
                          PDF
                        </Button>
                      </>
                    )}
                    {detail.status === 'failed' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRetry(detail.id)}
                        className="gap-2 rounded-full"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Erneut versuchen
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteId(detail.id)}
                      className="gap-2 rounded-full text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                    >
                      <Trash2 className="h-4 w-4" />
                      Löschen
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Generating state */}
            {(detail.status === 'pending' || detail.status === 'generating') && (
              <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
                <CardContent className="flex flex-col items-center gap-5 px-6 py-16 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/50">
                    <Sparkles className="h-7 w-7 animate-pulse text-blue-500 dark:text-blue-400" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">KI arbeitet...</h2>
                    <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
                      Dein Content Brief wird gerade generiert. Das kann bis zu 30 Sekunden dauern.
                    </p>
                  </div>
                  <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                </CardContent>
              </Card>
            )}

            {/* Failed state */}
            {detail.status === 'failed' && (
              <Alert variant="destructive" className="rounded-2xl">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Generierung fehlgeschlagen</AlertTitle>
                <AlertDescription>
                  {detail.error_message ?? 'Ein unbekannter Fehler ist aufgetreten. Bitte versuche es erneut.'}
                </AlertDescription>
              </Alert>
            )}

            {/* Brief content (done) */}
            {detail.status === 'done' && detail.brief_json && (
              <BriefContent brief={detail.brief_json} keyword={detail.keyword} />
            )}
          </>
        ) : (
          <Alert variant="destructive" className="rounded-2xl">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Fehler</AlertTitle>
            <AlertDescription>Brief konnte nicht geladen werden.</AlertDescription>
          </Alert>
        )}

        {/* Delete confirmation */}
        <DeleteConfirmDialog
          open={!!deleteId}
          onClose={() => setDeleteId(null)}
          onConfirm={handleDelete}
          deleting={deleting}
        />
      </div>
    )
  }

  // ── List view ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Content Briefs</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            KI-generierte Content-Briefings für SEO-optimierte Inhalte
          </p>
        </div>
        <Button
          onClick={handleCreateOpen}
          disabled={!activeCustomer}
          title={!activeCustomer ? 'Bitte zuerst einen Kunden auswählen' : undefined}
          className="gap-2 rounded-full bg-[#1f2937] text-white hover:bg-[#111827] dark:bg-blue-600 dark:hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Neues Briefing
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <Alert variant="destructive" className="rounded-2xl">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Fehler</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading state */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
              <CardContent className="p-6 space-y-4">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && briefs.length === 0 && (
        <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
          <CardContent className="flex flex-col items-center gap-5 px-6 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/50">
              <FileText className="h-7 w-7 text-blue-500 dark:text-blue-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Noch keine Content Briefs</h2>
              <p className="max-w-md text-sm leading-7 text-slate-500 dark:text-slate-400">
                Erstelle dein erstes KI-generiertes Content Briefing, um strukturierte Inhalte für SEO zu planen.
              </p>
            </div>
            <Button
              onClick={handleCreateOpen}
              disabled={!activeCustomer}
              title={!activeCustomer ? 'Bitte zuerst einen Kunden auswählen' : undefined}
              className="gap-2 rounded-full bg-[#1f2937] text-white hover:bg-[#111827] dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Erstes Briefing erstellen
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Brief cards */}
      {!loading && !error && briefs.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {briefs.map((brief) => (
            <Card
              key={brief.id}
              className="group cursor-pointer rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft transition-all hover:border-slate-200 hover:shadow-md dark:hover:border-[#2d3847]"
              onClick={() => {
                router.replace(`${pathname}?briefId=${brief.id}`, { scroll: false })
              }}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-3">
                    <div className="flex items-center gap-2">
                      <Search className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                      <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">{brief.keyword}</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {statusBadge(brief.status)}
                      <Badge variant="outline" className="rounded-full text-xs">{langLabel(brief.language)}</Badge>
                      <Badge variant="outline" className="rounded-full text-xs">{brief.word_count_target} W.</Badge>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                      <Clock className="h-3.5 w-3.5" />
                      {formatDate(brief.created_at)}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 dark:text-slate-600" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) handleCreateClose() }}>
        <DialogContent className="sm:max-w-lg rounded-[2rem]">
          <DialogHeader>
            <DialogTitle>Neues Content Briefing</DialogTitle>
            <DialogDescription>
              {createStep === 1
                ? 'Gib ein Keyword ein oder wähle eines aus deinen Keyword-Projekten.'
                : 'Passe die Optionen für dein Content Briefing an.'}
            </DialogDescription>
          </DialogHeader>

          {createStep === 1 && (
            <div className="space-y-6 py-4">
              {/* Keyword source toggle */}
              <div className="flex gap-2">
                <Button
                  variant={keywordSource === 'manual' ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full"
                  onClick={() => setKeywordSource('manual')}
                >
                  Manuell eingeben
                </Button>
                <Button
                  variant={keywordSource === 'project' ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full"
                  onClick={() => setKeywordSource('project')}
                >
                  Aus Projekt wählen
                </Button>
              </div>

              {keywordSource === 'manual' ? (
                <div className="space-y-2">
                  <Label htmlFor="keyword">Haupt-Keyword *</Label>
                  <Input
                    id="keyword"
                    placeholder="z.B. SEO Strategie 2026"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    className="rounded-xl"
                  />
                  {keyword.length > 0 && keyword.length < 2 && (
                    <p className="text-xs text-red-500">Keyword muss mindestens 2 Zeichen lang sein.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {kwProjectsUnavailable ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Keyword-Projekte nicht verfügbar. Bitte das Keywordranking-Modul aktivieren.
                    </p>
                  ) : kwProjectsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Projekte werden geladen...
                    </div>
                  ) : kwProjects.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Keine Keyword-Projekte vorhanden. Erstelle zuerst ein Projekt unter &quot;Keywordranking&quot;.
                    </p>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label>Projekt</Label>
                        <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                          <SelectTrigger className="rounded-xl">
                            <SelectValue placeholder="Projekt wählen..." />
                          </SelectTrigger>
                          <SelectContent>
                            {kwProjects.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name} ({p.target_domain})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {selectedProjectId && kwKeywordsLoading && (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Keywords werden geladen...
                        </div>
                      )}
                      {selectedProjectId && !kwKeywordsLoading && kwKeywords.length > 0 && (
                        <div className="space-y-2">
                          <Label>Keyword</Label>
                          <Select value={selectedKeywordFromProject} onValueChange={setSelectedKeywordFromProject}>
                            <SelectTrigger className="rounded-xl">
                              <SelectValue placeholder="Keyword wählen..." />
                            </SelectTrigger>
                            <SelectContent>
                              {kwKeywords.map((kw) => (
                                <SelectItem key={kw.id} value={kw.keyword}>{kw.keyword}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {selectedProjectId && !kwKeywordsLoading && kwKeywords.length === 0 && (
                        <p className="text-sm text-slate-500 dark:text-slate-400">Dieses Projekt hat noch keine Keywords.</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {createStep === 2 && (
            <div className="space-y-5 py-4">
              <div className="rounded-xl bg-slate-50 dark:bg-[#1e2635] p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <Search className="h-4 w-4 text-slate-400" />
                  Keyword: <span className="text-blue-600 dark:text-blue-400">{effectiveKeyword}</span>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Sprache</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="de">Deutsch</SelectItem>
                      <SelectItem value="en">Englisch</SelectItem>
                      <SelectItem value="fr">Französisch</SelectItem>
                      <SelectItem value="es">Spanisch</SelectItem>
                      <SelectItem value="it">Italienisch</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tonalität</Label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="informativ">Informativ</SelectItem>
                      <SelectItem value="werblich">Werblich</SelectItem>
                      <SelectItem value="neutral">Neutral</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Wortanzahl-Ziel</Label>
                <Select value={wordCount} onValueChange={setWordCount}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="500">500 Wörter</SelectItem>
                    <SelectItem value="1000">1.000 Wörter</SelectItem>
                    <SelectItem value="1500">1.500 Wörter</SelectItem>
                    <SelectItem value="2000">2.000+ Wörter</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="target-url">Ziel-URL (optional)</Label>
                <Input
                  id="target-url"
                  placeholder="https://wettbewerber.de/beispiel-seite"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  className="rounded-xl"
                />
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Falls angegeben, werden Wettbewerber-Hinweise basierend auf dieser URL generiert.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {createStep === 2 && (
              <Button variant="outline" onClick={() => setCreateStep(1)} className="rounded-full">
                Zurück
              </Button>
            )}
            {createStep === 1 ? (
              <Button
                onClick={() => setCreateStep(2)}
                disabled={!canProceedStep1}
                className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827] dark:bg-blue-600 dark:hover:bg-blue-700"
              >
                Weiter
              </Button>
            ) : (
              <Button
                onClick={handleCreate}
                disabled={!canCreate || creating}
                className="gap-2 rounded-full bg-[#1f2937] text-white hover:bg-[#111827] dark:bg-blue-600 dark:hover:bg-blue-700"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                <Sparkles className="h-4 w-4" />
                Brief erstellen
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <DeleteConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        deleting={deleting}
      />
    </div>
  )
}

// ─── Brief Content Display ───────────────────────────────────────────────────

function BriefContent({ brief, keyword }: { brief: BriefJson; keyword: string }) {
  return (
    <div className="space-y-6 print:space-y-4" id="brief-content">
      {/* Search Intent */}
      <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft print:shadow-none print:border print:rounded-lg">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4 text-blue-500" />
            Suchintention
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Badge className="rounded-full bg-blue-50 text-blue-700 hover:bg-blue-50 dark:bg-blue-950/50 dark:text-blue-400">
            {brief.search_intent.type}
          </Badge>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {brief.search_intent.reasoning}
          </p>
        </CardContent>
      </Card>

      {/* H1 Titles */}
      <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft print:shadow-none print:border print:rounded-lg">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-amber-500" />
            Empfohlene H1-Titel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {brief.h1_titles.map((title, i) => (
              <li key={i} className="flex items-start gap-3 rounded-xl bg-slate-50 dark:bg-[#1e2635] p-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900/50 dark:text-blue-400">{i + 1}</span>
                <CopyableText text={title} className="text-sm text-slate-700 dark:text-slate-300" />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Meta Descriptions */}
      <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft print:shadow-none print:border print:rounded-lg">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-emerald-500" />
            Meta-Description Vorschläge
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {brief.meta_descriptions.map((desc, i) => (
              <li key={i} className="rounded-xl border border-slate-100 dark:border-[#252d3a] p-4">
                <div className="flex items-start justify-between gap-2">
                  <CopyableText text={desc} className="text-sm text-slate-700 dark:text-slate-300" />
                </div>
                <p className="mt-1 text-xs text-slate-400">{desc.length} Zeichen</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Outline */}
      <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft print:shadow-none print:border print:rounded-lg">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-purple-500" />
            Gliederung
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {brief.outline.map((section, i) => (
            <div key={i} className="rounded-xl border border-slate-100 dark:border-[#252d3a] p-4">
              <h3 className="mb-1 font-semibold text-slate-900 dark:text-slate-50">H2: {section.h2}</h3>
              <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{section.description}</p>
              {section.h3s && section.h3s.length > 0 && (
                <ul className="ml-4 space-y-2 border-l-2 border-slate-100 dark:border-[#252d3a] pl-4">
                  {section.h3s.map((sub, j) => (
                    <li key={j} className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      H3: {sub}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Keywords */}
      <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft print:shadow-none print:border print:rounded-lg">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4 text-indigo-500" />
            Kern-Keywords
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-[#252d3a]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 dark:border-[#252d3a] dark:bg-[#1e2635]">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Keyword</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Empfohlene Häufigkeit</th>
                </tr>
              </thead>
              <tbody>
                {brief.keywords.map((kw, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0 dark:border-[#252d3a]">
                    <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-300">{kw.term}</td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{kw.frequency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Internal Linking Hints */}
      {brief.internal_linking_hints && brief.internal_linking_hints.length > 0 && (
        <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft print:shadow-none print:border print:rounded-lg">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Link className="h-4 w-4 text-violet-500" />
              Interne Verlinkungsvorschläge
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {brief.internal_linking_hints.map((hint, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="mt-0.5 shrink-0 text-violet-400">→</span>
                  {hint}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Competitor Hints */}
      {brief.competitor_hints && (
        <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft print:shadow-none print:border print:rounded-lg">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-orange-500" />
              Wettbewerber-Hinweise
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-line">
              {brief.competitor_hints}
            </p>
          </CardContent>
        </Card>
      )}

      {/* CTA Recommendation */}
      <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft print:shadow-none print:border print:rounded-lg">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-pink-500" />
            Call-to-Action Empfehlung
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-line">
            {brief.cta_recommendation}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Copyable text helper ────────────────────────────────────────────────────

function CopyableText({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: ignore
    }
  }

  return (
    <div className="group/copy flex items-start gap-2">
      <span className={className}>{text}</span>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 opacity-0 transition-opacity group-hover/copy:opacity-100 print:hidden"
        aria-label="Kopieren"
      >
        {copied ? (
          <Badge variant="outline" className="rounded-full text-xs text-emerald-600 dark:text-emerald-400">Kopiert!</Badge>
        ) : (
          <Copy className="h-4 w-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
        )}
      </button>
    </div>
  )
}

// ─── Delete confirmation dialog ──────────────────────────────────────────────

function DeleteConfirmDialog({
  open,
  onClose,
  onConfirm,
  deleting,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  deleting: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md rounded-[2rem]">
        <DialogHeader>
          <DialogTitle>Brief löschen?</DialogTitle>
          <DialogDescription>
            Dieser Content Brief wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-full">Abbrechen</Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={deleting}
            className="gap-2 rounded-full"
          >
            {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
            <Trash2 className="h-4 w-4" />
            Löschen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
