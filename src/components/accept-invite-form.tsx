'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Eye, EyeOff, Loader2, ShieldCheck, UserRoundPlus } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AcceptInvitationFormSchema,
  type AcceptInvitationFormInput,
  type AcceptInvitationInput,
} from '@/lib/schemas/invitations'

interface AcceptInviteFormProps {
  token?: string
  fallbackTenantName: string
  minimal?: boolean
}

interface InvitationValidationState {
  valid: boolean
  tenantName?: string | null
  email?: string | null
  role?: 'admin' | 'member'
  reason?: 'invalid' | 'expired' | 'revoked' | 'accepted'
}

const fieldClassName =
  'h-[52px] rounded-xl border-slate-200 dark:border-[#252d3a] bg-slate-50 dark:bg-[#151c28] px-4 text-[15px] shadow-soft transition placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:ring-blue-500/25 focus-visible:ring-offset-0'

export function AcceptInviteForm({ token, fallbackTenantName, minimal = false }: AcceptInviteFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isValidating, setIsValidating] = useState(true)
  const [validation, setValidation] = useState<InvitationValidationState | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AcceptInvitationFormInput>({
    resolver: zodResolver(AcceptInvitationFormSchema),
    defaultValues: {
      password: '',
    },
  })

  useEffect(() => {
    let isActive = true

    async function validateInvitation() {
      if (!token) {
        setValidation({ valid: false, reason: 'invalid', tenantName: fallbackTenantName })
        setIsValidating(false)
        return
      }

      try {
        setIsValidating(true)
        setServerError(null)

        const response = await fetch(`/api/invitations/validate?token=${encodeURIComponent(token)}`, {
          credentials: 'include',
        })
        const payload = await response.json().catch(() => ({}))

        if (!isActive) return

        setValidation(payload)
      } catch {
        if (!isActive) return
        setValidation({ valid: false, reason: 'invalid', tenantName: fallbackTenantName })
      } finally {
        if (isActive) {
          setIsValidating(false)
        }
      }
    }

    void validateInvitation()

    return () => {
      isActive = false
    }
  }, [fallbackTenantName, token])

  const submitInvitation = handleSubmit(onSubmit)

  async function onSubmit(data: AcceptInvitationFormInput) {
    if (!token || !validation?.valid) {
      setServerError('Diese Einladung ist unvollständig oder bereits abgelaufen.')
      return
    }

    setServerError(null)
    try {
      const response = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ...data,
          token,
        } satisfies AcceptInvitationInput),
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        setServerError(payload.error ?? 'Einladung konnte nicht angenommen werden.')
        return
      }

      setIsSuccess(true)
      window.location.assign(payload.redirectTo ?? '/dashboard')
    } catch {
      setServerError('Einladung konnte gerade nicht verarbeitet werden. Bitte versuche es erneut.')
    }
  }

  if (isSuccess) {
    return (
      <div className="space-y-6">
        <Alert className="rounded-2xl border-[#d7eadf] bg-[#eff8f2] text-[#166534] dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            Deine Einladung für {validation?.tenantName ?? fallbackTenantName} wurde angenommen.
            Du wirst direkt in den Workspace weitergeleitet.
          </AlertDescription>
        </Alert>

        <Link href="/login" className="inline-flex font-medium text-slate-500 dark:text-slate-400 underline-offset-4 hover:underline">
          Zur Login-Seite
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {!minimal && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[22px] border border-slate-100 dark:border-[#252d3a] bg-slate-50 dark:bg-[#151c28] p-4">
            <UserRoundPlus className="h-5 w-5 text-blue-600" />
            <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Onboarding direkt im Link</p>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Das Passwort wird direkt beim ersten Einstieg gesetzt.
            </p>
          </div>
          <div className="rounded-[22px] border border-[#d7eadf] bg-[#eff8f2] p-4 dark:border-emerald-900/70 dark:bg-emerald-950/30">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Token-basierter Einstieg</p>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Die Annahme-Seite bleibt öffentlich, ohne vorherigen Login.
            </p>
          </div>
        </div>
      )}

      {isValidating && (
        <Alert className="rounded-2xl border-slate-100 dark:border-[#252d3a] bg-slate-50 dark:bg-[#151c28] text-slate-700 dark:text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertDescription>Einladung wird geprüft...</AlertDescription>
        </Alert>
      )}

      {!isValidating && !validation?.valid && (
        <Alert className="rounded-2xl border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900/70 dark:bg-orange-950/30 dark:text-orange-300">
          <AlertDescription>
            {validation?.reason === 'expired'
              ? 'Diese Einladung ist abgelaufen. Bitte fordere bei einem Admin einen neuen Link an.'
              : validation?.reason === 'revoked'
                ? 'Diese Einladung wurde widerrufen. Bitte melde dich bei deinem Admin.'
                : validation?.reason === 'accepted'
                  ? 'Diese Einladung wurde bereits angenommen. Bitte melde dich normal an.'
                  : 'Einladung fehlt oder ist unvollständig. Bitte fordere einen neuen Link an.'}
          </AlertDescription>
        </Alert>
      )}

      {validation?.valid && (
        <Alert className="rounded-2xl border-[#d7eadf] bg-[#eff8f2] text-[#166534] dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300">
          <AlertDescription>
            Einladung für {validation.email} zu {validation.tenantName ?? fallbackTenantName} als{' '}
            {validation.role === 'admin' ? 'Admin' : 'Member'}.
          </AlertDescription>
        </Alert>
      )}

      {serverError && (
        <Alert className="rounded-2xl border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900/70 dark:bg-orange-950/30 dark:text-orange-300">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submitInvitation()
        }}
        className="space-y-5"
      >
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Passwort
          </label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Mindestens 8 Zeichen"
              className={`${fieldClassName} pr-12`}
              disabled={isSubmitting}
              {...register('password')}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 dark:text-slate-500 transition hover:text-slate-900 dark:hover:text-slate-100"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        </div>

        <Button
          type="submit"
          className="h-[52px] w-full rounded-xl bg-[#1f2937] text-white hover:bg-[#111827]"
          onClick={() => {
            void submitInvitation()
          }}
          disabled={isSubmitting || isValidating}
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Einladung annehmen
        </Button>
      </form>
    </div>
  )
}
