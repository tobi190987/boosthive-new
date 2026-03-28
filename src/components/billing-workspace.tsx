'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Loader2,
  Package,
  RefreshCw,
  Shield,
  Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { StripeCardForm } from '@/components/stripe-card-form'

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface ModuleRecord {
  id: string
  code: string
  name: string
  description: string
  price: number
  currency: string
  status: 'active' | 'canceling' | 'canceled' | 'not_subscribed'
  current_period_end: string | null
}

interface BillingData {
  subscription_status: 'none' | 'active' | 'past_due' | 'canceled' | 'canceling'
  subscription_period_end: string | null
  payment_method: {
    brand: string
    last4: string
    exp_month: number
    exp_year: number
  } | null
  plan: {
    name: string
    amount: number
    currency: string
    interval: string
  } | null
  modules?: ModuleRecord[]
}

interface BillingWorkspaceProps {
  tenantSlug: string
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function statusLabel(status: BillingData['subscription_status']) {
  switch (status) {
    case 'active':
      return 'Aktiv'
    case 'canceling':
      return 'Laeuft aus'
    case 'past_due':
      return 'Überfällig'
    case 'canceled':
      return 'Gekuendigt'
    default:
      return 'Kein Abo'
  }
}

function statusBadgeClasses(status: BillingData['subscription_status']) {
  switch (status) {
    case 'active':
      return 'bg-[#edf8f6] text-[#0d9488] hover:bg-[#edf8f6]'
    case 'canceling':
      return 'bg-[#fff8ed] text-[#b85e34] hover:bg-[#fff8ed]'
    case 'past_due':
      return 'bg-[#fef2f2] text-[#dc2626] hover:bg-[#fef2f2]'
    case 'canceled':
      return 'bg-[#f1f5f9] text-[#64748b] hover:bg-[#f1f5f9]'
    default:
      return 'bg-[#f1f5f9] text-[#64748b] hover:bg-[#f1f5f9]'
  }
}

function formatDate(value: string | null) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' }).format(date)
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100)
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function BillingWorkspace({ tenantSlug }: BillingWorkspaceProps) {
  const [billing, setBilling] = useState<BillingData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [showCardForm, setShowCardForm] = useState(false)
  const [activity, setActivity] = useState('Lade Billing-Daten...')

  const loadBilling = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch('/api/tenant/billing', {
        credentials: 'include',
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error ?? 'Billing-Daten konnten nicht geladen werden.')
      }

      setBilling(payload)
      setActivity('Billing-Daten erfolgreich geladen.')
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Billing-Daten konnten nicht geladen werden.'
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadBilling()
  }, [loadBilling])

  async function handleSubscribe() {
    try {
      setActionLoading('subscribe')
      setError(null)

      const response = await fetch('/api/tenant/billing/subscribe', {
        method: 'POST',
        credentials: 'include',
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error ?? 'Abo konnte nicht gestartet werden.')
      }

      setActivity('Basis-Plan erfolgreich abonniert.')
      await loadBilling()
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Abo konnte nicht gestartet werden.'
      )
    } finally {
      setActionLoading(null)
    }
  }

  async function handleCancel() {
    try {
      setActionLoading('cancel')
      setError(null)

      const response = await fetch('/api/tenant/billing/cancel', {
        method: 'POST',
        credentials: 'include',
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error ?? 'Kuendigung konnte nicht durchgefuehrt werden.')
      }

      setActivity('Abo wird zum Periodenende gekuendigt.')
      await loadBilling()
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Kuendigung konnte nicht durchgefuehrt werden.'
      )
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReactivate() {
    try {
      setActionLoading('reactivate')
      setError(null)

      const response = await fetch('/api/tenant/billing/reactivate', {
        method: 'POST',
        credentials: 'include',
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error ?? 'Reaktivierung fehlgeschlagen.')
      }

      setActivity('Kündigung erfolgreich zurückgenommen.')
      await loadBilling()
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Reaktivierung fehlgeschlagen.'
      )
    } finally {
      setActionLoading(null)
    }
  }

  async function handleModuleSubscribe(moduleId: string) {
    try {
      setActionLoading(`module-subscribe-${moduleId}`)
      setError(null)

      const response = await fetch(`/api/tenant/billing/modules/${moduleId}/subscribe`, {
        method: 'POST',
        credentials: 'include',
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error ?? 'Modul konnte nicht gebucht werden.')
      }

      setActivity('Modul erfolgreich gebucht.')
      await loadBilling()
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Modul konnte nicht gebucht werden.'
      )
    } finally {
      setActionLoading(null)
    }
  }

  async function handleModuleCancel(moduleId: string) {
    try {
      setActionLoading(`module-cancel-${moduleId}`)
      setError(null)

      const response = await fetch(`/api/tenant/billing/modules/${moduleId}/cancel`, {
        method: 'POST',
        credentials: 'include',
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error ?? 'Modul-Kuendigung fehlgeschlagen.')
      }

      setActivity('Modul wird zum Periodenende abbestellt.')
      await loadBilling()
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Modul-Kuendigung fehlgeschlagen.'
      )
    } finally {
      setActionLoading(null)
    }
  }

  async function handleModuleReactivate(moduleId: string) {
    try {
      setActionLoading(`module-reactivate-${moduleId}`)
      setError(null)

      const response = await fetch(`/api/tenant/billing/modules/${moduleId}/reactivate`, {
        method: 'POST',
        credentials: 'include',
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error ?? 'Modul-Reaktivierung fehlgeschlagen.')
      }

      setActivity('Modul-Kuendigung erfolgreich zurueckgenommen.')
      await loadBilling()
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Modul-Reaktivierung fehlgeschlagen.'
      )
    } finally {
      setActionLoading(null)
    }
  }

  function handleCardSaved() {
    setShowCardForm(false)
    setActivity('Zahlungsmethode erfolgreich hinterlegt.')
    void loadBilling()
  }

  // ----- Loading state -----
  if (isLoading) {
    return (
      <div className="space-y-6">
        <BillingHero tenantSlug={tenantSlug} />
        <div className="flex min-h-48 items-center justify-center rounded-[30px] border border-[#e4dbcf] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin text-[#b85e34]" />
            Billing-Daten werden geladen...
          </div>
        </div>
      </div>
    )
  }

  // ----- Error state (no data at all) -----
  if (!billing) {
    return (
      <div className="space-y-6">
        <BillingHero tenantSlug={tenantSlug} />
        {error && (
          <div className="rounded-[24px] border border-[#efc6b6] bg-[#fff0ea] px-5 py-4 text-sm text-[#8c3215] shadow-sm">
            {error}
          </div>
        )}
        <div className="flex min-h-48 flex-col items-center justify-center gap-4 rounded-[30px] border border-[#e4dbcf] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
          <p className="text-sm text-slate-600">
            Billing-Daten konnten nicht geladen werden.
          </p>
          <Button
            variant="outline"
            className="rounded-full border-[#ded4c7]"
            onClick={() => void loadBilling()}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Erneut versuchen
          </Button>
        </div>
      </div>
    )
  }

  const hasPaymentMethod = billing.payment_method !== null
  const status = billing.subscription_status

  return (
    <div className="space-y-6">
      <BillingHero tenantSlug={tenantSlug} />

      {error && (
        <div className="rounded-[24px] border border-[#efc6b6] bg-[#fff0ea] px-5 py-4 text-sm text-[#8c3215] shadow-sm">
          {error}
        </div>
      )}

      <div className="rounded-[24px] border border-[#dfd5c8] bg-[#fffdf9] px-5 py-4 text-sm text-slate-600 shadow-sm">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#157f68]" />
          <p>{activity}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ----- Subscription Status Card ----- */}
        <Card className="rounded-[28px] border border-[#e6ddd0] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-lg text-slate-950">
              <Zap className="h-5 w-5 text-[#0d9488]" />
              Abo-Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Status</span>
              <Badge className={`rounded-full ${statusBadgeClasses(status)}`}>
                {statusLabel(status)}
              </Badge>
            </div>

            {billing.plan && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Plan</span>
                <span className="text-sm font-semibold text-slate-900">
                  {billing.plan.name}
                </span>
              </div>
            )}

            {billing.plan && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Preis</span>
                <span className="text-sm font-semibold text-slate-900">
                  {formatAmount(billing.plan.amount, billing.plan.currency)} / {billing.plan.interval}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Naechste Abrechnung</span>
              <span className="text-sm font-semibold text-slate-900">
                {formatDate(billing.subscription_period_end)}
              </span>
            </div>

            {status === 'canceling' && billing.subscription_period_end && (
              <div className="rounded-2xl bg-[#fff8ed] px-4 py-3 text-sm text-[#b85e34]">
                <AlertTriangle className="mb-1 inline h-4 w-4" /> Dein Abo laeuft am{' '}
                {formatDate(billing.subscription_period_end)} aus. Bis dahin hast du vollen
                Zugang.
              </div>
            )}

            {status === 'past_due' && (
              <div className="rounded-2xl bg-[#fef2f2] px-4 py-3 text-sm text-[#dc2626]">
                <AlertTriangle className="mb-1 inline h-4 w-4" /> Deine letzte Zahlung ist
                fehlgeschlagen. Bitte aktualisiere deine Zahlungsmethode.
              </div>
            )}
          </CardContent>
        </Card>

        {/* ----- Payment Method Section ----- */}
        <Card className="rounded-[28px] border border-[#e6ddd0] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-lg text-slate-950">
              <CreditCard className="h-5 w-5 text-[#b85e34]" />
              Zahlungsmethode
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {showCardForm ? (
              <StripeCardForm
                onSuccess={handleCardSaved}
                onCancel={() => setShowCardForm(false)}
              />
            ) : hasPaymentMethod ? (
              <>
                <div className="rounded-2xl border border-[#e6ddd0] bg-[#fffdf9] px-4 py-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#f7f3ed]">
                      <CreditCard className="h-5 w-5 text-slate-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold capitalize text-slate-900">
                        {billing.payment_method!.brand} **** {billing.payment_method!.last4}
                      </p>
                      <p className="text-xs text-slate-500">
                        Gueltig bis {String(billing.payment_method!.exp_month).padStart(2, '0')}/{billing.payment_method!.exp_year}
                      </p>
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full rounded-full border-[#ded4c7] bg-white text-slate-700 hover:bg-white"
                  onClick={() => setShowCardForm(true)}
                >
                  Karte ersetzen
                </Button>
              </>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl bg-[#f7f3ed] px-4 py-4 text-center">
                  <CreditCard className="mx-auto h-8 w-8 text-slate-400" />
                  <p className="mt-2 text-sm text-slate-600">
                    Noch keine Zahlungsmethode hinterlegt.
                  </p>
                </div>
                <Button
                  className="w-full rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
                  onClick={() => setShowCardForm(true)}
                >
                  Karte hinterlegen
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ----- Subscription Actions ----- */}
      <Card className="rounded-[28px] border border-[#e6ddd0] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-lg text-slate-950">
            <Shield className="h-5 w-5 text-[#0d9488]" />
            Abo-Aktionen
          </CardTitle>
        </CardHeader>
        <CardContent>
          {status === 'none' && (
            <div className="space-y-4">
              <p className="text-sm leading-6 text-slate-600">
                Du hast noch kein aktives Abo. Abonniere den Basis-Plan, um alle Funktionen
                freizuschalten und Module buchen zu können.
              </p>
              <Button
                className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
                disabled={!hasPaymentMethod || actionLoading === 'subscribe'}
                onClick={() => void handleSubscribe()}
              >
                {actionLoading === 'subscribe' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Wird gestartet...
                  </>
                ) : (
                  'Basis-Plan abonnieren'
                )}
              </Button>
              {!hasPaymentMethod && (
                <p className="text-xs text-slate-500">
                  Bitte hinterlege zuerst eine Zahlungsmethode.
                </p>
              )}
            </div>
          )}

          {status === 'active' && (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-slate-600">
                Dein Basis-Plan ist aktiv. Du kannst jetzt Module buchen und alle
                Plattform-Funktionen nutzen.
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="shrink-0 rounded-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    disabled={actionLoading === 'cancel'}
                  >
                    {actionLoading === 'cancel' ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Wird gekuendigt...
                      </>
                    ) : (
                      'Abo kuendigen'
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-[24px]">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Abo wirklich kuendigen?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Dein Zugang bleibt bis zum Ende der aktuellen Abrechnungsperiode
                      ({formatDate(billing.subscription_period_end)}) bestehen. Danach verlierst
                      du den Zugriff auf alle Module.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-full">Abbrechen</AlertDialogCancel>
                    <AlertDialogAction
                      className="rounded-full bg-red-600 text-white hover:bg-red-700"
                      onClick={() => void handleCancel()}
                    >
                      Ja, kuendigen
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          {status === 'canceling' && (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-slate-600">
                Dein Abo laeuft zum{' '}
                <span className="font-semibold">
                  {formatDate(billing.subscription_period_end)}
                </span>{' '}
                aus. Du kannst die Kündigung jederzeit zurücknehmen.
              </p>
              <Button
                className="shrink-0 rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
                disabled={actionLoading === 'reactivate'}
                onClick={() => void handleReactivate()}
              >
                {actionLoading === 'reactivate' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Wird reaktiviert...
                  </>
                ) : (
                  'Kündigung zurücknehmen'
                )}
              </Button>
            </div>
          )}

          {status === 'past_due' && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-[#fef2f2] px-4 py-3 text-sm text-[#dc2626]">
                <AlertTriangle className="mb-1 inline h-4 w-4" /> Deine Zahlung ist
                fehlgeschlagen. Bitte aktualisiere deine Zahlungsmethode, um den Zugang zu
                behalten.
              </div>
              <Button
                className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
                onClick={() => setShowCardForm(true)}
              >
                Zahlungsmethode aktualisieren
              </Button>
            </div>
          )}

          {status === 'canceled' && (
            <div className="space-y-4">
              <p className="text-sm leading-6 text-slate-600">
                Dein Abo wurde gekuendigt. Um die Plattform wieder zu nutzen, kannst du ein
                neues Abo abschliessen.
              </p>
              <Button
                className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
                disabled={!hasPaymentMethod || actionLoading === 'subscribe'}
                onClick={() => void handleSubscribe()}
              >
                {actionLoading === 'subscribe' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Wird gestartet...
                  </>
                ) : (
                  'Erneut abonnieren'
                )}
              </Button>
              {!hasPaymentMethod && (
                <p className="text-xs text-slate-500">
                  Bitte hinterlege zuerst eine Zahlungsmethode.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Hero Section                                                               */
/* -------------------------------------------------------------------------- */

function BillingHero({ tenantSlug }: { tenantSlug: string }) {
  return (
    <section className="relative overflow-hidden rounded-[34px] border border-[#d9d1c6] bg-[linear-gradient(135deg,#fffaf2_0%,#f5efe6_55%,#eef6ef_100%)] p-6 shadow-[0_24px_80px_rgba(89,71,42,0.08)] sm:p-8">
      <div className="absolute right-[-3rem] top-[-3rem] h-40 w-40 rounded-full bg-[#eb6f3d]/12 blur-3xl" />
      <div className="absolute bottom-[-4rem] left-[-2rem] h-44 w-44 rounded-full bg-[#157f68]/10 blur-3xl" />

      <div className="relative max-w-3xl space-y-4">
        <Badge className="w-fit rounded-full bg-[#1f2937] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-white hover:bg-[#1f2937]">
          Billing
        </Badge>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#b85e34]">
            Abrechnung
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            Abo für {tenantSlug} verwalten
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
            Verwalte deinen Basis-Plan, hinterlege eine Zahlungsmethode und behalte den
            Abo-Status im Blick. Alle Zahlungen laufen sicher über Stripe.
          </p>
        </div>
      </div>

      <div className="relative mt-8 grid gap-4 lg:grid-cols-3">
        <div className="rounded-[26px] border border-white/70 bg-white/75 p-5 backdrop-blur-sm">
          <CreditCard className="h-5 w-5 text-[#b85e34]" />
          <p className="mt-3 text-sm font-semibold text-slate-900">Sichere Karteneingabe</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Zahlungsdaten werden direkt bei Stripe gespeichert und nie auf unseren Servern.
          </p>
        </div>
        <div className="rounded-[26px] border border-white/70 bg-white/75 p-5 backdrop-blur-sm">
          <Zap className="h-5 w-5 text-[#157f68]" />
          <p className="mt-3 text-sm font-semibold text-slate-900">4-Wochen-Zyklen</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Der Basis-Plan wird alle 4 Wochen automatisch verlaengert und abgerechnet.
          </p>
        </div>
        <div className="rounded-[26px] border border-white/70 bg-white/75 p-5 backdrop-blur-sm">
          <Shield className="h-5 w-5 text-[#1f2937]" />
          <p className="mt-3 text-sm font-semibold text-slate-900">Jederzeit kuendbar</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Kündige zum Periodenende oder nimm die Kündigung jederzeit zurück.
          </p>
        </div>
      </div>
    </section>
  )
}
