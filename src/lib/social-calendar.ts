export type SocialPlatformId = 'instagram' | 'linkedin' | 'facebook' | 'tiktok'

export type SocialPostStatus =
  | 'draft'
  | 'in_progress'
  | 'review'
  | 'approved'
  | 'published'

export type CalendarViewMode = 'month' | 'week'

export interface SocialMediaPost {
  id: string
  tenantId: string
  customerId: string | null
  customerName: string | null
  title: string
  caption: string | null
  platforms: SocialPlatformId[]
  scheduledAt: string // ISO
  status: SocialPostStatus
  assigneeId: string | null
  assigneeName: string | null
  notes: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export const SOCIAL_PLATFORM_META: Record<
  SocialPlatformId,
  {
    id: SocialPlatformId
    label: string
    short: string
    dotClass: string
    badgeClass: string
    ringClass: string
  }
> = {
  instagram: {
    id: 'instagram',
    label: 'Instagram',
    short: 'IG',
    dotClass: 'bg-pink-500',
    badgeClass:
      'border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-900 dark:bg-pink-950/40 dark:text-pink-300',
    ringClass: 'ring-pink-400',
  },
  linkedin: {
    id: 'linkedin',
    label: 'LinkedIn',
    short: 'LI',
    dotClass: 'bg-blue-600',
    badgeClass:
      'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
    ringClass: 'ring-blue-500',
  },
  facebook: {
    id: 'facebook',
    label: 'Facebook',
    short: 'FB',
    dotClass: 'bg-indigo-700',
    badgeClass:
      'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300',
    ringClass: 'ring-indigo-500',
  },
  tiktok: {
    id: 'tiktok',
    label: 'TikTok',
    short: 'TT',
    dotClass: 'bg-neutral-900',
    badgeClass:
      'border-neutral-300 bg-neutral-100 text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-200',
    ringClass: 'ring-neutral-700',
  },
}

export const SOCIAL_PLATFORMS: SocialPlatformId[] = [
  'instagram',
  'linkedin',
  'facebook',
  'tiktok',
]

export const SOCIAL_STATUS_META: Record<
  SocialPostStatus,
  { id: SocialPostStatus; label: string; badgeClass: string }
> = {
  draft: {
    id: 'draft',
    label: 'Entwurf',
    badgeClass:
      'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300',
  },
  in_progress: {
    id: 'in_progress',
    label: 'In Bearbeitung',
    badgeClass:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  },
  review: {
    id: 'review',
    label: 'Zur Freigabe',
    badgeClass:
      'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300',
  },
  approved: {
    id: 'approved',
    label: 'Freigegeben',
    badgeClass:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  published: {
    id: 'published',
    label: 'Veröffentlicht',
    badgeClass:
      'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
  },
}

export const SOCIAL_STATUSES: SocialPostStatus[] = [
  'draft',
  'in_progress',
  'review',
  'approved',
  'published',
]

export function platformLabel(id: SocialPlatformId) {
  return SOCIAL_PLATFORM_META[id]?.label ?? id
}

export function statusLabel(id: SocialPostStatus) {
  return SOCIAL_STATUS_META[id]?.label ?? id
}

/** Returns an array of 42 Date objects representing a 6-row month grid starting on Monday */
export function buildMonthGrid(reference: Date): Date[] {
  const year = reference.getFullYear()
  const month = reference.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  // Monday = 0, Sunday = 6
  const dayOfWeek = (firstOfMonth.getDay() + 6) % 7
  const gridStart = new Date(year, month, 1 - dayOfWeek)
  const cells: Date[] = []
  for (let i = 0; i < 42; i += 1) {
    cells.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i))
  }
  return cells
}

/** Returns 7 Date objects (Mon–Sun) for the week of the reference date */
export function buildWeekDays(reference: Date): Date[] {
  const year = reference.getFullYear()
  const month = reference.getMonth()
  const date = reference.getDate()
  const dayOfWeek = (reference.getDay() + 6) % 7
  const weekStart = new Date(year, month, date - dayOfWeek)
  const days: Date[] = []
  for (let i = 0; i < 7; i += 1) {
    days.push(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i))
  }
  return days
}

export function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

const MONTH_FORMATTER = new Intl.DateTimeFormat('de-DE', {
  month: 'long',
  year: 'numeric',
})

const WEEK_TITLE_FORMATTER = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: 'short',
})

const WEEK_FULL_FORMATTER = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const TIME_FORMATTER = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
})

const FULL_DATETIME_FORMATTER = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatMonthTitle(date: Date) {
  return MONTH_FORMATTER.format(date)
}

export function formatWeekRange(days: Date[]) {
  if (days.length === 0) return ''
  const first = days[0]
  const last = days[days.length - 1]
  return `${WEEK_TITLE_FORMATTER.format(first)} – ${WEEK_FULL_FORMATTER.format(last)}`
}

export function formatTime(date: Date) {
  return TIME_FORMATTER.format(date)
}

export function formatDateTime(date: Date) {
  return FULL_DATETIME_FORMATTER.format(date)
}

/** Returns a `YYYY-MM-DDTHH:mm` string in the user's local timezone for datetime-local inputs */
export function toDateTimeLocalValue(date: Date) {
  const pad = (n: number) => `${n}`.padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`
}

/** Converts a datetime-local string ("YYYY-MM-DDTHH:mm") into an ISO string */
export function fromDateTimeLocalValue(value: string): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

export function isOverdue(post: SocialMediaPost, now: Date = new Date()) {
  if (post.status === 'published') return false
  const scheduled = new Date(post.scheduledAt)
  if (Number.isNaN(scheduled.getTime())) return false
  return scheduled.getTime() < now.getTime()
}
