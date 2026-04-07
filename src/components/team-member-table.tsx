'use client'

import { useMemo, useState } from 'react'
import { CalendarDays, Loader2, Mail, RotateCcw, Search, ShieldAlert, Trash2, UserRound } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

export interface TeamMemberRecord {
  id: string
  kind: 'member' | 'invitation'
  userId: string | null
  email: string | null
  name: string | null
  role: 'admin' | 'member'
  status: 'active' | 'inactive' | 'pending'
  invitedAt: string | null
  joinedAt: string | null
}

interface TeamMemberTableProps {
  entries: TeamMemberRecord[]
  pendingAction?: {
    id: string
    type: 'delete' | 'resend'
  } | null
  onResend: (id: string) => Promise<void> | void
  onDelete: (entry: TeamMemberRecord) => Promise<void> | void
}

function statusCopy(status: TeamMemberRecord['status']) {
  switch (status) {
    case 'active':
      return 'Aktiv'
    case 'inactive':
      return 'Inaktiv'
    default:
      return 'Einladung offen'
  }
}

function roleCopy(role: TeamMemberRecord['role']) {
  return role === 'admin' ? 'Admin' : 'User'
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Noch nicht verfügbar'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function initialsForEntry(entry: TeamMemberRecord) {
  const source = entry.name ?? entry.email ?? 'BH'
  const parts = source
    .split(/[\s@._-]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)

  if (parts.length === 0) {
    return 'BH'
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('')
}

export function TeamMemberTable({
  entries,
  pendingAction,
  onResend,
  onDelete,
}: TeamMemberTableProps) {
  const [entryToDelete, setEntryToDelete] = useState<TeamMemberRecord | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | TeamMemberRecord['status']>('all')
  const [kindFilter, setKindFilter] = useState<'all' | TeamMemberRecord['kind']>('all')

  const activeCount = useMemo(
    () => entries.filter((entry) => entry.status === 'active').length,
    [entries]
  )
  const pendingCount = useMemo(
    () => entries.filter((entry) => entry.status === 'pending').length,
    [entries]
  )
  const adminCount = useMemo(
    () => entries.filter((entry) => entry.role === 'admin' && entry.status === 'active').length,
    [entries]
  )
  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return entries.filter((entry) => {
      const matchesQuery =
        !query ||
        entry.name?.toLowerCase().includes(query) ||
        entry.email?.toLowerCase().includes(query)
      const matchesStatus = statusFilter === 'all' || entry.status === statusFilter
      const matchesKind = kindFilter === 'all' || entry.kind === kindFilter

      return matchesQuery && matchesStatus && matchesKind
    })
  }, [entries, kindFilter, searchQuery, statusFilter])
  const hasActiveFilters =
    searchQuery.trim().length > 0 || statusFilter !== 'all' || kindFilter !== 'all'

  return (
    <div className="rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
      <div className="flex flex-col gap-4 border-b border-slate-100 dark:border-border px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-600">
            Teamübersicht
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">
            Mitglieder und Einladungen
          </h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="rounded-full border border-[#d7eadf] bg-[#eff8f2] px-4 py-2 text-sm text-slate-600 dark:text-slate-300">
            {activeCount} aktiv
          </div>
          <div className="rounded-full border border-slate-100 dark:border-border bg-slate-50 dark:bg-card px-4 py-2 text-sm text-slate-600 dark:text-slate-300">
            {pendingCount} Einladung offen
          </div>
          <div className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-slate-600 dark:text-slate-300">
            {adminCount} Admin
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 dark:border-border lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Nach Name oder E-Mail suchen"
            className="h-11 rounded-xl border-slate-200 bg-slate-50 pl-10 dark:border-border dark:bg-card"
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Select value={kindFilter} onValueChange={(value) => setKindFilter(value as 'all' | TeamMemberRecord['kind'])}>
            <SelectTrigger className="w-full rounded-xl sm:w-[180px]">
              <SelectValue placeholder="Typ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Einträge</SelectItem>
              <SelectItem value="member">Mitglieder</SelectItem>
              <SelectItem value="invitation">Einladungen</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | TeamMemberRecord['status'])}>
            <SelectTrigger className="w-full rounded-xl sm:w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              <SelectItem value="active">Aktiv</SelectItem>
              <SelectItem value="pending">Einladung offen</SelectItem>
              <SelectItem value="inactive">Inaktiv</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => {
                setSearchQuery('')
                setStatusFilter('all')
                setKindFilter('all')
              }}
            >
              Filter zurücksetzen
            </Button>
          )}
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-6">User</TableHead>
            <TableHead>Rolle</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Seit</TableHead>
            <TableHead className="pr-6 text-right">Aktionen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredEntries.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={5} className="px-6 py-14 text-center">
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {hasActiveFilters ? 'Keine passenden Einträge' : 'Noch kein Team vorhanden'}
                </p>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {hasActiveFilters
                    ? 'Passe Suche oder Filter an, um andere Mitglieder oder Einladungen zu sehen.'
                    : 'Lade dein erstes Teammitglied ein, um gemeinsam im Workspace zu arbeiten.'}
                </p>
              </TableCell>
            </TableRow>
          ) : null}

          {filteredEntries.map((entry) => {
            const isDeleting = pendingAction?.id === entry.id && pendingAction.type === 'delete'
            const isResending = pendingAction?.id === entry.id && pendingAction.type === 'resend'
            const hasPendingInvite = entry.kind === 'invitation' && entry.status === 'pending'

            return (
              <TableRow key={`${entry.kind}-${entry.id}`} className="border-slate-100 dark:border-border hover:bg-slate-50 dark:hover:bg-[#1e2635]">
                <TableCell className="pl-6">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-11 w-11 border border-slate-100 dark:border-border bg-slate-100 dark:bg-secondary">
                      <AvatarFallback className="bg-blue-50 text-sm font-semibold text-blue-600">
                        {initialsForEntry(entry)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                        {entry.name ?? entry.email ?? 'Unbekannter User'}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                        {hasPendingInvite ? (
                          <Mail className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                        ) : (
                          <UserRound className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                        )}
                        <span className="truncate">{entry.email ?? entry.userId ?? entry.id}</span>
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-semibold',
                      entry.role === 'admin'
                        ? 'border-amber-200 bg-amber-50 text-blue-600 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300'
                        : 'border-[#d7eadf] bg-[#eff8f2] text-[#166534] dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300'
                    )}
                  >
                    {roleCopy(entry.role)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-semibold',
                      entry.status === 'active'
                        ? 'border-[#d7eadf] bg-[#eff8f2] text-[#166534] dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : entry.status === 'inactive'
                          ? 'border-[#e8d7d7] bg-[#fbefef] text-[#991b1b] dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300'
                          : 'border-slate-100 dark:border-border bg-slate-50 dark:bg-card text-slate-600 dark:text-slate-300'
                    )}
                  >
                    {statusCopy(entry.status)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <CalendarDays className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                    {formatDateTime(entry.joinedAt ?? entry.invitedAt)}
                  </div>
                </TableCell>
                <TableCell className="pr-6">
                  <div className="flex justify-end gap-2">
                    {hasPendingInvite ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full border-slate-200 dark:border-border bg-white dark:bg-card hover:bg-slate-50 dark:hover:bg-[#1e2635]"
                        disabled={Boolean(pendingAction)}
                        onClick={() => onResend(entry.id)}
                      >
                        {isResending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RotateCcw className="h-4 w-4" />
                        )}
                        Erneut senden
                      </Button>
                    ) : null}

                    <AlertDialog
                      open={entryToDelete?.id === entry.id}
                      onOpenChange={(open) => {
                        if (!open && entryToDelete?.id === entry.id) {
                          setEntryToDelete(null)
                        }
                      }}
                    >
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full border-amber-200 bg-white dark:bg-card text-blue-600 hover:bg-amber-50"
                          disabled={Boolean(pendingAction)}
                          onClick={() => setEntryToDelete(entry)}
                        >
                          {isDeleting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : hasPendingInvite ? (
                            <ShieldAlert className="h-4 w-4" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          {hasPendingInvite ? 'Einladung löschen' : 'User löschen'}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-2xl border-slate-100 dark:border-border bg-slate-50 dark:bg-card">
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {hasPendingInvite ? 'Einladung wirklich löschen?' : 'User wirklich löschen?'}
                          </AlertDialogTitle>
                          <AlertDialogDescription className="leading-6">
                            {hasPendingInvite
                              ? `${entry.email ?? 'Diese Einladung'} wird widerrufen und verschwindet aus der Teamübersicht.`
                              : `${entry.email ?? 'Dieser User'} wird aus dem Team entfernt. Falls der Account sonst nirgends mehr genutzt wird, wird er zusätzlich aus Auth gelöscht.`}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-full">Abbrechen</AlertDialogCancel>
                          <AlertDialogAction
                            className="rounded-full bg-blue-600 hover:bg-blue-700"
                            onClick={async () => {
                              await onDelete(entry)
                              setEntryToDelete(null)
                            }}
                          >
                            {hasPendingInvite ? 'Einladung löschen' : 'User löschen'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
