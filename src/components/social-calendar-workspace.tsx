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
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileImage,
  ImageIcon,
  Loader2,
  MessageSquare,
  Play,
  Plus,
  Send,
  Trash2,
  Video,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useActiveCustomer } from '@/lib/active-customer-context'
import {
  buildMonthGrid,
  buildWeekDays,
  formatDateTime,
  formatMonthTitle,
  formatTime,
  formatWeekRange,
  fromDateTimeLocalValue,
  isSameDay,
  isSameMonth,
  isOverdue,
  SOCIAL_POST_FORMAT_META,
  SOCIAL_POST_FORMATS,
  toDateTimeLocalValue,
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_META,
  SOCIAL_STATUSES,
  SOCIAL_STATUS_META,
  type CalendarViewMode,
  type SocialMediaPost,
  type SocialPostFormat,
  type SocialPlatformId,
  type SocialPostStatus,
} from '@/lib/social-calendar'
import { ApprovalSubmitPanel } from '@/components/approval-submit-panel'
import type { ApprovalStatus } from '@/components/approval-status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FilterChips } from '@/components/filter-chips'

// ─── Asset-Picker types ───────────────────────────────────────────────────────

interface PickerAsset {
  id: string
  title: string
  media_type: 'image' | 'video'
  public_url: string
  width_px: number
  height_px: number
  file_format: string
  file_size_bytes: number
  duration_seconds: number | null
  customer_id: string
}

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
  postFormat: SocialPostFormat
  customerId: string
  scheduledAt: string
  status: SocialPostStatus
  assigneeId: string
  notes: string
  adAssetId: string | null
  adAssetUrl: string | null
}

interface ApprovalInfo {
  status: ApprovalStatus
  link: string | null
  feedback: string | null
  history: Array<{
    id: string
    event_type: 'submitted' | 'resubmitted' | 'approved' | 'changes_requested' | 'content_updated'
    status_after: ApprovalStatus
    feedback: string | null
    actor_label: string | null
    created_at: string
  }>
}

const EMPTY_FORM: PostFormData = {
  title: '',
  caption: '',
  platforms: [],
  postFormat: 'instagram_feed',
  customerId: 'none',
  scheduledAt: '',
  status: 'draft',
  assigneeId: 'none',
  notes: '',
  adAssetId: null,
  adAssetUrl: null,
}

// ─── Helper: URL key for date ────────────────────────────────────────────────

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function detectAssetKind(url: string | null): 'image' | 'video' | 'none' {
  if (!url) return 'none'
  return /\.(mp4|mov|webm)(\?|$)/i.test(url) ? 'video' : 'image'
}

function formatApprovalHistoryLabel(type: ApprovalInfo['history'][number]['event_type']) {
  switch (type) {
    case 'submitted':
      return 'Eingereicht'
    case 'resubmitted':
      return 'Erneut eingereicht'
    case 'approved':
      return 'Freigegeben'
    case 'changes_requested':
      return 'Korrektur gewünscht'
    case 'content_updated':
      return 'Inhalt aktualisiert'
    default:
      return type
  }
}

// ─── Workspace ───────────────────────────────────────────────────────────────

export function SocialCalendarWorkspace() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { activeCustomer, customers } = useActiveCustomer()

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
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1)
  const [form, setForm] = useState<PostFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [approvalInfo, setApprovalInfo] = useState<ApprovalInfo | null>(null)
  const [approvalLoading, setApprovalLoading] = useState(false)

  // Team members
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const teamMembersFetched = useRef(false)

  // Asset picker
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerAssets, setPickerAssets] = useState<PickerAsset[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')

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

  // ─── Auto-open sheet from Ads Library URL params ───────────────────────────

  useEffect(() => {
    const assetId = searchParams.get('asset_id')
    const assetUrl = searchParams.get('asset_url')
    const assetTitle = searchParams.get('asset_title')
    if (!assetId || !assetUrl) return

    const now = new Date()
    now.setMinutes(0, 0, 0)
    now.setHours(now.getHours() + 1)
    setForm({
      ...EMPTY_FORM,
      title: assetTitle ? decodeURIComponent(assetTitle) : '',
      scheduledAt: toDateTimeLocalValue(now),
      customerId: activeCustomer?.id ?? 'none',
      platforms: ['instagram'],
      postFormat: 'instagram_feed',
      adAssetId: assetId,
      adAssetUrl: decodeURIComponent(assetUrl),
    })
    setEditingPost(null)
    setApprovalInfo({ status: 'draft', link: null, feedback: null, history: [] })
    setWizardStep(1)
    setSheetOpen(true)
    // clean URL params without re-render loop
    const sp = new URLSearchParams(searchParams.toString())
    sp.delete('asset_id')
    sp.delete('asset_url')
    sp.delete('asset_title')
    const qs = sp.toString()
    startTransition(() => {
      router.replace(`/tools/social-calendar${qs ? `?${qs}` : ''}`, { scroll: false })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const loadApprovalInfo = useCallback(async (postId: string) => {
    setApprovalLoading(true)
    try {
      const sp = new URLSearchParams({
        content_type: 'social_media_post',
        content_id: postId,
      })
      const res = await fetch(`/api/tenant/approvals?${sp.toString()}`)
      if (!res.ok) throw new Error('Freigabeinformationen konnten nicht geladen werden.')
      const data = await res.json()
      const first = Array.isArray(data.approvals) ? data.approvals[0] : null
      if (!first) {
        setApprovalInfo({ status: 'draft', link: null, feedback: null, history: [] })
        return
      }
      setApprovalInfo({
        status: first.status ?? 'draft',
        link: first.public_token ? `${window.location.origin}/approval/${first.public_token}` : null,
        feedback: first.feedback ?? null,
        history: Array.isArray(first.history) ? first.history : [],
      })
    } catch {
      setApprovalInfo({ status: 'draft', link: null, feedback: null, history: [] })
    } finally {
      setApprovalLoading(false)
    }
  }, [])

  // ─── Fetch picker assets ───────────────────────────────────────────────────

  const openPicker = useCallback(async () => {
    setPickerOpen(true)
    setPickerSearch('')
    setPickerAssets([])
    setPickerLoading(true)
    try {
      const sp = new URLSearchParams({ limit: '200' })
      const customerId = form.customerId !== 'none' ? form.customerId : null
      if (customerId) sp.set('customer_id', customerId)
      const res = await fetch(`/api/tenant/ad-library?${sp.toString()}`)
      if (!res.ok) return
      const data = await res.json()
      setPickerAssets(data.assets ?? [])
    } finally {
      setPickerLoading(false)
    }
  }, [form.customerId])

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

  useEffect(() => {
    const postId = searchParams.get('postId')
    if (!postId || sheetOpen) return

    let cancelled = false

    async function loadPost() {
      try {
        const res = await fetch(`/api/tenant/social-calendar/${postId}`)
        if (!res.ok) return
        const data = await res.json()
        if (cancelled || !data.post) return
        openEditSheet(data.post as SocialMediaPost)
      } catch {
        // Ignore invalid deep link states
      }
    }

    void loadPost()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, sheetOpen])

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
      const next = platformFilter.includes(id as SocialPlatformId)
        ? platformFilter.filter((p) => p !== id)
        : [...platformFilter, id as SocialPlatformId]
      setPlatformFilter(next)
      updateUrl({ platform: next.length > 0 ? next.join(',') : null })
    },
    [platformFilter, updateUrl]
  )

  const toggleStatusFilter = useCallback(
    (id: string) => {
      const next = statusFilter.includes(id as SocialPostStatus)
        ? statusFilter.filter((s) => s !== id)
        : [...statusFilter, id as SocialPostStatus]
      setStatusFilter(next)
      updateUrl({ status: next.length > 0 ? next.join(',') : null })
    },
    [statusFilter, updateUrl]
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
  const formatMeta = SOCIAL_POST_FORMAT_META[form.postFormat]
  const primaryPlatform = formatMeta.platformId
  const captionLength = form.caption.length
  const captionLimit = formatMeta.characterLimit
  const previewSoftLimit = formatMeta.previewSoftLimit
  const captionRemaining = captionLimit - captionLength
  const captionTooLong = captionRemaining < 0
  const assetKind = detectAssetKind(form.adAssetUrl)
  const formatNeedsVideo = formatMeta.mediaLabel === 'Video'
  const formatMismatch =
    assetKind !== 'none' &&
    ((formatNeedsVideo && assetKind !== 'video') || (!formatNeedsVideo && assetKind !== 'image'))
  const previewPlatforms = useMemo(
    () => [primaryPlatform, ...form.platforms.filter((platform) => platform !== primaryPlatform)],
    [form.platforms, primaryPlatform]
  )

  const wizardCanContinue = useMemo(() => {
    if (wizardStep === 1) {
      return Boolean(form.scheduledAt)
    }

    if (wizardStep === 2) {
      return form.title.trim().length > 0 && form.platforms.length > 0 && !captionTooLong
    }

    return true
  }, [captionTooLong, form.platforms.length, form.scheduledAt, form.title, wizardStep])

  const applyFormat = useCallback((nextFormat: SocialPostFormat) => {
    const nextPrimary = SOCIAL_POST_FORMAT_META[nextFormat].platformId
    setForm((prev) => ({
      ...prev,
      postFormat: nextFormat,
      platforms: prev.platforms.includes(nextPrimary) ? prev.platforms : [nextPrimary, ...prev.platforms],
    }))
  }, [])

  const toggleCrossPostPlatform = useCallback(
    (platform: SocialPlatformId) => {
      if (platform === primaryPlatform) return
      setForm((prev) => ({
        ...prev,
        platforms: prev.platforms.includes(platform)
          ? prev.platforms.filter((entry) => entry !== platform)
          : [...prev.platforms, platform],
      }))
    },
    [primaryPlatform]
  )

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
    setWizardStep(1)
    setApprovalInfo({ status: 'draft', link: null, feedback: null, history: [] })
    const now = presetDate ?? new Date()
    // Default to 10:00 if creating for a specific date
    if (presetDate) {
      now.setHours(10, 0, 0, 0)
    }
    setForm({
      ...EMPTY_FORM,
      scheduledAt: toDateTimeLocalValue(now),
      customerId: activeCustomer?.id ?? 'none',
      platforms: ['instagram'],
      postFormat: 'instagram_feed',
    })
    setSheetOpen(true)
  }

  function openEditSheet(post: SocialMediaPost) {
    setEditingPost(post)
    setWizardStep(1)
    setPickerAssets([])
    setForm({
      title: post.title,
      caption: post.caption ?? '',
      platforms: [...post.platforms],
      postFormat: post.postFormat ?? 'instagram_feed',
      customerId: post.customerId ?? 'none',
      scheduledAt: toDateTimeLocalValue(new Date(post.scheduledAt)),
      status: post.status,
      assigneeId: post.assigneeId ?? 'none',
      notes: post.notes ?? '',
      adAssetId: post.adAssetId ?? null,
      adAssetUrl: post.adAssetUrl ?? null,
    })
    void loadApprovalInfo(post.id)
    setSheetOpen(true)
  }

  function closeSheet() {
    setSheetOpen(false)
    setWizardStep(1)
    setEditingPost(null)
    setApprovalInfo(null)
    setForm(EMPTY_FORM)
    setPickerAssets([])
    updateUrl({ postId: null, action: null })
  }

  // ─── Save post ─────────────────────────────────────────────────────────────

  async function savePost(options?: { submitForApproval?: boolean }) {
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
    if (captionTooLong) {
      toast({
        title: `Caption überschreitet das Limit für ${formatMeta.label}`,
        description: `Erlaubt sind maximal ${captionLimit} Zeichen.`,
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      const normalizedPlatforms = form.platforms.includes(primaryPlatform)
        ? form.platforms
        : [primaryPlatform, ...form.platforms]
      const body = {
        title: form.title.trim(),
        caption: form.caption.trim() || null,
        platforms: normalizedPlatforms,
        customer_id: form.customerId === 'none' ? null : form.customerId,
        scheduled_at: scheduledIso,
        status: form.status,
        assignee_id: form.assigneeId === 'none' ? null : form.assigneeId,
        notes: form.notes.trim() || null,
        ad_asset_id: form.adAssetId ?? null,
        ad_asset_url: form.adAssetUrl ?? null,
        post_format: form.postFormat,
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

      const data = await res.json().catch(() => ({}))
      const postId = (data.post?.id as string | undefined) ?? editingPost?.id
      if (data.post) {
        setEditingPost(data.post as SocialMediaPost)
      }

      if (options?.submitForApproval && postId) {
        const approvalRes = await fetch('/api/tenant/approvals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content_type: 'social_media_post', content_id: postId }),
        })

        if (!approvalRes.ok) {
          const approvalData = await approvalRes.json().catch(() => ({}))
          throw new Error(approvalData.error ?? 'Freigabe konnte nicht gestartet werden')
        }

        const approvalData = await approvalRes.json()
        setApprovalInfo({
          status: approvalData.approval_status ?? 'pending_approval',
          link: approvalData.approval_link ?? null,
          feedback: null,
          history: approvalInfo?.history ?? [],
        })
        toast({
          title: isEdit ? 'Post aktualisiert und eingereicht' : 'Post erstellt und eingereicht',
        })
      } else {
        toast({
          title: isEdit ? 'Post aktualisiert' : 'Post erstellt',
        })
      }
      closeSheet()
      void fetchPosts()
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

      {/* ── Asset Picker Dialog ────────────────────────────────────────────── */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-0 p-0">
          <DialogHeader className="border-b border-slate-200 px-5 py-4 dark:border-border">
            <DialogTitle>
              Asset aus Bibliothek wählen
              {form.customerId !== 'none' && customers.find((c) => c.id === form.customerId) && (
                <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
                  — {customers.find((c) => c.id === form.customerId)?.name}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 overflow-hidden px-4 pb-4 pt-3">
            <Input
              placeholder="Titel suchen…"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              className="h-9"
            />
            <div className="overflow-y-auto pr-0.5">
              {pickerLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : pickerAssets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <FileImage className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {form.customerId !== 'none'
                      ? 'Keine Assets für diesen Kunden'
                      : 'Keine Assets in der Bibliothek'}
                  </p>
                </div>
              ) : (() => {
                const filtered = pickerAssets.filter((a) =>
                  pickerSearch ? a.title.toLowerCase().includes(pickerSearch.toLowerCase()) : true
                )
                return filtered.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">Keine Treffer</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {filtered.map((asset) => {
                      const isSelected = form.adAssetId === asset.id
                      const sizeKb = Math.round(asset.file_size_bytes / 1024)
                      const sizeLabel = sizeKb >= 1024
                        ? `${(sizeKb / 1024).toFixed(1)} MB`
                        : `${sizeKb} KB`
                      const ratio = asset.width_px / asset.height_px
                      const knownRatios: [number, string][] = [
                        [1, '1:1'], [4/3, '4:3'], [3/4, '3:4'], [16/9, '16:9'],
                        [9/16, '9:16'], [4/5, '4:5'], [5/4, '5:4'],
                      ]
                      const ratioLabel =
                        knownRatios.find(([r]) => Math.abs(ratio - r) < 0.025)?.[1] ??
                        `${ratio.toFixed(2)}:1`
                      return (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() => {
                            setForm((prev) => ({
                              ...prev,
                              adAssetId: asset.id,
                              adAssetUrl: asset.public_url,
                            }))
                            setPickerOpen(false)
                          }}
                          className={cn(
                            'group overflow-hidden rounded-xl border bg-white text-left transition-all hover:border-blue-500 hover:shadow-md dark:bg-[#101723]',
                            isSelected
                              ? 'border-blue-500 ring-2 ring-blue-500/30'
                              : 'border-slate-200 dark:border-border'
                          )}
                        >
                          {/* Preview */}
                          <div className="relative aspect-video w-full overflow-hidden bg-slate-100 dark:bg-[#0b1220]">
                            {asset.media_type === 'image' ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={asset.public_url}
                                alt={asset.title}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <>
                                <video
                                  src={asset.public_url}
                                  className="h-full w-full object-cover"
                                  muted
                                  playsInline
                                  preload="metadata"
                                />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90">
                                    <Play className="h-3.5 w-3.5 translate-x-0.5 text-slate-900" />
                                  </div>
                                </div>
                              </>
                            )}
                            {/* Format badge */}
                            <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                              {asset.file_format}
                            </span>
                            {isSelected && (
                              <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white">
                                <svg viewBox="0 0 12 12" className="h-3 w-3 fill-current">
                                  <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </span>
                            )}
                          </div>
                          {/* Info */}
                          <div className="px-2.5 py-2">
                            <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                              {asset.title}
                            </p>
                            <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                              {asset.width_px}×{asset.height_px}px · {ratioLabel}
                            </p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500">
                              {asset.media_type === 'video' ? 'Video' : 'Bild'} · {sizeLabel}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Post Sheet (Create / Edit) ─────────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={(open) => !open && closeSheet()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-6xl">
          <SheetHeader>
            <SheetTitle>{editingPost ? 'Post überarbeiten' : 'Neuen Social Post planen'}</SheetTitle>
            <SheetDescription>
              {editingPost
                ? 'Arbeite den Post schrittweise durch, prüfe die Vorschau und reiche ihn bei Bedarf direkt zur Freigabe ein.'
                : 'Lege Format, Inhalt und Freigabe in einem geführten Wizard an.'}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                <span>Schritt {wizardStep} von 3</span>
                <span>
                  {wizardStep === 1 && 'Format & Planung'}
                  {wizardStep === 2 && 'Inhalt & Workflow'}
                  {wizardStep === 3 && 'Vorschau & Freigabe'}
                </span>
              </div>
              <div className="flex gap-2">
                {[1, 2, 3].map((step) => (
                  <div
                    key={step}
                    className={cn(
                      'h-2 flex-1 rounded-full transition-colors',
                      step <= wizardStep ? 'bg-blue-600 dark:bg-blue-400' : 'bg-slate-100 dark:bg-secondary'
                    )}
                  />
                ))}
              </div>
            </div>

            {wizardStep === 1 && (
              <div className="grid gap-6 xl:grid-cols-[1.25fr_0.95fr]">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-slate-950 dark:text-slate-50">
                      Hauptformat auswählen
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Das Hauptformat steuert Vorschau, Zeichenlimit und den primären Kanal. Weitere Plattformen kannst du danach als Cross-Posting hinzufügen.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {SOCIAL_POST_FORMATS.map((format) => {
                      const selected = form.postFormat === format.id
                      const platformMeta = SOCIAL_PLATFORM_META[format.platformId]
                      return (
                        <button
                          key={format.id}
                          type="button"
                          onClick={() => applyFormat(format.id)}
                          className={cn(
                            'rounded-2xl border p-4 text-left transition-all',
                            selected
                              ? 'border-blue-500 bg-blue-50 shadow-sm dark:border-blue-400 dark:bg-blue-950/30'
                              : 'border-slate-200 bg-white hover:border-slate-300 dark:border-border dark:bg-card dark:hover:border-slate-600'
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {format.label}
                              </p>
                              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                {format.description}
                              </p>
                            </div>
                            <Badge variant="outline" className={cn('rounded-full', platformMeta.badgeClass)}>
                              {platformMeta.short}
                            </Badge>
                          </div>
                          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            {format.mediaLabel === 'Video' ? <Video className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
                            {format.mediaLabel}
                            <span className="text-slate-300 dark:text-slate-600">•</span>
                            Max. {format.characterLimit.toLocaleString('de-DE')} Zeichen
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  <div className="space-y-2">
                    <Label>Zusätzliche Plattformen</Label>
                    <div className="flex flex-wrap gap-2">
                      {SOCIAL_PLATFORMS.map((platform) => {
                        const meta = SOCIAL_PLATFORM_META[platform]
                        const isPrimary = platform === primaryPlatform
                        const selected = previewPlatforms.includes(platform)
                        return (
                          <button
                            key={platform}
                            type="button"
                            onClick={() => toggleCrossPostPlatform(platform)}
                            disabled={isPrimary}
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                              selected
                                ? meta.badgeClass
                                : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-border dark:bg-card dark:text-slate-400 dark:hover:border-slate-600',
                              isPrimary && 'cursor-default ring-1 ring-blue-500/30'
                            )}
                          >
                            <span className={cn('h-2 w-2 rounded-full', selected ? meta.dotClass : 'bg-slate-300 dark:bg-slate-600')} />
                            {meta.label}
                            {isPrimary && <span className="text-[10px] uppercase tracking-wide">Primär</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="post-customer">Kunde</Label>
                      <Select
                        value={form.customerId}
                        onValueChange={(v) => setForm((prev) => ({ ...prev, customerId: v }))}
                      >
                        <SelectTrigger id="post-customer" className="rounded-2xl">
                          <SelectValue placeholder="Kunde auswählen" />
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

                    <div className="space-y-2">
                      <Label htmlFor="post-scheduled">Geplantes Datum / Uhrzeit *</Label>
                      <Input
                        id="post-scheduled"
                        type="datetime-local"
                        className="rounded-2xl"
                        value={form.scheduledAt}
                        onChange={(e) => setForm((prev) => ({ ...prev, scheduledAt: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                <Card className="rounded-3xl border-slate-200 bg-slate-50/80 shadow-none dark:border-border dark:bg-card/60">
                  <CardContent className="space-y-4 p-5">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                        Planung im Blick
                      </p>
                      <h3 className="mt-2 text-lg font-semibold text-slate-950 dark:text-slate-50">
                        {formatMeta.label}
                      </h3>
                    </div>
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-border dark:bg-card">
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Primärkanal</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {SOCIAL_PLATFORM_META[primaryPlatform].label}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-border dark:bg-card">
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Cross-Posting</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {previewPlatforms.map((platform) => (
                            <Badge key={platform} variant="outline" className={cn('rounded-full', SOCIAL_PLATFORM_META[platform].badgeClass)}>
                              {SOCIAL_PLATFORM_META[platform].label}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-border dark:bg-card">
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Zeichenlimit</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {formatMeta.characterLimit.toLocaleString('de-DE')} Zeichen
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Für die Vorschau werden ungefähr die ersten {previewSoftLimit} Zeichen prominent sichtbar.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="post-title">Interner Titel *</Label>
                    <Input
                      id="post-title"
                      className="rounded-2xl"
                      placeholder="z. B. Launch Reel April"
                      value={form.title}
                      onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="post-caption">Caption / Text</Label>
                      <span
                        className={cn(
                          'text-xs font-medium',
                          captionTooLong ? 'text-red-600 dark:text-red-400' : captionRemaining < 120 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'
                        )}
                      >
                        {captionLength}/{captionLimit.toLocaleString('de-DE')}
                      </span>
                    </div>
                    <Textarea
                      id="post-caption"
                      placeholder="Schreibe den sichtbaren Post-Text inklusive Emojis, Umbrüchen und CTA genau so, wie er später erscheinen soll."
                      rows={8}
                      className="min-h-[220px] rounded-2xl"
                      value={form.caption}
                      onChange={(e) => setForm((prev) => ({ ...prev, caption: e.target.value }))}
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Sichtbarer Anreißer in der Feed-Vorschau: ca. {previewSoftLimit} Zeichen.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Asset aus Bibliothek</Label>
                    {form.adAssetUrl ? (
                      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 dark:border-border dark:bg-card">
                        <div className="relative aspect-[4/5] w-full bg-slate-100 dark:bg-[#0b1220]">
                          {assetKind === 'video' ? (
                            <video
                              src={form.adAssetUrl}
                              className="h-full w-full object-cover"
                              muted
                              playsInline
                              preload="metadata"
                            />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={form.adAssetUrl}
                              alt="Ausgewähltes Asset"
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              {assetKind === 'video' ? 'Video verknüpft' : 'Bild verknüpft'}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {formatNeedsVideo ? 'Für dieses Format wird idealerweise ein Video verwendet.' : 'Für dieses Format funktioniert ein Bild am besten.'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" className="rounded-full" onClick={openPicker} type="button">
                              Asset wechseln
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="rounded-full text-slate-500 hover:text-red-600"
                              onClick={() => setForm((prev) => ({ ...prev, adAssetId: null, adAssetUrl: null }))}
                              type="button"
                            >
                              Entfernen
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        className="h-24 w-full rounded-3xl border-dashed"
                        onClick={openPicker}
                        type="button"
                      >
                        <FileImage className="mr-2 h-4 w-4 text-slate-400" />
                        Bild oder Video aus Bibliothek auswählen
                      </Button>
                    )}
                    {formatMismatch && (
                      <Alert className="rounded-2xl border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Format-Hinweis</AlertTitle>
                        <AlertDescription>
                          Das gewählte Asset passt nicht ideal zum Hauptformat. Für {formatMeta.label} ist {formatNeedsVideo ? 'ein Video' : 'ein Bild'} empfehlenswert.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="post-assignee">Zugewiesen an</Label>
                      <Select
                        value={form.assigneeId}
                        onValueChange={(v) => setForm((prev) => ({ ...prev, assigneeId: v }))}
                      >
                        <SelectTrigger id="post-assignee" className="rounded-2xl">
                          <SelectValue placeholder="Teammitglied auswählen" />
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

                    <div className="space-y-2">
                      <Label>Status im Team</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {SOCIAL_STATUSES.map((status) => {
                          const meta = SOCIAL_STATUS_META[status]
                          const selected = form.status === status
                          return (
                            <button
                              key={status}
                              type="button"
                              onClick={() => setForm((prev) => ({ ...prev, status }))}
                              className={cn(
                                'rounded-2xl border px-3 py-3 text-left text-sm transition',
                                selected
                                  ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950'
                                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-border dark:bg-card dark:text-slate-300'
                              )}
                            >
                              {meta.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="post-notes">Interne Notiz</Label>
                    <Textarea
                      id="post-notes"
                      rows={4}
                      className="rounded-2xl"
                      placeholder="Briefing, To-dos oder Hinweise für Designer und Redaktion."
                      value={form.notes}
                      onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                    />
                  </div>
                </div>

                <Card className="rounded-3xl border-slate-200 bg-slate-50/80 shadow-none dark:border-border dark:bg-card/60">
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                          Workflow
                        </p>
                        <h3 className="mt-2 text-lg font-semibold text-slate-950 dark:text-slate-50">
                          Status und Freigabe sichtbar
                        </h3>
                      </div>
                      <Badge variant="outline" className={cn('rounded-full', SOCIAL_STATUS_META[form.status].badgeClass)}>
                        {SOCIAL_STATUS_META[form.status].label}
                      </Badge>
                    </div>

                    <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-border dark:bg-card">
                        <p className="font-medium text-slate-900 dark:text-slate-100">Was das Team jetzt sieht</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          Der Status ist direkt im Kalender und im Post sichtbar. „Zur Freigabe“ ist damit nicht mehr nur ein Filter, sondern Teil des eigentlichen Erstellungsflows.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-border dark:bg-card">
                        <p className="font-medium text-slate-900 dark:text-slate-100">Kundenfreigabe</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          Im letzten Schritt kannst du den Post speichern oder direkt beim Kunden zur Freigabe einreichen. Bei Freigabe oder Änderungswunsch wird der Status automatisch aktualisiert.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-5">
                  <Card className="rounded-3xl border-slate-200 shadow-none dark:border-border">
                    <CardContent className="space-y-4 p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                            Check vor dem Publish
                          </p>
                          <h3 className="mt-2 text-lg font-semibold text-slate-950 dark:text-slate-50">
                            Vorschau & Freigabe
                          </h3>
                        </div>
                        <Badge variant="outline" className={cn('rounded-full', SOCIAL_STATUS_META[form.status].badgeClass)}>
                          {SOCIAL_STATUS_META[form.status].label}
                        </Badge>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-border dark:bg-card">
                          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Format</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{formatMeta.label}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-border dark:bg-card">
                          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Geplant für</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {form.scheduledAt ? formatDateTime(new Date(form.scheduledAt)) : 'Noch offen'}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-border dark:bg-card">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Caption-Limit</p>
                          <span className={cn('text-xs font-semibold', captionTooLong ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400')}>
                            {captionLength}/{captionLimit.toLocaleString('de-DE')}
                          </span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              captionTooLong ? 'bg-red-500' : captionRemaining < 120 ? 'bg-amber-500' : 'bg-emerald-500'
                            )}
                            style={{ width: `${Math.min(100, Math.max(6, (captionLength / captionLimit) * 100))}%` }}
                          />
                        </div>
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                          {captionTooLong
                            ? `Bitte kürze den Text um ${Math.abs(captionRemaining)} Zeichen.`
                            : `${captionRemaining.toLocaleString('de-DE')} Zeichen verbleiben.`}
                        </p>
                      </div>

                      {approvalLoading ? (
                        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:border-border dark:bg-card dark:text-slate-400">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Freigabeinformationen werden geladen…
                        </div>
                      ) : editingPost ? (
                        <ApprovalSubmitPanel
                          contentType="social_media_post"
                          contentId={editingPost.id}
                          approvalStatus={approvalInfo?.status ?? 'draft'}
                          approvalLink={approvalInfo?.link}
                          feedback={approvalInfo?.feedback}
                          onStatusChange={(newStatus, link) => {
                            setApprovalInfo((prev) => ({
                              status: newStatus,
                              link: link ?? prev?.link ?? null,
                              feedback: newStatus === 'changes_requested' ? prev?.feedback ?? null : null,
                              history: prev?.history ?? [],
                            }))
                            setForm((prev) => ({
                              ...prev,
                              status:
                                newStatus === 'approved'
                                  ? 'approved'
                                  : newStatus === 'pending_approval'
                                    ? 'review'
                                    : newStatus === 'changes_requested'
                                      ? 'in_progress'
                                      : prev.status,
                            }))
                            void fetchPosts()
                          }}
                        />
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500 dark:border-border dark:bg-card dark:text-slate-400">
                          Speichere den Post oder nutze direkt „Erstellen & zur Freigabe einreichen“, damit automatisch ein Kunden-Link erzeugt wird.
                        </div>
                      )}

                      {approvalInfo?.history.length ? (
                        <div className="space-y-3">
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Freigabeverlauf</p>
                          <div className="space-y-2">
                            {approvalInfo.history.map((entry) => (
                              <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-border dark:bg-card">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                    {formatApprovalHistoryLabel(entry.event_type)}
                                  </p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {new Date(entry.created_at).toLocaleString('de-DE')}
                                  </p>
                                </div>
                                {entry.feedback && (
                                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
                                    {entry.feedback}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>

                <Card className="overflow-hidden rounded-[2rem] border-slate-200 bg-[#edf2f7] shadow-none dark:border-border dark:bg-[#111827]">
                  <CardContent className="p-6">
                    <div className="mx-auto max-w-[380px] space-y-4">
                      <div className="rounded-[2rem] bg-white p-4 shadow-[0_20px_50px_rgba(15,23,42,0.08)] dark:bg-[#0f172a]">
                        <div className="flex items-center gap-3">
                          <div className={cn('flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold text-white', primaryPlatform === 'instagram' && 'bg-gradient-to-br from-fuchsia-500 to-orange-400', primaryPlatform === 'facebook' && 'bg-blue-600', primaryPlatform === 'linkedin' && 'bg-sky-700', primaryPlatform === 'tiktok' && 'bg-slate-900')}>
                            {SOCIAL_PLATFORM_META[primaryPlatform].short}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-950 dark:text-slate-50">
                              {customers.find((c) => c.id === form.customerId)?.name ?? 'Boosthive Kunde'}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {formatMeta.shortLabel} • {form.scheduledAt ? formatTime(new Date(form.scheduledAt)) : 'Entwurf'}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 overflow-hidden rounded-[1.5rem] bg-slate-100 dark:bg-slate-900">
                          {form.adAssetUrl ? (
                            assetKind === 'video' ? (
                              <div className="relative aspect-[4/5]">
                                <video
                                  src={form.adAssetUrl}
                                  className="h-full w-full object-cover"
                                  muted
                                  playsInline
                                  preload="metadata"
                                />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-slate-900">
                                    <Play className="h-5 w-5 translate-x-0.5" />
                                  </div>
                                </div>
                              </div>
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={form.adAssetUrl}
                                alt={form.title || 'Post Vorschau'}
                                className="aspect-[4/5] h-full w-full object-cover"
                              />
                            )
                          ) : (
                            <div className="flex aspect-[4/5] items-center justify-center px-8 text-center text-sm text-slate-400 dark:text-slate-500">
                              Noch kein Bild oder Video hinterlegt
                            </div>
                          )}
                        </div>

                        <div className="mt-4 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {previewPlatforms.map((platform) => (
                              <Badge key={platform} variant="outline" className={cn('rounded-full', SOCIAL_PLATFORM_META[platform].badgeClass)}>
                                {SOCIAL_PLATFORM_META[platform].label}
                              </Badge>
                            ))}
                          </div>
                          <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                            {form.title.trim() || 'Interner Titel noch leer'}
                          </p>
                          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 dark:text-slate-200">
                            {form.caption.trim() || 'Die Caption erscheint hier in der echten Schreibweise mit Emojis, Umbrüchen und Textfluss.'}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-slate-400 dark:text-slate-500">
                            <span>Gefällt mir</span>
                            <span>Kommentieren</span>
                            <span>Teilen</span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-3xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-600 backdrop-blur dark:border-border dark:bg-[#0f172a]/80 dark:text-slate-300">
                        <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                          <MessageSquare className="h-4 w-4" />
                          Vorschau-Hinweis
                        </div>
                        <p className="mt-2">
                          Die Vorschau zeigt die tatsächliche Reihenfolge von Visual, Text und Umbrüchen. Unterschiede durch App-Chrome oder algorithmische Kürzungen bleiben plattformabhängig, die Caption selbst wird aber 1:1 übernommen.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-border">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => {
                    if (wizardStep === 1) {
                      closeSheet()
                      return
                    }
                    setWizardStep((current) => (current - 1) as 1 | 2 | 3)
                  }}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {wizardStep === 1 ? 'Abbrechen' : 'Zurück'}
                </Button>
                {editingPost && (
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={deletePost}
                    disabled={deleting || saving}
                    aria-label="Post loeschen"
                  >
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {wizardStep < 3 ? (
                  <Button
                    type="button"
                    variant="dark"
                    onClick={() => setWizardStep((current) => (current + 1) as 1 | 2 | 3)}
                    disabled={!wizardCanContinue}
                  >
                    Weiter
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <>
                    <Button type="button" variant="outline" onClick={() => void savePost()} disabled={saving || captionTooLong} className="rounded-full">
                      {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {editingPost ? 'Speichern' : 'Post erstellen'}
                    </Button>
                    <Button
                      type="button"
                      variant="dark"
                      onClick={() => void savePost({ submitForApproval: true })}
                      disabled={saving || captionTooLong || form.customerId === 'none'}
                      className="rounded-full"
                    >
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      {editingPost ? 'Speichern & zur Freigabe' : 'Erstellen & zur Freigabe'}
                    </Button>
                  </>
                )}
              </div>
            </div>
            {form.customerId === 'none' && wizardStep === 3 && (
              <p className="text-right text-xs text-slate-400 dark:text-slate-500">
                Für die Kundenfreigabe muss ein Kunde zugeordnet sein.
              </p>
            )}
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
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && onClick) {
            event.preventDefault()
            onClick(event as unknown as React.MouseEvent)
          }
        }}
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
        <span
          className={cn(
            'ml-auto shrink-0 rounded-full px-1 py-0 text-[9px] font-semibold uppercase tracking-wide',
            statusMeta.badgeClass
          )}
        >
          {statusMeta.label}
        </span>
        {overdue && (
          <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />
        )}
      </div>
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
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {SOCIAL_POST_FORMAT_META[post.postFormat]?.shortLabel ?? 'Format'}
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
