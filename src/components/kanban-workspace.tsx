'use client'

import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2,
  FileImage,
  FileText,
  GripVertical,
  Loader2,
  Megaphone,
  Plus,
  Search,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useActiveCustomer } from '@/lib/active-customer-context'
import { KANBAN_WORKFLOW_STATUSES, kanbanStatusLabel, type KanbanWorkflowStatus } from '@/lib/kanban-shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { FilterChips } from '@/components/filter-chips'
import { cn } from '@/lib/utils'

type ApprovalStatus = 'draft' | 'pending_approval' | 'approved' | 'changes_requested'
type ContentType = 'content_brief' | 'ad_generation' | 'ad_library_asset'

interface KanbanItem {
  id: string
  content_type: ContentType
  title: string
  customer_id: string | null
  customer_name: string | null
  workflow_status: KanbanWorkflowStatus
  approval_status: ApprovalStatus
  source_status: string
  href: string
  created_at: string
  updated_at: string
}

const COLUMN_ORDER: KanbanWorkflowStatus[] = [...KANBAN_WORKFLOW_STATUSES]

function contentTypeLabel(contentType: ContentType) {
  switch (contentType) {
    case 'content_brief':
      return 'Content Brief'
    case 'ad_generation':
      return 'Ad-Text'
    case 'ad_library_asset':
      return 'Creative'
    default:
      return contentType
  }
}

function contentTypeIcon(contentType: ContentType) {
  switch (contentType) {
    case 'content_brief':
      return <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
    case 'ad_generation':
      return <Megaphone className="h-4 w-4 text-orange-600 dark:text-orange-400" />
    case 'ad_library_asset':
      return <FileImage className="h-4 w-4 text-blue-600 dark:text-blue-400" />
    default:
      return <FileText className="h-4 w-4 text-slate-500" />
  }
}

function approvalBadge(status: ApprovalStatus) {
  switch (status) {
    case 'pending_approval':
      return (
        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          Freigabe offen
        </Badge>
      )
    case 'approved':
      return (
        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          Freigegeben
        </Badge>
      )
    case 'changes_requested':
      return (
        <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          Korrekturwunsch
        </Badge>
      )
    default:
      return null
  }
}

function sourceStatusLabel(item: KanbanItem) {
  switch (item.content_type) {
    case 'content_brief':
      return item.source_status === 'done'
        ? 'Brief fertig'
        : item.source_status === 'failed'
          ? 'Brief fehlgeschlagen'
          : item.source_status === 'generating'
            ? 'Brief wird erstellt'
            : 'Brief wartend'
    case 'ad_generation':
      return item.source_status === 'completed'
        ? 'Generierung fertig'
        : item.source_status === 'failed'
          ? 'Generierung fehlgeschlagen'
          : 'Generierung läuft'
    default:
      return 'In Bibliothek'
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function KanbanWorkspace() {
  const router = useRouter()
  const { toast } = useToast()
  const { activeCustomer, customers } = useActiveCustomer()
  const [items, setItems] = useState<KanbanItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | ContentType>('all')
  const [customerFilter, setCustomerFilter] = useState<string>('all')
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [dropStatus, setDropStatus] = useState<KanbanWorkflowStatus | null>(null)
  const [movingItemId, setMovingItemId] = useState<string | null>(null)

  useEffect(() => {
    if (activeCustomer?.id) {
      setCustomerFilter(activeCustomer.id)
    }
  }, [activeCustomer?.id])

  const fetchItems = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/tenant/kanban')
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Board konnte nicht geladen werden.')
      }
      const payload = (await res.json()) as { items?: KanbanItem[] }
      setItems(payload.items ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Board konnte nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchItems()
  }, [fetchItems])

  const filteredItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    return items.filter((item) => {
      if (typeFilter !== 'all' && item.content_type !== typeFilter) return false
      if (customerFilter !== 'all' && item.customer_id !== customerFilter) return false
      if (!normalizedQuery) return true

      return (
        item.title.toLowerCase().includes(normalizedQuery) ||
        (item.customer_name?.toLowerCase().includes(normalizedQuery) ?? false)
      )
    })
  }, [customerFilter, items, searchQuery, typeFilter])

  const itemsByStatus = useMemo(() => {
    return COLUMN_ORDER.reduce<Record<KanbanWorkflowStatus, KanbanItem[]>>((acc, status) => {
      acc[status] = filteredItems.filter((item) => item.workflow_status === status)
      return acc
    }, {
      none: [],
      in_progress: [],
      client_review: [],
      done: [],
    })
  }, [filteredItems])

  const moveItem = useCallback(async (item: KanbanItem, nextStatus: KanbanWorkflowStatus) => {
    if (item.workflow_status === nextStatus) return

    const previousItems = items
    setMovingItemId(item.id)
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id && entry.content_type === item.content_type
          ? { ...entry, workflow_status: nextStatus }
          : entry
      )
    )

    try {
      const res = await fetch('/api/tenant/kanban', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content_type: item.content_type,
          content_id: item.id,
          workflow_status: nextStatus,
        }),
      })

      const payload = (await res.json().catch(() => ({}))) as { error?: string; item?: KanbanItem }
      if (!res.ok || !payload.item) {
        throw new Error(payload.error ?? 'Status konnte nicht aktualisiert werden.')
      }

      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id && entry.content_type === item.content_type ? payload.item! : entry
        )
      )

      toast({
        title: 'Status aktualisiert',
        description:
          nextStatus === 'client_review'
            ? 'Die Freigabe wurde beim Kunden angefragt.'
            : `"${item.title}" liegt jetzt in "${kanbanStatusLabel(nextStatus)}".`,
      })
    } catch (err) {
      setItems(previousItems)
      toast({
        title: 'Statuswechsel fehlgeschlagen',
        description: err instanceof Error ? err.message : 'Bitte versuche es erneut.',
        variant: 'destructive',
      })
    } finally {
      setMovingItemId(null)
      setDraggedItemId(null)
      setDropStatus(null)
    }
  }, [items, toast])

  function handleDragStart(event: DragEvent<HTMLButtonElement>, item: KanbanItem) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', item.id)
    setDraggedItemId(item.id)
  }

  function handleDrop(status: KanbanWorkflowStatus) {
    const item = items.find((entry) => entry.id === draggedItemId)
    if (!item) return
    void moveItem(item, status)
  }

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 bg-white dark:border-border dark:bg-card">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Neuen Content direkt aus dem Board starten
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Springe direkt in die Erstellung von Briefs, Ad-Texten oder neuen Creatives.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-full" onClick={() => router.push('/tools/content-briefs?action=create')}>
              <Plus className="mr-2 h-4 w-4" />
              Content Brief
            </Button>
            <Button variant="outline" className="rounded-full" onClick={() => router.push('/tools/ad-generator')}>
              <Plus className="mr-2 h-4 w-4" />
              Ad Generation
            </Button>
            <Button variant="outline" className="rounded-full" onClick={() => router.push('/tools/ads-library?action=upload')}>
              <Plus className="mr-2 h-4 w-4" />
              Creative hochladen
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px_240px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Suche nach Titel oder Kunde..."
            className="pl-9"
          />
        </div>

        <FilterChips
          chips={[
            { id: 'content_brief', label: 'Content Briefs' },
            { id: 'ad_generation', label: 'Ad-Texte' },
            { id: 'ad_library_asset', label: 'Creatives' },
          ]}
          activeIds={typeFilter === 'all' ? [] : [typeFilter]}
          onToggle={(id) => setTypeFilter((prev) => (prev === id ? 'all' : id as ContentType))}
          onClear={() => setTypeFilter('all')}
          className="items-center"
        />

        <Select value={customerFilter} onValueChange={setCustomerFilter}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Kunde" />
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
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Board konnte nicht geladen werden</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-4">
          {COLUMN_ORDER.map((status) => (
            <Card key={status} className="border-slate-200/80 bg-white/80 dark:border-border dark:bg-card/80">
              <CardHeader className="pb-4">
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="pb-2">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {COLUMN_ORDER.map((status) => {
              const columnItems = itemsByStatus[status]

              return (
                <Card
                  key={status}
                  className={cn(
                    'border-slate-200 bg-gradient-to-b from-white to-slate-50 dark:border-border dark:from-card dark:to-card/80',
                    dropStatus === status && 'ring-2 ring-blue-300 dark:ring-blue-800'
                  )}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setDropStatus(status)
                  }}
                  onDragLeave={() => setDropStatus((current) => (current === status ? null : current))}
                  onDrop={(event) => {
                    event.preventDefault()
                    handleDrop(status)
                  }}
                >
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {kanbanStatusLabel(status)}
                      </CardTitle>
                      <Badge variant="secondary" className="rounded-full">
                        {columnItems.length}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {columnItems.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500 dark:border-border dark:bg-background/40 dark:text-slate-400">
                        Keine Elemente in dieser Spalte.
                      </div>
                    ) : null}

                    {columnItems.map((item) => {
                      const isBusy = movingItemId === item.id
                      const approvalStateBadge = approvalBadge(item.approval_status)

                      return (
                        <button
                          key={`${item.content_type}:${item.id}`}
                          type="button"
                          draggable={!isBusy}
                          onDragStart={(event) => handleDragStart(event, item)}
                          onDragEnd={() => {
                            setDraggedItemId(null)
                            setDropStatus(null)
                          }}
                          onClick={() => router.push(item.href)}
                          className={cn(
                            'w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md dark:border-border dark:bg-card dark:hover:border-slate-600',
                            draggedItemId === item.id && 'opacity-50',
                            isBusy && 'cursor-wait opacity-70'
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-900/60">
                                {contentTypeIcon(item.content_type)}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                                  {contentTypeLabel(item.content_type)}
                                  {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                                </div>
                              </div>
                            </div>
                            <GripVertical className="h-4 w-4 shrink-0 text-slate-400" />
                          </div>

                          <div className="mt-3 space-y-3">
                            <div>
                              <p className="line-clamp-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {item.title}
                              </p>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {item.customer_name ?? 'Ohne Kunde'}
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Badge variant="secondary" className="rounded-full">
                                {sourceStatusLabel(item)}
                              </Badge>
                              {approvalStateBadge}
                              {item.workflow_status === 'done' && item.approval_status === 'approved' ? (
                                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                                  <CheckCircle2 className="mr-1 h-3 w-3" />
                                  Kunde hat freigegeben
                                </Badge>
                              ) : null}
                            </div>

                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Aktualisiert am {formatDate(item.updated_at)}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
