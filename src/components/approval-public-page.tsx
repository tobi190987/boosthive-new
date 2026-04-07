'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  FileImage,
  FileText,
  Loader2,
  MessageSquare,
  Pencil,
  Printer,
  Type,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  getAdFieldDisplayLabel,
  getAdTypeDisplayLabel,
  getPlatformDisplayLabel,
} from '@/lib/ad-limits'

interface ApprovalData {
  tenant_name: string
  tenant_logo_url: string | null
  content_type: 'content_brief' | 'ad_generation' | 'ad_library_asset'
  content_title: string
  status: 'pending_approval' | 'approved' | 'changes_requested'
  content_html: string
  decided_at: string | null
  history: Array<{
    id: string
    event_type: 'submitted' | 'resubmitted' | 'approved' | 'changes_requested' | 'content_updated'
    status_after: 'pending_approval' | 'approved' | 'changes_requested'
    feedback: string | null
    actor_label: string | null
    created_at: string
  }>
}

interface ApprovalPublicPageProps {
  token: string
}

function parseNodesToHtml(nodes: ChildNode[]): string {
  return nodes
    .map((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) return (node as HTMLElement).outerHTML
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
      return ''
    })
    .join('')
}

function buildLegacyBriefHtml(rawHtml: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(rawHtml, 'text/html')
  const bodyChildren = Array.from(doc.body.children)

  if (bodyChildren.length === 0) return rawHtml

  const sections: string[] = []
  let currentTitle = ''
  let currentNodes: ChildNode[] = []

  const flush = () => {
    if (!currentTitle && currentNodes.length === 0) return
    const body = parseNodesToHtml(currentNodes) || '<p class="approval-empty">-</p>'
    sections.push(
      `<section class="approval-section approval-section--default"><div class="approval-section__header"><h3>${currentTitle || 'Inhalt'}</h3></div><div class="approval-section__body">${body}</div></section>`
    )
    currentTitle = ''
    currentNodes = []
  }

  bodyChildren.forEach((element) => {
    if (element.tagName === 'H3') {
      flush()
      currentTitle = element.textContent?.trim() || 'Inhalt'
      return
    }

    if (element.tagName === 'UL') {
      element.classList.add('approval-list')
    }

    if (element.tagName === 'P') {
      const strong = element.querySelector('strong')
      if (strong && /typ:?/i.test(strong.textContent || '')) {
        const content = (element.textContent || '').replace(/typ:?/i, '').trim()
        const pill = doc.createElement('div')
        pill.className = 'approval-pill-row'
        pill.innerHTML = `<span class="approval-pill">${content}</span>`
        currentNodes.push(pill)
        return
      }
    }

    if (element.tagName === 'H4') {
      const card = doc.createElement('article')
      card.className = 'approval-outline-card'
      card.innerHTML = `<div class="approval-outline-card__eyebrow">Abschnitt</div><h4>${element.textContent || 'Abschnitt'}</h4>`
      currentNodes.push(card)
      return
    }

    if (element.tagName === 'H5') {
      const badge = doc.createElement('div')
      badge.className = 'approval-ad-variant__header'
      badge.textContent = element.textContent || ''
      currentNodes.push(badge)
      return
    }

    currentNodes.push(element)
  })

  flush()

  return `<div class="approval-rich-content approval-rich-content--brief">${sections.join('')}</div>`
}

function buildLegacyAdsHtml(rawHtml: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(rawHtml, 'text/html')
  const children = Array.from(doc.body.children)

  if (children.length === 0) return rawHtml

  const platforms: string[] = []
  let currentPlatform = ''
  let currentPlatformId = ''
  let currentPlatformParts: string[] = []
  let currentType = ''
  let currentTypeId = ''
  let currentTypeParts: string[] = []

  const flushType = () => {
    if (!currentType) return
    currentPlatformParts.push(
      `<section class="approval-ad-type"><div class="approval-ad-type__header"><h4>${currentType}</h4></div><div class="approval-ad-type__variants">${currentTypeParts.join('') || '<p class="approval-empty">-</p>'}</div></section>`
    )
    currentType = ''
    currentTypeParts = []
  }

  const flushPlatform = () => {
    flushType()
    if (!currentPlatform) return
    platforms.push(
      `<section class="approval-platform"><div class="approval-platform__header"><h3>${currentPlatform}</h3></div><div class="approval-platform__body">${currentPlatformParts.join('') || '<p class="approval-empty">-</p>'}</div></section>`
    )
    currentPlatform = ''
    currentPlatformId = ''
    currentPlatformParts = []
  }

  children.forEach((element) => {
    if (element.tagName === 'H3') {
      flushPlatform()
      currentPlatformId = (element.textContent?.trim() || 'Plattform').toLowerCase()
      currentPlatform = getPlatformDisplayLabel(currentPlatformId)
      return
    }

    if (element.tagName === 'H4') {
      flushType()
      currentTypeId = element.textContent?.trim() || 'Ad-Typ'
      currentType = getAdTypeDisplayLabel(currentPlatformId, currentTypeId)
      return
    }

    if (element.tagName === 'H5') {
      currentTypeParts.push(
        `<article class="approval-ad-variant"><div class="approval-ad-variant__header">${element.textContent || 'Variante'}</div><div class="approval-ad-variant__body">`
      )
      return
    }

    if (element.tagName === 'UL') {
      const items = Array.from(element.querySelectorAll(':scope > li'))
        .map((item) => {
          const html = item.innerHTML
          const match = html.match(/<strong>(.*?)<\/strong>\s*:?\s*(.*)/i)
          if (match) {
            return `<div class="approval-ad-field"><div class="approval-ad-field__label">${getAdFieldDisplayLabel(currentPlatformId, currentTypeId, match[1])}</div><ul class="approval-ad-field__values"><li>${match[2]}</li></ul></div>`
          }
          return `<div class="approval-ad-field"><ul class="approval-ad-field__values"><li>${html}</li></ul></div>`
        })
        .join('')

      if (currentTypeParts.length > 0 && currentTypeParts[currentTypeParts.length - 1].endsWith('<div class="approval-ad-variant__body">')) {
        currentTypeParts[currentTypeParts.length - 1] += `${items}</div></article>`
      } else {
        currentTypeParts.push(
          `<article class="approval-ad-variant"><div class="approval-ad-variant__header">Variante</div><div class="approval-ad-variant__body">${items}</div></article>`
        )
      }
      return
    }

    currentTypeParts.push(element.outerHTML)
  })

  flushPlatform()

  return `<div class="approval-rich-content approval-rich-content--ads">${platforms.join('')}</div>`
}

function beautifyApprovalHtml(rawHtml: string, type: ApprovalData['content_type']): string {
  if (!rawHtml || typeof window === 'undefined') return rawHtml
  if (rawHtml.includes('approval-rich-content')) return rawHtml
  return type === 'content_brief' ? buildLegacyBriefHtml(rawHtml) : buildLegacyAdsHtml(rawHtml)
}

export function ApprovalPublicPage({ token }: ApprovalPublicPageProps) {
  const [data, setData] = useState<ApprovalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Action state
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [actionDone, setActionDone] = useState<'approved' | 'changes_requested' | null>(null)

  const fetchApproval = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/public/approval/${token}`)
      if (res.status === 404) {
        setNotFound(true)
        return
      }
      if (!res.ok) throw new Error('Freigabe konnte nicht geladen werden.')
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchApproval()
  }, [fetchApproval])

  const displayHtml = useMemo(() => {
    if (!data) return ''
    return beautifyApprovalHtml(data.content_html, data.content_type)
  }, [data])

  const formatHistoryLabel = (eventType: ApprovalData['history'][number]['event_type']) => {
    switch (eventType) {
      case 'submitted':
        return 'Freigabe angefordert'
      case 'resubmitted':
        return 'Freigabe erneut angefordert'
      case 'approved':
        return 'Freigabe erteilt'
      case 'changes_requested':
        return 'Korrektur angefordert'
      case 'content_updated':
        return 'Inhalt überarbeitet'
      default:
        return eventType
    }
  }

  const formatHistoryDate = (iso: string) =>
    new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  const handleApprove = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/public/approval/${token}/approve`, { method: 'POST' })
      if (res.status === 409) {
        setActionDone('approved')
        return
      }
      if (!res.ok) throw new Error('Fehler bei der Freigabe.')
      setActionDone('approved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRequestChanges = async () => {
    if (feedback.trim().length < 10) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/public/approval/${token}/request-changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: feedback.trim() }),
      })
      if (res.status === 409) {
        setActionDone('changes_requested')
        return
      }
      if (!res.ok) throw new Error('Fehler beim Senden des Feedbacks.')
      setActionDone('changes_requested')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setSubmitting(false)
    }
  }

  // 404 page
  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-4 dark:bg-[#0b1120]">
        <Card className="w-full max-w-md rounded-2xl border-slate-200 shadow-lg dark:border-border dark:bg-card">
          <CardContent className="flex flex-col items-center gap-5 px-6 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-950/40">
              <AlertCircle className="h-7 w-7 text-red-500 dark:text-red-300" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Freigabe nicht gefunden</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Dieser Freigabe-Link ist ungültig oder das zugehörige Element wurde entfernt.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Loading
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-4 dark:bg-[#0b1120]">
        <Card className="w-full max-w-2xl rounded-2xl border-slate-200 shadow-lg dark:border-border dark:bg-card">
          <CardContent className="p-8 space-y-6">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-6 w-64" />
            <Separator />
            <Skeleton className="h-64 w-full" />
            <div className="flex gap-3">
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-40" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Error
  if (error && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-4 dark:bg-[#0b1120]">
        <Card className="w-full max-w-md rounded-2xl border-slate-200 shadow-lg dark:border-border dark:bg-card">
          <CardContent className="flex flex-col items-center gap-5 px-6 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-950/40">
              <AlertCircle className="h-7 w-7 text-red-500 dark:text-red-300" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Fehler</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data) return null

  const alreadyDecided = data.status !== 'pending_approval'
  const contentTypeLabel =
    data.content_type === 'content_brief'
      ? 'Content Brief'
      : data.content_type === 'ad_library_asset'
        ? 'Ad-Creative'
        : 'Ad-Text'

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.10),_transparent_30%),linear-gradient(180deg,#f8fafc_0%,#eef4ff_100%)] px-4 py-8 dark:bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_30%),linear-gradient(180deg,#0f172a_0%,#020617_100%)] sm:py-12">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header with branding */}
        <div className="flex items-center justify-between gap-4 rounded-[2rem] border border-white/70 bg-white/80 px-5 py-4 shadow-[0_20px_60px_-35px_rgba(15,23,42,0.35)] backdrop-blur dark:border-border dark:bg-card/85">
          <div className="flex items-center gap-3">
          {data.tenant_logo_url ? (
            <Image
              src={data.tenant_logo_url}
              alt={data.tenant_name}
              width={200}
              height={60}
              className="h-10 w-auto max-w-[180px] object-contain"
              unoptimized
            />
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-xs font-semibold text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                {data.tenant_name.slice(0, 1).toUpperCase()}
              </div>
              <span className="text-lg font-bold text-slate-900 dark:text-slate-100">{data.tenant_name}</span>
            </div>
          )}
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 dark:border-border dark:bg-muted dark:text-slate-300"
            >
              {contentTypeLabel}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-xl text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200 print:hidden"
              onClick={() => window.print()}
              title="Drucken / Als PDF speichern"
            >
              <Printer className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Success confirmation */}
        {actionDone && (
          <Alert className="rounded-2xl border-emerald-200 bg-emerald-50 dark:border-emerald-900/70 dark:bg-emerald-950/30">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
            <AlertTitle className="text-emerald-800 dark:text-emerald-200">
              {actionDone === 'approved' ? 'Vielen Dank!' : 'Feedback gesendet!'}
            </AlertTitle>
            <AlertDescription className="text-emerald-700 dark:text-emerald-300">
              {actionDone === 'approved'
                ? 'Sie haben den Inhalt freigegeben. Die Agentur wurde benachrichtigt.'
                : 'Ihre Korrekturwünsche wurden an die Agentur weitergeleitet.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Already decided banner */}
        {alreadyDecided && !actionDone && (
          <Alert className="rounded-2xl border-blue-200 bg-blue-50 dark:border-blue-900/70 dark:bg-blue-950/30">
            <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-300" />
            <AlertTitle className="text-blue-800 dark:text-blue-200">Bereits entschieden</AlertTitle>
            <AlertDescription className="text-blue-700 dark:text-blue-300">
              {data.status === 'approved'
                ? 'Dieser Inhalt wurde bereits freigegeben.'
                : 'Für diesen Inhalt wurden bereits Korrekturen angefragt.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Content card */}
        <Card className="overflow-hidden rounded-[2rem] border-white/80 bg-white/90 shadow-[0_28px_80px_-40px_rgba(15,23,42,0.45)] backdrop-blur dark:border-border dark:bg-card/90">
          <CardHeader className="border-b border-slate-100 bg-[linear-gradient(135deg,rgba(248,250,252,0.95),rgba(239,246,255,0.95))] px-6 py-5 dark:border-border dark:bg-[linear-gradient(135deg,rgba(17,24,39,0.98),rgba(30,41,59,0.95))] sm:px-8">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80 dark:bg-muted dark:ring-[#2a3444]">
                {data.content_type === 'content_brief' ? (
                  <FileText className="h-4 w-4 text-blue-600" />
                ) : data.content_type === 'ad_library_asset' ? (
                  <FileImage className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Type className="h-4 w-4 text-purple-600" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                  {contentTypeLabel}
                </p>
                <CardTitle className="mt-1 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
                  {data.content_title}
                </CardTitle>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-900">
                    Zur Freigabe
                  </Badge>
                  <Badge
                    variant="outline"
                    className="rounded-full border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 dark:border-border dark:bg-muted dark:text-slate-300"
                  >
                    Bitte sorgfältig prüfen
                  </Badge>
                </div>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Bitte prüfen Sie den folgenden Inhalt und geben Sie Ihre Rückmeldung.
            </p>
          </CardHeader>

          <CardContent className="px-6 py-6 sm:px-8 sm:py-8">
            {/* Content display */}
            <div
              className={`approval-render-shell ${data.content_type === 'content_brief' ? 'approval-render-shell--brief' : 'approval-render-shell--ads'}`}
              dangerouslySetInnerHTML={{ __html: displayHtml }}
            />
          </CardContent>
        </Card>

        {data.history.length > 0 && (
          <Card className="rounded-[2rem] border-white/80 bg-white/90 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.42)] dark:border-border dark:bg-card/90">
            <CardHeader className="border-b border-slate-100 px-6 py-5 dark:border-border sm:px-8">
              <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">Abnahmeverlauf</CardTitle>
            </CardHeader>
            <CardContent className="px-6 py-6 sm:px-8">
              <div className="space-y-4">
                {data.history.map((entry, index) => (
                  <div key={entry.id} className="relative pl-8">
                    {index < data.history.length - 1 && (
                      <div className="absolute left-[0.45rem] top-6 h-[calc(100%+0.5rem)] w-px bg-slate-200 dark:bg-[#2a3444]" />
                    )}
                    <div className="absolute left-0 top-1.5 h-4 w-4 rounded-full border-4 border-white bg-blue-500 shadow-sm dark:border-[#111827]" />
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/75 p-4 dark:border-border dark:bg-muted">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {formatHistoryLabel(entry.event_type)}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{formatHistoryDate(entry.created_at)}</p>
                      </div>
                      {entry.actor_label && (
                        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                          {entry.actor_label}
                        </p>
                      )}
                      {entry.feedback && (
                        <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm leading-6 text-orange-900 dark:border-orange-900/70 dark:bg-orange-950/30 dark:text-orange-300">
                          {entry.feedback}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action panel */}
        {!alreadyDecided && !actionDone && (
          <Card className="rounded-2xl border-slate-200 shadow-lg dark:border-border dark:bg-card">
            <CardContent className="px-6 py-6 space-y-4">
              {!showFeedback ? (
                <>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Ihre Entscheidung:</p>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      onClick={handleApprove}
                      disabled={submitting}
                      className="flex-1 gap-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      {submitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      Freigeben
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowFeedback(true)}
                      disabled={submitting}
                      className="flex-1 gap-2 rounded-xl border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-900/70 dark:text-orange-300 dark:hover:bg-orange-950/30"
                    >
                      <Pencil className="h-4 w-4" />
                      Korrektur nötig
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Was soll geändert werden?</p>
                  <Textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Bitte beschreiben Sie Ihre Änderungswünsche (min. 10 Zeichen)..."
                    className="min-h-[120px] rounded-xl"
                  />
                  <div className="flex items-center justify-between">
                    {feedback.length > 0 && feedback.length < 10 ? (
                      <p className="text-xs text-red-500">Mindestens 10 Zeichen erforderlich ({feedback.length}/10)</p>
                    ) : (
                      <span />
                    )}
                    <p className={`text-xs ${feedback.length >= 10 ? 'text-slate-400 dark:text-slate-500' : 'text-slate-300 dark:text-slate-600'}`}>
                      {feedback.length} Zeichen
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      onClick={handleRequestChanges}
                      disabled={submitting || feedback.trim().length < 10}
                      className="gap-2 rounded-xl bg-orange-600 text-white hover:bg-orange-700"
                    >
                      {submitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MessageSquare className="h-4 w-4" />
                      )}
                      Feedback absenden
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => { setShowFeedback(false); setFeedback('') }}
                      disabled={submitting}
                      className="rounded-xl"
                    >
                      Abbrechen
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center">
          <p className="text-xs text-slate-400">
            Bereitgestellt durch BoostHive Platform
          </p>
        </div>
      </div>
    </div>
  )
}
