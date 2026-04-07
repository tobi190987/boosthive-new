'use client'

import { useState, type FormEvent } from 'react'
import { AlertCircle, LockKeyhole, Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function sanitizeReturnTo(value: string | null): string {
  if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) {
    return value
  }

  return '/'
}

interface PreviewAccessFormProps {
  returnTo?: string
}

export function PreviewAccessForm({ returnTo: rawReturnTo }: PreviewAccessFormProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const returnTo = sanitizeReturnTo(rawReturnTo ?? null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await fetch('/api/access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password, returnTo }),
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error ?? 'Zugang konnte nicht freigeschaltet werden.')
      }

      window.location.assign(payload.redirectTo ?? returnTo)
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Zugang konnte nicht freigeschaltet werden.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <Alert className="rounded-2xl border-amber-200 bg-amber-50 text-amber-800">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-2xl border border-slate-100 dark:border-border bg-slate-50 dark:bg-card px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
        Temporärer Projektschutz aktiv. Nach Freigabe gelangst du automatisch zurück auf die angeforderte Seite.
      </div>

      <div className="space-y-2">
        <Label htmlFor="preview-password" className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Zugriffspasswort
        </Label>
        <div className="relative">
          <LockKeyhole className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <Input
            id="preview-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Passwort eingeben"
            autoComplete="current-password"
            className="h-[50px] rounded-2xl border-slate-200 dark:border-border bg-white dark:bg-card pl-11 text-[15px] text-slate-900 dark:text-slate-100 shadow-sm"
            disabled={isSubmitting}
          />
        </div>
      </div>

      <Button
        type="submit"
        variant="dark"
        className="h-[50px] w-full rounded-2xl"
        disabled={isSubmitting}
      >
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Inhalte freischalten
      </Button>
    </form>
  )
}
