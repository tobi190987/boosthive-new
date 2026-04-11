'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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

// ─── Component ───────────────────────────────────────────────────────────────

export function ExportsWorkspace({ tenantName, tenantLogoUrl }: ExportsWorkspaceProps) {
  const { activeCustomer, customers } = useActiveCustomer()
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
      setHistory(data.exports ?? [])
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
          customerCount={customers.length}
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
  customerCount: number
  onCreated: (item: ExportHistoryItem) => void
}

function ExportConfigModal({
  open,
  onOpenChange,
  exportType,
  tenantName,
  tenantLogoUrl,
  activeCustomer,
  customerCount,
  onCreated,
}: ExportConfigModalProps) {
  const { toast } = useToast()

  const [format, setFormat] = useState<ExportFormat>(exportType.formats[0])
  const [customerScope, setCustomerScope] = useState<'current' | 'all'>(
    activeCustomer ? 'current' : 'all'
  )
  const [brandingSource, setBrandingSource] = useState<BrandingSource>(
    activeCustomer ? 'customer' : 'tenant'
  )
  const [brandColor, setBrandColor] = useState<string>('#2563eb')
  const [acknowledgedEmpty, setAcknowledgedEmpty] = useState(false)
  const [emptyDataWarning, setEmptyDataWarning] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset state when modal opens/exportType changes
  useEffect(() => {
    if (open) {
      setFormat(exportType.formats[0])
      setCustomerScope(activeCustomer ? 'current' : 'all')
      setBrandingSource(activeCustomer ? 'customer' : 'tenant')
      setBrandColor('#2563eb')
      setAcknowledgedEmpty(false)
      setEmptyDataWarning(null)
      setError(null)
      setSubmitting(false)
    }
  }, [open, exportType, activeCustomer])

  const customerLogoMissing =
    brandingSource === 'customer' && customerScope === 'current' && !activeCustomer

  const effectiveBrandingSource: BrandingSource = customerLogoMissing ? 'tenant' : brandingSource

  const selectedCustomerId = customerScope === 'current' ? activeCustomer?.id ?? null : null
  const selectedCustomerName =
    customerScope === 'current' ? activeCustomer?.name ?? null : null

  const canSelectCurrent = !!activeCustomer

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
          customer_id: selectedCustomerId,
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

      const data = (await res.json()) as { export?: ExportHistoryItem }
      if (!data.export) throw new Error('Server-Antwort ungültig')
      onCreated(data.export)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      setError(message)
      toast({
        title: 'Export fehlgeschlagen',
        description: message,
        variant: 'destructive',
      })
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
    selectedCustomerId,
    toast,
  ])

  const needsAcknowledgement = !!emptyDataWarning && !acknowledgedEmpty

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{exportType.name} exportieren</DialogTitle>
          <DialogDescription>
            Konfiguriere Format, Kunden-Kontext und Branding für diesen Export.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
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

          {/* Customer scope */}
          <div className="space-y-3">
            <Label>Kunden-Kontext</Label>
            <RadioGroup
              value={customerScope}
              onValueChange={(value) => setCustomerScope(value as 'current' | 'all')}
              disabled={submitting}
              className="gap-2"
            >
              <label
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors',
                  customerScope === 'current'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                    : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600',
                  !canSelectCurrent && 'cursor-not-allowed opacity-60'
                )}
              >
                <RadioGroupItem
                  value="current"
                  id="scope-current"
                  disabled={!canSelectCurrent || submitting}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Aktueller Kunde
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {activeCustomer
                      ? activeCustomer.name
                      : 'Kein Kunde ausgewählt — wähle oben einen Kunden im Selektor.'}
                  </p>
                </div>
              </label>

              <label
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors',
                  customerScope === 'all'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                    : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                )}
              >
                <RadioGroupItem value="all" id="scope-all" disabled={submitting} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Alle Kunden
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Export umfasst {customerCount > 0 ? `${customerCount} Kunden` : 'alle Kunden'} dieses Tenants.
                  </p>
                </div>
              </label>
            </RadioGroup>
          </div>

          <Separator />

          {/* Branding */}
          <div className="space-y-3">
            <Label>Branding</Label>
            <RadioGroup
              value={brandingSource}
              onValueChange={(value) => setBrandingSource(value as BrandingSource)}
              disabled={submitting}
              className="gap-2"
            >
              <label
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors',
                  brandingSource === 'tenant'
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

              <label
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors',
                  brandingSource === 'customer'
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
                    {selectedCustomerName
                      ? `Logo des Kunden „${selectedCustomerName}" wird verwendet.`
                      : 'Wähle einen Kunden-Kontext, damit das Kunden-Logo verwendet werden kann.'}
                  </p>
                </div>
              </label>
            </RadioGroup>

            {customerLogoMissing ? (
              <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Kein Kunden-Logo verfügbar</AlertTitle>
                <AlertDescription>
                  Da kein Kunde ausgewählt ist, fällt das Branding auf das Tenant-Logo zurück.
                </AlertDescription>
              </Alert>
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
                    disabled={submitting}
                    aria-label="Akzentfarbe wählen"
                    className="h-9 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900"
                  />
                  <Input
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    disabled={submitting}
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

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Abbrechen
          </Button>
          <Button
            variant="dark"
            onClick={() => void handleSubmit()}
            disabled={submitting || needsAcknowledgement}
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
        body: JSON.stringify({ email: email.trim(), message: message.trim() || null }),
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
