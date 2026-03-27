'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Eye, EyeOff, Loader2, ShieldCheck, UserRoundPlus } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AcceptInvitationSchema,
  type AcceptInvitationInput,
} from '@/lib/schemas/invitations'

interface AcceptInviteFormProps {
  token?: string
  fallbackTenantName: string
}

interface InvitationValidationState {
  valid: boolean
  tenantName?: string | null
  email?: string | null
  role?: 'admin' | 'member'
  reason?: 'invalid' | 'expired' | 'revoked' | 'accepted'
}

const fieldClassName =
  'h-[52px] rounded-[18px] border-[#d5c8b7] bg-[#fcfaf6] px-4 text-[15px] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition placeholder:text-slate-400 focus-visible:border-[#b7673f] focus-visible:ring-[#b7673f]/25 focus-visible:ring-offset-0'

export function AcceptInviteForm({ token, fallbackTenantName }: AcceptInviteFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isValidating, setIsValidating] = useState(true)
  const [validation, setValidation] = useState<InvitationValidationState | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AcceptInvitationInput>({
    resolver: zodResolver(AcceptInvitationSchema),
    defaultValues: {
      name: '',
      password: '',
      confirmPassword: '',
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

  async function onSubmit(data: AcceptInvitationInput) {
    if (!token || !validation?.valid) {
      setServerError('Diese Einladung ist unvollständig oder bereits abgelaufen.')
      return
    }

    setServerError(null)

    const response = await fetch('/api/invitations/accept', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        ...data,
        token,
      }),
    })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      setServerError(payload.error ?? 'Einladung konnte nicht angenommen werden.')
      return
    }

    setIsSuccess(true)
    router.push(payload.redirectTo ?? '/dashboard')
  }

  if (isSuccess) {
    return (
      <div className="space-y-6">
        <Alert className="rounded-[24px] border-[#d7eadf] bg-[#eff8f2] text-[#166534]">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            Deine Einladung für {validation?.tenantName ?? fallbackTenantName} wurde angenommen.
            Du wirst direkt in den Workspace weitergeleitet.
          </AlertDescription>
        </Alert>

        <Link href="/login" className="inline-flex font-medium text-[#9c4f2c] underline-offset-4 hover:underline">
          Zur Login-Seite
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[22px] border border-[#eadfce] bg-[#fbf6ef] p-4">
          <UserRoundPlus className="h-5 w-5 text-[#b85e34]" />
          <p className="mt-3 text-sm font-semibold text-slate-900">Onboarding direkt im Link</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Anzeigename und Passwort lassen sich in einem Schritt setzen.
          </p>
        </div>
        <div className="rounded-[22px] border border-[#d7eadf] bg-[#eff8f2] p-4">
          <ShieldCheck className="h-5 w-5 text-[#157f68]" />
          <p className="mt-3 text-sm font-semibold text-slate-900">Token-basierter Einstieg</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Die Annahme-Seite bleibt öffentlich, ohne vorherigen Login.
          </p>
        </div>
      </div>

      {isValidating && (
        <Alert className="rounded-[24px] border-[#eadfce] bg-[#fbf6ef] text-slate-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertDescription>Einladung wird geprüft...</AlertDescription>
        </Alert>
      )}

      {!isValidating && !validation?.valid && (
        <Alert className="rounded-[24px] border-[#efc6b6] bg-[#fff0ea] text-[#8c3215]">
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
        <Alert className="rounded-[24px] border-[#d7eadf] bg-[#eff8f2] text-[#166534]">
          <AlertDescription>
            Einladung für {validation.email} zu {validation.tenantName ?? fallbackTenantName} als{' '}
            {validation.role === 'admin' ? 'Admin' : 'Member'}.
          </AlertDescription>
        </Alert>
      )}

      {serverError && (
        <Alert className="rounded-[24px] border-[#efc6b6] bg-[#fff0ea] text-[#8c3215]">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-sm font-medium text-slate-700">
            Anzeigename
          </Label>
          <Input
            id="name"
            placeholder="Max Muster"
            className={fieldClassName}
            disabled={isSubmitting}
            {...register('name')}
          />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium text-slate-700">
            Passwort
          </Label>
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
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:text-slate-900"
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
              className={`${fieldClassName} pr-12`}
              disabled={isSubmitting}
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
          {errors.confirmPassword && (
            <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
          )}
        </div>

        <Button
          type="submit"
          className="h-[52px] w-full rounded-[18px] bg-[#1f2937] text-white hover:bg-[#111827]"
          disabled={isSubmitting || isValidating || !validation?.valid}
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Einladung annehmen
        </Button>
      </form>
    </div>
  )
}
