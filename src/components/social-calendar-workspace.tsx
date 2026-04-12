'use client'

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useActiveCustomer, type Customer } from '@/lib/active-customer-context'
import {
  buildMonthGrid,
  buildWeekDays,
  formatMonthTitle,
  formatTime,
  formatWeekRange,
  fromDateTimeLocalValue,
  isSameDay,
  isSameMonth,
  isOverdue,
  toDateTimeLocalValue,
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_META,
  SOCIAL_STATUSES,
  SOCIAL_STATUS_META,
  type CalendarViewMode,
  type SocialMediaPost,
  type SocialPlatformId,
  type SocialPostStatus,
} from '@/lib/social-calendar'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FilterChips } from '@/components/filter-chips'

// ─── Types ───────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string
  firstName: string | null
  lastName: string | null
  email: string
}

type PostFormData = {
  title: string
  caption: string
  platforms: SocialPlatformId[]
  customerId: string
  scheduledAt: string
  status: SocialPostStatus
  assigneeId: string
  notes: string
}

const EMPTY_FORM: PostFormData = {
  title: '',
  caption: '',
  platforms: [],
  customerId: 'none',
  scheduledAt: '',
  status: 'draft',
  assigneeId: 'none',
  notes: '',
}

// ─── Helper: URL key for date ────────────────────────────────────────────────

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── Workspace ───────────────────────────────────────────────────────────────

export function SocialCalendarWorkspace() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { activeCustomer, customers, loading: customersLoading } = useActiveCustomer()

  // ─── State ─────────────────────────────────────────────────────────────────

  const [viewMode, setViewMode] = useState<CalendarViewMode>(
    (searchParams.get('view') as CalendarViewMode) || 'month'
  )
  const [referenceDate, setReferenceDate] = useState<Date>(() => {
    const dateParam = searchParams.get('date')
    if (dateParam) {
      const parsed = new Date(dateParam)
      if (!Number.isNaN(parsed.getTime())) return parsed
    }
    return new Date()
  })

  const [posts, setPosts] = useState<SocialMediaPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filter state from URL
  const [platformFilter, setPlatformFilter] = useState<SocialPlatformId[]>(() => {
    const p = searchParams.get('platform')
    return p ? (p.split(',') as SocialPlatformId[]) : []
  })
  const [statusFilter, setStatusFilter] = useState<SocialPostStatus[]>(() => {
    const s = searchParams.get('status')
    return s ? (s.split(',') as SocialPostStatus[]) : []
  })
  const [customerFilter, setCustomerFilter] = useState<string | null>(() => {
    return searchParams.get('customer') ?? null
  })

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingPost, setEditingPost] = useState<SocialMediaPost | null>(null)
  const [form, setForm] = useState<PostFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Team members
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const teamMembersFetched = useRef(false)

  // ─── URL Sync ──────────────────────────────────────────────────────────────

  const updateUrl = useCallback(
    (params: Record<string, string | null>) => {
      const sp = new URLSearchParams(searchParams.toString())
      for (const [key, val] of Object.entries(params)) {
        if (val === null || val === '') {
          sp.delete(key)
        } else {
          sp.set(key, val)
        }
      }
      const qs = sp.toString()
      startTransition(() => {
        router.replace(`/tools/social-calendar${qs ? `?${qs}` : ''}`, { scroll: false })
      })
    },
    [router, searchParams]
  )

  // ─── Fetch posts ───────────────────────────────────────────────────────────

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const sp = new URLSearchParams()

      // Calculate date range based on view
      if (viewMode === 'month') {
        const grid = buildMonthGrid(referenceDate)
        sp.set('start', grid[0].toISOString())
        sp.set('end', grid[grid.length - 1].toISOString())
      } else {
        const days = buildWeekDays(referenceDate)
        sp.set('start', days[0].toISOString())
        const endOfWeek = new Date(days[6])
        endOfWeek.setHours(23, 59, 59, 999)
        sp.set('end', endOfWeek.toISOString())
      }

      // customerFilter (FilterBar) takes precedence over global activeCustomer
      const effectiveCustomerId = customerFilter ?? activeCustomer?.id ?? null
      if (effectiveCustomerId) {
        sp.set('customer_id', effectiveCustomerId)
      }
      if (platformFilter.length > 0) {
        sp.set('platform', platformFilter.join(','))
      }
      if (statusFilter.length > 0) {
        sp.set('status', statusFilter.join(','))
      }

      const res = await fetch(`/api/tenant/social-calendar?${sp.toString()}`)
      if (!res.ok) {
        throw new Error('Posts konnten nicht geladen werden.')
      }
      const data = await res.json()
      setPosts(data.posts ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [viewMode, referenceDate, activeCustomer, customerFilter, platformFilter, statusFilter])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  // ─── Fetch team members ────────────────────────────────────────────────────

  useEffect(() => {
    if (teamMembersFetched.current) return
    teamMembersFetched.current = true
    async function load() {
      try {
        const res = await fetch('/api/tenant/members')
        if (!res.ok) return
        const data = await res.json()
        setTeamMembers(
          (data.members ?? []).map((m: Record<string, unknown>) => ({
            id: m.user_id ?? m.id,
            firstName: m.first_name ?? null,
            lastName: m.last_name ?? null,
            email: m.email ?? '',
          }))
        )
      } catch {
        // Ignore
      }
    }
    load()
  }, [])

  // ─── Open create sheet from URL ────────────────────────────────────────────

  useEffect(() => {
    if (searchParams.get('action') === 'create' && !sheetOpen) {
      openCreateSheet()
      // Remove the action param
      updateUrl({ action: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // ─── Navigation ────────────────────────────────────────────────────────────

  const navigatePrev = useCallback(() => {
    const newDate = new Date(referenceDate)
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() - 1)
    } else {
      newDate.setDate(newDate.getDate() - 7)
    }
    setReferenceDate(newDate)
    updateUrl({ date: dateKey(newDate) })
  }, [referenceDate, viewMode, updateUrl])

  const navigateNext = useCallback(() => {
    const newDate = new Date(referenceDate)
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + 1)
    } else {
      newDate.setDate(newDate.getDate() + 7)
    }
    setReferenceDate(newDate)
    updateUrl({ date: dateKey(newDate) })
  }, [referenceDate, viewMode, updateUrl])

  const goToday = useCallback(() => {
    const today = new Date()
    setReferenceDate(today)
    updateUrl({ date: null })
  }, [updateUrl])

  const switchView = useCallback(
    (mode: CalendarViewMode) => {
      setViewMode(mode)
      updateUrl({ view: mode === 'month' ? null : mode })
    },
    [updateUrl]
  )

  // ─── Filters ───────────────────────────────────────────────────────────────

  const togglePlatformFilter = useCallback(
    (id: string) => {
      setPlatformFilter((prev) => {
        const next = prev.includes(id as SocialPlatformId)
          ? prev.filter((p) => p !== id)
          : [...prev, id as SocialPlatformId]
        updateUrl({ platform: next.length > 0 ? next.join(',') : null })
        return next
      })
    },
    [updateUrl]
  )

  const toggleStatusFilter = useCallback(
    (id: string) => {
      setStatusFilter((prev) => {
        const next = prev.includes(id as SocialPostStatus)
          ? prev.filter((s) => s !== id)
          : [...prev, id as SocialPostStatus]
        updateUrl({ status: next.length > 0 ? next.join(',') : null })
        return next
      })
    },
    [updateUrl]
  )

  const setCustomerFilterValue = useCallback(
    (id: string | null) => {
      setCustomerFilter(id)
      updateUrl({ customer: id })
    },
    [updateUrl]
  )

  const clearAllFilters = useCallback(() => {
    setPlatformFilter([])
    setStatusFilter([])
    setCustomerFilter(null)
    updateUrl({ platform: null, status: null, customer: null })
  }, [updateUrl])

  const hasActiveFilters = platformFilter.length > 0 || statusFilter.length > 0 || customerFilter !== null

  // ─── Computed grids ────────────────────────────────────────────────────────

  const monthGrid = useMemo(() => buildMonthGrid(referenceDate), [referenceDate])
  const weekDays = useMemo(() => buildWeekDays(referenceDate), [referenceDate])
  const today = useMemo(() => new Date(), [])

  const postsByDate = useMemo(() => {
    const map = new Map<string, SocialMediaPost[]>()
    for (const post of posts) {
      const d = new Date(post.scheduledAt)
      const key = dateKey(d)
      const existing = map.get(key) ?? []
      existing.push(post)
      map.set(key, existing)
    }
    return map
  }, [posts])

  // ─── Sheet logic ───────────────────────────────────────────────────────────

  function openCreateSheet(presetDate?: Date) {
    setEditingPost(null)
    const now = presetDate ?? new Date()
    // Default to 10:00 if creating for a specific date
    if (presetDate) {
      now.setHours(10, 0, 0, 0)
    }
    setForm({
      ...EMPTY_FORM,
      scheduledAt: toDateTimeLocalValue(now),
      customerId: activeCustomer?.id ?? 'none',
    })
    setSheetOpen(true)
  }

  function openEditSheet(post: SocialMediaPost) {
    setEditingPost(post)
    setForm({
      title: post.title,
      caption: post.caption ?? '',
      platforms: [...post.platforms],
      customerId: post.customerId ?? 'none',
      scheduledAt: toDateTimeLocalValue(new Date(post.scheduledAt)),
      status: post.status,
      assigneeId: post.assigneeId ?? 'none',
      notes: post.notes ?? '',
    })
    setSheetOpen(true)
  }

  function closeSheet() {
    setSheetOpen(false)
    setEditingPost(null)
    setForm(EMPTY_FORM)
  }

  // ─── Platform multi-select ─────────────────────────────────────────────────

  function togglePlatform(platform: SocialPlatformId) {
    setForm((prev) => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter((p) => p !== platform)
        : [...prev.platforms, platform],
    }))
  }

  // ─── Save post ─────────────────────────────────────────────────────────────

  async function savePost() {
    if (!form.title.trim()) {
      toast({ title: 'Titel ist erforderlich', variant: 'destructive' })
      return
    }
    if (form.platforms.length === 0) {
      toast({ title: 'Mindestens eine Plattform auswaehlen', variant: 'destructive' })
      return
    }
    const scheduledIso = fromDateTimeLocalValue(form.scheduledAt)
    if (!scheduledIso) {
      toast({ title: 'Geplantes Datum ist erforderlich', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      const body = {
        title: form.title.trim(),
        caption: form.caption.trim() || null,
        platforms: form.platforms,
        customer_id: form.customerId === 'none' ? null : form.customerId,
        scheduled_at: scheduledIso,
        status: form.status,
        assignee_id: form.assigneeId === 'none' ? null : form.assigneeId,
        notes: form.notes.trim() || null,
      }

      const isEdit = !!editingPost
      const url = isEdit
        ? `/api/tenant/social-calendar/${editingPost.id}`
        : '/api/tenant/social-calendar'
      const method = isEdit ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Speichern fehlgeschlagen')
      }

      toast({
        title: isEdit ? 'Post aktualisiert' : 'Post erstellt',
      })
      closeSheet()
      fetchPosts()
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : 'Fehler beim Speichern',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  // ─── Delete post ───────────────────────────────────────────────────────────

  async function deletePost() {
    if (!editingPost) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/tenant/social-calendar/${editingPost.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        throw new Error('Loeschen fehlgeschlagen')
      }
      toast({ title: 'Post geloescht' })
      closeSheet()
      fetchPosts()
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : 'Fehler beim Loeschen',
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
    }
  }

  // ─── Member name helper ────────────────────────────────────────────────────

  function memberName(m: TeamMember) {
    if (m.firstName || m.lastName) {
      return `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim()
    }
    return m.email
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const platformChips = SOCIAL_PLATFORMS.map((p) => ({
    id: p,
    label: SOCIAL_PLATFORM_META[p].label,
  }))

  const statusChips = SOCIAL_STATUSES.map((s) => ({
    id: s,
    label: SOCIAL_STATUS_META[s].label,
  }))

  const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

  return (
    <div className="space-y-4">
      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToday}>
            Heute
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={navigatePrev} aria-label="Zurueck">
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zurueck</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={navigateNext} aria-label="Weiter">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Weiter</TooltipContent>
          </Tooltip>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            {viewMode === 'month'
              ? formatMonthTitle(referenceDate)
              : formatWeekRange(weekDays)}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Tabs
            value={viewMode}
            onValueChange={(v) => switchView(v as CalendarViewMode)}
          >
            <TabsList className="h-9">
              <TabsTrigger value="month" className="text-xs">
                Monat
              </TabsTrigger>
              <TabsTrigger value="week" className="text-xs">
                Woche
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="dark"
            size="sm"
            className="gap-1.5 sm:hidden"
            onClick={() => openCreateSheet()}
          >
            <Plus className="h-4 w-4" />
            Neuer Post
          </Button>
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Kundenfilter */}
        {customers.length > 0 && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Kunde:</span>
              <Select
                value={customerFilter ?? 'all'}
                onValueChange={(v) => setCustomerFilterValue(v === 'all' ? null : v)}
              >
                <SelectTrigger className="h-7 w-[160px] rounded-full text-xs">
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
            <Separator orientation="vertical" className="hidden h-5 sm:block" />
          </>
        )}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Plattform:</span>
          <FilterChips
            chips={platformChips}
            activeIds={platformFilter}
            onToggle={togglePlatformFilter}
            showClear={false}
          />
        </div>
        <Separator orientation="vertical" className="hidden h-5 sm:block" />
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Status:</span>
          <FilterChips
            chips={statusChips}
            activeIds={statusFilter}
            onToggle={toggleStatusFilter}
            showClear={false}
          />
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="h-7 gap-1.5 rounded-full px-2.5 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <X className="h-3 w-3" />
            Filter zurücksetzen
          </Button>
        )}
      </div>

      {/* ── Error state ────────────────────────────────────────────────────── */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Fehler</AlertTitle>
          <AlertDescription className="flex items-center gap-2">
            {error}
            <Button variant="outline" size="sm" onClick={fetchPosts}>
              Erneut versuchen
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* ── Loading state ──────────────────────────────────────────────────── */}
      {loading && !error && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      )}

      {/* ── Month View ─────────────────────────────────────────────────────── */}
      {!loading && !error && viewMode === 'month' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-border">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 dark:border-border dark:bg-card">
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="px-2 py-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                {label}
              </div>
            ))}
          </div>
          {/* Grid */}
          <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 dark:divide-border">
            {monthGrid.map((day, i) => {
              const key = dateKey(day)
              const dayPosts = postsByDate.get(key) ?? []
              const isCurrentMonth = isSameMonth(day, referenceDate)
              const isToday = isSameDay(day, today)
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => openCreateSheet(day)}
                  className={cn(
                    'group relative min-h-[6rem] cursor-pointer p-1.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-secondary/40 sm:min-h-[7rem] sm:p-2',
                    !isCurrentMonth && 'bg-slate-50/50 dark:bg-card/50'
                  )}
                  aria-label={`Post erstellen am ${day.toLocaleDateString('de-DE')}`}
                >
                  <span
                    className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                      isToday
                        ? 'bg-blue-600 text-white'
                        : isCurrentMonth
                          ? 'text-slate-700 dark:text-slate-300'
                          : 'text-slate-400 dark:text-slate-600'
                    )}
                  >
                    {day.getDate()}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayPosts.slice(0, 3).map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        compact
                        onClick={(e) => {
                          e.stopPropagation()
                          openEditSheet(post)
                        }}
                      />
                    ))}
                    {dayPosts.length > 3 && (
                      <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400">
                        +{dayPosts.length - 3} weitere
                      </span>
                    )}
                  </div>
                  {/* Hover add indicator */}
                  <span className="absolute right-1 top-1 hidden rounded-full bg-blue-600 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100 sm:block">
                    <Plus className="h-3 w-3" />
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Week View ──────────────────────────────────────────────────────── */}
      {!loading && !error && viewMode === 'week' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-border">
          <div className="divide-y divide-slate-100 dark:divide-border">
            {weekDays.map((day, i) => {
              const key = dateKey(day)
              const dayPosts = postsByDate.get(key) ?? []
              const isToday = isSameDay(day, today)
              return (
                <div
                  key={i}
                  className={cn(
                    'flex gap-4 p-3 sm:p-4',
                    isToday && 'bg-blue-50/40 dark:bg-blue-950/20'
                  )}
                >
                  <div className="flex w-16 shrink-0 flex-col items-center sm:w-20">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {WEEKDAY_LABELS[i]}
                    </span>
                    <span
                      className={cn(
                        'mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold',
                        isToday
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-700 dark:text-slate-300'
                      )}
                    >
                      {day.getDate()}
                    </span>
                    <span className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                      {day.toLocaleDateString('de-DE', { month: 'short' })}
                    </span>
                  </div>
                  <div className="min-h-[4rem] flex-1">
                    {dayPosts.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => openCreateSheet(day)}
                        className="flex h-full min-h-[4rem] w-full items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs text-slate-400 transition-colors hover:border-blue-300 hover:text-blue-500 dark:border-border dark:hover:border-blue-700 dark:hover:text-blue-400"
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Post hinzufuegen
                      </button>
                    ) : (
                      <div className="space-y-1.5">
                        {dayPosts.map((post) => (
                          <PostCard
                            key={post.id}
                            post={post}
                            compact={false}
                            onClick={() => openEditSheet(post)}
                          />
                        ))}
                        <button
                          type="button"
                          onClick={() => openCreateSheet(day)}
                          className="flex w-full items-center justify-center rounded-lg border border-dashed border-slate-200 py-1 text-xs text-slate-400 transition-colors hover:border-blue-300 hover:text-blue-500 dark:border-border dark:hover:border-blue-700 dark:hover:text-blue-400"
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          Hinzufuegen
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────────────── */}
      {!loading && !error && posts.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-16 dark:border-border">
          <Calendar className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Keine Posts in diesem Zeitraum
          </p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            {hasActiveFilters
              ? 'Versuche andere Filter oder erstelle einen neuen Post.'
              : 'Klicke auf einen Tag oder nutze "Neuer Post", um loszulegen.'}
          </p>
          <Button
            variant="dark"
            size="sm"
            className="mt-4 gap-1.5"
            onClick={() => openCreateSheet()}
          >
            <Plus className="h-4 w-4" />
            Ersten Post erstellen
          </Button>
        </div>
      )}

      {/* ── Post Sheet (Create / Edit) ─────────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={(open) => !open && closeSheet()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{editingPost ? 'Post bearbeiten' : 'Neuer Post'}</SheetTitle>
            <SheetDescription>
              {editingPost
                ? 'Bearbeite die Details dieses Social-Media-Posts.'
                : 'Erstelle einen neuen Social-Media-Post.'}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="post-title">Titel *</Label>
              <Input
                id="post-title"
                placeholder="z.B. Instagram Reel Q2 Kampagne"
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              />
            </div>

            {/* Platform multi-select */}
            <div className="space-y-2">
              <Label>Plattformen *</Label>
              <div className="flex flex-wrap gap-2">
                {SOCIAL_PLATFORMS.map((p) => {
                  const meta = SOCIAL_PLATFORM_META[p]
                  const selected = form.platforms.includes(p)
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePlatform(p)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                        selected
                          ? meta.badgeClass
                          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-border dark:bg-card dark:text-slate-400 dark:hover:border-slate-600'
                      )}
                    >
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full',
                          selected ? meta.dotClass : 'bg-slate-300 dark:bg-slate-600'
                        )}
                      />
                      {meta.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Customer */}
            <div className="space-y-2">
              <Label htmlFor="post-customer">Kunde</Label>
              <Select
                value={form.customerId}
                onValueChange={(v) => setForm((prev) => ({ ...prev, customerId: v }))}
              >
                <SelectTrigger id="post-customer">
                  <SelectValue placeholder="Kunde auswaehlen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ohne Kunde</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.domain ? ` (${c.domain})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Scheduled date/time */}
            <div className="space-y-2">
              <Label htmlFor="post-scheduled">Geplantes Datum / Uhrzeit *</Label>
              <Input
                id="post-scheduled"
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, scheduledAt: e.target.value }))
                }
              />
            </div>

            {/* Caption */}
            <div className="space-y-2">
              <Label htmlFor="post-caption">Caption / Text</Label>
              <Textarea
                id="post-caption"
                placeholder="Post-Inhalt eingeben..."
                rows={4}
                value={form.caption}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, caption: e.target.value }))
                }
              />
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label htmlFor="post-status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  setForm((prev) => ({ ...prev, status: v as SocialPostStatus }))
                }
              >
                <SelectTrigger id="post-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOCIAL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SOCIAL_STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Assignee */}
            <div className="space-y-2">
              <Label htmlFor="post-assignee">Zugewiesen an</Label>
              <Select
                value={form.assigneeId}
                onValueChange={(v) =>
                  setForm((prev) => ({ ...prev, assigneeId: v }))
                }
              >
                <SelectTrigger id="post-assignee">
                  <SelectValue placeholder="Teammitglied auswaehlen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nicht zugewiesen</SelectItem>
                  {teamMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {memberName(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="post-notes">Interne Notiz</Label>
              <Textarea
                id="post-notes"
                placeholder="Optionale Notiz fuer das Team..."
                rows={2}
                value={form.notes}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, notes: e.target.value }))
                }
              />
            </div>

            <Separator />

            {/* Actions */}
            <div className="flex items-center gap-3">
              <Button
                onClick={savePost}
                disabled={saving}
                className="gap-1.5"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingPost ? 'Speichern' : 'Post erstellen'}
              </Button>
              <Button variant="outline" onClick={closeSheet} disabled={saving}>
                Abbrechen
              </Button>
              {editingPost && (
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={deletePost}
                  disabled={deleting || saving}
                  className="ml-auto"
                  aria-label="Post loeschen"
                >
                  {deleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ─── PostCard ──────────────────────────────────────────────────────────────────

interface PostCardProps {
  post: SocialMediaPost
  compact?: boolean
  onClick?: (e: React.MouseEvent) => void
}

function PostCard({ post, compact = true, onClick }: PostCardProps) {
  const overdue = isOverdue(post)
  const statusMeta = SOCIAL_STATUS_META[post.status]

  if (compact) {
    // Compact card for month view cells
    const primaryPlatform = post.platforms[0]
    const platformMeta = primaryPlatform ? SOCIAL_PLATFORM_META[primaryPlatform] : null
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-left text-[11px] leading-tight transition-colors hover:ring-1',
          platformMeta?.badgeClass ?? 'border-slate-200 bg-slate-50 text-slate-600',
          platformMeta?.ringClass ? `hover:${platformMeta.ringClass}` : 'hover:ring-slate-300'
        )}
      >
        {platformMeta && (
          <span className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', platformMeta.dotClass)} />
        )}
        <span className="truncate font-medium">{post.title}</span>
        {overdue && (
          <AlertTriangle className="ml-auto h-3 w-3 shrink-0 text-amber-500" />
        )}
      </button>
    )
  }

  // Expanded card for week view
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-xl border border-slate-100 bg-white p-3 text-left transition-colors hover:border-slate-200 hover:shadow-sm dark:border-border dark:bg-card dark:hover:border-slate-600"
    >
      <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
        {post.platforms.map((p) => (
          <span
            key={p}
            className={cn('h-2.5 w-2.5 rounded-full', SOCIAL_PLATFORM_META[p].dotClass)}
            title={SOCIAL_PLATFORM_META[p].label}
          />
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{post.title}</p>
          {overdue && (
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              </TooltipTrigger>
              <TooltipContent>Ueberfaellig</TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge
            variant="outline"
            className={cn('text-[10px] px-1.5 py-0', statusMeta.badgeClass)}
          >
            {statusMeta.label}
          </Badge>
          {post.platforms.map((p) => (
            <Badge
              key={p}
              variant="outline"
              className={cn('text-[10px] px-1.5 py-0', SOCIAL_PLATFORM_META[p].badgeClass)}
            >
              {SOCIAL_PLATFORM_META[p].short}
            </Badge>
          ))}
          <span className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
            <Clock className="h-3 w-3" />
            {formatTime(new Date(post.scheduledAt))}
          </span>
        </div>
        {post.customerName && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{post.customerName}</p>
        )}
        {post.assigneeName && (
          <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
            Zugewiesen: {post.assigneeName}
          </p>
        )}
      </div>
    </button>
  )
}
