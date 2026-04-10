'use client'

import { type FormEvent, useId, useState } from 'react'
import { Loader2, MailPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface InvitationDraft {
  email: string
  role: 'admin' | 'member'
}

interface InviteDialogProps {
  onInvite: (draft: InvitationDraft) => Promise<void> | void
  triggerLabel?: string
  triggerClassName?: string
}

export function InviteDialog({
  onInvite,
  triggerLabel = 'Member einladen',
  triggerClassName,
}: InviteDialogProps) {
  const [open, setOpen] = useState(false)
  const contentId = useId()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function resetForm() {
    setEmail('')
    setRole('member')
    setError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!email.trim()) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      await onInvite({
        email: email.trim(),
        role,
      })

      resetForm()
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="dark" className={triggerClassName ?? 'px-5'}>
          <MailPlus className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent id={contentId} className="rounded-2xl border-slate-200 dark:border-border bg-slate-50 dark:bg-card p-0 sm:max-w-[560px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="space-y-3 border-b border-slate-100 dark:border-border px-6 py-6 text-left">
            <DialogTitle className="text-2xl font-semibold text-slate-950 dark:text-slate-50">
              Mitglied einladen
            </DialogTitle>
            <DialogDescription className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              Gib E-Mail-Adresse und Rolle an. Das Mitglied erhält eine Einladungsmail mit einem
              Aktivierungslink.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="mx-6 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="space-y-5 px-6 py-6">
            <div className="space-y-2">
              <Label htmlFor="invite-email" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                E-Mail-Adresse
              </Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="teammitglied@agentur.de"
                className="h-[52px] rounded-xl border-slate-200 dark:border-border bg-slate-50 dark:bg-card"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-role" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Rolle
              </Label>
              <Select value={role} onValueChange={(value: 'admin' | 'member') => setRole(value)}>
                <SelectTrigger
                  id="invite-role"
                  className="h-[52px] rounded-xl border-slate-200 dark:border-border bg-slate-50 dark:bg-card"
                >
                  <SelectValue placeholder="Rolle wählen" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-slate-200 dark:border-border">
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="border-t border-slate-100 dark:border-border px-6 py-5 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              className="rounded-full text-slate-500 dark:text-slate-400 hover:bg-blue-50 hover:text-slate-900 dark:hover:bg-blue-950/30 dark:hover:text-slate-100"
              onClick={() => {
                resetForm()
                setOpen(false)
              }}
            >
              Abbrechen
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="rounded-full bg-slate-900 px-5 text-white hover:bg-slate-800"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Einladung versenden
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
