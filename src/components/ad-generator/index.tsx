'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Clock, Plus } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getAdTypesForPlatforms, type PlatformId } from '@/lib/ad-limits'
import { useActiveCustomer } from '@/lib/active-customer-context'
import { apiGenerate, apiGetGeneration, apiGetHistory } from './api'
import type {
  BriefingData,
  GenerationDetail,
  GenerationResult,
  GenerationSummary,
  SelectedAdType,
  ViewState,
} from './types'
import { WizardView } from './wizard'
import { GeneratingView } from './generating'
import { ResultsView } from './results'
import { HistoryView } from './history'
import type { ApprovalStatus } from '@/components/approval-status-badge'

// ─── Workspace Component ─────────────────────────────────────────────────────

export function AdGeneratorWorkspace() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { activeCustomer, customers, loading: customersLoading } = useActiveCustomer()

  // View state
  const [view, setView] = useState<ViewState>('history')

  // Wizard state
  const [step, setStep] = useState(1)
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>([])
  const [categoryFilter, setCategoryFilter] = useState<'social' | 'paid' | 'both'>('both')
  const [selectedAdTypes, setSelectedAdTypes] = useState<SelectedAdType[]>([])
  const [briefing, setBriefing] = useState<BriefingData>({
    product: '',
    audience: '',
    goal: '',
    usp: '',
    tone: '',
  })
  const [wizardCustomerId, setWizardCustomerId] = useState<string>('none')

  // Results state
  const [generationId, setGenerationId] = useState<string | null>(null)
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null)
  const [generationDetail, setGenerationDetail] = useState<GenerationDetail | null>(null)
  const [generating, setGenerating] = useState(false)
  const [currentApprovalStatus, setCurrentApprovalStatus] = useState<ApprovalStatus | 'draft' | null>(null)

  // History state
  const [history, setHistory] = useState<GenerationSummary[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyFilterCustomer, setHistoryFilterCustomer] = useState<string>('all')
  const [historyFilterPlatform, setHistoryFilterPlatform] = useState<PlatformId | 'all'>('all')
  const [historySearch, setHistorySearch] = useState('')
  const [historyFilterDate, setHistoryFilterDate] = useState<'all' | '7d' | '30d' | '90d'>('all')
  const hasAutoNavigated = useRef(false)
  const hideNavigationActions = view === 'results' && currentApprovalStatus === 'changes_requested'

  // Sync wizard customer with global selector
  useEffect(() => {
    if (activeCustomer) {
      setWizardCustomerId(activeCustomer.id)
    } else {
      setWizardCustomerId('none')
    }
  }, [activeCustomer])

  // ─── History Loading ─────────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const cid = historyFilterCustomer !== 'all' ? historyFilterCustomer : undefined
      const plat = historyFilterPlatform !== 'all' ? historyFilterPlatform : undefined
      const data = await apiGetHistory(cid, plat)
      setHistory(data)
      if (
        !hasAutoNavigated.current &&
        data.length === 0 &&
        historyFilterCustomer === 'all' &&
        historyFilterPlatform === 'all'
      ) {
        hasAutoNavigated.current = true
        setView('wizard')
      }
    } catch {
      toast({ title: 'Fehler', description: 'History konnte nicht geladen werden.', variant: 'destructive' })
    } finally {
      setHistoryLoading(false)
    }
  }, [historyFilterCustomer, historyFilterPlatform, toast])

  useEffect(() => {
    if (view === 'history') {
      loadHistory()
    }
  }, [view, loadHistory])

  useEffect(() => {
    const generationIdFromUrl = searchParams.get('id')
    if (!generationIdFromUrl) return
    if (generationId === generationIdFromUrl && view === 'results') return
    void openGeneration(generationIdFromUrl, { syncUrl: false })
  }, [generationId, searchParams, view])

  // ─── Wizard: Platform toggle ─────────────────────────────────────────────

  function togglePlatform(pid: PlatformId) {
    setSelectedPlatforms((prev) =>
      prev.includes(pid) ? prev.filter((p) => p !== pid) : [...prev, pid]
    )
  }

  // When platforms or category changes, update selected ad types
  useEffect(() => {
    const available = getAdTypesForPlatforms(selectedPlatforms, categoryFilter)
    setSelectedAdTypes(
      available.map(({ platform, adType }) => ({
        platformId: platform.id,
        adTypeId: adType.id,
      }))
    )
  }, [selectedPlatforms, categoryFilter])

  function toggleAdType(platformId: PlatformId, adTypeId: string) {
    setSelectedAdTypes((prev) => {
      const exists = prev.some(
        (s) => s.platformId === platformId && s.adTypeId === adTypeId
      )
      if (exists) {
        return prev.filter(
          (s) => !(s.platformId === platformId && s.adTypeId === adTypeId)
        )
      }
      return [...prev, { platformId, adTypeId }]
    })
  }

  // ─── Generate ────────────────────────────────────────────────────────────

  async function handleGenerate() {
    setView('generating')
    setGenerating(true)
    try {
      const cid = wizardCustomerId === 'none' ? null : wizardCustomerId
      const { id, result } = await apiGenerate(
        briefing,
        selectedPlatforms,
        categoryFilter,
        selectedAdTypes,
        cid
      )
      setGenerationId(id)
      setGenerationResult(result)
      setGenerationDetail(null)
      setCurrentApprovalStatus('draft')
      setView('results')
      router.replace(`${pathname}?id=${id}`, { scroll: false })
    } catch (err) {
      toast({
        title: 'Generierung fehlgeschlagen',
        description: err instanceof Error ? err.message : 'Ein unbekannter Fehler ist aufgetreten.',
        variant: 'destructive',
      })
      setView('wizard')
    } finally {
      setGenerating(false)
    }
  }

  // ─── Open from History ───────────────────────────────────────────────────

  async function openGeneration(id: string, options?: { syncUrl?: boolean }) {
    if (options?.syncUrl !== false) {
      router.replace(`${pathname}?id=${id}`, { scroll: false })
    }
    setView('generating')
    setGenerating(true)
    try {
      const detail = await apiGetGeneration(id)
      setGenerationId(id)
      setGenerationDetail(detail)
      setGenerationResult(detail.result)
      setCurrentApprovalStatus(null)
      setView('results')
    } catch {
      toast({
        title: 'Fehler',
        description: 'Generierung konnte nicht geladen werden.',
        variant: 'destructive',
      })
      setView('history')
      router.replace(pathname, { scroll: false })
    } finally {
      setGenerating(false)
    }
  }

  // ─── Reset wizard ────────────────────────────────────────────────────────

  function resetWizard() {
    setStep(1)
    setSelectedPlatforms([])
    setCategoryFilter('both')
    setSelectedAdTypes([])
    setBriefing({ product: '', audience: '', goal: '', usp: '', tone: '' })
    setWizardCustomerId(activeCustomer?.id ?? 'none')
    setGenerationId(null)
    setGenerationResult(null)
    setGenerationDetail(null)
    setCurrentApprovalStatus(null)
    setView('wizard')
    router.replace(pathname, { scroll: false })
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Ad Generator</h1>
            <Badge variant="secondary" className="rounded-full text-[10px] px-2 py-0.5 self-center font-mono">DE</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            KI-gestützte Anzeigentexte für Facebook, LinkedIn, TikTok und Google Ads
          </p>
        </div>
        <div className="flex gap-2">
          {view !== 'wizard' && view !== 'generating' && !hideNavigationActions && (
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => {
                setView('history')
                router.replace(pathname, { scroll: false })
              }}
            >
              <Clock className="mr-2 h-4 w-4" />
              History
            </Button>
          )}
          {view !== 'wizard' && view !== 'generating' && !hideNavigationActions && (
            <Button
              className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827] dark:bg-blue-600 dark:hover:bg-blue-700"
              onClick={resetWizard}
            >
              <Plus className="mr-2 h-4 w-4" />
              Neue Generierung
            </Button>
          )}
        </div>
      </div>

      {/* Views */}
      {view === 'wizard' && (
        <WizardView
          step={step}
          setStep={setStep}
          selectedPlatforms={selectedPlatforms}
          togglePlatform={togglePlatform}
          categoryFilter={categoryFilter}
          setCategoryFilter={setCategoryFilter}
          selectedAdTypes={selectedAdTypes}
          toggleAdType={toggleAdType}
          briefing={briefing}
          setBriefing={setBriefing}
          wizardCustomerId={wizardCustomerId}
          setWizardCustomerId={setWizardCustomerId}
          customers={customers}
          customersLoading={customersLoading}
          onGenerate={handleGenerate}
        />
      )}

      {view === 'generating' && (
        <GeneratingView platforms={selectedPlatforms} />
      )}

      {view === 'results' && generationResult && (
        <ResultsView
          result={generationResult}
          detail={generationDetail}
          generationId={generationId}
          briefing={briefing}
          platforms={selectedPlatforms}
          selectedAdTypes={selectedAdTypes}
          onNewGeneration={resetWizard}
          onBackToHistory={() => {
            setView('history')
            router.replace(pathname, { scroll: false })
          }}
          onApprovalStatusChange={setCurrentApprovalStatus}
        />
      )}

      {view === 'history' && (
        <HistoryView
          history={history}
          loading={historyLoading}
          customers={customers}
          filterCustomer={historyFilterCustomer}
          setFilterCustomer={setHistoryFilterCustomer}
          filterPlatform={historyFilterPlatform}
          setFilterPlatform={setHistoryFilterPlatform}
          search={historySearch}
          setSearch={setHistorySearch}
          filterDate={historyFilterDate}
          setFilterDate={setHistoryFilterDate}
          onOpen={openGeneration}
          onNew={resetWizard}
        />
      )}
    </div>
  )
}
