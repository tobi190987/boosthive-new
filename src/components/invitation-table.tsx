'use client'

import { useMemo } from 'react'
import { CalendarDays, Mail, RotateCcw, ShieldAlert, Trash2, UserRoundPlus } from 'lucide-react'
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

export interface InvitationRecord {
  id: string
  email: string
  role: 'admin' | 'member'
  status: 'pending' | 'accepted' | 'revoked'
  invitedAt: string
  name?: string
}

interface InvitationTableProps {
  invitations: InvitationRecord[]
  onResend: (id: string) => void
  onRevoke: (id: string) => void
}

function statusCopy(status: InvitationRecord['status']) {
  switch (status) {
    case 'accepted':
      return 'Angenommen'
    case 'revoked':
      return 'Widerrufen'
    default:
      return 'Ausstehend'
  }
}

function roleCopy(role: InvitationRecord['role']) {
  return role === 'admin' ? 'Admin' : 'Member'
}

export function InvitationTable({ invitations, onResend, onRevoke }: InvitationTableProps) {
  const pendingCount = useMemo(
    () => invitations.filter((invitation) => invitation.status === 'pending').length,
    [invitations]
  )

  return (
    <div className="rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
      <div className="flex flex-col gap-4 border-b border-slate-100 dark:border-border px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-600">
            Einladungsstatus
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">Ausstehende und versendete Einladungen</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="rounded-full border border-slate-100 dark:border-border bg-slate-50 dark:bg-secondary/80 px-4 py-2 text-sm text-slate-600 dark:text-slate-300">
            {pendingCount} offen
          </div>
          <div className="rounded-full border border-[#d7eadf] bg-[#eff8f2] px-4 py-2 text-sm text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300">
            {invitations.filter((invitation) => invitation.status === 'accepted').length} angenommen
          </div>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-6">Person</TableHead>
            <TableHead>Rolle</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Einladung</TableHead>
            <TableHead className="pr-6 text-right">Aktionen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invitations.map((invitation) => {
            const isPending = invitation.status === 'pending'

            return (
              <TableRow key={invitation.id} className="border-slate-100 dark:border-border hover:bg-slate-50 dark:hover:bg-[#1e2635]">
                <TableCell className="pl-6">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-blue-50 p-2 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                      {invitation.status === 'accepted' ? (
                        <UserRoundPlus className="h-4 w-4" />
                      ) : invitation.status === 'revoked' ? (
                        <ShieldAlert className="h-4 w-4" />
                      ) : (
                        <Mail className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {invitation.name ?? invitation.email.split('@')[0]}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{invitation.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-semibold',
                      invitation.role === 'admin'
                        ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300'
                        : 'border-[#d7eadf] bg-[#eff8f2] text-[#166534] dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300'
                    )}
                  >
                    {roleCopy(invitation.role)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-semibold',
                      invitation.status === 'accepted'
                        ? 'border-[#d7eadf] bg-[#eff8f2] text-[#166534] dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : invitation.status === 'revoked'
                          ? 'border-[#e8d7d7] bg-[#fbefef] text-[#991b1b] dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300'
                          : 'border-slate-100 dark:border-border bg-slate-50 dark:bg-secondary/80 text-slate-600 dark:text-slate-300'
                    )}
                  >
                    {statusCopy(invitation.status)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <CalendarDays className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                    {invitation.invitedAt}
                  </div>
                </TableCell>
                <TableCell className="pr-6">
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full border-slate-200 dark:border-border bg-white dark:bg-card hover:bg-slate-50 dark:hover:bg-[#1e2635]"
                      disabled={!isPending}
                      onClick={() => onResend(invitation.id)}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Erneut senden
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full border-red-200 bg-white text-red-700 hover:bg-red-50 dark:border-red-900/70 dark:bg-card dark:text-red-300 dark:hover:bg-red-950/30"
                      disabled={!isPending}
                      onClick={() => onRevoke(invitation.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Widerrufen
                    </Button>
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
