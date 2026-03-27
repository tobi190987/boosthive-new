'use client'

import { type FormEvent, useState } from 'react'
import { MailPlus } from 'lucide-react'
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
}

export function InviteDialog({ onInvite }: InviteDialogProps) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')

  function resetForm() {
    setEmail('')
    setRole('member')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!email.trim()) {
      return
    }

    try {
      await onInvite({
        email: email.trim(),
        role,
      })

      resetForm()
      setOpen(false)
    } catch {
      // Fehler werden in der aufrufenden Workspace-Komponente angezeigt.
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-full bg-[#1f2937] px-5 text-white hover:bg-[#111827]">
          <MailPlus className="h-4 w-4" />
          Member einladen
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-[28px] border-[#e0d6c8] bg-[#fffdf9] p-0 sm:max-w-[560px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="space-y-3 border-b border-[#ece2d5] px-6 py-6 text-left">
            <DialogTitle className="text-2xl font-semibold text-slate-950">
              Neue Einladung vorbereiten
            </DialogTitle>
            <DialogDescription className="text-sm leading-6 text-slate-600">
              Lege Rolle und Zieladresse fest. Der Backend-Flow aus `PROJ-7` verschickt spaeter den
              echten Token-Link.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 px-6 py-6">
            <div className="space-y-2">
              <Label htmlFor="invite-email" className="text-sm font-medium text-slate-700">
                E-Mail-Adresse
              </Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="teammitglied@agentur.de"
                className="h-[52px] rounded-[18px] border-[#d5c8b7] bg-[#fcfaf6]"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-role" className="text-sm font-medium text-slate-700">
                Rolle
              </Label>
              <Select value={role} onValueChange={(value: 'admin' | 'member') => setRole(value)}>
                <SelectTrigger
                  id="invite-role"
                  className="h-[52px] rounded-[18px] border-[#d5c8b7] bg-[#fcfaf6]"
                >
                  <SelectValue placeholder="Rolle waehlen" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-[#ddd3c5]">
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="border-t border-[#ece2d5] px-6 py-5 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              className="rounded-full text-slate-500 hover:bg-[#f5efe6] hover:text-slate-900"
              onClick={() => {
                resetForm()
                setOpen(false)
              }}
            >
              Abbrechen
            </Button>
            <Button type="submit" className="rounded-full bg-[#b85e34] px-5 text-white hover:bg-[#9f4f2d]">
              Einladung vormerken
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
