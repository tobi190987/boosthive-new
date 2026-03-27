'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, MailCheck, ShieldCheck } from 'lucide-react'
import { ForgotPasswordSchema, type ForgotPasswordInput } from '@/lib/schemas/auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const GENERIC_SUCCESS =
  'Wenn ein passendes Konto in diesem Tenant existiert, wurde eine E-Mail mit weiteren Schritten versendet.'

const fieldClassName =
  'h-[48px] rounded-xl border-slate-200 bg-white px-4 text-[15px] text-slate-900 shadow-sm transition placeholder:text-slate-400 focus-visible:border-[#1dbfaa] focus-visible:ring-[#1dbfaa]/20 focus-visible:ring-offset-0'

interface ForgotPasswordFormProps {
  action: string
}

export function ForgotPasswordForm({ action }: ForgotPasswordFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  })

  async function onSubmit(data: ForgotPasswordInput) {
    setServerError(null)

    try {
      const response = await fetch(action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const payload = (await response.json().catch(() => null)) as { error?: string } | null

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Der Reset-Link konnte nicht angefordert werden.')
      }

      setIsSuccess(true)
    } catch (submitError) {
      setServerError(
        submitError instanceof Error ? submitError.message : 'Der Reset-Link konnte nicht angefordert werden.'
      )
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[#d1faf4] bg-[#f0fdfb] p-4">
          <MailCheck className="h-4 w-4 text-[#0d9488]" />
          <p className="mt-2.5 text-sm font-semibold text-slate-900">Kein Account-Leak</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Die Rückmeldung bleibt neutral, egal ob die Adresse existiert oder nicht.
          </p>
        </div>
        <div className="rounded-xl border border-[#d1faf4] bg-[#f0fdfb] p-4">
          <ShieldCheck className="h-4 w-4 text-[#0d9488]" />
          <p className="mt-2.5 text-sm font-semibold text-slate-900">Tenant-gebunden</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Der Ablauf bleibt am richtigen Workspace und führt nicht aus dem Flow heraus.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {serverError && (
          <Alert className="rounded-xl border-red-200 bg-red-50 text-red-700">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        {isSuccess && (
          <Alert className="rounded-xl border-[#d1faf4] bg-[#f0fdfb] text-[#0d9488]">
            <AlertDescription>{GENERIC_SUCCESS}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium text-slate-700">
            E-Mail
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="name@beispiel.de"
            autoComplete="email"
            disabled={isSubmitting || isSuccess}
            aria-invalid={!!errors.email}
            className={fieldClassName}
            {...register('email')}
          />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>

        <Button
          type="submit"
          className="h-[48px] w-full rounded-xl bg-[#1dbfaa] text-white shadow-[0_4px_14px_rgba(29,191,170,0.28)] transition hover:bg-[#18a896] disabled:opacity-60"
          disabled={isSubmitting || isSuccess}
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Reset-Link anfordern
        </Button>
      </form>

      <p className="text-sm text-slate-500">
        Zurück zum Login?{' '}
        <Link href="/login" className="font-medium text-[#0d9488] underline-offset-4 hover:underline">
          Jetzt anmelden
        </Link>
      </p>
    </div>
  )
}
