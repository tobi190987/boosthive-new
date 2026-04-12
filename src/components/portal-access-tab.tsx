'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Mail, UserPlus, XCircle } from 'lucide-react'

interface PortalUser {
  id: string
  email: string
  name: string | null
  is_active: boolean
  invited_at: string
  last_login: string | null
}

interface PortalVisibility {
  show_ga4: boolean
  show_ads: boolean
  show_seo: boolean
  show_reports: boolean
}

const DEFAULT_VISIBILITY: PortalVisibility = {
  show_ga4: true,
  show_ads: true,
  show_seo: true,
  show_reports: true,
}

interface PortalAccessTabProps {
  customerId: string
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function PortalAccessTab({ customerId }: PortalAccessTabProps) {
  const [users, setUsers] = useState<PortalUser[]>([])
  const [visibility, setVisibility] = useState<PortalVisibility>(DEFAULT_VISIBILITY)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingVisibility, setLoadingVisibility] = useState(true)
  const [savingVisibility, setSavingVisibility] = useState(false)
  const [deactivating, setDeactivating] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviting, setInviting] = useState(false)

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true)
    try {
      const res = await fetch(`/api/tenant/portal/users?customerId=${customerId}`)
      if (!res.ok) throw new Error()
      const data = await res.json() as { users: PortalUser[] }
      setUsers(data.users ?? [])
    } catch {
      toast.error('Portal-Zugänge konnten nicht geladen werden.')
    } finally {
      setLoadingUsers(false)
    }
  }, [customerId])

  const loadVisibility = useCallback(async () => {
    setLoadingVisibility(true)
    try {
      const res = await fetch(`/api/tenant/portal/visibility/${customerId}`)
      if (!res.ok) throw new Error()
      const data = await res.json() as { visibility: PortalVisibility }
      setVisibility(data.visibility ?? DEFAULT_VISIBILITY)
    } catch {
      // Use defaults silently
    } finally {
      setLoadingVisibility(false)
    }
  }, [customerId])

  useEffect(() => {
    void loadUsers()
    void loadVisibility()
  }, [loadUsers, loadVisibility])

  async function handleInvite() {
    if (!inviteEmail.trim()) return
    setInviting(true)
    try {
      const res = await fetch('/api/tenant/portal/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, email: inviteEmail.trim(), name: inviteName.trim() || null }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? 'Einladung fehlgeschlagen.')
      }
      toast.success(`Einladung an ${inviteEmail} versendet.`)
      setInviteOpen(false)
      setInviteEmail('')
      setInviteName('')
      await loadUsers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Einladung fehlgeschlagen.')
    } finally {
      setInviting(false)
    }
  }

  async function handleDeactivate(userId: string) {
    setDeactivating(userId)
    try {
      const res = await fetch(`/api/tenant/portal/users/${userId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Zugang wurde deaktiviert.')
      await loadUsers()
    } catch {
      toast.error('Zugang konnte nicht deaktiviert werden.')
    } finally {
      setDeactivating(null)
    }
  }

  async function handleVisibilityChange(key: keyof PortalVisibility, value: boolean) {
    const next = { ...visibility, [key]: value }
    setVisibility(next)
    setSavingVisibility(true)
    try {
      const res = await fetch(`/api/tenant/portal/visibility/${customerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      if (!res.ok) throw new Error()
    } catch {
      setVisibility(visibility)
      toast.error('Sichtbarkeit konnte nicht gespeichert werden.')
    } finally {
      setSavingVisibility(false)
    }
  }

  return (
    <div className="space-y-6 pt-4">
      {/* Portal Users */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Portal-Zugänge</CardTitle>
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Einladen
          </Button>
        </CardHeader>
        <CardContent>
          {loadingUsers ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-slate-500">
              <Mail className="h-8 w-8 opacity-40" />
              <p className="text-sm">Noch keine Portal-Zugänge angelegt.</p>
              <p className="text-xs">Lade deinen Kunden mit einem Klick auf „Einladen" ein.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-Mail</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Eingeladen am</TableHead>
                  <TableHead>Letzter Login</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.email}</TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-400">{u.name ?? '—'}</TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-400">{formatDate(u.invited_at)}</TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-400">{formatDate(u.last_login)}</TableCell>
                    <TableCell>
                      <Badge variant={u.is_active ? 'default' : 'secondary'}>
                        {u.is_active ? 'Aktiv' : 'Deaktiviert'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {u.is_active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                          disabled={deactivating === u.id}
                          onClick={() => void handleDeactivate(u.id)}
                        >
                          {deactivating === u.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <XCircle className="h-4 w-4" />
                          )}
                          <span className="ml-1.5">Deaktivieren</span>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Visibility Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sichtbarkeit im Portal</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingVisibility ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : (
            <div className="space-y-4">
              {[
                { key: 'show_ga4' as const, label: 'GA4-Metriken (Traffic)', desc: 'Sessions, Nutzer, Seitenaufrufe' },
                { key: 'show_ads' as const, label: 'Ads-Daten (Spend & ROAS)', desc: 'Google Ads, Meta Ads, TikTok' },
                { key: 'show_seo' as const, label: 'SEO-Rankings', desc: 'Top-Keywords aus Google Search Console' },
                { key: 'show_reports' as const, label: 'Reports & Exporte', desc: 'Freigegebene PDF-Reports' },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{label}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{desc}</p>
                  </div>
                  <Switch
                    checked={visibility[key]}
                    onCheckedChange={(v) => void handleVisibilityChange(key, v)}
                    disabled={savingVisibility}
                    aria-label={label}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Portal-Zugang einladen</DialogTitle>
            <DialogDescription>
              Der Kunde erhält eine E-Mail mit einem Magic-Link zum Portal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="invite-email">E-Mail-Adresse *</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="kunde@beispiel.de"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={inviting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-name">Name (optional)</Label>
              <Input
                id="invite-name"
                placeholder="Max Mustermann"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                disabled={inviting}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={inviting}>
              Abbrechen
            </Button>
            <Button onClick={() => void handleInvite()} disabled={inviting || !inviteEmail.trim()}>
              {inviting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Einladung senden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
