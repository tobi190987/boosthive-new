'use client'

import {
  ArrowLeft,
  Check,
  ChevronRight,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  AD_PLATFORMS,
  getAdTypesForPlatforms,
  type AdTypeConfig,
  type PlatformConfig,
  type PlatformId,
} from '@/lib/ad-limits'
import type { BriefingData, SelectedAdType } from './types'

// ─── Constants ───────────────────────────────────────────────────────────────

export const PLATFORM_ICONS: Record<PlatformId, string> = {
  facebook: 'f',
  linkedin: 'in',
  tiktok: 'T',
  google: 'G',
}

// ─── Wizard View ─────────────────────────────────────────────────────────────

export interface WizardViewProps {
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

export function WizardView({
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
    <Card className="rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
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
              variant="dark"
              onClick={() => setStep(step + 1)}
              disabled={!canNext()}
            >
              Weiter
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="dark"
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
                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-border dark:bg-card dark:hover:border-[#3d4a5c]'
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
                        : 'border-slate-200 hover:border-slate-300 dark:border-border dark:hover:border-[#3d4a5c]'
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
