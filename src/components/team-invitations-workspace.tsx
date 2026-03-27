'use client'

import { useEffect, useState } from 'react'
import { BellRing, CheckCircle2, Loader2, ShieldCheck, Sparkles } from 'lucide-react'
import { InviteDialog, type InvitationDraft } from '@/components/invite-dialog'
import { InvitationTable, type InvitationRecord } from '@/components/invitation-table'
import { Badge } from '@/components/ui/badge'

interface TeamInvitationsWorkspaceProps {
  tenantSlug: string
}

function formatInvitationDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function normalizeInvitation(invitation: InvitationRecord): InvitationRecord {
  return {
    ...invitation,
    invitedAt: formatInvitationDate(invitation.invitedAt),
  }
}

export function TeamInvitationsWorkspace({ tenantSlug }: TeamInvitationsWorkspaceProps) {
  const [invitations, setInvitations] = useState<InvitationRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activity, setActivity] = useState(
    'Lade Einladungen und Status direkt aus der API.'
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isActive = true

    async function loadInvitations() {
      try {
        setIsLoading(true)
        setError(null)

        const response = await fetch('/api/tenant/invitations', {
          method: 'GET',
          credentials: 'include',
        })
        const payload = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(payload.error ?? 'Einladungen konnten nicht geladen werden.')
        }

        if (!isActive) return

        setInvitations(
          Array.isArray(payload.invitations)
            ? payload.invitations.map(normalizeInvitation)
            : []
        )
        setActivity('Echte API-Anbindung aktiv: Einladungsliste und Status stammen aus dem Backend.')
      } catch (loadError) {
        if (!isActive) return
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Einladungen konnten nicht geladen werden.'
        )
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    void loadInvitations()

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
      setInvitations((current) => [normalizeInvitation(payload.invitation), ...current])
    }

    setActivity(
      `Einladung an ${draft.email} als ${draft.role === 'admin' ? 'Admin' : 'Member'} wurde versendet.`
    )
  }

  async function handleResend(id: string) {
    setError(null)

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
      setInvitations((current) =>
        current.map((entry) =>
          entry.id === id ? normalizeInvitation(payload.invitation) : entry
        )
      )
      setActivity(`Einladung an ${payload.invitation.email} wurde erneut versendet.`)
    }
  }

  async function handleRevoke(id: string) {
    const invitation = invitations.find((entry) => entry.id === id)
    if (!invitation) return

    setError(null)

    const response = await fetch(`/api/tenant/invitations/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      setError(payload.error ?? 'Einladung konnte nicht widerrufen werden.')
      return
    }

    setInvitations((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, status: 'revoked' } : entry))
    )
    setActivity(`Einladung an ${invitation.email} wurde widerrufen.`)
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
                Einladungen fuer {tenantSlug} steuern
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                Admins sehen offene Einladungen, koennen neue Teammitglieder vormerken und die
                zukuenftigen Aktionen fuers Resending oder Widerrufen direkt ansteuern.
              </p>
            </div>
          </div>

          <InviteDialog onInvite={handleInvite} />
        </div>

        <div className="relative mt-8 grid gap-4 lg:grid-cols-3">
          <div className="rounded-[26px] border border-white/70 bg-white/75 p-5 backdrop-blur-sm">
            <Sparkles className="h-5 w-5 text-[#b85e34]" />
            <p className="mt-3 text-sm font-semibold text-slate-900">Rolle beim Einladen setzen</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Dialog fuer E-Mail + Rolle ist bereits fertig und auf den Admin-Flow zugeschnitten.
            </p>
          </div>
          <div className="rounded-[26px] border border-white/70 bg-white/75 p-5 backdrop-blur-sm">
            <ShieldCheck className="h-5 w-5 text-[#157f68]" />
            <p className="mt-3 text-sm font-semibold text-slate-900">Status pro Einladung sichtbar</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Pending, angenommen und widerrufen sind visuell klar getrennt und sofort scanbar.
            </p>
          </div>
          <div className="rounded-[26px] border border-white/70 bg-white/75 p-5 backdrop-blur-sm">
            <BellRing className="h-5 w-5 text-[#1f2937]" />
            <p className="mt-3 text-sm font-semibold text-slate-900">Echte API-Anbindung aktiv</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Neue Einladungen, Resend und Widerruf laufen jetzt direkt ueber Tenant-APIs.
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
            Einladungen werden geladen...
          </div>
        </div>
      ) : (
        <InvitationTable
          invitations={invitations}
          onResend={handleResend}
          onRevoke={handleRevoke}
        />
      )}
    </div>
  )
}
