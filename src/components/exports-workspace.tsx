'use client'

import { toBlob } from 'html-to-image'
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Upload,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useActiveCustomer } from '@/lib/active-customer-context'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

// ─── Types ───────────────────────────────────────────────────────────────────

export type ExportFormat = 'pdf' | 'png' | 'xlsx'
export type ExportType =
  | 'keyword_rankings'
  | 'marketing_dashboard'
  | 'gsc_discovery'
  | 'customer_report'
export type ExportStatus = 'pending' | 'generating' | 'done' | 'failed'
export type BrandingSource = 'tenant' | 'customer'

interface ExportTypeOption {
  id: ExportType
  name: string
  description: string
  icon: typeof BarChart3
  iconBg: string
  iconColor: string
  formats: ExportFormat[]
}

interface ExportHistoryItem {
  id: string
  type: ExportType
  format: ExportFormat
  customer_id: string | null
  customer_name: string | null
  branding_source: BrandingSource
  brand_color: string
  status: ExportStatus
  error_message: string | null
  created_at: string
  email_sent_at: string | null
  email_sent_to: string | null
}

interface PngSnapshotPayload {
  title: string
  subtitle: string
  metrics: Array<{ label: string; value: string | number; unit?: string }>
  generatedAt: string
  accentColor: string
}

interface CustomerListResponse {
  customers?: ExportCustomer[]
}

interface ExportAvailabilityResponse {
  hasData?: boolean
  message?: string | null
}

type ExportCustomer = ReturnType<typeof useActiveCustomer>['customers'][number] & {
  contact_email?: string | null
  logo_url?: string | null
}

interface ExportsWorkspaceProps {
  tenantName: string
  tenantLogoUrl: string | null
}

// ─── Catalog ─────────────────────────────────────────────────────────────────

const EXPORT_TYPES: ExportTypeOption[] = [
  {
    id: 'keyword_rankings',
    name: 'Keyword Rankings',
    description: 'Keyword-Positionen, Verlauf und Top-Movers für deinen Kunden.',
    icon: Search,
    iconBg: 'bg-blue-50 dark:bg-blue-950/40',
    iconColor: 'text-blue-600 dark:text-blue-400',
    formats: ['pdf', 'xlsx'],
  },
  {
    id: 'marketing_dashboard',
    name: 'Marketing Dashboard',
    description: 'Kombinierter Bericht aus GA4-, Ads- und Performance-Metriken.',
    icon: BarChart3,
    iconBg: 'bg-violet-50 dark:bg-violet-950/40',
    iconColor: 'text-violet-600 dark:text-violet-400',
    formats: ['pdf', 'png'],
  },
  {
    id: 'gsc_discovery',
    name: 'GSC Discovery',
    description: 'Alle Rankings aus der Google Search Console als Rohdaten.',
    icon: FileSpreadsheet,
    iconBg: 'bg-emerald-50 dark:bg-emerald-950/40',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    formats: ['xlsx'],
  },
  {
    id: 'customer_report',
    name: 'Kundenbericht',
    description: 'Monatlicher Zusammenfassungsbericht für einen Kunden.',
    icon: FileText,
    iconBg: 'bg-orange-50 dark:bg-orange-950/40',
    iconColor: 'text-orange-600 dark:text-orange-400',
    formats: ['pdf'],
  },
]

const EXPORT_TYPE_LABELS: Record<ExportType, string> = {
  keyword_rankings: 'Keyword Rankings',
  marketing_dashboard: 'Marketing Dashboard',
  gsc_discovery: 'GSC Discovery',
  customer_report: 'Kundenbericht',
}

const FORMAT_LABELS: Record<ExportFormat, string> = {
  pdf: 'PDF',
  png: 'PNG',
  xlsx: 'XLSX',
}

const FORMAT_ICONS: Record<ExportFormat, typeof FileText> = {
  pdf: FileText,
  png: FileImage,
  xlsx: FileSpreadsheet,
}

function isSupportedLogoUrl(value: string | null | undefined): value is string {
  if (!value) return false
  return (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('/') ||
    value.startsWith('data:image/')
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ExportsWorkspace({ tenantName, tenantLogoUrl }: ExportsWorkspaceProps) {
  const { activeCustomer, customers, refetchCustomers } = useActiveCustomer()
  const { toast } = useToast()

  const [history, setHistory] = useState<ExportHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)

  const [configOpen, setConfigOpen] = useState(false)
  const [activeExportType, setActiveExportType] = useState<ExportTypeOption | null>(null)

  const [emailModal, setEmailModal] = useState<ExportHistoryItem | null>(null)

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const res = await fetch('/api/tenant/exports', { credentials: 'include' })
      if (!res.ok) {
        if (res.status === 404) {
          // API not yet implemented — keep empty history
          setHistory([])
          return
        }
        throw new Error(`Fehler beim Laden des Verlaufs (${res.status})`)
      }
      const data = (await res.json()) as { exports?: ExportHistoryItem[] }
      setHistory((data.exports ?? []).filter((item) => item.status !== 'failed'))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler'
      setHistoryError(message)
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const handleStartExport = useCallback((type: ExportTypeOption) => {
    setActiveExportType(type)
    setConfigOpen(true)
  }, [])

  const handleExportCreated = useCallback(
    (item: ExportHistoryItem) => {
      setHistory((prev) => [item, ...prev].slice(0, 50))
      setConfigOpen(false)
      setActiveExportType(null)
      toast({
        title: 'Export erstellt',
        description: `${EXPORT_TYPE_LABELS[item.type]} wurde als ${FORMAT_LABELS[item.format]} generiert.`,
      })
    },
    [toast]
  )

  const handleDownload = useCallback(
    async (item: ExportHistoryItem) => {
      try {
        const res = await fetch(`/api/tenant/exports/${item.id}/download`, {
          credentials: 'include',
        })
        if (!res.ok) throw new Error('Download fehlgeschlagen')
        const data = (await res.json()) as { url?: string }
        if (!data.url) throw new Error('Keine Download-URL verfügbar')
        window.open(data.url, '_blank', 'noopener,noreferrer')
      } catch (error) {
        toast({
          title: 'Download fehlgeschlagen',
          description: error instanceof Error ? error.message : 'Unbekannter Fehler',
          variant: 'destructive',
        })
      }
    },
    [toast]
  )

  return (
    <div className="space-y-8">
      {/* Export Types Grid */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Verfügbare Exporte
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {EXPORT_TYPES.map((type) => (
            <ExportTypeCard key={type.id} type={type} onStart={handleStartExport} />
          ))}
        </div>
      </section>

      {/* Export History */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              Export-Verlauf
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Die letzten 50 Exports dieses Tenants.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadHistory()}
            disabled={historyLoading}
            className="gap-2"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', historyLoading && 'animate-spin')} />
            Aktualisieren
          </Button>
        </div>

        <Card className="border-slate-100 dark:border-border">
          <CardContent className="p-0">
            {historyLoading ? (
              <HistoryLoadingState />
            ) : historyError ? (
              <HistoryErrorState message={historyError} onRetry={() => void loadHistory()} />
            ) : history.length === 0 ? (
              <HistoryEmptyState />
            ) : (
              <HistoryTable
                items={history}
                onDownload={(item) => void handleDownload(item)}
                onEmail={(item) => setEmailModal(item)}
              />
            )}
          </CardContent>
        </Card>
      </section>

      {/* Config Modal */}
      {activeExportType ? (
        <ExportConfigModal
          open={configOpen}
          onOpenChange={(open) => {
            setConfigOpen(open)
            if (!open) setActiveExportType(null)
          }}
          exportType={activeExportType}
          tenantName={tenantName}
          tenantLogoUrl={tenantLogoUrl}
          activeCustomer={activeCustomer}
          customers={customers as ExportCustomer[]}
          refetchCustomers={refetchCustomers}
          onCreated={handleExportCreated}
        />
      ) : null}

      {/* Email Modal */}
      {emailModal ? (
        <ExportEmailModal
          open={!!emailModal}
          onOpenChange={(open) => {
            if (!open) setEmailModal(null)
          }}
          item={emailModal}
          onSent={(updated) => {
            setHistory((prev) => prev.map((h) => (h.id === updated.id ? updated : h)))
            setEmailModal(null)
            toast({
              title: 'E-Mail versendet',
              description: `Export wurde an ${updated.email_sent_to} gesendet.`,
            })
          }}
        />
      ) : null}
    </div>
  )
}

// ─── Export Type Card ────────────────────────────────────────────────────────

function ExportTypeCard({
  type,
  onStart,
}: {
  type: ExportTypeOption
  onStart: (type: ExportTypeOption) => void
}) {
  return (
    <Card className="flex flex-col border-slate-100 transition-shadow hover:shadow-md dark:border-border">
      <CardHeader className="pb-3">
        <div
          className={cn(
            'mb-3 flex h-10 w-10 items-center justify-center rounded-xl',
            type.iconBg
          )}
          aria-hidden="true"
        >
          <type.icon className={cn('h-5 w-5', type.iconColor)} />
        </div>
        <CardTitle className="text-base text-slate-900 dark:text-slate-50">{type.name}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">{type.description}</p>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {type.formats.map((format) => {
              const Icon = FORMAT_ICONS[format]
              return (
                <Badge
                  key={format}
                  variant="secondary"
                  className="gap-1 rounded-full bg-slate-100 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Icon className="h-3 w-3" />
                  {FORMAT_LABELS[format]}
                </Badge>
              )
            })}
          </div>
          <Button
            variant="dark"
            size="sm"
            className="w-full"
            onClick={() => onStart(type)}
            aria-label={`${type.name} exportieren`}
          >
            Export starten
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── History States ──────────────────────────────────────────────────────────

function HistoryLoadingState() {
  return (
    <div className="space-y-3 p-6">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-12 w-full rounded-xl" />
      ))}
    </div>
  )
}

function HistoryErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="p-6">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Verlauf konnte nicht geladen werden</AlertTitle>
        <AlertDescription className="mt-2 space-y-3">
          <p>{message}</p>
          <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            Erneut versuchen
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  )
}

function HistoryEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
        <Download className="h-5 w-5 text-slate-400 dark:text-slate-500" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Noch keine Exports erstellt
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Starte oben deinen ersten Export, um ihn hier im Verlauf zu sehen.
        </p>
      </div>
    </div>
  )
}

// ─── History Table ───────────────────────────────────────────────────────────

function HistoryTable({
  items,
  onDownload,
  onEmail,
}: {
  items: ExportHistoryItem[]
  onDownload: (item: ExportHistoryItem) => void
  onEmail: (item: ExportHistoryItem) => void
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Typ</TableHead>
            <TableHead>Format</TableHead>
            <TableHead>Kunde</TableHead>
            <TableHead>Branding</TableHead>
            <TableHead>Erstellt</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Aktionen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <HistoryRow
              key={item.id}
              item={item}
              onDownload={onDownload}
              onEmail={onEmail}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function HistoryRow({
  item,
  onDownload,
  onEmail,
}: {
  item: ExportHistoryItem
  onDownload: (item: ExportHistoryItem) => void
  onEmail: (item: ExportHistoryItem) => void
}) {
  const FormatIcon = FORMAT_ICONS[item.format]
  const canDownload = item.status === 'done'
  const canEmail = item.status === 'done'

  return (
    <TableRow>
      <TableCell className="font-medium text-slate-900 dark:text-slate-100">
        {EXPORT_TYPE_LABELS[item.type]}
      </TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
          <FormatIcon className="h-3.5 w-3.5 text-slate-400" />
          {FORMAT_LABELS[item.format]}
        </span>
      </TableCell>
      <TableCell className="text-sm text-slate-600 dark:text-slate-300">
        {item.customer_name ?? 'Alle Kunden'}
      </TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <span
            className="inline-block h-3 w-3 rounded-full border border-slate-200 dark:border-slate-700"
            style={{ backgroundColor: item.brand_color }}
            aria-hidden="true"
          />
          {item.branding_source === 'tenant' ? 'Tenant' : 'Kunde'}
        </span>
      </TableCell>
      <TableCell className="text-sm text-slate-500 dark:text-slate-400">
        {formatDate(item.created_at)}
      </TableCell>
      <TableCell>
        <StatusBadge status={item.status} />
        {item.email_sent_at ? (
          <span className="mt-1 block text-[10px] text-slate-400">
            Gesendet {formatDate(item.email_sent_at)}
          </span>
        ) : null}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5"
            disabled={!canDownload}
            onClick={() => onDownload(item)}
            aria-label="Export herunterladen"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5"
            disabled={!canEmail}
            onClick={() => onEmail(item)}
            aria-label="Export per E-Mail senden"
          >
            <Mail className="h-3.5 w-3.5" />
            Senden
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function StatusBadge({ status }: { status: ExportStatus }) {
  if (status === 'done') {
    return (
      <Badge className="gap-1 rounded-full bg-emerald-50 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" />
        Fertig
      </Badge>
    )
  }
  if (status === 'failed') {
    return (
      <Badge className="gap-1 rounded-full bg-red-50 text-[11px] font-medium text-red-700 hover:bg-red-50 dark:bg-red-950/40 dark:text-red-400">
        <XCircle className="h-3 w-3" />
        Fehlgeschlagen
      </Badge>
    )
  }
  return (
    <Badge className="gap-1 rounded-full bg-blue-50 text-[11px] font-medium text-blue-700 hover:bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400">
      <Loader2 className="h-3 w-3 animate-spin" />
      Generierung läuft
    </Badge>
  )
}

function formatDate(iso: string): string {
  try {
    const date = new Date(iso)
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  } catch {
    return iso
  }
}

// ─── Config Modal ────────────────────────────────────────────────────────────

interface ExportConfigModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  exportType: ExportTypeOption
  tenantName: string
  tenantLogoUrl: string | null
  activeCustomer: ReturnType<typeof useActiveCustomer>['activeCustomer']
  customers: ExportCustomer[]
  refetchCustomers: ReturnType<typeof useActiveCustomer>['refetchCustomers']
  onCreated: (item: ExportHistoryItem) => void
}

function ExportConfigModal({
  open,
  onOpenChange,
  exportType,
  tenantName,
  tenantLogoUrl,
  activeCustomer,
  customers,
  refetchCustomers,
  onCreated,
}: ExportConfigModalProps) {
  const { toast } = useToast()

  const [format, setFormat] = useState<ExportFormat>(exportType.formats[0])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(activeCustomer?.id ?? 'all')
  const [brandingSource, setBrandingSource] = useState<BrandingSource>(
    activeCustomer ? 'customer' : 'tenant'
  )
  const [brandColor, setBrandColor] = useState<string>('#2563eb')
  const [acknowledgedEmpty, setAcknowledgedEmpty] = useState(false)
  const [emptyDataWarning, setEmptyDataWarning] = useState<string | null>(null)
  const [hasAvailableData, setHasAvailableData] = useState(false)
  const [checkingAvailability, setCheckingAvailability] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pngSnapshot, setPngSnapshot] = useState<PngSnapshotPayload | null>(null)
  const [uploadingCustomerLogo, setUploadingCustomerLogo] = useState(false)
  const [customerOptions, setCustomerOptions] = useState<ExportCustomer[]>(customers)
  const snapshotRef = useRef<HTMLDivElement | null>(null)
  const customerLogoInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setCustomerOptions(customers)
  }, [customers])

  // Reset state when modal opens/exportType changes
  useEffect(() => {
    if (open) {
      setFormat(exportType.formats[0])
      setSelectedCustomerId(activeCustomer?.id ?? 'all')
      setBrandingSource(activeCustomer ? 'customer' : 'tenant')
      setBrandColor('#2563eb')
      setAcknowledgedEmpty(false)
      setEmptyDataWarning(null)
      setHasAvailableData(false)
      setCheckingAvailability(false)
      setError(null)
      setSubmitting(false)
      setUploadingCustomerLogo(false)
    }
  }, [open, exportType, activeCustomer])

  useEffect(() => {
    if (!open) return

    let cancelled = false

    async function loadCustomerOptions() {
      try {
        const response = await fetch('/api/tenant/customers', {
          credentials: 'include',
        })
        if (!response.ok) return

        const payload = (await response.json()) as CustomerListResponse
        if (cancelled) return
        setCustomerOptions(payload.customers ?? [])
      } catch {
        // Keep existing options from context if the refresh fails.
      }
    }

    void loadCustomerOptions()

    return () => {
      cancelled = true
    }
  }, [open])

  const selectedCustomer = useMemo(
    () => customerOptions.find((customer) => customer.id === selectedCustomerId) ?? null,
    [customerOptions, selectedCustomerId]
  )
  const selectedCustomerValue = selectedCustomer?.id ?? 'all'
  const selectedCustomerName = selectedCustomer?.name ?? null
  const selectedCustomerLogoUrl = isSupportedLogoUrl(selectedCustomer?.logo_url)
    ? selectedCustomer.logo_url
    : null
  const showCustomerBrandingOption = selectedCustomerValue !== 'all'
  const effectiveBrandingSource: BrandingSource =
    showCustomerBrandingOption ? brandingSource : 'tenant'
  const customerLogoMissing =
    effectiveBrandingSource === 'customer' && showCustomerBrandingOption && !selectedCustomerLogoUrl

  const waitForSnapshotReady = useCallback(async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
      if (snapshotRef.current) return snapshotRef.current
    }

    throw new Error('PNG-Vorschau konnte nicht gerendert werden.')
  }, [])

  const uploadPngExport = useCallback(
    async (exportId: string) => {
      const node = await waitForSnapshotReady()
      const blob = await toBlob(node, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        skipFonts: true,
      })

      if (!blob) {
        throw new Error('PNG-Datei konnte nicht erstellt werden.')
      }

      const formData = new FormData()
      formData.set('file', new File([blob], `export-${exportId}.png`, { type: 'image/png' }))

      const uploadRes = await fetch(`/api/tenant/exports/${exportId}/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })

      if (!uploadRes.ok) {
        const uploadData = await uploadRes.json().catch(() => ({}))
        throw new Error(
          (uploadData as { error?: string }).error ?? `PNG-Upload fehlgeschlagen (${uploadRes.status})`
        )
      }

      const uploaded = (await uploadRes.json()) as { export?: ExportHistoryItem }
      if (!uploaded.export) throw new Error('Server-Antwort für PNG-Upload ungültig')
      return uploaded.export
    },
    [waitForSnapshotReady]
  )

  const handleCustomerLogoUpload = useCallback(
    async (file: File) => {
      if (!selectedCustomer) {
        throw new Error('Bitte wähle zuerst einen Kunden aus.')
      }

      setUploadingCustomerLogo(true)
      setError(null)

      try {
        const formData = new FormData()
        formData.set('logo', file)

        const response = await fetch(`/api/tenant/customers/${selectedCustomer.id}/logo`, {
          method: 'POST',
          body: formData,
          credentials: 'include',
        })
        const payload = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(
            (payload as { error?: string }).error ??
              `Kundenlogo konnte nicht hochgeladen werden (${response.status})`
          )
        }

        const nextLogoUrl = (payload as { logo_url?: string | null }).logo_url ?? null
        if (nextLogoUrl) {
          setCustomerOptions((current) =>
            current.map((customer) =>
              customer.id === selectedCustomer.id
                ? { ...customer, logo_url: nextLogoUrl }
                : customer
            )
          )
        }

        await refetchCustomers()
        toast({
          title: 'Kundenlogo gespeichert',
          description: `Das Logo für ${selectedCustomer.name} wurde hinterlegt.`,
        })
      } finally {
        setUploadingCustomerLogo(false)
      }
    },
    [refetchCustomers, selectedCustomer, toast]
  )

  const handleSubmit = useCallback(async () => {
    setError(null)
    setSubmitting(true)

    try {
      const res = await fetch('/api/tenant/exports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type: exportType.id,
          format,
          customer_id: selectedCustomerValue === 'all' ? null : selectedCustomerValue,
          branding_source: effectiveBrandingSource,
          brand_color: brandColor,
          acknowledge_empty: acknowledgedEmpty,
        }),
      })

      // Empty-data warning from server
      if (res.status === 409) {
        const data = (await res.json()) as { message?: string }
        setEmptyDataWarning(
          data.message ?? 'Für diese Auswahl liegen aktuell keine Daten vor.'
        )
        setSubmitting(false)
        return
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(
          (data as { error?: string }).error ?? `Export fehlgeschlagen (${res.status})`
        )
      }

      const data = (await res.json()) as {
        export?: ExportHistoryItem
        snapshot?: PngSnapshotPayload
      }
      if (!data.export) throw new Error('Server-Antwort ungültig')

      if (format === 'png') {
        if (!data.snapshot) throw new Error('PNG-Snapshotdaten fehlen.')
        setPngSnapshot(data.snapshot)
        const uploadedExport = await uploadPngExport(data.export.id)
        setPngSnapshot(null)
        onCreated(uploadedExport)
        return
      }

      onCreated(data.export)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      setPngSnapshot(null)
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }, [
    acknowledgedEmpty,
    brandColor,
    effectiveBrandingSource,
    exportType.id,
    format,
    onCreated,
    selectedCustomerValue,
    uploadPngExport,
  ])

  const needsAcknowledgement = !!emptyDataWarning && !acknowledgedEmpty

  useEffect(() => {
    if (!open) return

    let cancelled = false
    const controller = new AbortController()

    async function checkAvailability() {
      setCheckingAvailability(true)

      try {
        const params = new URLSearchParams({
          type: exportType.id,
        })

        if (selectedCustomerValue !== 'all') {
          params.set('customer_id', selectedCustomerValue)
        }

        const response = await fetch(`/api/tenant/exports/availability?${params.toString()}`, {
          credentials: 'include',
          signal: controller.signal,
        })

        if (!response.ok) {
          if (cancelled) return
          setEmptyDataWarning(null)
          setHasAvailableData(false)
          return
        }

        const payload = (await response.json()) as ExportAvailabilityResponse
        if (cancelled) return
        const hasData = payload.hasData !== false
        setHasAvailableData(hasData)
        setEmptyDataWarning(hasData ? null : payload.message ?? null)
        setAcknowledgedEmpty(false)
      } catch (availabilityError) {
        if (controller.signal.aborted || cancelled) return
        setEmptyDataWarning(null)
        setHasAvailableData(false)
      } finally {
        if (!cancelled) {
          setCheckingAvailability(false)
        }
      }
    }

    void checkAvailability()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [open, exportType.id, selectedCustomerValue])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl overflow-hidden p-0">
        <DialogHeader>
          <div className="px-6 pt-6">
            <DialogTitle>{exportType.name} exportieren</DialogTitle>
            <DialogDescription>
              Konfiguriere Format, Kunden-Kontext und Branding für diesen Export.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="max-h-[min(70vh,720px)] space-y-6 overflow-y-auto px-6 py-2">
          {/* Format */}
          <div className="space-y-2">
            <Label htmlFor="export-format">Format</Label>
            <Select
              value={format}
              onValueChange={(value) => setFormat(value as ExportFormat)}
              disabled={submitting}
            >
              <SelectTrigger id="export-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {exportType.formats.map((f) => (
                  <SelectItem key={f} value={f}>
                    {FORMAT_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Customer selection */}
          <div className="space-y-3">
            <Label htmlFor="export-customer">Kunde</Label>
              <Select
              value={selectedCustomerValue}
              onValueChange={setSelectedCustomerId}
              disabled={submitting || uploadingCustomerLogo}
            >
              <SelectTrigger id="export-customer">
                <SelectValue placeholder="Kunden auswählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Kunden</SelectItem>
                {customerOptions.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {selectedCustomer
                ? `Export wird für ${selectedCustomer.name} erstellt.`
                : `Export umfasst ${customerOptions.length > 0 ? `${customerOptions.length} Kunden` : 'alle Kunden'} dieses Tenants.`}
            </p>
          </div>

          <Separator />

          {/* Branding */}
          <div className="space-y-3">
            <Label>Branding</Label>
            <RadioGroup
              value={effectiveBrandingSource}
              onValueChange={(value) => setBrandingSource(value as BrandingSource)}
              disabled={submitting || uploadingCustomerLogo}
              className="gap-2"
            >
              <label
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors',
                  effectiveBrandingSource === 'tenant'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                    : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                )}
              >
                <RadioGroupItem value="tenant" id="brand-tenant" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Tenant-Logo ({tenantName})
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {tenantLogoUrl
                      ? 'Tenant-Logo wird im Header des Exports verwendet.'
                      : 'Kein Logo hinterlegt — es wird der Tenant-Name verwendet.'}
                  </p>
                </div>
              </label>

              {showCustomerBrandingOption ? (
                <label
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors',
                    effectiveBrandingSource === 'customer'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                  )}
                >
                  <RadioGroupItem value="customer" id="brand-customer" className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      Kunden-Logo
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {selectedCustomerLogoUrl
                        ? `Logo des Kunden „${selectedCustomerName}" wird verwendet.`
                        : `Für ${selectedCustomerName} ist noch kein Logo hinterlegt.`}
                    </p>
                  </div>
                </label>
              ) : null}
            </RadioGroup>

            {customerLogoMissing ? (
              <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Kein Kundenlogo hinterlegt</AlertTitle>
                <AlertDescription className="mt-2 space-y-3">
                  <p>
                    Für {selectedCustomerName} ist noch kein Kundenlogo gespeichert. Du kannst es
                    direkt hier hochladen und anschließend für den Export verwenden.
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      ref={customerLogoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (!file) return

                        void handleCustomerLogoUpload(file)
                          .catch((uploadError) => {
                            const message =
                              uploadError instanceof Error
                                ? uploadError.message
                                : 'Kundenlogo konnte nicht hochgeladen werden.'
                            setError(message)
                            toast({
                              title: 'Logo-Upload fehlgeschlagen',
                              description: message,
                              variant: 'destructive',
                            })
                          })
                          .finally(() => {
                            if (customerLogoInputRef.current) {
                              customerLogoInputRef.current.value = ''
                            }
                          })
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => customerLogoInputRef.current?.click()}
                      disabled={submitting || uploadingCustomerLogo}
                      className="gap-2"
                    >
                      {uploadingCustomerLogo ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Logo wird hochgeladen...
                        </>
                      ) : (
                        <>
                          <Upload className="h-3.5 w-3.5" />
                          Kundenlogo hochladen
                        </>
                      )}
                    </Button>
                    <span className="text-xs text-amber-800/80 dark:text-amber-300/80">
                      Erlaubt: PNG, JPG, SVG, WebP bis 5 MB
                    </span>
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}

            {effectiveBrandingSource === 'customer' && selectedCustomerLogoUrl ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  Hinterlegtes Kundenlogo
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="relative h-12 w-12 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selectedCustomerLogoUrl}
                      alt={`Logo von ${selectedCustomerName}`}
                      className="h-full w-full object-contain p-1"
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.style.display = 'none'
                      }}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {selectedCustomerName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Dieses Logo wird im Export verwendet.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-1">
                <Label htmlFor="brand-color" className="text-xs font-normal text-slate-500">
                  Akzentfarbe
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="brand-color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    disabled={submitting || uploadingCustomerLogo}
                    aria-label="Akzentfarbe wählen"
                    className="h-9 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900"
                  />
                  <Input
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    disabled={submitting || uploadingCustomerLogo}
                    className="h-9 flex-1 font-mono text-xs uppercase"
                    maxLength={7}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Empty-data warning */}
          {emptyDataWarning ? (
            <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Keine Daten für diese Auswahl</AlertTitle>
              <AlertDescription className="mt-2 space-y-3">
                <p>{emptyDataWarning}</p>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={acknowledgedEmpty}
                    onChange={(e) => setAcknowledgedEmpty(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-amber-300"
                  />
                  Trotzdem exportieren — Export zeigt dann &bdquo;Keine Daten verf&uuml;gbar&ldquo;.
                </label>
              </AlertDescription>
            </Alert>
          ) : checkingAvailability ? (
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Datenlage wird geprüft...
            </div>
          ) : hasAvailableData ? (
            <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Daten verfügbar
            </div>
          ) : null}

          {/* Error */}
          {error ? (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Export fehlgeschlagen</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter className="border-t bg-background px-6 py-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting || uploadingCustomerLogo}
          >
            Abbrechen
          </Button>
          <Button
            variant="dark"
            onClick={() => void handleSubmit()}
            disabled={submitting || uploadingCustomerLogo || needsAcknowledgement}
            className="gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Wird generiert...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Exportieren
              </>
            )}
          </Button>
        </DialogFooter>

        {pngSnapshot ? (
          <div className="pointer-events-none absolute -left-[10000px] top-0 opacity-0">
            <MarketingDashboardExportSnapshot
              ref={snapshotRef}
              snapshot={pngSnapshot}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

// ─── Email Modal ─────────────────────────────────────────────────────────────

interface ExportEmailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: ExportHistoryItem
  onSent: (updated: ExportHistoryItem) => void
}

function ExportEmailModal({ open, onOpenChange, item, onSent }: ExportEmailModalProps) {
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const emailValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()), [email])

  const handleSend = useCallback(async () => {
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/tenant/exports/${item.id}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ to: email.trim(), message: message.trim() || null }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(
          (data as { error?: string }).error ?? `Versand fehlgeschlagen (${res.status})`
        )
      }

      const data = (await res.json()) as { export?: ExportHistoryItem }
      if (!data.export) throw new Error('Server-Antwort ungültig')
      onSent(data.export)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
      setError(msg)
      toast({
        title: 'E-Mail-Versand fehlgeschlagen',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }, [email, item.id, message, onSent, toast])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export per E-Mail senden</DialogTitle>
          <DialogDescription>
            {EXPORT_TYPE_LABELS[item.type]} als {FORMAT_LABELS[item.format]} an den Kunden senden.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="email-to">Empfänger-E-Mail</Label>
            <Input
              id="email-to"
              type="email"
              placeholder="kunde@beispiel.de"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={sending}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-message">Nachricht (optional)</Label>
            <Textarea
              id="email-message"
              placeholder="Hallo, anbei der aktuelle Bericht..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={sending}
              rows={4}
            />
          </div>

          {error ? (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Abbrechen
          </Button>
          <Button
            variant="dark"
            onClick={() => void handleSend()}
            disabled={sending || !emailValid}
            className="gap-2"
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Wird gesendet...
              </>
            ) : (
              <>
                <Mail className="h-4 w-4" />
                Senden
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const MarketingDashboardExportSnapshot = forwardRef<HTMLDivElement, { snapshot: PngSnapshotPayload }>(
  function MarketingDashboardExportSnapshot({ snapshot }, ref) {
  return (
    <div
      ref={ref}
      className="w-[1200px] rounded-[32px] bg-white p-10 text-slate-900 shadow-2xl"
      style={{
        backgroundImage:
          'radial-gradient(circle at top right, rgba(148,163,184,0.18), transparent 28%)',
      }}
    >
      <div
        className="rounded-[28px] px-8 py-7 text-white"
        style={{ backgroundColor: snapshot.accentColor }}
      >
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/80">
          Export Center
        </p>
        <div className="mt-4 flex items-end justify-between gap-8">
          <div>
            <h2 className="text-4xl font-semibold">{snapshot.title}</h2>
            <p className="mt-2 text-lg text-white/80">{snapshot.subtitle}</p>
          </div>
          <p className="text-sm text-white/80">{snapshot.generatedAt}</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-5">
        {snapshot.metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-[24px] border border-slate-200 bg-slate-50 px-6 py-5"
          >
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-500">
              {metric.label}
            </p>
            <p className="mt-3 text-3xl font-semibold text-slate-950">
              {metric.value}
              {metric.unit ? ` ${metric.unit}` : ''}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
})
