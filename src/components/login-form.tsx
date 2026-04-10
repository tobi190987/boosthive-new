'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { LoginSchema, type LoginInput } from '@/lib/schemas/auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface LoginFormProps {
  action: string
  returnTo: string
  title?: string
  showForgotPasswordLink?: boolean
  notice?: string
  submitLabel?: string
}

function sanitizeReturnTo(url: string, fallback: string): string {
  if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) {
    return url
  }
  return fallback
}

const fieldClassName =
  'h-[48px] rounded-xl border-slate-200 dark:border-border bg-white dark:bg-card px-4 text-[15px] text-slate-900 dark:text-slate-100 shadow-sm transition placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:ring-blue-500/20 focus-visible:ring-offset-0'

export function LoginForm({
  action,
  returnTo,
  title,
  showForgotPasswordLink = false,
  notice,
  submitLabel = 'Anmelden',
}: LoginFormProps) {
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  async function onSubmit(data: LoginInput) {
    setError(null)

    try {
      const response = await fetch(action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const result = (await response.json().catch(() => null)) as { error?: string } | null

      if (!response.ok) {
        throw new Error(result?.error ?? 'Die Anmeldung ist fehlgeschlagen.')
      }

      window.location.assign(sanitizeReturnTo(returnTo, '/dashboard'))
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Die Anmeldung ist fehlgeschlagen.')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {title && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
        </div>
      )}

      {error && (
        <Alert className="rounded-xl border-red-200 bg-red-50 text-red-700">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {notice && !error && (
        <Alert className="rounded-xl border-amber-200 bg-amber-50 text-amber-800">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="email" className="text-sm font-medium text-slate-700 dark:text-slate-300">
          E-Mail
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="name@beispiel.de"
          autoComplete="email"
          disabled={isSubmitting}
          aria-invalid={!!errors.email}
          className={fieldClassName}
          {...register('email')}
        />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="password" className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Passwort
          </Label>
          {showForgotPasswordLink && (
            <Link href="/forgot-password" tabIndex={-1} className="text-sm font-medium text-blue-600 underline-offset-4 hover:underline">
              Passwort vergessen?
            </Link>
          )}
        </div>

        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Passwort eingeben"
            autoComplete="current-password"
            disabled={isSubmitting}
            aria-invalid={!!errors.password}
            className={`${fieldClassName} pr-12`}
            {...register('password')}
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 dark:text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>

      <Button
        type="submit"
        className="h-[48px] w-full rounded-xl bg-slate-900 text-white shadow-[0_4px_14px_rgba(0,0,0,0.15)] transition hover:bg-slate-800 disabled:opacity-60"
        disabled={isSubmitting}
      >
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  )
}
