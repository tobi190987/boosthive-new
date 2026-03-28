'use client'

import { useEffect, useState } from 'react'
import { BellRing, CheckCircle2, Loader2, ShieldCheck, Sparkles } from 'lucide-react'
import { InviteDialog, type InvitationDraft } from '@/components/invite-dialog'
import { TeamMemberTable, type TeamMemberRecord } from '@/components/team-member-table'
import { Badge } from '@/components/ui/badge'

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

  useEffect(() => {
    let isActive = true

    async function loadEntries() {
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

        if (!isActive) return

        setEntries(
          Array.isArray(payload.entries)
            ? payload.entries.map(normalizeEntry)
            : []
        )
        setActivity('Echte API-Anbindung aktiv: Mitglieder und offene Einladungen stammen direkt aus dem Backend.')
      } catch (loadError) {
        if (!isActive) return
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Teamübersicht konnte nicht geladen werden.'
        )
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    void loadEntries()

    return () => {
      isActive = false
    }
  }, [])

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
      <section className="relative overflow-hidden rounded-[34px] border border-[#d9d1c6] bg-[linear-gradient(135deg,#fffaf2_0%,#f5efe6_55%,#eef6ef_100%)] p-6 shadow-[0_24px_80px_rgba(89,71,42,0.08)] sm:p-8">
        <div className="absolute right-[-3rem] top-[-3rem] h-40 w-40 rounded-full bg-[#eb6f3d]/12 blur-3xl" />
        <div className="absolute bottom-[-4rem] left-[-2rem] h-44 w-44 rounded-full bg-[#157f68]/10 blur-3xl" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <Badge className="w-fit rounded-full bg-[#1f2937] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-white hover:bg-[#1f2937]">
              Team Access
            </Badge>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#b85e34]">
                Settings / Team
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Teammitglieder für {tenantSlug} verwalten
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                Admins sehen vorhandene User und offene Einladungen in einer gemeinsamen Liste,
                können User entfernen und Einladungen direkt erneut versenden oder löschen.
              </p>
            </div>
          </div>

          <InviteDialog onInvite={handleInvite} />
        </div>

        <div className="relative mt-8 grid gap-4 lg:grid-cols-3">
          <div className="rounded-[26px] border border-white/70 bg-white/75 p-5 backdrop-blur-sm">
            <Sparkles className="h-5 w-5 text-[#b85e34]" />
            <p className="mt-3 text-sm font-semibold text-slate-900">User und Einladungen zusammen</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Die Teamseite zeigt jetzt vorhandene Mitglieder und offene Einladungen in einer Sicht.
            </p>
          </div>
          <div className="rounded-[26px] border border-white/70 bg-white/75 p-5 backdrop-blur-sm">
            <ShieldCheck className="h-5 w-5 text-[#157f68]" />
            <p className="mt-3 text-sm font-semibold text-slate-900">Status direkt erkennbar</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Aktiv und Einladung offen sind klar getrennt und sofort scanbar.
            </p>
          </div>
          <div className="rounded-[26px] border border-white/70 bg-white/75 p-5 backdrop-blur-sm">
            <BellRing className="h-5 w-5 text-[#1f2937]" />
            <p className="mt-3 text-sm font-semibold text-slate-900">Aktionen direkt aus der Übersicht</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Neue Einladungen, Resend und Löschen laufen direkt über Tenant-APIs.
            </p>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-[24px] border border-[#efc6b6] bg-[#fff0ea] px-5 py-4 text-sm text-[#8c3215] shadow-sm">
          {error}
        </div>
      )}

      <div className="rounded-[24px] border border-[#dfd5c8] bg-[#fffdf9] px-5 py-4 text-sm text-slate-600 shadow-sm">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#157f68]" />
          <p>{activity}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex min-h-48 items-center justify-center rounded-[30px] border border-[#e4dbcf] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin text-[#b85e34]" />
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
