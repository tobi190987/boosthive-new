'use client'

import { useState } from 'react'
import Image from 'next/image'
import { AlertCircle, CheckCircle2, Loader2, Mail } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface PortalBranding {
  agencyName: string
  logoUrl: string | null
  primaryColor: string
}

interface PortalLoginFormProps {
  branding: PortalBranding
}

const fieldClassName =
  'h-[48px] rounded-xl border-slate-200 dark:border-border bg-white dark:bg-card px-4 text-[15px] text-slate-900 dark:text-slate-100 shadow-sm transition placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:ring-blue-500/20 focus-visible:ring-offset-0'

export function PortalLoginForm({ branding }: PortalLoginFormProps) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/portal/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) {
        throw new Error(data.error ?? 'Fehler beim Versenden des Magic Links.')
      }
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Versenden des Magic Links.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 dark:bg-background">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo / Agency Name */}
        <div className="flex flex-col items-center gap-4 text-center">
          {branding.logoUrl ? (
            <Image
              src={branding.logoUrl}
              alt={branding.agencyName}
              width={160}
              height={48}
              className="h-12 w-auto object-contain"
            />
          ) : (
            <div
              className="flex h-12 items-center justify-center rounded-xl px-6 text-lg font-bold text-white"
              style={{ backgroundColor: branding.primaryColor }}
            >
              {branding.agencyName || 'Kundenportal'}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Willkommen im Kundenportal
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Gib deine E-Mail-Adresse ein, um einen Anmelde-Link zu erhalten.
            </p>
          </div>
        </div>

        {/* Form / Success */}
        {sent ? (
          <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center dark:border-green-800 dark:bg-green-950">
            <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-green-600 dark:text-green-400" />
            <p className="font-semibold text-slate-900 dark:text-slate-100">Überprüfe deine E-Mails</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Wir haben einen Anmelde-Link an <strong>{email}</strong> gesendet.
              Der Link ist 15 Minuten gültig.
            </p>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
            {error && (
              <Alert className="rounded-xl border-red-200 bg-red-50 text-red-700">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                E-Mail-Adresse
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="name@beispiel.de"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className={fieldClassName}
                required
              />
            </div>

            <Button
              type="submit"
              className="h-[48px] w-full rounded-xl text-white shadow-[0_4px_14px_rgba(0,0,0,0.15)] transition disabled:opacity-60"
              style={{ backgroundColor: branding.primaryColor }}
              disabled={loading || !email.trim()}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mail className="mr-2 h-4 w-4" />
              )}
              Anmelde-Link senden
            </Button>
          </form>
        )}

        <p className="text-center text-xs text-slate-400 dark:text-slate-600">
          Nur für eingeladene Kunden zugänglich.
        </p>
      </div>
    </div>
  )
}
