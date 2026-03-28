'use client'

import { useMemo, useState } from 'react'
import { CalendarDays, Loader2, Mail, RotateCcw, ShieldAlert, Trash2, UserRound } from 'lucide-react'
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

  const activeCount = useMemo(
    () => entries.filter((entry) => entry.status === 'active').length,
    [entries]
  )
  const pendingCount = useMemo(
    () => entries.filter((entry) => entry.status === 'pending').length,
    [entries]
  )

  return (
    <div className="rounded-[30px] border border-[#e4dbcf] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
      <div className="flex flex-col gap-4 border-b border-[#ece2d5] px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#b85e34]">
            Teamübersicht
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">
            Vorhandene User und offene Einladungen
          </h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="rounded-full border border-[#d7eadf] bg-[#eff8f2] px-4 py-2 text-sm text-slate-600">
            {activeCount} aktiv
          </div>
          <div className="rounded-full border border-[#e9ddcf] bg-[#faf5ee] px-4 py-2 text-sm text-slate-600">
            {pendingCount} Einladung offen
          </div>
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
          {entries.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={5} className="px-6 py-14 text-center">
                <p className="text-lg font-semibold text-slate-900">Noch keine User vorhanden</p>
                <p className="mt-2 text-sm text-slate-500">
                  Lade Teammitglieder oder erstelle die erste Einladung.
                </p>
              </TableCell>
            </TableRow>
          ) : null}

          {entries.map((entry) => {
            const isDeleting = pendingAction?.id === entry.id && pendingAction.type === 'delete'
            const isResending = pendingAction?.id === entry.id && pendingAction.type === 'resend'
            const hasPendingInvite = entry.kind === 'invitation' && entry.status === 'pending'

            return (
              <TableRow key={`${entry.kind}-${entry.id}`} className="border-[#f1ebe2] hover:bg-[#fcfaf6]">
                <TableCell className="pl-6">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-11 w-11 border border-[#efe6d9] bg-[#f8f3ec]">
                      <AvatarFallback className="bg-[#f5efe6] text-sm font-semibold text-[#9f4f2d]">
                        {initialsForEntry(entry)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">
                        {entry.name ?? entry.email ?? 'Unbekannter User'}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        {hasPendingInvite ? (
                          <Mail className="h-4 w-4 text-slate-400" />
                        ) : (
                          <UserRound className="h-4 w-4 text-slate-400" />
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
                        ? 'border-[#edd4c6] bg-[#fff4ee] text-[#9f4f2d]'
                        : 'border-[#d7eadf] bg-[#eff8f2] text-[#166534]'
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
                        ? 'border-[#d7eadf] bg-[#eff8f2] text-[#166534]'
                        : entry.status === 'inactive'
                          ? 'border-[#e8d7d7] bg-[#fbefef] text-[#991b1b]'
                          : 'border-[#e9ddcf] bg-[#faf5ee] text-[#8a6d47]'
                    )}
                  >
                    {statusCopy(entry.status)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <CalendarDays className="h-4 w-4 text-slate-400" />
                    {formatDateTime(entry.joinedAt ?? entry.invitedAt)}
                  </div>
                </TableCell>
                <TableCell className="pr-6">
                  <div className="flex justify-end gap-2">
                    {hasPendingInvite ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full border-[#e0d6c8] bg-white hover:bg-[#faf5ee]"
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
                          className="rounded-full border-[#edd4c6] bg-white text-[#9f4f2d] hover:bg-[#fff4ee]"
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
                      <AlertDialogContent className="rounded-[28px] border-[#e7ddd1] bg-[#fffdf9]">
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
                            className="rounded-full bg-[#9f4f2d] hover:bg-[#7c3d1d]"
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
