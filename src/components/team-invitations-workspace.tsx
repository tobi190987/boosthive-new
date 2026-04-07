'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Loader2, MailPlus, RefreshCw, ShieldCheck } from 'lucide-react'
import { InviteDialog, type InvitationDraft } from '@/components/invite-dialog'
import { TeamMemberTable, type TeamMemberRecord } from '@/components/team-member-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface TeamInvitationsWorkspaceProps {
  tenantSlug: string
}

function formatDateTime(value: string | null) {
  if (!value) {
    return null
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function normalizeEntry(entry: TeamMemberRecord): TeamMemberRecord {
  return {
    ...entry,
    invitedAt: formatDateTime(entry.invitedAt),
    joinedAt: formatDateTime(entry.joinedAt),
  }
}

export function TeamInvitationsWorkspace({ tenantSlug }: TeamInvitationsWorkspaceProps) {
  const [entries, setEntries] = useState<TeamMemberRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activity, setActivity] = useState('Lade Teammitglieder und offene Einladungen direkt aus der API.')
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<{
    id: string
    type: 'delete' | 'resend'
  } | null>(null)

  const loadEntries = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch('/api/tenant/members', {
        method: 'GET',
        credentials: 'include',
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error ?? 'Teamübersicht konnte nicht geladen werden.')
      }

      setEntries(
        Array.isArray(payload.entries)
          ? payload.entries.map(normalizeEntry)
          : []
      )
      setActivity('Teamstatus aktualisiert.')
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Teamübersicht konnte nicht geladen werden.'
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadEntries()
  }, [loadEntries])

  const summary = useMemo(() => {
    const members = entries.filter((entry) => entry.kind === 'member').length
    const pendingInvites = entries.filter((entry) => entry.kind === 'invitation' && entry.status === 'pending').length
    const admins = entries.filter((entry) => entry.role === 'admin' && entry.status === 'active').length

    return { members, pendingInvites, admins }
  }, [entries])

  async function handleInvite(draft: InvitationDraft) {
    setError(null)

    const response = await fetch('/api/tenant/invitations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(draft),
    })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      const message = payload.error ?? 'Einladung konnte nicht erstellt werden.'
      setError(message)
      throw new Error(message)
    }

    if (payload.invitation) {
      const newEntry = normalizeEntry({
        id: payload.invitation.id,
        kind: 'invitation',
        userId: null,
        email: payload.invitation.email,
        name: payload.invitation.name ?? null,
        role: payload.invitation.role,
        status: 'pending',
        invitedAt: payload.invitation.invitedAt,
        joinedAt: null,
      } satisfies TeamMemberRecord)

      setEntries((current) => {
        const filtered = current.filter(
          (entry) =>
            !(
              entry.kind === 'invitation' &&
              entry.email?.toLowerCase() === newEntry.email?.toLowerCase()
            )
        )
        return [newEntry, ...filtered]
      })
    }

    setActivity(
      `Einladung an ${draft.email} als ${draft.role === 'admin' ? 'Admin' : 'User'} wurde versendet.`
    )
  }

  async function handleResend(id: string) {
    setError(null)
    setPendingAction({ id, type: 'resend' })

    try {
      const response = await fetch(`/api/tenant/invitations/${id}/resend`, {
        method: 'POST',
        credentials: 'include',
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        setError(payload.error ?? 'Einladung konnte nicht erneut versendet werden.')
        return
      }

      if (payload.invitation) {
        const nextEntry = normalizeEntry({
          id: payload.invitation.id,
          kind: 'invitation',
          userId: null,
          email: payload.invitation.email,
          name: payload.invitation.name ?? null,
          role: payload.invitation.role,
          status: 'pending',
          invitedAt: payload.invitation.invitedAt,
          joinedAt: null,
        } satisfies TeamMemberRecord)

        setEntries((current) =>
          current.map((entry) => (entry.id === id ? nextEntry : entry))
        )
        setActivity(`Einladung an ${payload.invitation.email} wurde erneut versendet.`)
      }
    } finally {
      setPendingAction(null)
    }
  }

  async function handleDelete(entry: TeamMemberRecord) {
    setError(null)
    setPendingAction({ id: entry.id, type: 'delete' })

    try {
      const endpoint =
        entry.kind === 'invitation'
          ? `/api/tenant/invitations/${entry.id}`
          : `/api/tenant/members/${entry.id}`

      const fallbackError =
        entry.kind === 'invitation'
          ? 'Einladung konnte nicht gelöscht werden.'
          : 'User konnte nicht gelöscht werden.'

      const response = await fetch(endpoint, {
        method: 'DELETE',
        credentials: 'include',
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        setError(payload.error ?? fallbackError)
        return
      }

      setEntries((current) => current.filter((currentEntry) => currentEntry.id !== entry.id))
      setActivity(
        entry.kind === 'invitation'
          ? `Einladung an ${entry.email ?? 'den User'} wurde gelöscht.`
          : `${entry.email ?? entry.name ?? 'Der User'} wurde aus dem Team entfernt.`
      )
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-soft dark:border-border dark:bg-card">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white hover:bg-slate-900">
                Team
              </Badge>
              <Badge variant="outline" className="rounded-full text-xs">
                {tenantSlug}
              </Badge>
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">
                Team verwalten
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Mitglieder einladen, offene Einladungen nachfassen und Zugänge direkt verwalten.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => void loadEntries()}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Aktualisieren
            </Button>
            <InviteDialog
              onInvite={handleInvite}
              triggerLabel="Einladung senden"
              triggerClassName="px-5"
            />
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 dark:border-border dark:bg-secondary">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
              Mitglieder
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">{summary.members}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 dark:border-border dark:bg-secondary">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
              Offene Einladungen
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">{summary.pendingInvites}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 dark:border-border dark:bg-secondary">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
              Admins
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">{summary.admins}</p>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4 text-sm text-orange-800 shadow-sm dark:border-orange-900/70 dark:bg-orange-950/30 dark:text-orange-300">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-slate-100 dark:border-border bg-slate-50 dark:bg-card px-5 py-4 text-sm text-slate-600 dark:text-slate-300 shadow-sm">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <p>{activity}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex min-h-48 items-center justify-center rounded-[2rem] border border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
          <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            Teamübersicht wird geladen...
          </div>
        </div>
      ) : (
        <TeamMemberTable
          entries={entries}
          pendingAction={pendingAction}
          onResend={handleResend}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
