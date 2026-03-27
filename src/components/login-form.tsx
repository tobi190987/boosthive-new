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
}

function sanitizeReturnTo(url: string, fallback: string): string {
  if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) {
    return url
  }
  return fallback
}

const fieldClassName =
  'h-[52px] rounded-[18px] border-[#d5c8b7] bg-[#fcfaf6] px-4 text-[15px] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition placeholder:text-slate-400 focus-visible:border-[#b7673f] focus-visible:ring-[#b7673f]/25 focus-visible:ring-offset-0'

export function LoginForm({ action, returnTo, title, showForgotPasswordLink = false }: LoginFormProps) {
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {title && (
        <div className="rounded-[24px] border border-[#eadfce] bg-[#f8f0e4] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8a6d47]">Arbeitsbereich</p>
          <p className="mt-1 text-base font-semibold text-slate-900">{title}</p>
        </div>
      )}

      {error && (
        <Alert className="rounded-[20px] border-[#efc6b6] bg-[#fff0ea] text-[#8c3215]">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
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
          disabled={isSubmitting}
          aria-invalid={!!errors.email}
          className={fieldClassName}
          {...register('email')}
        />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="password" className="text-sm font-medium text-slate-700">
            Passwort
          </Label>
          {showForgotPasswordLink && (
            <Link href="/forgot-password" className="text-sm font-medium text-[#9c4f2c] underline-offset-4 hover:underline">
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
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:text-slate-900"
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
        className="h-[52px] w-full rounded-[18px] bg-[#1f2937] text-white shadow-[0_18px_36px_rgba(31,41,55,0.18)] hover:bg-[#111827]"
        disabled={isSubmitting}
      >
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Anmelden
      </Button>
    </form>
  )
}
