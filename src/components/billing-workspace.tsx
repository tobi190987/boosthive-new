'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  CreditCard,
  Download,
  FileText,
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
import { Checkbox } from '@/components/ui/checkbox'
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

interface InvoiceRecord {
  id: string
  number: string | null
  amount_due: number
  amount_paid: number
  currency: string
  status: string | null
  created: number
  due_date: number | null
  invoice_pdf: string | null
  hosted_invoice_url: string | null
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
      return 'Läuft aus'
    case 'past_due':
      return 'Überfällig'
    case 'canceled':
      return 'Gekündigt'
    default:
      return 'Kein Abo'
  }
}

function statusBadgeClasses(status: BillingData['subscription_status']) {
  switch (status) {
    case 'active':
      return 'bg-blue-50 text-blue-600 hover:bg-blue-50'
    case 'canceling':
      return 'bg-blue-50 text-blue-600 hover:bg-blue-50'
    case 'past_due':
      return 'bg-red-50 text-[#dc2626] hover:bg-red-50'
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

export function BillingWorkspace({ tenantSlug: _tenantSlug }: BillingWorkspaceProps) {
  const [billing, setBilling] = useState<BillingData | null>(null)
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [showCardForm, setShowCardForm] = useState(false)

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

      // Load invoices in parallel (non-blocking)
      fetch('/api/tenant/billing/invoices', { credentials: 'include' })
        .then((r) => r.json())
        .then((data) => { if (data.invoices) setInvoices(data.invoices) })
        .catch(() => { /* non-fatal */ })
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

  async function handleSubscribe(selectedModuleIds: string[]) {
    try {
      setActionLoading('subscribe')
      setError(null)

      const response = await fetch('/api/tenant/billing/subscribe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module_ids: selectedModuleIds }),
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error ?? 'Abo konnte nicht gestartet werden.')
      }

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
        throw new Error(payload.error ?? 'Kündigung konnte nicht durchgeführt werden.')
      }

      await loadBilling()
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Kündigung konnte nicht durchgeführt werden.'
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
        throw new Error(payload.error ?? 'Modul-Kündigung fehlgeschlagen.')
      }

      await loadBilling()
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Modul-Kündigung fehlgeschlagen.'
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
    void loadBilling()
  }

  // ----- Loading state -----
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex min-h-48 items-center justify-center rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
          <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
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
        {error && (
          <div className="rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4 text-sm text-orange-800 shadow-sm dark:border-orange-900/70 dark:bg-orange-950/30 dark:text-orange-300">
            {error}
          </div>
        )}
        <div className="flex min-h-48 flex-col items-center justify-center gap-4 rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Billing-Daten konnten nicht geladen werden.
          </p>
          <Button
            variant="outline"
            className="rounded-full border-slate-200 dark:border-border"
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

  const activeModules = (billing.modules ?? []).filter((m) => m.status === 'active' || m.status === 'canceling')
  const modulesTotal = activeModules.reduce((sum, m) => sum + m.price, 0)
  const totalAmount = (billing.plan?.amount ?? 0) + modulesTotal
  const totalCurrency = billing.plan?.currency ?? 'eur'

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4 text-sm text-orange-800 shadow-sm dark:border-orange-900/70 dark:bg-orange-950/30 dark:text-orange-300">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ----- Subscription Status Card ----- */}
        <Card className="rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-lg text-slate-950 dark:text-slate-50">
              <Zap className="h-5 w-5 text-blue-600" />
              Abo-Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-300">Status</span>
              <Badge className={`rounded-full ${statusBadgeClasses(status)}`}>
                {statusLabel(status)}
              </Badge>
            </div>

            {billing.plan && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600 dark:text-slate-300">Plan</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {billing.plan.name}
                </span>
              </div>
            )}

            {billing.plan && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600 dark:text-slate-300">Gesamtpreis</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {formatAmount(totalAmount, totalCurrency)} / {billing.plan.interval}
                </span>
              </div>
            )}

            {billing.plan && modulesTotal > 0 && (
              <div className="rounded-2xl border border-slate-100 dark:border-border bg-slate-50 dark:bg-card px-4 py-3 space-y-1.5">
                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Basis-Plan</span>
                  <span>{formatAmount(billing.plan.amount, billing.plan.currency)}</span>
                </div>
                {activeModules.map((m) => (
                  <div key={m.id} className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>{m.name}</span>
                    <span>{formatAmount(m.price, m.currency)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-300">Nächste Abrechnung</span>
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {formatDate(billing.subscription_period_end)}
              </span>
            </div>

            {status === 'canceling' && billing.subscription_period_end && (
              <div className="rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-600">
                <AlertTriangle className="mb-1 inline h-4 w-4" /> Dein Abo läuft am{' '}
                {formatDate(billing.subscription_period_end)} aus. Bis dahin hast du vollen
                Zugang.
              </div>
            )}

            {status === 'past_due' && (
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-[#dc2626]">
                <AlertTriangle className="mb-1 inline h-4 w-4" /> Deine letzte Zahlung ist
                fehlgeschlagen. Bitte aktualisiere deine Zahlungsmethode.
              </div>
            )}
          </CardContent>
        </Card>

        {/* ----- Payment Method Section ----- */}
        <Card className="rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-lg text-slate-950 dark:text-slate-50">
              <CreditCard className="h-5 w-5 text-blue-600" />
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
                <div className="rounded-2xl border border-slate-100 dark:border-border bg-slate-50 dark:bg-card px-4 py-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 dark:bg-card">
                      <CreditCard className="h-5 w-5 text-slate-600 dark:text-slate-300" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold capitalize text-slate-900 dark:text-slate-100">
                        {billing.payment_method!.brand} **** {billing.payment_method!.last4}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Gueltig bis {String(billing.payment_method!.exp_month).padStart(2, '0')}/{billing.payment_method!.exp_year}
                      </p>
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full rounded-full border-slate-200 dark:border-border bg-white dark:bg-card text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-[#1e2635]"
                  onClick={() => setShowCardForm(true)}
                >
                  Karte ersetzen
                </Button>
              </>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl bg-slate-50 dark:bg-card px-4 py-4 text-center">
                  <CreditCard className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    Noch keine Zahlungsmethode hinterlegt.
                  </p>
                </div>
                <Button
                  variant="dark" className="w-full"
                  onClick={() => setShowCardForm(true)}
                >
                  Karte hinterlegen
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ----- Module Catalog Section (only when subscription is active) ----- */}
      {(status === 'active' || status === 'canceling') && (
        <ModuleSection
          modules={billing.modules ?? []}
          subscriptionStatus={status}
          actionLoading={actionLoading}
          onSubscribe={handleModuleSubscribe}
          onCancel={handleModuleCancel}
          onReactivate={handleModuleReactivate}
        />
      )}

      {/* ----- Invoices Section ----- */}
      {invoices.length > 0 && (
        <Card className="rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-lg text-slate-950 dark:text-slate-50">
              <FileText className="h-5 w-5 text-blue-600" />
              Rechnungen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-slate-100">
              {invoices.map((inv) => {
                const isPaid = inv.status === 'paid'
                const displayAmount = isPaid ? inv.amount_paid : inv.amount_due
                const dateLabel = isPaid
                  ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' }).format(new Date(inv.created * 1000))
                  : inv.due_date
                    ? `Fällig am ${new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' }).format(new Date(inv.due_date * 1000))}`
                    : 'Ausstehend'

                return (
                  <div key={inv.id} className="flex items-center justify-between py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {inv.number ?? 'Ausstehende Rechnung'}
                        </p>
                        {!isPaid && (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">
                            Offen
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{dateLabel}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {formatAmount(displayAmount, inv.currency)}
                      </span>
                      {inv.invoice_pdf ? (
                        <a
                          href={inv.invoice_pdf}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-border px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1e2635] transition-colors"
                        >
                          <Download className="h-3.5 w-3.5" />
                          PDF
                        </a>
                      ) : inv.hosted_invoice_url ? (
                        <a
                          href={inv.hosted_invoice_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-border px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1e2635] transition-colors"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Ansehen
                        </a>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ----- Subscription Actions ----- */}
      <Card className="rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-lg text-slate-950 dark:text-slate-50">
            <Shield className="h-5 w-5 text-blue-600" />
            Abo-Aktionen
          </CardTitle>
        </CardHeader>
        <CardContent>
          {status === 'none' && (
            <SubscribeWithModules
              modules={billing.modules ?? []}
              planAmount={billing.plan?.amount ?? 2900}
              planCurrency={billing.plan?.currency ?? 'eur'}
              planInterval={billing.plan?.interval ?? '4 Wochen'}
              hasPaymentMethod={hasPaymentMethod}
              isLoading={actionLoading === 'subscribe'}
              onSubscribe={handleSubscribe}
            />
          )}

          {status === 'active' && (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
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
                      'Abo kündigen'
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-2xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Abo wirklich kündigen?</AlertDialogTitle>
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
                      Ja, kündigen
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          {status === 'canceling' && (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                Dein Abo läuft zum{' '}
                <span className="font-semibold">
                  {formatDate(billing.subscription_period_end)}
                </span>{' '}
                aus. Du kannst die Kündigung jederzeit zurücknehmen.
              </p>
              <Button
                variant="dark" className="shrink-0"
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
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-[#dc2626]">
                <AlertTriangle className="mb-1 inline h-4 w-4" /> Deine Zahlung ist
                fehlgeschlagen. Bitte aktualisiere deine Zahlungsmethode, um den Zugang zu
                behalten.
              </div>
              <Button
                variant="dark"
                onClick={() => setShowCardForm(true)}
              >
                Zahlungsmethode aktualisieren
              </Button>
            </div>
          )}

          {status === 'canceled' && (
            <SubscribeWithModules
              modules={billing.modules ?? []}
              planAmount={billing.plan?.amount ?? 2900}
              planCurrency={billing.plan?.currency ?? 'eur'}
              planInterval={billing.plan?.interval ?? '4 Wochen'}
              hasPaymentMethod={hasPaymentMethod}
              isLoading={actionLoading === 'subscribe'}
              onSubscribe={handleSubscribe}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Subscribe With Modules                                                     */
/* -------------------------------------------------------------------------- */

interface SubscribeWithModulesProps {
  modules: ModuleRecord[]
  planAmount: number
  planCurrency: string
  planInterval: string
  hasPaymentMethod: boolean
  isLoading: boolean
  onSubscribe: (moduleIds: string[]) => void
}

function SubscribeWithModules({
  modules,
  planAmount,
  planCurrency,
  planInterval,
  hasPaymentMethod,
  isLoading,
  onSubscribe,
}: SubscribeWithModulesProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [agbAccepted, setAgbAccepted] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  function toggleModule(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const selectedModules = modules.filter((m) => selectedIds.includes(m.id))
  const modulesTotal = selectedModules.reduce((sum, m) => sum + m.price, 0)
  const total = planAmount + modulesTotal
  const canSubscribe = hasPaymentMethod && selectedIds.length > 0

  function handleOpenChange(open: boolean) {
    setDialogOpen(open)
    if (!open) setAgbAccepted(false)
  }

  return (
    <div className="space-y-5">
      <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
        Wähle mindestens ein Modul aus, das du zusammen mit dem Basis-Plan abonnieren möchtest.
      </p>

      {/* Module selection */}
      <div className="space-y-2">
        {modules.map((mod) => {
          const selected = selectedIds.includes(mod.id)
          return (
            <button
              key={mod.id}
              type="button"
              onClick={() => toggleModule(mod.id)}
              className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                selected
                  ? 'border-[#1f2937] bg-slate-50 dark:bg-card'
                  : 'border-slate-100 dark:border-border bg-slate-50 dark:bg-card hover:border-slate-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  selected ? 'border-[#1f2937] bg-slate-900' : 'border-[#c9bfb5]'
                }`}>
                  {selected && (
                    <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 10 10">
                      <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{mod.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{mod.description}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {formatAmount(mod.price, mod.currency)}
                  <span className="font-normal text-slate-400 dark:text-slate-500"> / {planInterval}</span>
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Price breakdown */}
      {selectedIds.length > 0 && (
        <div className="rounded-2xl border border-slate-100 dark:border-border bg-slate-50 dark:bg-card px-4 py-3 space-y-1.5">
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Basis-Plan</span>
            <span>{formatAmount(planAmount, planCurrency)}</span>
          </div>
          {selectedModules.map((m) => (
            <div key={m.id} className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>{m.name}</span>
              <span>{formatAmount(m.price, m.currency)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-slate-200 dark:border-border pt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <span>Gesamt</span>
            <span>{formatAmount(total, planCurrency)} / {planInterval}</span>
          </div>
        </div>
      )}

      {!hasPaymentMethod && (
        <p className="text-xs text-slate-500 dark:text-slate-400">Bitte hinterlege zuerst eine Zahlungsmethode.</p>
      )}
      {selectedIds.length === 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">Bitte wähle mindestens ein Modul aus.</p>
      )}

      <AlertDialog open={dialogOpen} onOpenChange={handleOpenChange}>
        <AlertDialogTrigger asChild>
          <Button
            variant="dark"
            disabled={!canSubscribe || isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Wird gestartet...
              </>
            ) : (
              `Jetzt abonnieren${selectedIds.length > 0 ? ` · ${formatAmount(total, planCurrency)}` : ''}`
            )}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Abo kostenpflichtig abschließen?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>Du buchst den Basis-Plan inkl. {selectedModules.map(m => m.name).join(', ')} für <strong>{formatAmount(total, planCurrency)} / {planInterval}</strong>.</p>
                <div className="flex items-start gap-3 rounded-2xl border border-slate-100 dark:border-border bg-slate-50 dark:bg-card px-4 py-3">
                  <Checkbox
                    id="agb-subscribe"
                    checked={agbAccepted}
                    onCheckedChange={(checked) => setAgbAccepted(checked === true)}
                    className="mt-0.5"
                  />
                  <label htmlFor="agb-subscribe" className="text-sm leading-6 text-slate-600 dark:text-slate-300 cursor-pointer">
                    Ich habe die{' '}
                    <a href="/agb" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline underline-offset-2 hover:text-blue-700">
                      Allgemeinen Geschäftsbedingungen
                    </a>{' '}
                    gelesen und akzeptiere diese.
                  </label>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-400 disabled:pointer-events-none disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
              disabled={!agbAccepted}
              onClick={() => { onSubscribe(selectedIds); setDialogOpen(false) }}
            >
              Kostenpflichtig buchen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Module Section                                                             */
/* -------------------------------------------------------------------------- */

function moduleStatusLabel(status: ModuleRecord['status']) {
  switch (status) {
    case 'active':
      return 'Aktiv'
    case 'canceling':
      return 'Endet bald'
    case 'canceled':
      return 'Beendet'
    default:
      return 'Nicht gebucht'
  }
}

function moduleStatusBadgeClasses(status: ModuleRecord['status']) {
  switch (status) {
    case 'active':
      return 'bg-blue-50 text-blue-600 hover:bg-blue-50'
    case 'canceling':
      return 'bg-blue-50 text-blue-600 hover:bg-blue-50'
    case 'canceled':
      return 'bg-[#f1f5f9] text-[#64748b] hover:bg-[#f1f5f9]'
    default:
      return 'bg-[#f1f5f9] text-[#94a3b8] hover:bg-[#f1f5f9]'
  }
}

interface ModuleSectionProps {
  modules: ModuleRecord[]
  subscriptionStatus: BillingData['subscription_status']
  actionLoading: string | null
  onSubscribe: (moduleId: string) => void
  onCancel: (moduleId: string) => void
  onReactivate: (moduleId: string) => void
}

function ModuleSection({
  modules,
  subscriptionStatus,
  actionLoading,
  onSubscribe,
  onCancel,
  onReactivate,
}: ModuleSectionProps) {
  const hasActivePlan = subscriptionStatus === 'active' || subscriptionStatus === 'canceling'

  return (
    <Card className="rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
      <CardHeader>
        <CardTitle className="flex items-center gap-3 text-lg text-slate-950 dark:text-slate-50">
          <Package className="h-5 w-5 text-blue-600" />
          Modul-Katalog
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasActivePlan && (
          <div className="rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-600">
            <AlertTriangle className="mb-1 inline h-4 w-4" /> Module können nur mit einem aktiven
            Basis-Plan gebucht werden.
          </div>
        )}

        {modules.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-100 dark:border-border bg-slate-50 dark:bg-card px-6 py-12 text-center">
            <Package className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Keine Module verfügbar</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Sobald Module zur Plattform hinzugefuegt werden, erscheinen sie hier.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {modules.map((mod) => (
              <ModuleCatalogCard
                key={mod.id}
                module={mod}
                hasActivePlan={hasActivePlan}
                actionLoading={actionLoading}
                onSubscribe={onSubscribe}
                onCancel={onCancel}
                onReactivate={onReactivate}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface ModuleCatalogCardProps {
  module: ModuleRecord
  hasActivePlan: boolean
  actionLoading: string | null
  onSubscribe: (moduleId: string) => void
  onCancel: (moduleId: string) => void
  onReactivate: (moduleId: string) => void
}

function ModuleCatalogCard({
  module: mod,
  hasActivePlan,
  actionLoading,
  onSubscribe,
  onCancel,
  onReactivate,
}: ModuleCatalogCardProps) {
  const [agbAccepted, setAgbAccepted] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const isSubscribing = actionLoading === `module-subscribe-${mod.id}`
  const isCanceling = actionLoading === `module-cancel-${mod.id}`
  const isReactivating = actionLoading === `module-reactivate-${mod.id}`
  const isAnyActionOnThis = isSubscribing || isCanceling || isReactivating

  function handleOpenChange(open: boolean) {
    setDialogOpen(open)
    if (!open) setAgbAccepted(false)
  }

  return (
    <div className="rounded-[22px] border border-slate-100 dark:border-border bg-slate-50 dark:bg-card p-5 transition hover:border-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{mod.name}</p>
          <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{mod.description}</p>
        </div>
        <Badge className={`shrink-0 rounded-full ${moduleStatusBadgeClasses(mod.status)}`}>
          {moduleStatusLabel(mod.status)}
        </Badge>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {formatAmount(mod.price, mod.currency)}{' '}
          <span className="font-normal text-slate-500 dark:text-slate-400">/ 4 Wochen</span>
        </span>

        {mod.status === 'not_subscribed' && (
          <AlertDialog open={dialogOpen} onOpenChange={handleOpenChange}>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="dark"
                disabled={!hasActivePlan || isAnyActionOnThis}
              >
                {isSubscribing ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Wird gebucht...
                  </>
                ) : (
                  'Jetzt buchen'
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Modul &quot;{mod.name}&quot; buchen?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-4">
                    <p>
                      Du buchst <strong>{mod.name}</strong> für{' '}
                      <strong>{formatAmount(mod.price, mod.currency)} / 4 Wochen</strong>.
                      Der Betrag wird anteilig zu deiner nächsten Rechnung hinzugefügt.
                      Du erhältst eine Buchungsbestätigung per E-Mail.
                    </p>
                    <div className="flex items-start gap-3 rounded-2xl border border-slate-100 dark:border-border bg-slate-50 dark:bg-card px-4 py-3">
                      <Checkbox
                        id={`agb-module-${mod.id}`}
                        checked={agbAccepted}
                        onCheckedChange={(checked) => setAgbAccepted(checked === true)}
                        className="mt-0.5"
                      />
                      <label
                        htmlFor={`agb-module-${mod.id}`}
                        className="text-sm leading-6 text-slate-600 dark:text-slate-300 cursor-pointer"
                      >
                        Ich habe die{' '}
                        <a
                          href="/agb"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 underline underline-offset-2 hover:text-blue-700"
                        >
                          Allgemeinen Geschäftsbedingungen
                        </a>{' '}
                        gelesen und akzeptiere diese.
                      </label>
                    </div>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-full">Abbrechen</AlertDialogCancel>
                <AlertDialogAction
                  className="rounded-full bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-400 disabled:pointer-events-none disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                  disabled={!agbAccepted}
                  onClick={() => { void onSubscribe(mod.id); setDialogOpen(false) }}
                >
                  Kostenpflichtig buchen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {mod.status === 'active' && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="rounded-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                disabled={isAnyActionOnThis}
              >
                {isCanceling ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Wird abbestellt...
                  </>
                ) : (
                  'Abbestellen'
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Modul &quot;{mod.name}&quot; abbestellen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Das Modul bleibt bis zum Ende der aktuellen Periode nutzbar und wird dann
                  deaktiviert.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-full">Abbrechen</AlertDialogCancel>
                <AlertDialogAction
                  className="rounded-full bg-red-600 text-white hover:bg-red-700"
                  onClick={() => void onCancel(mod.id)}
                >
                  Ja, abbestellen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {mod.status === 'canceling' && (
          <Button
            size="sm"
            variant="dark"
            disabled={isAnyActionOnThis}
            onClick={() => void onReactivate(mod.id)}
          >
            {isReactivating ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Wird reaktiviert...
              </>
            ) : (
              'Kündigung aufheben'
            )}
          </Button>
        )}
      </div>

      {mod.status === 'canceling' && mod.current_period_end && (
        <p className="mt-3 text-xs text-blue-600">
          Endet am {formatDate(mod.current_period_end)}
        </p>
      )}
    </div>
  )
}
