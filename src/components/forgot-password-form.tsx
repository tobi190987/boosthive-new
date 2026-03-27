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
  'h-[52px] rounded-[18px] border-[#d5c8b7] bg-[#fcfaf6] px-4 text-[15px] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition placeholder:text-slate-400 focus-visible:border-[#b7673f] focus-visible:ring-[#b7673f]/25 focus-visible:ring-offset-0'

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
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[22px] border border-[#eadfce] bg-[#fbf6ef] p-4">
          <MailCheck className="h-5 w-5 text-[#b85e34]" />
          <p className="mt-3 text-sm font-semibold text-slate-900">Kein Account-Leak</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Die Rueckmeldung bleibt neutral, egal ob die Adresse existiert oder nicht.
          </p>
        </div>
        <div className="rounded-[22px] border border-[#e1e7df] bg-[#f3f8f3] p-4">
          <ShieldCheck className="h-5 w-5 text-[#157f68]" />
          <p className="mt-3 text-sm font-semibold text-slate-900">Tenant-gebunden</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Der Ablauf bleibt am richtigen Workspace und fuehrt nicht aus dem Flow heraus.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {serverError && (
          <Alert className="rounded-[20px] border-[#efc6b6] bg-[#fff0ea] text-[#8c3215]">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        {isSuccess && (
          <Alert className="rounded-[20px] border-[#cfe7d7] bg-[#effaf2] text-[#14532d]">
            <AlertDescription>{GENERIC_SUCCESS}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2.5">
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
          className="h-[52px] w-full rounded-[18px] bg-[#1f2937] text-white shadow-[0_18px_36px_rgba(31,41,55,0.18)] hover:bg-[#111827]"
          disabled={isSubmitting || isSuccess}
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Reset-Link anfordern
        </Button>
      </form>

      <p className="text-sm text-slate-500">
        Zurueck zum Login?{' '}
        <Link href="/login" className="font-medium text-[#9c4f2c] underline-offset-4 hover:underline">
          Jetzt anmelden
        </Link>
      </p>
    </div>
  )
}
