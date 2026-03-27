'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react'
import { ResetPasswordSchema, type ResetPasswordInput } from '@/lib/schemas/auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ResetPasswordFormProps {
  action: string
  token?: string
}

const fieldClassName =
  'h-[52px] rounded-[18px] border-[#d5c8b7] bg-[#fcfaf6] px-4 text-[15px] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition placeholder:text-slate-400 focus-visible:border-[#b7673f] focus-visible:ring-[#b7673f]/25 focus-visible:ring-offset-0'

export function ResetPasswordForm({ action, token }: ResetPasswordFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const missingToken = !token?.trim()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  })

  async function onSubmit(data: ResetPasswordInput) {
    if (missingToken) {
      setServerError('Der Reset-Link ist unvollstaendig. Bitte fordere einen neuen Link an.')
      return
    }

    setServerError(null)

    try {
      const response = await fetch(action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password: data.password,
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; redirectTo?: string }
        | null

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Das Passwort konnte nicht aktualisiert werden.')
      }

      setIsSuccess(true)
      window.location.assign(
        typeof payload?.redirectTo === 'string' && payload.redirectTo.startsWith('/')
          ? payload.redirectTo
          : '/dashboard'
      )
    } catch (submitError) {
      setServerError(
        submitError instanceof Error ? submitError.message : 'Das Passwort konnte nicht aktualisiert werden.'
      )
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[24px] border border-[#eadfce] bg-[#f8f0e4] p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-white/70 p-2.5 ring-1 ring-[#dccfbf]">
            <KeyRound className="h-5 w-5 text-[#b85e34]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Neues Passwort festlegen</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Nutze ein starkes Passwort, damit der Zugang zu deinem Workspace sofort wieder sicher ist.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {missingToken && !serverError && (
          <Alert className="rounded-[20px] border-[#efc6b6] bg-[#fff0ea] text-[#8c3215]">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Im Link fehlt ein gueltiges Reset-Token.</AlertDescription>
          </Alert>
        )}

        {serverError && (
          <Alert className="rounded-[20px] border-[#efc6b6] bg-[#fff0ea] text-[#8c3215]">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        {isSuccess && (
          <Alert className="rounded-[20px] border-[#cfe7d7] bg-[#effaf2] text-[#14532d]">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              Dein Passwort wurde aktualisiert. Du kannst dich jetzt neu anmelden.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2.5">
          <Label htmlFor="password" className="text-sm font-medium text-slate-700">
            Neues Passwort
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Mindestens 8 Zeichen"
              autoComplete="new-password"
              disabled={isSubmitting || isSuccess}
              aria-invalid={!!errors.password}
              className={`${fieldClassName} pr-12`}
              {...register('password')}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:text-slate-900"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        </div>

        <div className="space-y-2.5">
          <Label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700">
            Passwort bestaetigen
          </Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Passwort wiederholen"
              autoComplete="new-password"
              disabled={isSubmitting || isSuccess}
              aria-invalid={!!errors.confirmPassword}
              className={`${fieldClassName} pr-12`}
              {...register('confirmPassword')}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:text-slate-900"
              onClick={() => setShowConfirmPassword((value) => !value)}
              aria-label={showConfirmPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
        </div>

        <Button
          type="submit"
          className="h-[52px] w-full rounded-[18px] bg-[#1f2937] text-white shadow-[0_18px_36px_rgba(31,41,55,0.18)] hover:bg-[#111827]"
          disabled={isSubmitting || isSuccess}
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Passwort zuruecksetzen
        </Button>
      </form>

      <p className="text-sm text-slate-500">
        Link abgelaufen?{' '}
        <Link href="/forgot-password" className="font-medium text-[#9c4f2c] underline-offset-4 hover:underline">
          Neuen Reset anfordern
        </Link>
      </p>
    </div>
  )
}
