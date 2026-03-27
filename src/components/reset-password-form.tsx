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
  'h-[48px] rounded-xl border-slate-200 bg-white px-4 text-[15px] text-slate-900 shadow-sm transition placeholder:text-slate-400 focus-visible:border-[#1dbfaa] focus-visible:ring-[#1dbfaa]/20 focus-visible:ring-offset-0'

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
      setServerError('Der Reset-Link ist unvollständig. Bitte fordere einen neuen Link an.')
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
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-[#d1faf4] bg-[#f0fdfb] p-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1dbfaa]/20">
          <KeyRound className="h-4 w-4 text-[#0d9488]" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Neues Passwort festlegen</p>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">
            Nutze ein starkes Passwort, damit der Zugang zu deinem Workspace sofort wieder sicher ist.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {missingToken && !serverError && (
          <Alert className="rounded-xl border-red-200 bg-red-50 text-red-700">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Im Link fehlt ein gültiges Reset-Token.</AlertDescription>
          </Alert>
        )}

        {serverError && (
          <Alert className="rounded-xl border-red-200 bg-red-50 text-red-700">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        {isSuccess && (
          <Alert className="rounded-xl border-[#d1faf4] bg-[#f0fdfb] text-[#0d9488]">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              Dein Passwort wurde aktualisiert. Du kannst dich jetzt neu anmelden.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
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
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:text-slate-700"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700">
            Passwort bestätigen
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
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:text-slate-700"
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
          className="h-[48px] w-full rounded-xl bg-[#1dbfaa] text-white shadow-[0_4px_14px_rgba(29,191,170,0.28)] transition hover:bg-[#18a896] disabled:opacity-60"
          disabled={isSubmitting || isSuccess}
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Passwort zurücksetzen
        </Button>
      </form>

      <p className="text-sm text-slate-500">
        Link abgelaufen?{' '}
        <Link href="/forgot-password" className="font-medium text-[#0d9488] underline-offset-4 hover:underline">
          Neuen Reset anfordern
        </Link>
      </p>
    </div>
  )
}
