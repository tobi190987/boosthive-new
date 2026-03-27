'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useForm, type FieldPath } from 'react-hook-form'
import {
  AlertCircle,
  CreditCard,
  ImagePlus,
  Loader2,
  Trash2,
  UserRound,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StripeCardForm } from '@/components/stripe-card-form'
import { getUserInitials } from '@/lib/profile'

interface BillingResponse {
  payment_method: {
    brand: string
    last4: string
    exp_month: number
    exp_year: number
  } | null
}

interface TenantProfileWorkspaceProps {
  mode: 'onboarding' | 'settings'
  initialData: {
    role: 'admin' | 'member'
    tenantName: string
    firstName: string
    lastName: string
    avatarUrl: string | null
    billingCompany: string
    billingStreet: string
    billingZip: string
    billingCity: string
    billingCountry: string
    billingVatId: string
  }
}

interface ProfileFormValues {
  first_name: string
  last_name: string
  billing_company: string
  billing_street: string
  billing_zip: string
  billing_city: string
  billing_country: string
  billing_vat_id: string
}

const fieldClassName =
  'h-[48px] rounded-xl border-slate-200 bg-white px-4 text-[15px] text-slate-900 shadow-sm transition placeholder:text-slate-400 focus-visible:border-[#1dbfaa] focus-visible:ring-[#1dbfaa]/20 focus-visible:ring-offset-0'

function formatCard(paymentMethod: BillingResponse['payment_method']) {
  if (!paymentMethod) return 'Noch keine Zahlungsmethode gespeichert'

  return `${paymentMethod.brand.toUpperCase()} •••• ${paymentMethod.last4} · ${String(
    paymentMethod.exp_month
  ).padStart(2, '0')}/${paymentMethod.exp_year}`
}

export function TenantProfileWorkspace({
  mode,
  initialData,
}: TenantProfileWorkspaceProps) {
  const [avatarUrl, setAvatarUrl] = useState(initialData.avatarUrl)
  const [avatarPending, setAvatarPending] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showStripeForm, setShowStripeForm] = useState(false)
  const [billing, setBilling] = useState<BillingResponse | null>(null)
  const [billingLoading, setBillingLoading] = useState(initialData.role === 'admin')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    defaultValues: {
      first_name: initialData.firstName,
      last_name: initialData.lastName,
      billing_company: initialData.billingCompany,
      billing_street: initialData.billingStreet,
      billing_zip: initialData.billingZip,
      billing_city: initialData.billingCity,
      billing_country: initialData.billingCountry,
      billing_vat_id: initialData.billingVatId,
    },
  })

  useEffect(() => {
    if (initialData.role !== 'admin') {
      return
    }

    async function loadBilling() {
      try {
        setBillingLoading(true)
        const response = await fetch('/api/tenant/billing', {
          credentials: 'include',
        })
        const payload = (await response.json().catch(() => ({}))) as BillingResponse & {
          error?: string
        }

        if (!response.ok) {
          throw new Error(payload.error ?? 'Stripe-Status konnte nicht geladen werden.')
        }

        setBilling(payload)
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Stripe-Status konnte nicht geladen werden.'
        )
      } finally {
        setBillingLoading(false)
      }
    }

    void loadBilling()
  }, [initialData.role])

  function applyFieldErrors(details?: Record<string, string[] | undefined>) {
    if (!details) {
      return
    }

    const fields = Object.entries(details) as Array<[FieldPath<ProfileFormValues>, string[] | undefined]>
    fields.forEach(([field, messages]) => {
      const firstMessage = messages?.[0]
      if (!firstMessage) {
        return
      }

      setFieldError(field, {
        type: 'server',
        message: firstMessage,
      })
    })
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      setAvatarPending(true)
      setError(null)
      setSuccess(null)

      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/tenant/profile/avatar', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })
      const payload = (await response.json().catch(() => ({}))) as {
        avatar_url?: string | null
        error?: string
      }

      if (!response.ok) {
        throw new Error(payload.error ?? 'Profilbild konnte nicht hochgeladen werden.')
      }

      setAvatarUrl(payload.avatar_url ?? null)
      setSuccess('Profilbild wurde aktualisiert.')
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Profilbild konnte nicht hochgeladen werden.'
      )
    } finally {
      setAvatarPending(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  async function removeAvatar() {
    try {
      setAvatarPending(true)
      setError(null)
      setSuccess(null)

      const response = await fetch('/api/tenant/profile/avatar', {
        method: 'DELETE',
        credentials: 'include',
      })
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
      }

      if (!response.ok) {
        throw new Error(payload.error ?? 'Profilbild konnte nicht entfernt werden.')
      }

      setAvatarUrl(null)
      setSuccess('Profilbild wurde entfernt.')
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : 'Profilbild konnte nicht entfernt werden.'
      )
    } finally {
      setAvatarPending(false)
    }
  }

  async function onSubmit(values: ProfileFormValues) {
    try {
      setIsSaving(true)
      setError(null)
      setSuccess(null)

      const response = await fetch('/api/tenant/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...values,
          complete_onboarding: mode === 'onboarding',
        }),
      })

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
        details?: Record<string, string[] | undefined>
        redirectTo?: string | null
      }

      if (!response.ok) {
        applyFieldErrors(payload.details)
        throw new Error(
          payload.error ??
            (mode === 'onboarding'
              ? 'Onboarding konnte nicht abgeschlossen werden.'
              : 'Profil konnte nicht gespeichert werden.')
        )
      }

      if (mode === 'onboarding' && payload.redirectTo) {
        window.location.assign(payload.redirectTo)
        return
      }

      setSuccess('Deine Profildaten wurden gespeichert.')
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : mode === 'onboarding'
            ? 'Onboarding konnte nicht abgeschlossen werden.'
            : 'Profil konnte nicht gespeichert werden.'
      )
    } finally {
      setIsSaving(false)
    }
  }

  const isAdmin = initialData.role === 'admin'
  const submitLabel =
    mode === 'onboarding' ? 'Onboarding abschliessen' : 'Profil speichern'

  return (
    <div className="space-y-6">
      <Card className="rounded-[30px] border border-[#e4dbcf] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge className="rounded-full bg-[#edf8f6] text-[#0d9488] hover:bg-[#edf8f6]">
              {mode === 'onboarding' ? 'Erster Login' : 'Profil'}
            </Badge>
            <Badge className="rounded-full bg-[#f6efe4] text-[#8b5e34] hover:bg-[#f6efe4]">
              {isAdmin ? 'Admin' : 'Member'}
            </Badge>
          </div>
          <CardTitle className="text-2xl text-slate-900">
            {mode === 'onboarding'
              ? `Willkommen bei ${initialData.tenantName}`
              : 'Persoenliche Daten und Profilbild'}
          </CardTitle>
          <p className="text-sm leading-6 text-slate-600">
            {mode === 'onboarding'
              ? 'Bitte vervollstaendige jetzt dein Profil. Vorname und Nachname sind fuer alle verpflichtend.'
              : 'Hier kannst du deine persoenlichen Daten jederzeit aktualisieren.'}
          </p>
        </CardHeader>
        <CardContent>
          {(error || success) && (
            <div className="mb-6 space-y-3">
              {error && (
                <Alert className="rounded-2xl border-red-200 bg-red-50 text-red-700">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {success && (
                <Alert className="rounded-2xl border-[#d1faf4] bg-[#f0fdfb] text-[#0f766e]">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{success}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit((values) => void onSubmit(values))} className="space-y-8">
            <section className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Profilbild
                </h2>
                <p className="text-sm text-slate-500">
                  Optional, aber hilfreich fuer Sidebar und Team-Kontext.
                </p>
              </div>
              <div className="rounded-[28px] border border-[#efe5d8] bg-[#fffaf4] p-5">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                  <Avatar className="h-24 w-24 border border-[#dceee9] shadow-sm">
                    <AvatarImage src={avatarUrl ?? undefined} alt="Profilbild" />
                    <AvatarFallback className="bg-[#e8f8f3] text-xl font-semibold text-[#0d9488]">
                      {getUserInitials(
                        {
                          first_name: initialData.firstName,
                          last_name: initialData.lastName,
                        },
                        'profil'
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full border-[#d8d0c3] bg-white"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={avatarPending}
                      >
                        {avatarPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <ImagePlus className="mr-2 h-4 w-4" />
                        )}
                        Bild hochladen
                      </Button>
                      {avatarUrl && (
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full border-[#ead4c8] bg-white text-[#9f4a24]"
                          onClick={() => void removeAvatar()}
                          disabled={avatarPending}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Bild entfernen
                        </Button>
                      )}
                    </div>
                    <p className="text-sm text-slate-500">PNG, JPG oder WEBP bis 2 MB.</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      className="hidden"
                      onChange={(event) => void handleAvatarChange(event)}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Persoenliche Daten
                </h2>
                <p className="text-sm text-slate-500">
                  Diese Angaben erscheinen in deinem Profil und in der Sidebar.
                </p>
              </div>
              <div className="grid gap-4 rounded-[28px] border border-[#efe5d8] bg-[#fffaf4] p-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="first_name">Vorname</Label>
                  <Input id="first_name" className={fieldClassName} {...register('first_name')} />
                  {errors.first_name && (
                    <p className="text-sm text-destructive">{errors.first_name.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Nachname</Label>
                  <Input id="last_name" className={fieldClassName} {...register('last_name')} />
                  {errors.last_name && (
                    <p className="text-sm text-destructive">{errors.last_name.message}</p>
                  )}
                </div>
              </div>
            </section>

            {isAdmin && (
              <>
                <section className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Rechnungsadresse
                    </h2>
                    <p className="text-sm text-slate-500">
                      Diese Angaben sind fuer Admins verpflichtend.
                    </p>
                  </div>
                  <div className="grid gap-4 rounded-[28px] border border-[#efe5d8] bg-[#fffaf4] p-5 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="billing_company">Firma</Label>
                      <Input
                        id="billing_company"
                        className={fieldClassName}
                        {...register('billing_company')}
                      />
                      {errors.billing_company && (
                        <p className="text-sm text-destructive">
                          {errors.billing_company.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="billing_street">Strasse und Hausnummer</Label>
                      <Input
                        id="billing_street"
                        className={fieldClassName}
                        {...register('billing_street')}
                      />
                      {errors.billing_street && (
                        <p className="text-sm text-destructive">
                          {errors.billing_street.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="billing_zip">PLZ</Label>
                      <Input id="billing_zip" className={fieldClassName} {...register('billing_zip')} />
                      {errors.billing_zip && (
                        <p className="text-sm text-destructive">{errors.billing_zip.message}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="billing_city">Stadt</Label>
                      <Input id="billing_city" className={fieldClassName} {...register('billing_city')} />
                      {errors.billing_city && (
                        <p className="text-sm text-destructive">{errors.billing_city.message}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="billing_country">Land</Label>
                      <Input
                        id="billing_country"
                        className={fieldClassName}
                        {...register('billing_country')}
                      />
                      {errors.billing_country && (
                        <p className="text-sm text-destructive">
                          {errors.billing_country.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="billing_vat_id">USt-IdNr. (optional)</Label>
                      <Input
                        id="billing_vat_id"
                        className={fieldClassName}
                        {...register('billing_vat_id')}
                      />
                      {errors.billing_vat_id && (
                        <p className="text-sm text-destructive">
                          {errors.billing_vat_id.message}
                        </p>
                      )}
                    </div>
                  </div>
                </section>

                <section className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Stripe
                    </h2>
                    <p className="text-sm text-slate-500">
                      {mode === 'onboarding'
                        ? 'Zum Abschluss des Admin-Onboardings ist eine hinterlegte Zahlungsmethode erforderlich.'
                        : 'Zahlungsmethode fuer Abrechnung und spaeteres Abo verwalten.'}
                    </p>
                  </div>
                  <div className="space-y-4 rounded-[28px] border border-[#efe5d8] bg-[#fffaf4] p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-[#b85e34]" />
                          <span className="text-sm font-semibold text-slate-900">
                            Zahlungsmethode
                          </span>
                          <Badge
                            className={
                              billing?.payment_method
                                ? 'rounded-full bg-[#edf8f6] text-[#0d9488] hover:bg-[#edf8f6]'
                                : 'rounded-full bg-[#fff1e8] text-[#a35a34] hover:bg-[#fff1e8]'
                            }
                          >
                            {billing?.payment_method ? 'Verbunden' : 'Fehlt'}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-600">
                          {billingLoading
                            ? 'Stripe-Status wird geladen...'
                            : formatCard(billing?.payment_method ?? null)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
                        onClick={() => setShowStripeForm((value) => !value)}
                      >
                        {showStripeForm
                          ? 'Stripe-Formular ausblenden'
                          : billing?.payment_method
                            ? 'Zahlungsmethode aendern'
                            : 'Zahlungsmethode hinterlegen'}
                      </Button>
                    </div>

                    {showStripeForm && (
                      <div className="rounded-[24px] border border-[#e8dece] bg-white p-4">
                        <StripeCardForm
                          onCancel={() => setShowStripeForm(false)}
                          onSuccess={() => {
                            setShowStripeForm(false)
                            setSuccess('Zahlungsmethode wurde gespeichert.')
                            setBillingLoading(true)
                            void fetch('/api/tenant/billing', { credentials: 'include' })
                              .then((response) => response.json().then((payload) => ({ response, payload })))
                              .then(({ response, payload }) => {
                                if (!response.ok) {
                                  throw new Error(
                                    (payload as { error?: string }).error ??
                                      'Stripe-Status konnte nicht aktualisiert werden.'
                                  )
                                }
                                setBilling(payload as BillingResponse)
                              })
                              .catch((loadError: unknown) => {
                                setError(
                                  loadError instanceof Error
                                    ? loadError.message
                                    : 'Stripe-Status konnte nicht aktualisiert werden.'
                                )
                              })
                              .finally(() => setBillingLoading(false))
                          }}
                        />
                      </div>
                    )}
                  </div>
                </section>
              </>
            )}

            <div className="flex flex-col gap-3 border-t border-[#efe5d8] pt-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <UserRound className="h-4 w-4" />
                {mode === 'onboarding'
                  ? 'Nach dem Abschluss kannst du alles spaeter im Profil aendern.'
                  : 'Aenderungen werden sofort fuer deinen Workspace uebernommen.'}
              </div>
              <Button
                type="submit"
                className="h-[48px] rounded-xl bg-[#1dbfaa] px-6 text-white shadow-[0_4px_14px_rgba(29,191,170,0.28)] transition hover:bg-[#18a896] disabled:opacity-60"
                disabled={isSaving}
              >
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {submitLabel}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
