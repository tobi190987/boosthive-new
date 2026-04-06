'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Loader2,
  Megaphone,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useActiveCustomer } from '@/lib/active-customer-context'
import { ApprovalSubmitPanel } from '@/components/approval-submit-panel'
import { ApprovalStatusBadge, type ApprovalStatus } from '@/components/approval-status-badge'
import {
  AD_PLATFORMS,
  AD_PLATFORMS_MAP,
  getAdTypesForPlatforms,
  type AdCategory,
  type AdFieldConfig,
  type AdTypeConfig,
  type PlatformConfig,
  type PlatformId,
} from '@/lib/ad-limits'

// ─── Types ───────────────────────────────────────────────────────────────────

interface BriefingData {
  product: string
  audience: string
  goal: 'awareness' | 'conversion' | 'traffic' | ''
  usp: string
  tone: 'professional' | 'casual' | 'emotional' | ''
}

interface SelectedAdType {
  platformId: PlatformId
  adTypeId: string
}

/** A single text field value in the result */
type FieldValue = string | string[]

/** One variant of an ad type: field name -> text(s) */
type VariantFields = Record<string, FieldValue>

/** An ad type result: variant 1-3 */
interface AdTypeResult {
  variants: [VariantFields, VariantFields, VariantFields]
}

/** Platform results: adTypeId -> result */
type PlatformResult = Record<string, AdTypeResult>

/** Full generation result: platformId -> platform result */
type GenerationResult = Record<string, PlatformResult>

interface ApprovalInfo {
  status: ApprovalStatus
  link: string | null
  feedback: string | null
  history: Array<{
    id: string
    event_type: 'submitted' | 'resubmitted' | 'approved' | 'changes_requested' | 'content_updated'
    feedback: string | null
    actor_label: string | null
    created_at: string
  }>
}

interface GenerationSummary {
  id: string
  product: string
  platforms: PlatformId[]
  customer_id: string | null
  customer_name: string | null
  created_at: string
  status: 'pending' | 'completed' | 'failed'
  approval_status: ApprovalStatus | 'draft'
}

interface GenerationDetail {
  id: string
  briefing: BriefingData & {
    platforms: PlatformId[]
    categories: 'social' | 'paid' | 'both'
    selectedAdTypes: SelectedAdType[]
  }
  result: GenerationResult
  customer_id: string | null
  customer_name: string | null
  created_at: string
  status: 'pending' | 'completed' | 'failed'
}

type ViewState = 'wizard' | 'generating' | 'results' | 'history'

// ─── API Functions ───────────────────────────────────────────────────────────

async function apiGenerate(
  briefing: BriefingData,
  platforms: PlatformId[],
  categories: 'social' | 'paid' | 'both',
  selectedAdTypes: SelectedAdType[],
  customerId: string | null
): Promise<{ id: string; result: GenerationResult }> {
  const res = await fetch('/api/tenant/ad-generator/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      briefing: { ...briefing, platforms, categories, selectedAdTypes },
      customerId,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Generierung fehlgeschlagen')
  }
  return res.json()
}

async function apiGetHistory(
  customerId?: string,
  platform?: PlatformId
): Promise<GenerationSummary[]> {
  const params = new URLSearchParams()
  if (customerId) params.set('customerId', customerId)
  if (platform) params.set('platform', platform)
  const res = await fetch(`/api/tenant/ad-generator/history?${params.toString()}`)
  if (!res.ok) throw new Error('History konnte nicht geladen werden')
  const data = await res.json()
  return data.generations ?? []
}

async function apiGetGeneration(id: string): Promise<GenerationDetail> {
  const res = await fetch(`/api/tenant/ad-generator/${id}`)
  if (!res.ok) throw new Error('Generierung konnte nicht geladen werden')
  const data = await res.json()
  return data.generation
}

function exportUrl(id: string): string {
  return `/api/tenant/ad-generator/${id}/export`
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function platformLabel(id: PlatformId): string {
  return AD_PLATFORMS_MAP[id]?.label ?? id
}

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

// ═══════════════════════════════════════════════════════════════════════════════
// WIZARD VIEW
// ═══════════════════════════════════════════════════════════════════════════════

interface WizardViewProps {
  step: number
  setStep: (s: number) => void
  selectedPlatforms: PlatformId[]
  togglePlatform: (pid: PlatformId) => void
  categoryFilter: 'social' | 'paid' | 'both'
  setCategoryFilter: (c: 'social' | 'paid' | 'both') => void
  selectedAdTypes: SelectedAdType[]
  toggleAdType: (platformId: PlatformId, adTypeId: string) => void
  briefing: BriefingData
  setBriefing: (b: BriefingData) => void
  wizardCustomerId: string
  setWizardCustomerId: (id: string) => void
  customers: { id: string; name: string }[]
  customersLoading: boolean
  onGenerate: () => void
}

function WizardView({
  step,
  setStep,
  selectedPlatforms,
  togglePlatform,
  categoryFilter,
  setCategoryFilter,
  selectedAdTypes,
  toggleAdType,
  briefing,
  setBriefing,
  wizardCustomerId,
  setWizardCustomerId,
  customers,
  customersLoading,
  onGenerate,
}: WizardViewProps) {
  const canNext = () => {
    switch (step) {
      case 1:
        return selectedPlatforms.length > 0
      case 2:
        return selectedAdTypes.length > 0
      case 3:
        return briefing.product.trim().length > 0
      case 4:
        return true
      default:
        return false
    }
  }

  return (
    <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
      <CardContent className="p-6 sm:p-8">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">
            <span>Schritt {step} von 4</span>
            <span>
              {step === 1 && 'Plattformen'}
              {step === 2 && 'Anzeigentypen'}
              {step === 3 && 'Briefing'}
              {step === 4 && 'Kundenzuordnung'}
            </span>
          </div>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-colors',
                  s <= step
                    ? 'bg-blue-500 dark:bg-blue-400'
                    : 'bg-slate-100 dark:bg-slate-800'
                )}
              />
            ))}
          </div>
        </div>

        {/* Steps */}
        {step === 1 && (
          <Step1Platforms
            selected={selectedPlatforms}
            onToggle={togglePlatform}
          />
        )}
        {step === 2 && (
          <Step2AdTypes
            selectedPlatforms={selectedPlatforms}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            selectedAdTypes={selectedAdTypes}
            toggleAdType={toggleAdType}
          />
        )}
        {step === 3 && (
          <Step3Briefing
            briefing={briefing}
            setBriefing={setBriefing}
          />
        )}
        {step === 4 && (
          <Step4Customer
            customerId={wizardCustomerId}
            setCustomerId={setWizardCustomerId}
            customers={customers}
            loading={customersLoading}
          />
        )}

        {/* Navigation */}
        <Separator className="my-6 bg-slate-100 dark:bg-slate-800" />
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            className="rounded-full"
            onClick={() => setStep(step - 1)}
            disabled={step === 1}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurück
          </Button>

          {step < 4 ? (
            <Button
              className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827] dark:bg-blue-600 dark:hover:bg-blue-700"
              onClick={() => setStep(step + 1)}
              disabled={!canNext()}
            >
              Weiter
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827] dark:bg-blue-600 dark:hover:bg-blue-700"
              onClick={onGenerate}
              disabled={!canNext()}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Jetzt generieren
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Step 1: Platforms ───────────────────────────────────────────────────────

const PLATFORM_ICONS: Record<PlatformId, string> = {
  facebook: 'f',
  linkedin: 'in',
  tiktok: 'T',
  google: 'G',
}

function Step1Platforms({
  selected,
  onToggle,
}: {
  selected: PlatformId[]
  onToggle: (pid: PlatformId) => void
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">
        Plattformen auswählen
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Wähle eine oder mehrere Plattformen, für die du Anzeigentexte generieren möchtest.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {AD_PLATFORMS.map((platform) => {
          const isSelected = selected.includes(platform.id)
          return (
            <button
              key={platform.id}
              type="button"
              onClick={() => onToggle(platform.id)}
              className={cn(
                'flex items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all',
                isSelected
                  ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/30'
                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-[#252d3a] dark:bg-[#151c28] dark:hover:border-[#3d4a5c]'
              )}
            >
              <div
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold transition-colors',
                  isSelected
                    ? 'bg-blue-500 text-white dark:bg-blue-500'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                )}
              >
                {PLATFORM_ICONS[platform.id]}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'font-semibold',
                  isSelected
                    ? 'text-blue-700 dark:text-blue-300'
                    : 'text-slate-900 dark:text-slate-100'
                )}>
                  {platform.label}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {platform.adTypes.length} Anzeigentypen
                </p>
              </div>
              <div
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-md border-2 transition-colors',
                  isSelected
                    ? 'border-blue-500 bg-blue-500 dark:border-blue-400 dark:bg-blue-400'
                    : 'border-slate-300 dark:border-slate-600'
                )}
              >
                {isSelected && <Check className="h-4 w-4 text-white" />}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Step 2: Ad Types ────────────────────────────────────────────────────────

function Step2AdTypes({
  selectedPlatforms,
  categoryFilter,
  setCategoryFilter,
  selectedAdTypes,
  toggleAdType,
}: {
  selectedPlatforms: PlatformId[]
  categoryFilter: 'social' | 'paid' | 'both'
  setCategoryFilter: (c: 'social' | 'paid' | 'both') => void
  selectedAdTypes: SelectedAdType[]
  toggleAdType: (platformId: PlatformId, adTypeId: string) => void
}) {
  const availableTypes = getAdTypesForPlatforms(selectedPlatforms, categoryFilter)

  // Group by platform
  const grouped = selectedPlatforms.reduce<
    Record<PlatformId, { platform: PlatformConfig; adTypes: AdTypeConfig[] }>
  >((acc, pid) => {
    const items = availableTypes.filter((a) => a.platform.id === pid)
    if (items.length > 0) {
      acc[pid] = {
        platform: items[0].platform,
        adTypes: items.map((i) => i.adType),
      }
    }
    return acc
  }, {} as Record<PlatformId, { platform: PlatformConfig; adTypes: AdTypeConfig[] }>)

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">
        Anzeigentypen auswählen
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Filtere nach Kategorie und wähle die Anzeigentypen, die generiert werden sollen.
      </p>

      {/* Category filter */}
      <div className="mb-6">
        <Label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
          Kategorie
        </Label>
        <RadioGroup
          value={categoryFilter}
          onValueChange={(v) => setCategoryFilter(v as 'social' | 'paid' | 'both')}
          className="flex flex-wrap gap-4"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="social" id="cat-social" />
            <Label htmlFor="cat-social" className="text-sm cursor-pointer">Social Ads</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="paid" id="cat-paid" />
            <Label htmlFor="cat-paid" className="text-sm cursor-pointer">Paid Ads</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="both" id="cat-both" />
            <Label htmlFor="cat-both" className="text-sm cursor-pointer">Beide</Label>
          </div>
        </RadioGroup>
      </div>

      {/* Ad types grouped by platform */}
      <div className="space-y-6">
        {Object.entries(grouped).map(([pid, { platform, adTypes }]) => (
          <div key={pid}>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
              {platform.label}
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {adTypes.map((adType) => {
                const isSelected = selectedAdTypes.some(
                  (s) => s.platformId === pid && s.adTypeId === adType.id
                )
                return (
                  <label
                    key={adType.id}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors',
                      isSelected
                        ? 'border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20'
                        : 'border-slate-200 hover:border-slate-300 dark:border-[#252d3a] dark:hover:border-[#3d4a5c]'
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleAdType(pid as PlatformId, adType.id)}
                    />
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {adType.label}
                      </span>
                      <Badge
                        variant="secondary"
                        className="ml-2 text-[10px] px-1.5 py-0"
                      >
                        {adType.category === 'social' ? 'Social' : 'Paid'}
                      </Badge>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>
        ))}

        {Object.keys(grouped).length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
            Keine Anzeigentypen für die gewählte Kategorie verfügbar.
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Step 3: Briefing ────────────────────────────────────────────────────────

function Step3Briefing({
  briefing,
  setBriefing,
}: {
  briefing: BriefingData
  setBriefing: (b: BriefingData) => void
}) {
  function update(field: keyof BriefingData, value: string) {
    setBriefing({ ...briefing, [field]: value })
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">
        Briefing
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Beschreibe dein Produkt oder gib ein Stichwort ein. Die KI generiert passende Anzeigentexte.
      </p>

      <div className="space-y-5">
        <div>
          <Label htmlFor="ad-product" className="text-sm font-medium">
            Produkt / Stichwort <span className="text-red-500">*</span>
          </Label>
          <Input
            id="ad-product"
            value={briefing.product}
            onChange={(e) => update('product', e.target.value)}
            placeholder="z.B. Eventuri Ansaugsystem"
            className="mt-1.5 rounded-xl"
          />
        </div>

        <div>
          <Label htmlFor="ad-audience" className="text-sm font-medium">
            Zielgruppe
          </Label>
          <Textarea
            id="ad-audience"
            value={briefing.audience}
            onChange={(e) => update('audience', e.target.value)}
            placeholder="z.B. Auto-Enthusiasten, 25-45 Jahre"
            className="mt-1.5 rounded-xl min-h-[80px]"
          />
        </div>

        <div>
          <Label className="text-sm font-medium mb-2 block">Kampagnenziel</Label>
          <RadioGroup
            value={briefing.goal}
            onValueChange={(v) => update('goal', v)}
            className="flex flex-wrap gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="awareness" id="goal-awareness" />
              <Label htmlFor="goal-awareness" className="text-sm cursor-pointer">Awareness</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="conversion" id="goal-conversion" />
              <Label htmlFor="goal-conversion" className="text-sm cursor-pointer">Conversion</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="traffic" id="goal-traffic" />
              <Label htmlFor="goal-traffic" className="text-sm cursor-pointer">Traffic</Label>
            </div>
          </RadioGroup>
        </div>

        <div>
          <Label htmlFor="ad-usp" className="text-sm font-medium">
            USP
          </Label>
          <Input
            id="ad-usp"
            value={briefing.usp}
            onChange={(e) => update('usp', e.target.value)}
            placeholder="z.B. Performance, Qualität, Design"
            className="mt-1.5 rounded-xl"
          />
        </div>

        <div>
          <Label className="text-sm font-medium mb-2 block">Tonalität</Label>
          <RadioGroup
            value={briefing.tone}
            onValueChange={(v) => update('tone', v)}
            className="flex flex-wrap gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="professional" id="tone-pro" />
              <Label htmlFor="tone-pro" className="text-sm cursor-pointer">Professionell</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="casual" id="tone-casual" />
              <Label htmlFor="tone-casual" className="text-sm cursor-pointer">Locker</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="emotional" id="tone-emotional" />
              <Label htmlFor="tone-emotional" className="text-sm cursor-pointer">Emotional</Label>
            </div>
          </RadioGroup>
        </div>
      </div>
    </div>
  )
}

// ─── Step 4: Customer ────────────────────────────────────────────────────────

function Step4Customer({
  customerId,
  setCustomerId,
  customers,
  loading,
}: {
  customerId: string
  setCustomerId: (id: string) => void
  customers: { id: string; name: string }[]
  loading: boolean
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">
        Kundenzuordnung
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Ordne die Generierung optional einem Kunden zu, um sie später einfach wiederzufinden.
      </p>

      {loading ? (
        <Skeleton className="h-10 w-full rounded-xl" />
      ) : (
        <Select value={customerId} onValueChange={setCustomerId}>
          <SelectTrigger className="rounded-xl">
            <SelectValue placeholder="Kunde wählen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Kein Kunde (tenant-weit)</SelectItem>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// GENERATING VIEW
// ═══════════════════════════════════════════════════════════════════════════════

const GENERATING_PHASES = [
  'Briefing wird analysiert...',
  'KI erstellt Ad-Texte...',
  'Zeichenlimits werden geprüft...',
  'Fast fertig...',
]
const GENERATING_PHASE_DELAYS = [2500, 14000, 8000]

function GeneratingView({ platforms }: { platforms: PlatformId[] }) {
  const [phaseIndex, setPhaseIndex] = useState(0)

  useEffect(() => {
    let current = 0
    const timers: ReturnType<typeof setTimeout>[] = []
    function advance() {
      current++
      if (current < GENERATING_PHASES.length) {
        setPhaseIndex(current)
        if (current < GENERATING_PHASE_DELAYS.length) {
          timers.push(setTimeout(advance, GENERATING_PHASE_DELAYS[current]))
        }
      }
    }
    timers.push(setTimeout(advance, GENERATING_PHASE_DELAYS[0]))
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
      <CardContent className="flex flex-col items-center gap-6 p-8 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/30">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Ad-Texte werden generiert...
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 transition-all">
            {GENERATING_PHASES[phaseIndex]}
          </p>
          <div className="mt-4 flex justify-center gap-1.5">
            {GENERATING_PHASES.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1.5 w-6 rounded-full transition-colors duration-500',
                  i <= phaseIndex
                    ? 'bg-blue-500 dark:bg-blue-400'
                    : 'bg-slate-100 dark:bg-slate-800'
                )}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {platforms.map((pid) => (
            <Badge
              key={pid}
              variant="secondary"
              className="flex items-center gap-1.5 rounded-full px-3 py-1"
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              {platformLabel(pid)}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESULTS VIEW
// ═══════════════════════════════════════════════════════════════════════════════

interface ResultsViewProps {
  result: GenerationResult
  detail: GenerationDetail | null
  generationId: string | null
  briefing: BriefingData
  platforms: PlatformId[]
  selectedAdTypes: SelectedAdType[]
  onNewGeneration: () => void
  onBackToHistory: () => void
  onApprovalStatusChange?: (status: ApprovalStatus | 'draft' | null) => void
}

function ResultsView({
  result,
  detail,
  generationId,
  briefing: wizardBriefing,
  platforms: wizardPlatforms,
  selectedAdTypes: wizardAdTypes,
  onNewGeneration,
  onBackToHistory,
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
      <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
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
                      className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827] dark:bg-blue-600 dark:hover:bg-blue-700"
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
                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-[#252d3a] dark:bg-[#151c28]">
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
              {!canEdit && (
                <Button
                  className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827] dark:bg-blue-600 dark:hover:bg-blue-700"
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
                    className="rounded-2xl border border-slate-100 bg-white dark:border-[#252d3a] dark:bg-[#151c28] overflow-hidden"
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
        <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28]">
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
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-[#252d3a] dark:bg-[#0c1018]">
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
          className="min-h-[92px] rounded-xl border-slate-200 bg-white text-sm text-slate-900 dark:border-[#252d3a] dark:bg-[#151c28] dark:text-slate-100"
        />
      ) : (
        <p className="text-sm text-slate-900 dark:text-slate-100 whitespace-pre-wrap break-words">
          {text || <span className="text-slate-400 italic">Kein Text</span>}
        </p>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// HISTORY VIEW
// ═══════════════════════════════════════════════════════════════════════════════

interface HistoryViewProps {
  history: GenerationSummary[]
  loading: boolean
  customers: { id: string; name: string }[]
  filterCustomer: string
  setFilterCustomer: (id: string) => void
  filterPlatform: PlatformId | 'all'
  setFilterPlatform: (p: PlatformId | 'all') => void
  search: string
  setSearch: (s: string) => void
  filterDate: 'all' | '7d' | '30d' | '90d'
  setFilterDate: (d: 'all' | '7d' | '30d' | '90d') => void
  onOpen: (id: string) => void
  onNew: () => void
}

function HistoryView({
  history,
  loading,
  customers,
  filterCustomer,
  setFilterCustomer,
  filterPlatform,
  setFilterPlatform,
  search,
  setSearch,
  filterDate,
  setFilterDate,
  onOpen,
  onNew,
}: HistoryViewProps) {
  const filtered = history
    .filter((item) => !search || item.product.toLowerCase().includes(search.toLowerCase()))
    .filter((item) => {
      if (filterDate === 'all') return true
      const days = filterDate === '7d' ? 7 : filterDate === '30d' ? 30 : 90
      return new Date(item.created_at) >= new Date(Date.now() - days * 86_400_000)
    })

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">
                Suche
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Produkt suchen..."
                  className="rounded-xl pl-8"
                />
              </div>
            </div>
            <div className="flex-1">
              <Label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">
                Kunde
              </Label>
              <Select value={filterCustomer} onValueChange={setFilterCustomer}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Alle Kunden" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Kunden</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">
                Plattform
              </Label>
              <Select value={filterPlatform} onValueChange={(v) => setFilterPlatform(v as PlatformId | 'all')}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Alle Plattformen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Plattformen</SelectItem>
                  {AD_PLATFORMS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">
                Zeitraum
              </Label>
              <Select value={filterDate} onValueChange={(v) => setFilterDate(v as 'all' | '7d' | '30d' | '90d')}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="7d">Letzte 7 Tage</SelectItem>
                  <SelectItem value="30d">Letzte 30 Tage</SelectItem>
                  <SelectItem value="90d">Letzte 90 Tage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827] dark:bg-blue-600 dark:hover:bg-blue-700 shrink-0"
              onClick={onNew}
            >
              <Plus className="mr-2 h-4 w-4" />
              Neue Generierung
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {/* No results (filters active) */}
      {!loading && history.length > 0 && filtered.length === 0 && (
        <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
          Keine Generierungen für diese Filtereinstellungen gefunden.
        </div>
      )}

      {/* Empty state */}
      {!loading && history.length === 0 && (
        <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
          <CardContent className="flex flex-col items-center gap-5 p-8 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 dark:bg-slate-800">
              <Megaphone className="h-7 w-7 text-slate-400 dark:text-slate-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                Noch keine Generierungen
              </h2>
              <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
                Erstelle deine erste KI-generierte Anzeige. Wähle Plattformen, gib ein Briefing ein und erhalte sofort optimierte Ad-Texte.
              </p>
            </div>
            <Button
              className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827] dark:bg-blue-600 dark:hover:bg-blue-700"
              onClick={onNew}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Erste Generierung starten
            </Button>
          </CardContent>
        </Card>
      )}

      {/* History list */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpen(item.id)}
              className="w-full text-left rounded-2xl border border-slate-100 bg-white p-4 sm:p-5 transition-all hover:border-slate-200 hover:shadow-sm dark:border-[#252d3a] dark:bg-[#151c28] dark:hover:border-[#3d4a5c]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 dark:text-slate-50 truncate">
                    {item.product}
                  </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {item.platforms.map((pid) => (
                      <Badge key={pid} variant="secondary" className="rounded-full text-[10px] px-2 py-0.5">
                        {platformLabel(pid)}
                      </Badge>
                    ))}
                    {item.customer_name && (
                      <Badge variant="outline" className="rounded-full text-[10px] px-2 py-0.5">
                        {item.customer_name}
                      </Badge>
                    )}
                    {item.approval_status !== 'draft' && (
                      <ApprovalStatusBadge status={item.approval_status} />
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {formatDate(item.created_at)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
