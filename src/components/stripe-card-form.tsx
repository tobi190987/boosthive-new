'use client'

import { useState } from 'react'
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

/* -------------------------------------------------------------------------- */
/*  Stripe instance                                                            */
/* -------------------------------------------------------------------------- */

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''

const stripePromise = stripePublishableKey
  ? loadStripe(stripePublishableKey)
  : null

/* -------------------------------------------------------------------------- */
/*  Card Element styling                                                       */
/* -------------------------------------------------------------------------- */

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      color: '#1e293b',
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      '::placeholder': {
        color: '#94a3b8',
      },
    },
    invalid: {
      color: '#dc2626',
      iconColor: '#dc2626',
    },
  },
}

/* -------------------------------------------------------------------------- */
/*  Inner form (must be inside <Elements>)                                     */
/* -------------------------------------------------------------------------- */

interface CardFormInnerProps {
  onSuccess: () => void
  onCancel: () => void
}

function CardFormInner({ onSuccess, onCancel }: CardFormInnerProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!stripe || !elements) return

    const cardElement = elements.getElement(CardElement)
    if (!cardElement) return

    try {
      setIsSaving(true)
      setError(null)

      // 1. Create SetupIntent on the server
      const setupResponse = await fetch('/api/tenant/billing/setup-intent', {
        method: 'POST',
        credentials: 'include',
      })
      const setupPayload = await setupResponse.json().catch(() => ({}))

      if (!setupResponse.ok) {
        throw new Error(
          setupPayload.error ?? 'SetupIntent konnte nicht erstellt werden.'
        )
      }

      const { client_secret } = setupPayload

      // 2. Confirm the SetupIntent with the card element
      const { error: stripeError } = await stripe.confirmCardSetup(client_secret, {
        payment_method: {
          card: cardElement,
        },
      })

      if (stripeError) {
        throw new Error(stripeError.message ?? 'Kartendaten konnten nicht gespeichert werden.')
      }

      onSuccess()
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Kartendaten konnten nicht gespeichert werden.'
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div className="rounded-2xl border border-[#e6ddd0] bg-[#fffdf9] px-4 py-4">
        <CardElement options={CARD_ELEMENT_OPTIONS} />
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <div className="flex gap-3">
        <Button
          type="submit"
          className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
          disabled={!stripe || isSaving}
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Wird gespeichert...
            </>
          ) : (
            'Karte speichern'
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-full border-[#ded4c7]"
          onClick={onCancel}
          disabled={isSaving}
        >
          Abbrechen
        </Button>
      </div>
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/*  Public wrapper (provides Stripe context)                                   */
/* -------------------------------------------------------------------------- */

interface StripeCardFormProps {
  onSuccess: () => void
  onCancel: () => void
}

export function StripeCardForm({ onSuccess, onCancel }: StripeCardFormProps) {
  if (!stripePromise) {
    return (
      <div className="rounded-2xl bg-[#fef2f2] px-4 py-4 text-sm text-red-600">
        Stripe ist nicht konfiguriert. Bitte setze die Umgebungsvariable{' '}
        <code className="rounded bg-red-50 px-1 font-mono text-xs">
          NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
        </code>.
      </div>
    )
  }

  return (
    <Elements stripe={stripePromise}>
      <CardFormInner onSuccess={onSuccess} onCancel={onCancel} />
    </Elements>
  )
}
