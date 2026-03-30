'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react'
import { ResetPasswordSchema, type ResetPasswordInput } from '@/lib/schemas/auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createBrowserClient } from '@/lib/supabase-browser'

interface ResetPasswordFormProps {
  action: string
  token?: string
}

const fieldClassName =
  'h-[48px] rounded-xl border-slate-200 dark:border-[#252d3a] bg-white dark:bg-[#151c28] px-4 text-[15px] text-slate-900 dark:text-slate-100 shadow-sm transition placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:ring-blue-500/20 focus-visible:ring-offset-0'

export function ResetPasswordForm({ action, token }: ResetPasswordFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [recoverySessionReady, setRecoverySessionReady] = useState(Boolean(token?.trim()))
  const [isPreparingRecoverySession, setIsPreparingRecoverySession] = useState(!token?.trim())

  const missingToken =
    !token?.trim() && !recoverySessionReady && !isPreparingRecoverySession && !serverError

  useEffect(() => {
    if (token?.trim()) {
      setRecoverySessionReady(true)
      setIsPreparingRecoverySession(false)
      return
    }

    const supabase = createBrowserClient()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        event === 'PASSWORD_RECOVERY' ||
        ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && Boolean(session))
      ) {
        setRecoverySessionReady(true)
        setIsPreparingRecoverySession(false)
      }
    })
    const searchParams = new URLSearchParams(window.location.search)
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const hashErrorDescription = hashParams.get('error_description')
    const queryErrorDescription = searchParams.get('error_description')
    const authCode = searchParams.get('code')

    if (hashErrorDescription || queryErrorDescription) {
      const raw = hashErrorDescription ?? queryErrorDescription ?? ''
      setServerError(decodeURIComponent(raw.replace(/\+/g, ' ')))
      setRecoverySessionReady(false)
      setIsPreparingRecoverySession(false)
      return
    }

    if (authCode) {
      void supabase.auth
        .exchangeCodeForSession(authCode)
        .then(({ error }) => {
          if (error) {
            setServerError('Der Recovery-Link konnte nicht bestätigt werden. Bitte fordere einen neuen Link an.')
            setRecoverySessionReady(false)
            return
          }

          setRecoverySessionReady(true)
          window.history.replaceState(null, '', window.location.pathname)
        })
        .catch(() => {
          setServerError('Der Recovery-Link konnte nicht bestätigt werden. Bitte fordere einen neuen Link an.')
          setRecoverySessionReady(false)
        })
        .finally(() => {
          setIsPreparingRecoverySession(false)
        })
      return
    }

    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')
    const flowType = hashParams.get('type')

    if (!accessToken || !refreshToken || flowType !== 'recovery') {
      void supabase.auth.getSession().then(({ data }) => {
        setRecoverySessionReady(Boolean(data.session))
        setIsPreparingRecoverySession(false)
      })
      return
    }

    void supabase.auth
      .setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      .then(({ error }) => {
        if (error) {
          setServerError('Der Recovery-Link konnte nicht bestätigt werden. Bitte fordere einen neuen Link an.')
          setRecoverySessionReady(false)
          return
        }

        setRecoverySessionReady(true)
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      })
      .catch(() => {
        setServerError('Der Recovery-Link konnte nicht bestätigt werden. Bitte fordere einen neuen Link an.')
        setRecoverySessionReady(false)
      })
      .finally(() => {
        setIsPreparingRecoverySession(false)
      })

    return () => {
      subscription.unsubscribe()
    }
  }, [token])

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
    if (!token?.trim() && !recoverySessionReady) {
      setServerError('Der Reset-Link ist unvollständig. Bitte fordere einen neuen Link an.')
      return
    }

    setServerError(null)

    try {
      if (token?.trim()) {
        const response = await fetch(action, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            password: data.password,
            confirmPassword: data.confirmPassword,
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
        return
      }

      const supabase = createBrowserClient()
      const { error } = await supabase.auth.updateUser({
        password: data.password,
      })

      if (error) {
        throw new Error(error.message || 'Das Passwort konnte nicht aktualisiert werden.')
      }

      await supabase.auth.signOut()
      setIsSuccess(true)
      window.location.assign('/login')
    } catch (submitError) {
      setServerError(
        submitError instanceof Error ? submitError.message : 'Das Passwort konnte nicht aktualisiert werden.'
      )
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600/20">
          <KeyRound className="h-4 w-4 text-blue-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Neues Passwort festlegen</p>
          <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
            Nutze ein starkes Passwort, damit der Zugang zu deinem Workspace sofort wieder sicher ist.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {isPreparingRecoverySession && (
          <Alert className="rounded-xl border-blue-200 bg-blue-50 text-blue-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertDescription>Recovery-Link wird geprüft, einen Moment bitte.</AlertDescription>
          </Alert>
        )}

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
          <Alert className="rounded-xl border-blue-200 bg-blue-50 text-blue-600">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              Dein Passwort wurde aktualisiert. Du kannst dich jetzt neu anmelden.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium text-slate-700 dark:text-slate-300">
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
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 dark:text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700 dark:text-slate-300">
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
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 dark:text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300"
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
          className="h-[48px] w-full rounded-xl bg-blue-600 text-white shadow-[0_4px_14px_rgba(37,99,235,0.25)] transition hover:bg-blue-700 disabled:opacity-60"
          disabled={isSubmitting || isSuccess || isPreparingRecoverySession}
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Passwort zurücksetzen
        </Button>
      </form>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        Link abgelaufen?{' '}
        <Link href="/forgot-password" className="font-medium text-blue-600 underline-offset-4 hover:underline">
          Neuen Reset anfordern
        </Link>
      </p>
    </div>
  )
}
