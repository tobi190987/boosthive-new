'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Phone,
  Users,
  Mail,
  StickyNote,
  CheckSquare,
  Pencil,
  Trash2,
  Plus,
  CalendarClock,
  Search,
} from 'lucide-react'
import { CrmLogActivityDialog, type ActivityType, type ActivityFormData } from './crm-log-activity-dialog'

interface Activity {
  id: string
  activity_type: ActivityType
  description: string
  activity_date: string
  follow_up_date?: string | null
  created_by: string
  created_by_name?: string | null
  created_at: string
  updated_at: string
}

interface CrmActivityTimelineProps {
  customerId: string
}

const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  call: 'Anruf',
  meeting: 'Meeting',
  email: 'E-Mail',
  note: 'Notiz',
  task: 'Aufgabe',
}

const ACTIVITY_TYPE_ICON: Record<ActivityType, typeof Phone> = {
  call: Phone,
  meeting: Users,
  email: Mail,
  note: StickyNote,
  task: CheckSquare,
}

const ACTIVITY_TYPE_COLOR: Record<ActivityType, string> = {
  call: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  meeting: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400',
  email: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  note: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  task: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',
}

const PAGE_SIZE = 50

function formatDate(iso: string, includeTime = true): string {
  const date = new Date(iso)
  const datePart = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  if (!includeTime) return datePart
  const hasTime = date.getUTCHours() !== 0 || date.getUTCMinutes() !== 0
  if (!hasTime) return `${datePart}, keine Uhrzeit`
  const timePart = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  return `${datePart}, ${timePart} Uhr`
}

export function CrmActivityTimeline({ customerId }: CrmActivityTimelineProps) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)
  const [deletingActivity, setDeletingActivity] = useState<Activity | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | ActivityType>('all')
  const [page, setPage] = useState(1)

  const loadActivities = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (typeFilter !== 'all') params.set('type', typeFilter)
      const res = await fetch(`/api/tenant/customers/${customerId}/activities?${params}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Fehler beim Laden der Aktivitäten')
      }
      const data = await res.json()
      setActivities(data.activities || [])
      setTotal(data.total ?? 0)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten.')
      setActivities([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [customerId, page, typeFilter])

  useEffect(() => {
    loadActivities()
  }, [loadActivities])

  // Text search is client-side within the current page
  const filtered = activities.filter((act) =>
    !searchQuery.trim() ||
    act.description.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const paged = filtered

  const handleSave = useCallback(
    async (formData: ActivityFormData) => {
      const isEdit = !!editingActivity
      const url = isEdit
        ? `/api/tenant/customers/${customerId}/activities/${editingActivity!.id}`
        : `/api/tenant/customers/${customerId}/activities`
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Fehler beim Speichern')
      }
      toast.success(isEdit ? 'Aktivität aktualisiert.' : 'Aktivität geloggt.')
      setDialogOpen(false)
      setEditingActivity(null)
      await loadActivities()
    },
    [customerId, editingActivity, loadActivities]
  )

  const handleDelete = useCallback(async () => {
    if (!deletingActivity) return
    setDeleting(true)
    try {
      const res = await fetch(
        `/api/tenant/customers/${customerId}/activities/${deletingActivity.id}`,
        { method: 'DELETE' }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Fehler beim Löschen')
      }
      toast.success('Aktivität gelöscht.')
      setDeletingActivity(null)
      await loadActivities()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten.')
    } finally {
      setDeleting(false)
    }
  }, [customerId, deletingActivity, loadActivities])

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Aktivitäten durchsuchen..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setPage(1)
                }}
                className="pl-10"
              />
            </div>
            <Select
              value={typeFilter}
              onValueChange={(value) => {
                setPage(1)
                setTypeFilter(value as typeof typeFilter)
              }}
            >
              <SelectTrigger className="sm:w-[160px]">
                <SelectValue placeholder="Typ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Typen</SelectItem>
                <SelectItem value="call">Anruf</SelectItem>
                <SelectItem value="meeting">Meeting</SelectItem>
                <SelectItem value="email">E-Mail</SelectItem>
                <SelectItem value="note">Notiz</SelectItem>
                <SelectItem value="task">Aufgabe</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => {
              setEditingActivity(null)
              setDialogOpen(true)
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Neue Aktivität
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-20 w-full bg-slate-200 dark:bg-slate-800 rounded animate-pulse"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center dark:border-border dark:bg-card">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white dark:bg-secondary">
              <StickyNote className="h-5 w-5 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
              {activities.length === 0
                ? 'Noch keine Aktivitäten geloggt'
                : 'Keine passenden Aktivitäten'}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
              {activities.length === 0
                ? 'Logge Anrufe, Meetings, E-Mails, Notizen oder Aufgaben, damit dein Team den Kontaktverlauf kennt.'
                : 'Passe Suche oder Typfilter an, um andere Aktivitäten zu sehen.'}
            </p>
          </div>
        ) : (
          <>
            <ol className="relative space-y-4 border-l border-slate-200 pl-6 dark:border-slate-800">
              {paged.map((act) => {
                const Icon = ACTIVITY_TYPE_ICON[act.activity_type]
                const isFollowUpDue =
                  act.follow_up_date &&
                  new Date(act.follow_up_date) <= new Date()
                return (
                  <li key={act.id} className="relative">
                    <span
                      className={`absolute -left-[29px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white dark:ring-background ${ACTIVITY_TYPE_COLOR[act.activity_type]}`}
                    >
                      <Icon className="h-3 w-3" />
                    </span>
                    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-border dark:bg-card">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className={ACTIVITY_TYPE_COLOR[act.activity_type]}
                          >
                            {ACTIVITY_TYPE_LABEL[act.activity_type]}
                          </Badge>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {formatDate(act.activity_date)}
                          </span>
                          {act.created_by_name && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              · {act.created_by_name}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingActivity(act)
                              setDialogOpen(true)
                            }}
                            aria-label="Aktivität bearbeiten"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingActivity(act)}
                            aria-label="Aktivität löschen"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
                        {act.description}
                      </p>
                      {act.follow_up_date && (
                        <div
                          className={`mt-3 flex items-center gap-2 text-xs ${isFollowUpDue ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}
                        >
                          <CalendarClock className="w-3.5 h-3.5" />
                          Follow-up: {formatDate(act.follow_up_date, false)}
                          {isFollowUpDue && (
                            <Badge
                              variant="outline"
                              className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                            >
                              fällig
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2 text-sm text-slate-500 dark:text-slate-400">
                <span>
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} von{' '}
                  {total}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Zurück
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    disabled={page === totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Weiter
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        <CrmLogActivityDialog
          open={dialogOpen}
          onOpenChange={(next) => {
            setDialogOpen(next)
            if (!next) setEditingActivity(null)
          }}
          activity={editingActivity}
          onSave={handleSave}
        />

        <AlertDialog
          open={!!deletingActivity}
          onOpenChange={(next) => {
            if (!next) setDeletingActivity(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Aktivität löschen</AlertDialogTitle>
              <AlertDialogDescription>
                Diese Aktivität wird unwiderruflich gelöscht. Möchtest du fortfahren?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Löschen...' : 'Löschen'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}
