'use client'

import { useEffect, useState } from 'react'
import {
  AlertCircle,
  Copy,
  Download,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ApprovalSubmitPanel } from '@/components/approval-submit-panel'
import type { ApprovalStatus } from '@/components/approval-status-badge'
import {
  AD_PLATFORMS_MAP,
  type AdTypeConfig,
  type PlatformId,
} from '@/lib/ad-limits'
import { exportUrl } from './api'
import { PLATFORM_ICONS } from './wizard'
import type {
  ApprovalInfo,
  BriefingData,
  GenerationDetail,
  GenerationResult,
  SelectedAdType,
  VariantFields,
} from './types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function platformLabel(id: PlatformId): string {
  return AD_PLATFORMS_MAP[id]?.label ?? id
}

// ─── Results View ────────────────────────────────────────────────────────────

export interface ResultsViewProps {
  result: GenerationResult
  detail: GenerationDetail | null
  generationId: string | null
  briefing: BriefingData
  platforms: PlatformId[]
  selectedAdTypes: SelectedAdType[]
  onNewGeneration: () => void
  onApprovalStatusChange?: (status: ApprovalStatus | 'draft' | null) => void
}

export function ResultsView({
  result,
  detail,
  generationId,
  briefing: wizardBriefing,
  platforms: wizardPlatforms,
  selectedAdTypes: wizardAdTypes,
  onNewGeneration,
  onApprovalStatusChange,
}: ResultsViewProps) {
  const { toast } = useToast()
  const [approvalInfo, setApprovalInfo] = useState<ApprovalInfo | null>(null)
  const [editableResult, setEditableResult] = useState<GenerationResult>(result)
  const [savingEdits, setSavingEdits] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [regeneratingVariant, setRegeneratingVariant] = useState<{
    platformId: string
    adTypeId: string
    variantIndex: number
  } | null>(null)

  // Use detail briefing if available (from history), otherwise wizard state
  const product = detail?.briefing?.product ?? wizardBriefing.product
  const platforms = detail?.briefing?.platforms ?? wizardPlatforms
  const adTypesUsed = detail?.briefing?.selectedAdTypes ?? wizardAdTypes

  useEffect(() => {
    setEditableResult(result)
  }, [result])

  useEffect(() => {
    if (!generationId) {
      setApprovalInfo(null)
      onApprovalStatusChange?.(null)
      return
    }

    const currentGenerationId = generationId
    let cancelled = false

    async function loadApproval() {
      try {
        const params = new URLSearchParams({
          content_type: 'ad_generation',
          content_id: currentGenerationId,
        })
        const res = await fetch(`/api/tenant/approvals?${params.toString()}`)
        if (!res.ok) return
        const data = await res.json()
        const first = Array.isArray(data.approvals) ? data.approvals[0] : null
        if (cancelled) return
        if (!first) {
          setApprovalInfo({ status: 'draft', link: null, feedback: null, history: [] })
          onApprovalStatusChange?.('draft')
          return
        }
        setApprovalInfo({
          status: first.status as ApprovalStatus,
          link: `${window.location.origin}/approval/${first.public_token}`,
          feedback: first.feedback ?? null,
          history: Array.isArray(first.history) ? first.history : [],
        })
        onApprovalStatusChange?.(first.status as ApprovalStatus)
      } catch {
        // optional UI fetch
      }
    }

    loadApproval()

    return () => {
      cancelled = true
    }
  }, [generationId, onApprovalStatusChange])

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast({ title: 'Kopiert!', description: 'Text wurde in die Zwischenablage kopiert.' })
    } catch {
      toast({ title: 'Fehler', description: 'Kopieren fehlgeschlagen.', variant: 'destructive' })
    }
  }

  async function copyAllVariant(
    adType: AdTypeConfig,
    variant: VariantFields
  ) {
    const lines: string[] = []
    for (const field of adType.fields) {
      const value = variant[field.name]
      if (Array.isArray(value)) {
        value.forEach((v, i) => {
          lines.push(`${field.label} ${i + 1}: ${v}`)
        })
      } else if (value) {
        lines.push(`${field.label}: ${value}`)
      }
    }
    await copyText(lines.join('\n'))
  }

  function updateFieldValue(
    platformId: PlatformId,
    adTypeId: string,
    variantIndex: number,
    fieldName: string,
    value: string | string[],
  ) {
    setEditableResult((current) => ({
      ...current,
      [platformId]: {
        ...current[platformId],
        [adTypeId]: {
          ...current[platformId]?.[adTypeId],
          variants: current[platformId]?.[adTypeId]?.variants.map((variant, index) =>
            index === variantIndex
              ? {
                  ...variant,
                  [fieldName]: value,
                }
              : variant
          ) as [VariantFields, VariantFields, VariantFields],
        },
      },
    }))
  }

  async function persistEdits(resubmitAfterSave: boolean) {
    if (!generationId) return
    setSavingEdits(true)
    try {
      const saveRes = await fetch(`/api/tenant/ad-generator/${generationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result: editableResult }),
      })

      if (!saveRes.ok) {
        const data = await saveRes.json().catch(() => ({}))
        throw new Error(data.error || 'Änderungen konnten nicht gespeichert werden.')
      }

      toast({
        title: 'Gespeichert',
        description: resubmitAfterSave
          ? 'Änderungen wurden gespeichert und erneut zur Freigabe eingereicht.'
          : 'Änderungen wurden gespeichert.',
      })

      if (resubmitAfterSave) {
        const resubmitRes = await fetch('/api/tenant/approvals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content_type: 'ad_generation', content_id: generationId }),
        })
        if (!resubmitRes.ok) {
          const data = await resubmitRes.json().catch(() => ({}))
          throw new Error(data.error || 'Erneute Freigabe konnte nicht gestartet werden.')
        }
        const payload = await resubmitRes.json()
        setApprovalInfo((prev) => ({
          status: 'pending_approval',
          link: payload.approval_link ?? prev?.link ?? null,
          feedback: null,
          history: prev?.history ?? [],
        }))
      }
    } catch (error) {
      toast({
        title: 'Fehler',
        description: error instanceof Error ? error.message : 'Änderungen konnten nicht gespeichert werden.',
        variant: 'destructive',
      })
    } finally {
      setSavingEdits(false)
    }
  }

  const canEdit = approvalInfo !== null && approvalInfo.status !== 'approved'

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="rounded-[2rem] border border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                {product}
              </h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {platforms.map((pid) => (
                  <Badge key={pid} variant="secondary" className="rounded-full text-xs">
                    {platformLabel(pid)}
                  </Badge>
                ))}
              </div>
              {generationId && approvalInfo && (
                <div className="mt-3">
                  <ApprovalSubmitPanel
                    contentType="ad_generation"
                    contentId={generationId}
                    approvalStatus={approvalInfo.status}
                    approvalLink={approvalInfo.link}
                    feedback={approvalInfo.feedback}
                    onStatusChange={(newStatus, link) => {
                      setApprovalInfo((prev) => ({
                        status: newStatus,
                        link: link ?? prev?.link ?? null,
                        feedback: newStatus === 'changes_requested' ? prev?.feedback ?? null : null,
                        history: prev?.history ?? [],
                      }))
                      onApprovalStatusChange?.(newStatus)
                    }}
                  />
                </div>
              )}
              {canEdit && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="rounded-full"
                    onClick={() => void persistEdits(false)}
                    disabled={savingEdits}
                  >
                    {savingEdits ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Änderungen speichern
                  </Button>
                  {approvalInfo?.status === 'changes_requested' && (
                    <Button
                      variant="dark"
                      onClick={() => void persistEdits(true)}
                      disabled={savingEdits}
                    >
                      {savingEdits ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Speichern & zur Freigabe senden
                    </Button>
                  )}
                </div>
              )}
              {approvalInfo?.history && approvalInfo.history.length > 0 && (
                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-border dark:bg-card">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                    Freigabeverlauf
                  </p>
                  <div className="space-y-3">
                    {approvalInfo.history.map((entry) => (
                      <div key={entry.id} className="border-l-2 border-slate-200 pl-3 dark:border-[#2d3847]">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {entry.event_type === 'submitted'
                            ? 'Freigabe angefordert'
                            : entry.event_type === 'resubmitted'
                              ? 'Freigabe erneut angefordert'
                              : entry.event_type === 'approved'
                                ? 'Freigabe erteilt'
                                : entry.event_type === 'changes_requested'
                                  ? 'Korrektur angefragt'
                                  : 'Inhalt überarbeitet'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(entry.created_at).toLocaleDateString('de-DE', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {entry.actor_label ? ` · ${entry.actor_label}` : ''}
                        </p>
                        {entry.feedback && (
                          <p className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">{entry.feedback}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {generationId && (
                <Button
                  variant="outline"
                  className="rounded-full"
                  disabled={exportLoading}
                  onClick={async () => {
                    setExportLoading(true)
                    try {
                      const res = await fetch(exportUrl(generationId))
                      if (!res.ok) throw new Error('Export fehlgeschlagen')
                      const blob = await res.blob()
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      const safeName = (detail?.briefing?.product ?? '').replace(/[^a-z0-9äöü]/gi, '_').slice(0, 40) || 'ads'
                      a.download = `ads_${safeName}_${new Date().toISOString().slice(0, 10)}.xlsx`
                      a.click()
                      URL.revokeObjectURL(url)
                    } catch {
                      toast({ title: 'Fehler', description: 'Excel-Export fehlgeschlagen.', variant: 'destructive' })
                    } finally {
                      setExportLoading(false)
                    }
                  }}
                >
                  {exportLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Excel herunterladen
                </Button>
              )}
              {generationId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full gap-2 print:hidden"
                  onClick={() => window.print()}
                >
                  <Printer className="h-4 w-4" />
                  PDF
                </Button>
              )}
              {!canEdit && (
                <Button
                  variant="dark"
                  onClick={onNewGeneration}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Neu erstellen
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results per platform */}
      {platforms.map((pid) => {
        const platformResult = editableResult[pid]
        if (!platformResult) return null
        const platform = AD_PLATFORMS_MAP[pid]
        if (!platform) return null

        // Only show ad types that were selected
        const relevantAdTypes = platform.adTypes.filter((at) =>
          adTypesUsed.some(
            (s) => s.platformId === pid && s.adTypeId === at.id
          )
        )

        return (
          <div key={pid}>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {PLATFORM_ICONS[pid]}
              </div>
              {platform.label}
            </h3>
            <Accordion type="multiple" className="space-y-3" defaultValue={relevantAdTypes[0] ? [relevantAdTypes[0].id] : []}>
              {relevantAdTypes.map((adType) => {
                const adTypeResult = platformResult[adType.id]
                if (!adTypeResult) return null

                return (
                  <AccordionItem
                    key={adType.id}
                    value={adType.id}
                    className="rounded-2xl border border-slate-100 bg-white dark:border-border dark:bg-card overflow-hidden"
                  >
                    <AccordionTrigger className="px-5 py-4 text-sm font-semibold hover:no-underline text-slate-900 dark:text-slate-100">
                      {adType.label}
                    </AccordionTrigger>
                    <AccordionContent className="px-5 pb-5">
                      <Tabs defaultValue="0">
                        <TabsList className="mb-4">
                          <TabsTrigger value="0">Variante 1</TabsTrigger>
                          <TabsTrigger value="1">Variante 2</TabsTrigger>
                          <TabsTrigger value="2">Variante 3</TabsTrigger>
                        </TabsList>
                        {adTypeResult.variants.map((variant, vIdx) => {
                          const variantLabels = ['Nutzenorientiert', 'Hook-lastig', 'Vertrauensbasiert']
                          const isRegenerating =
                            regeneratingVariant?.platformId === pid &&
                            regeneratingVariant.adTypeId === adType.id &&
                            regeneratingVariant.variantIndex === vIdx
                          return (
                          <TabsContent key={vIdx} value={String(vIdx)}>
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-xs italic text-slate-400 dark:text-slate-500">
                                {variantLabels[vIdx]}
                              </span>
                              {generationId && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 rounded-full px-2 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                                  disabled={!!regeneratingVariant}
                                  onClick={async () => {
                                    setRegeneratingVariant({ platformId: pid, adTypeId: adType.id, variantIndex: vIdx })
                                    try {
                                      const res = await fetch(`/api/tenant/ad-generator/${generationId}/regenerate`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ platformId: pid, adTypeId: adType.id, variantIndex: vIdx }),
                                      })
                                      if (!res.ok) {
                                        const err = await res.json().catch(() => ({}))
                                        throw new Error(err.error || 'Neu-Generierung fehlgeschlagen')
                                      }
                                      const data = await res.json()
                                      setEditableResult((current) => ({
                                        ...current,
                                        [pid]: {
                                          ...current[pid],
                                          [adType.id]: {
                                            ...current[pid]?.[adType.id],
                                            variants: current[pid]?.[adType.id]?.variants.map((v, i) =>
                                              i === vIdx ? (data.variant as VariantFields) : v
                                            ) as [VariantFields, VariantFields, VariantFields],
                                          },
                                        },
                                      }))
                                      toast({ title: 'Neu generiert', description: `Variante ${vIdx + 1} wurde ersetzt.` })
                                    } catch (err) {
                                      toast({
                                        title: 'Fehler',
                                        description: err instanceof Error ? err.message : 'Neu-Generierung fehlgeschlagen.',
                                        variant: 'destructive',
                                      })
                                    } finally {
                                      setRegeneratingVariant(null)
                                    }
                                  }}
                                >
                                  {isRegenerating
                                    ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                                    : <RotateCcw className="mr-1.5 h-3 w-3" />}
                                  Neu generieren
                                </Button>
                              )}
                            </div>
                            <div className="space-y-3">
                              {adType.fields.map((field) => {
                                const value = variant[field.name]
                                if (Array.isArray(value)) {
                                  return value.map((v, mIdx) => (
                                    <AdTextFieldDisplay
                                      key={`${field.name}-${mIdx}`}
                                      label={`${field.label} ${mIdx + 1}`}
                                      text={v}
                                      limit={field.limit}
                                      onCopy={() => copyText(v)}
                                      editable={canEdit}
                                      onChange={(nextValue) => {
                                        const nextValues = Array.isArray(variant[field.name])
                                          ? [...(variant[field.name] as string[])]
                                          : []
                                        nextValues[mIdx] = nextValue
                                        updateFieldValue(pid, adType.id, vIdx, field.name, nextValues)
                                      }}
                                    />
                                  ))
                                }
                                return (
                                  <AdTextFieldDisplay
                                    key={field.name}
                                    label={field.label}
                                    text={typeof value === 'string' ? value : ''}
                                    limit={field.limit}
                                    onCopy={() => copyText(typeof value === 'string' ? value : '')}
                                    editable={canEdit}
                                    onChange={(nextValue) =>
                                      updateFieldValue(pid, adType.id, vIdx, field.name, nextValue)
                                    }
                                  />
                                )
                              })}
                              <div className="pt-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="rounded-full text-xs"
                                  onClick={() => copyAllVariant(adType, variant)}
                                >
                                  <Copy className="mr-1.5 h-3 w-3" />
                                  Alle kopieren
                                </Button>
                              </div>
                            </div>
                          </TabsContent>
                          )
                        })}
                      </Tabs>
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
          </div>
        )
      })}

      {/* Empty state if nothing in result */}
      {Object.keys(result).length === 0 && (
        <Card className="rounded-[2rem] border border-slate-100 dark:border-border bg-white dark:bg-card">
          <CardContent className="flex flex-col items-center gap-4 p-8 py-16 text-center">
            <AlertCircle className="h-10 w-10 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Keine Ergebnisse vorhanden. Bitte versuche es erneut.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── Single Text Field Display ───────────────────────────────────────────────

function AdTextFieldDisplay({
  label,
  text,
  limit,
  onCopy,
  editable = false,
  onChange,
}: {
  label: string
  text: string
  limit: number
  onCopy: () => void
  editable?: boolean
  onChange?: (value: string) => void
}) {
  const charCount = [...text].length // Unicode-aware
  const isOver = charCount > limit

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-border dark:bg-[#0c1018]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {label}
        </span>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-xs font-mono tabular-nums',
              isOver
                ? 'text-red-500 dark:text-red-400'
                : 'text-emerald-600 dark:text-emerald-400'
            )}
          >
            {charCount}/{limit}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-md"
            onClick={onCopy}
            aria-label={`${label} kopieren`}
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      </div>
      {editable ? (
        <Textarea
          value={text}
          onChange={(event) => onChange?.(event.target.value)}
          className="min-h-[92px] rounded-xl border-slate-200 bg-white text-sm text-slate-900 dark:border-border dark:bg-card dark:text-slate-100"
        />
      ) : (
        <p className="text-sm text-slate-900 dark:text-slate-100 whitespace-pre-wrap break-words">
          {text || <span className="text-slate-400 italic">Kein Text</span>}
        </p>
      )}
    </div>
  )
}
