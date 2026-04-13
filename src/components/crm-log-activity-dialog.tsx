'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertCircle } from 'lucide-react'

export type ActivityType = 'call' | 'meeting' | 'email' | 'note' | 'task'

export interface ActivityFormData {
  activity_type: ActivityType
  description: string
  activity_date: string
  follow_up_date: string | null
}

interface ActivityLike {
  id: string
  activity_type: ActivityType
  description: string
  activity_date: string
  follow_up_date?: string | null
}

interface CrmLogActivityDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  activity: ActivityLike | null
  onSave: (data: ActivityFormData) => Promise<void>
}

function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function CrmLogActivityDialog({
  open,
  onOpenChange,
  activity,
  onSave,
}: CrmLogActivityDialogProps) {
  const [activityType, setActivityType] = useState<ActivityType>('call')
  const [description, setDescription] = useState('')
  const [activityDate, setActivityDate] = useState('')
  const [hasTime, setHasTime] = useState(true)
  const [followUpDate, setFollowUpDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (activity) {
      setActivityType(activity.activity_type)
      setDescription(activity.description)
      setActivityDate(toDateTimeLocal(activity.activity_date))
      setHasTime(true)
      setFollowUpDate(toDateInput(activity.follow_up_date))
    } else {
      setActivityType('call')
      setDescription('')
      const now = new Date()
      const pad = (n: number) => n.toString().padStart(2, '0')
      setActivityDate(
        `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
      )
      setHasTime(true)
      setFollowUpDate('')
    }
  }, [activity, open])

  const followUpIsPast =
    followUpDate && new Date(followUpDate) < new Date(new Date().setHours(0, 0, 0, 0))

  const handleSubmit = async () => {
    if (!description.trim()) {
      toast.error('Bitte gib eine Beschreibung ein.')
      return
    }
    if (!activityDate) {
      toast.error('Bitte gib ein Datum an.')
      return
    }

    setSaving(true)
    try {
      // If user disabled time, strip time component (set to midnight)
      let isoDate: string
      if (hasTime) {
        isoDate = new Date(activityDate).toISOString()
      } else {
        const datePart = activityDate.split('T')[0]
        isoDate = new Date(`${datePart}T00:00:00Z`).toISOString()
      }

      await onSave({
        activity_type: activityType,
        description: description.trim(),
        activity_date: isoDate,
        follow_up_date: followUpDate || null,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{activity ? 'Aktivität bearbeiten' : 'Neue Aktivität loggen'}</DialogTitle>
          <DialogDescription>
            Halte fest, was mit diesem Kunden besprochen oder erledigt wurde.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="activity_type">Typ</Label>
            <Select
              value={activityType}
              onValueChange={(value) => setActivityType(value as ActivityType)}
            >
              <SelectTrigger id="activity_type" disabled={saving}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="call">Anruf</SelectItem>
                <SelectItem value="meeting">Meeting</SelectItem>
                <SelectItem value="email">E-Mail</SelectItem>
                <SelectItem value="note">Notiz</SelectItem>
                <SelectItem value="task">Aufgabe</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">
              Beschreibung <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Worum ging es?"
              rows={4}
              disabled={saving}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="activity_date">
                Datum / Uhrzeit <span className="text-destructive">*</span>
              </Label>
              <Input
                id="activity_date"
                type={hasTime ? 'datetime-local' : 'date'}
                value={hasTime ? activityDate : activityDate.split('T')[0]}
                onChange={(e) => {
                  const val = e.target.value
                  setActivityDate(hasTime ? val : `${val}T00:00`)
                }}
                disabled={saving}
              />
              <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={!hasTime}
                  onChange={(e) => setHasTime(!e.target.checked)}
                  disabled={saving}
                  className="rounded border-slate-300"
                />
                Keine Uhrzeit angeben
              </label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="follow_up_date">Follow-up (optional)</Label>
              <Input
                id="follow_up_date"
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                disabled={saving}
              />
              {followUpIsPast && (
                <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Datum liegt in der Vergangenheit
                </p>
              )}
            </div>
          </div>
        </div>
        <DialogFooter className="pt-2 gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !description.trim()}>
            {saving ? 'Speichern...' : activity ? 'Aktualisieren' : 'Aktivität loggen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
