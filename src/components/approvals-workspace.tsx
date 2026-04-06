'use client'

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CheckSquare,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Filter,
  MessageSquare,
  Type,
  X,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ApprovalStatusBadge, type ApprovalStatus } from '@/components/approval-status-badge'
import { useActiveCustomer } from '@/lib/active-customer-context'
import { useToast } from '@/hooks/use-toast'

interface ApprovalItem {
  id: string
  content_type: 'content_brief' | 'ad_generation'
  content_id: string
  public_token: string
  status: ApprovalStatus
  feedback: string | null
  customer_name: string | null
  content_title: string
  created_by_name: string
  created_at: string
  decided_at: string | null
  history: Array<{
    id: string
    event_type: 'submitted' | 'resubmitted' | 'approved' | 'changes_requested' | 'content_updated'
    status_after: ApprovalStatus
    feedback: string | null
    actor_label: string | null
    created_at: string
  }>
}

function historyLabel(type: ApprovalItem['history'][number]['event_type']) {
  switch (type) {
    case 'submitted':
      return 'Angefragt'
    case 'resubmitted':
      return 'Erneut angefragt'
    case 'approved':
      return 'Freigegeben'
    case 'changes_requested':
      return 'Korrektur angefragt'
    case 'content_updated':
      return 'Überarbeitet'
    default:
      return type
  }
}

function contentTypeLabel(type: string): string {
  switch (type) {
    case 'content_brief':
      return 'Content Brief'
    case 'ad_generation':
      return 'Ad-Text'
    default:
      return type
  }
}

function contentTypeIcon(type: string) {
  switch (type) {
    case 'content_brief':
      return <FileText className="h-4 w-4 text-blue-500 dark:text-blue-400" />
    case 'ad_generation':
      return <Type className="h-4 w-4 text-purple-500 dark:text-purple-400" />
    default:
      return <FileText className="h-4 w-4 text-slate-400" />
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

interface SummaryCardProps {
  label: string
  count: number
  icon: React.ReactNode
  colorClass: string
  onClick: () => void
  active: boolean
}

function SummaryCard({ label, count, icon, colorClass, onClick, active }: SummaryCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center gap-4 rounded-2xl border p-4 text-left transition-all hover:shadow-md ${
        active
          ? 'border-blue-200 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-950/30'
          : 'border-slate-100 bg-white hover:border-slate-200 dark:border-[#252d3a] dark:bg-[#151c28] dark:hover:border-[#2d3847]'
      }`}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${colorClass}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">{count}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </button>
  )
}

export function ApprovalsWorkspace() {
  const router = useRouter()
  const { toast } = useToast()
  const { activeCustomer, customers } = useActiveCustomer()
  const [approvals, setApprovals] = useState<ApprovalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | ApprovalStatus>('open')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [customerFilter, setCustomerFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    if (activeCustomer) {
      setCustomerFilter(activeCustomer.id)
    }
  }, [activeCustomer])

  const fetchApprovals = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all' && statusFilter !== 'open') params.set('status', statusFilter)
      if (typeFilter !== 'all') params.set('content_type', typeFilter)
      const effectiveCustomerId = activeCustomer?.id ?? (customerFilter !== 'all' ? customerFilter : null)
      if (effectiveCustomerId) params.set('customer_id', effectiveCustomerId)
      const url = `/api/tenant/approvals${params.toString() ? `?${params}` : ''}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Freigaben konnten nicht geladen werden.')
      const data = await res.json()
      setApprovals(data.approvals ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [activeCustomer?.id, customerFilter, statusFilter, typeFilter])

  useEffect(() => {
    fetchApprovals()
  }, [fetchApprovals])

  // Summary stats computed from loaded data (before local search filter)
  const summaryStats = useMemo(() => {
    const pending = approvals.filter((a) => a.status === 'pending_approval').length
    const approved = approvals.filter((a) => a.status === 'approved').length
    const changes = approvals.filter((a) => a.status === 'changes_requested').length

    return {
      open: pending + changes,
      pending,
      approved,
      changes,
    }
  }, [approvals])

  // Client-side search filter on top of server-side filters
  const filteredApprovals = useMemo(() => {
    const base =
      statusFilter === 'open'
        ? approvals.filter(
            (approval) =>
              approval.status === 'pending_approval' || approval.status === 'changes_requested'
          )
        : approvals

    if (!searchQuery.trim()) return base
    const q = searchQuery.toLowerCase()
    return base.filter(
      (a) =>
        a.content_title.toLowerCase().includes(q) ||
        (a.customer_name?.toLowerCase().includes(q) ?? false)
    )
  }, [approvals, searchQuery, statusFilter])

  const hasActiveFilters =
    statusFilter !== 'open' ||
    typeFilter !== 'all' ||
    (!activeCustomer && customerFilter !== 'all') ||
    searchQuery.trim() !== ''

  const handleResetFilters = () => {
    setStatusFilter('open')
    setTypeFilter('all')
    if (!activeCustomer) setCustomerFilter('all')
    setSearchQuery('')
  }

  const handleRowClick = (item: ApprovalItem) => {
    if (item.content_type === 'content_brief') {
      router.push(`/tools/content-briefs?briefId=${item.content_id}`)
    } else if (item.content_type === 'ad_generation') {
      router.push(`/tools/ad-generator?id=${item.content_id}`)
    }
  }

  const handleCopyLink = async (event: MouseEvent<HTMLButtonElement>, item: ApprovalItem) => {
    event.stopPropagation()
    const approvalLink = `${window.location.origin}/approval/${item.public_token}`
    try {
      await navigator.clipboard.writeText(approvalLink)
      setCopiedId(item.id)
      toast({ title: 'Kopiert', description: 'Freigabe-Link wurde kopiert.' })
      window.setTimeout(() => setCopiedId((current) => (current === item.id ? null : current)), 2000)
    } catch {
      toast({
        title: 'Fehler',
        description: 'Freigabe-Link konnte nicht kopiert werden.',
        variant: 'destructive',
      })
    }
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Freigabe-Übersicht</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Offene Freigaben, Kundenentscheidungen und abgeschlossene Abnahmen in einem Workflow.
            </p>
            {activeCustomer && (
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                Gefiltert nach Kunde: {activeCustomer.name}
              </p>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        {!loading && !error && (
          <div className="flex flex-col gap-3 sm:flex-row">
            <SummaryCard
              label="Offen"
              count={summaryStats.open}
              icon={<CheckSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
              colorClass="bg-blue-50 dark:bg-blue-950/40"
              active={statusFilter === 'open'}
              onClick={() => setStatusFilter(statusFilter === 'open' ? 'all' : 'open')}
            />
            <SummaryCard
              label="Warte auf Freigabe"
              count={summaryStats.pending}
              icon={<Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
              colorClass="bg-amber-50 dark:bg-amber-950/40"
              active={statusFilter === 'pending_approval'}
              onClick={() => setStatusFilter(statusFilter === 'pending_approval' ? 'all' : 'pending_approval')}
            />
            <SummaryCard
              label="Freigegeben"
              count={summaryStats.approved}
              icon={<CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
              colorClass="bg-emerald-50 dark:bg-emerald-950/40"
              active={statusFilter === 'approved'}
              onClick={() => setStatusFilter(statusFilter === 'approved' ? 'all' : 'approved')}
            />
            <SummaryCard
              label="Korrektur angefragt"
              count={summaryStats.changes}
              icon={<MessageSquare className="h-5 w-5 text-orange-600 dark:text-orange-400" />}
              colorClass="bg-orange-50 dark:bg-orange-950/40"
              active={statusFilter === 'changes_requested'}
              onClick={() => setStatusFilter(statusFilter === 'changes_requested' ? 'all' : 'changes_requested')}
            />
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as 'all' | 'open' | ApprovalStatus)}
            >
              <SelectTrigger className="w-[180px] rounded-xl">
                <SelectValue placeholder="Status filtern" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Offen</SelectItem>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="pending_approval">Warte auf Freigabe</SelectItem>
                <SelectItem value="approved">Freigegeben</SelectItem>
                <SelectItem value="changes_requested">Korrektur angefragt</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px] rounded-xl">
              <SelectValue placeholder="Typ filtern" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Typen</SelectItem>
              <SelectItem value="content_brief">Content Brief</SelectItem>
              <SelectItem value="ad_generation">Ad-Text</SelectItem>
            </SelectContent>
          </Select>
          {!activeCustomer && (
            <Select value={customerFilter} onValueChange={setCustomerFilter}>
              <SelectTrigger className="w-[220px] rounded-xl">
                <SelectValue placeholder="Kunde filtern" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Kunden</SelectItem>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input
            placeholder="Titel oder Kunde suchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-[220px] rounded-xl"
          />
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetFilters}
              className="gap-1.5 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              <X className="h-3.5 w-3.5" />
              Zurücksetzen
            </Button>
          )}
        </div>

        {/* Error */}
        {error && (
          <Alert variant="destructive" className="rounded-2xl">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Fehler</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Loading */}
        {loading && (
          <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
            <CardContent className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-5 w-24" />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Empty */}
        {!loading && !error && filteredApprovals.length === 0 && (
          <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
            <CardContent className="flex flex-col items-center gap-5 px-6 py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/50">
                <CheckSquare className="h-7 w-7 text-blue-500 dark:text-blue-400" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Keine Freigaben</h2>
                <p className="max-w-md text-sm leading-7 text-slate-500 dark:text-slate-400">
                  {hasActiveFilters
                    ? 'Keine Einträge für die aktuellen Filter. Filter zurücksetzen?'
                    : 'Es gibt aktuell keine offenen Freigaben. Reiche einen Content Brief oder Ad-Text zur Freigabe ein, um hier Wartezustand, Korrekturen und Freigaben zu verfolgen.'}
                </p>
                {hasActiveFilters && (
                  <Button variant="outline" size="sm" onClick={handleResetFilters} className="mt-2 rounded-xl">
                    Filter zurücksetzen
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Table */}
        {!loading && !error && filteredApprovals.length > 0 && (
          <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-100 dark:border-[#252d3a]">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Typ</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Titel</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Kunde</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Status</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Datum</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Link</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredApprovals.map((item) => {
                  const iterationCount = item.history.length
                  const isPending = item.status === 'pending_approval'
                  const displayDate = !isPending && item.decided_at ? item.decided_at : item.created_at
                  const dateLabel = !isPending && item.decided_at ? 'Entschieden' : 'Erstellt'

                  return (
                    <TableRow
                      key={item.id}
                      className="cursor-pointer border-slate-100 transition-colors hover:bg-slate-50 dark:border-[#252d3a] dark:hover:bg-[#1e2635]/40"
                      onClick={() => handleRowClick(item)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {contentTypeIcon(item.content_type)}
                          <span className="text-sm text-slate-700 dark:text-slate-300">{contentTypeLabel(item.content_type)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate max-w-[220px] block">
                            {item.content_title}
                          </span>
                          {iterationCount > 0 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="shrink-0 inline-flex items-center justify-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400 cursor-default">
                                  {iterationCount}×
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-[220px] space-y-1 p-3">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Verlauf</p>
                                {item.history.map((entry) => (
                                  <p key={entry.id} className="text-xs text-slate-700 dark:text-slate-200">
                                    {historyLabel(entry.event_type)}
                                  </p>
                                ))}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          {item.customer_name || '--'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <ApprovalStatusBadge status={item.status} />
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <span className="text-sm text-slate-500 dark:text-slate-400">{formatDate(displayDate)}</span>
                          <p className="text-[10px] text-slate-400 dark:text-slate-600">{dateLabel}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {isPending ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2 rounded-full"
                            onClick={(event) => handleCopyLink(event, item)}
                          >
                            {copiedId === item.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            {copiedId === item.id ? 'Kopiert' : 'Link kopieren'}
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <ExternalLink className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </TooltipProvider>
  )
}
