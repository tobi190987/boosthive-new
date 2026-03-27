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
}

function sanitizeReturnTo(url: string, fallback: string): string {
  if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) {
    return url
  }
  return fallback
}

const fieldClassName =
  'h-[48px] rounded-xl border-slate-200 bg-white px-4 text-[15px] text-slate-900 shadow-sm transition placeholder:text-slate-400 focus-visible:border-[#1dbfaa] focus-visible:ring-[#1dbfaa]/20 focus-visible:ring-offset-0'

export function LoginForm({
  action,
  returnTo,
  title,
  showForgotPasswordLink = false,
  notice,
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
        <div className="rounded-xl border border-[#d1faf4] bg-[#f0fdfb] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#0d9488]">Arbeitsbereich</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">{title}</p>
        </div>
      )}

      {error && (
        <Alert className="rounded-xl border-red-200 bg-red-50 text-red-700">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {notice && !error && (
        <Alert className="rounded-xl border-[#f1d4b7] bg-[#fff4ea] text-[#8c4a19]">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{notice}</AlertDescription>
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
          disabled={isSubmitting}
          aria-invalid={!!errors.email}
          className={fieldClassName}
          {...register('email')}
        />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="password" className="text-sm font-medium text-slate-700">
            Passwort
          </Label>
          {showForgotPasswordLink && (
            <Link href="/forgot-password" className="text-sm font-medium text-[#0d9488] underline-offset-4 hover:underline">
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
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:text-slate-700"
            onClick={() => setShowPassword((value) => !value)}
            tabIndex={-1}
            aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>

      <Button
        type="submit"
        className="h-[48px] w-full rounded-xl bg-[#1dbfaa] text-white shadow-[0_4px_14px_rgba(29,191,170,0.28)] transition hover:bg-[#18a896] disabled:opacity-60"
        disabled={isSubmitting}
      >
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Anmelden
      </Button>
    </form>
  )
}
