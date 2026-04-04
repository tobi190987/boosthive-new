'use client'

import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  Check,
  CheckSquare,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Filter,
  Loader2,
  MessageSquare,
  Type,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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

export function ApprovalsWorkspace() {
  const router = useRouter()
  const { toast } = useToast()
  const { activeCustomer } = useActiveCustomer()
  const [approvals, setApprovals] = useState<ApprovalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const fetchApprovals = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (typeFilter !== 'all') params.set('content_type', typeFilter)
      if (activeCustomer?.id) params.set('customer_id', activeCustomer.id)
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
  }, [activeCustomer?.id, statusFilter, typeFilter])

  useEffect(() => {
    fetchApprovals()
  }, [fetchApprovals])

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

  const filteredApprovals = approvals

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Freigabe-Übersicht</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Alle laufenden und abgeschlossenen Freigabe-Anfragen
          </p>
          {activeCustomer && (
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Gefiltert nach Kunde: {activeCustomer.name}
            </p>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] rounded-xl">
              <SelectValue placeholder="Status filtern" />
            </SelectTrigger>
            <SelectContent>
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
                Es gibt aktuell keine Freigabe-Anfragen. Reiche einen Content Brief oder Ad-Text zur Freigabe ein, um hier den Status zu verfolgen.
              </p>
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
              {filteredApprovals.map((item) => (
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
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate max-w-[200px] block">
                      {item.content_title}
                    </span>
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
                    <span className="text-sm text-slate-500 dark:text-slate-400">{formatDate(item.created_at)}</span>
                  </TableCell>
                  <TableCell>
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
                  </TableCell>
                  <TableCell>
                    <ExternalLink className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
