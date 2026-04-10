'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { InviteDialog, type InvitationDraft } from '@/components/invite-dialog'
import { TeamMemberTable, type TeamMemberRecord } from '@/components/team-member-table'
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
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4 text-sm text-orange-800 shadow-sm dark:border-orange-900/70 dark:bg-orange-950/30 dark:text-orange-300">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex min-h-48 items-center justify-center rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
          <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            Teamübersicht wird geladen...
          </div>
        </div>
      ) : (
        <TeamMemberTable
          entries={entries}
          summary={summary}
          tenantSlug={tenantSlug}
          pendingAction={pendingAction}
          onResend={handleResend}
          onDelete={handleDelete}
          headerActions={
            <>
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
            </>
          }
        />
      )}
    </div>
  )
}
