'use client'

import Image from 'next/image'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useForm, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  AlertCircle,
  CreditCard,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Move,
  Trash2,
  UserRound,
  ZoomIn,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StripeCardForm } from '@/components/stripe-card-form'
import { TenantLogoutButton } from '@/components/tenant-logout-button'
import { getUserInitials } from '@/lib/profile'
import {
  EmailChangeSchema,
  PasswordChangeSchema,
  type EmailChangeInput,
  type PasswordChangeInput,
} from '@/lib/schemas/auth'

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
    role: 'admin' | 'member' | 'owner'
    email: string
    tenantName: string
    tenantLogoUrl: string | null
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

interface AvatarCropDraft {
  file: File
  previewUrl: string
  imageWidth: number
  imageHeight: number
}

function RequiredLabel({
  htmlFor,
  children,
}: {
  htmlFor: string
  children: string
}) {
  return (
    <Label htmlFor={htmlFor} className="flex items-center gap-1.5">
      <span>{children}</span>
      <span aria-hidden="true" className="text-[#c2410c]">
        *
      </span>
      <span className="sr-only">Pflichtfeld</span>
    </Label>
  )
}

const fieldClassName =
  'h-[48px] rounded-xl border-slate-200 bg-white px-4 text-[15px] text-slate-900 shadow-sm transition placeholder:text-slate-400 focus-visible:border-[#1dbfaa] focus-visible:ring-[#1dbfaa]/20 focus-visible:ring-offset-0'
const AVATAR_PREVIEW_SIZE = 280
const AVATAR_EXPORT_SIZE = 512
const AVATAR_MIN_ZOOM = 1
const AVATAR_MAX_ZOOM = 3

function getAvatarTransform(
  imageWidth: number,
  imageHeight: number,
  zoom: number,
  xPercent: number,
  yPercent: number,
  viewportSize: number
) {
  const baseScale = Math.max(viewportSize / imageWidth, viewportSize / imageHeight)
  const scaledWidth = imageWidth * baseScale * zoom
  const scaledHeight = imageHeight * baseScale * zoom
  const maxOffsetX = Math.max(0, (scaledWidth - viewportSize) / 2)
  const maxOffsetY = Math.max(0, (scaledHeight - viewportSize) / 2)

  return {
    width: scaledWidth,
    height: scaledHeight,
    offsetX: (xPercent / 100) * maxOffsetX,
    offsetY: (yPercent / 100) * maxOffsetY,
  }
}

async function loadImageMeta(file: File) {
  const previewUrl = URL.createObjectURL(file)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'))
      element.src = previewUrl
    })

    return {
      previewUrl,
      imageWidth: image.naturalWidth,
      imageHeight: image.naturalHeight,
    }
  } catch (error) {
    URL.revokeObjectURL(previewUrl)
    throw error
  }
}

async function renderCroppedAvatar(
  draft: AvatarCropDraft,
  zoom: number,
  xPercent: number,
  yPercent: number
) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new window.Image()
    element.onload = () => resolve(element)
    element.onerror = () => reject(new Error('Bild konnte nicht verarbeitet werden.'))
    element.src = draft.previewUrl
  })

  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_EXPORT_SIZE
  canvas.height = AVATAR_EXPORT_SIZE

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas-Kontext konnte nicht initialisiert werden.')
  }

  const transform = getAvatarTransform(
    draft.imageWidth,
    draft.imageHeight,
    zoom,
    xPercent,
    yPercent,
    AVATAR_EXPORT_SIZE
  )

  context.clearRect(0, 0, AVATAR_EXPORT_SIZE, AVATAR_EXPORT_SIZE)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    image,
    (AVATAR_EXPORT_SIZE - transform.width) / 2 + transform.offsetX,
    (AVATAR_EXPORT_SIZE - transform.height) / 2 + transform.offsetY,
    transform.width,
    transform.height
  )

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((result) => resolve(result), 'image/png', 0.92)
  )

  if (!blob) {
    throw new Error('Bild konnte nicht exportiert werden.')
  }

  return new File([blob], `${draft.file.name.replace(/\.[^.]+$/, '') || 'avatar'}.png`, {
    type: 'image/png',
  })
}

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
  const [tenantLogoUrl, setTenantLogoUrl] = useState(initialData.tenantLogoUrl)
  const [avatarPending, setAvatarPending] = useState(false)
  const [tenantLogoPending, setTenantLogoPending] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showStripeForm, setShowStripeForm] = useState(false)
  const [billing, setBilling] = useState<BillingResponse | null>(null)
  const [billingLoading, setBillingLoading] = useState(initialData.role === 'admin')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [avatarCropDraft, setAvatarCropDraft] = useState<AvatarCropDraft | null>(null)
  const [avatarCropX, setAvatarCropX] = useState(0)
  const [avatarCropY, setAvatarCropY] = useState(0)
  const [avatarCropZoom, setAvatarCropZoom] = useState(1.2)
  const [showCurrentEmailPassword, setShowCurrentEmailPassword] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const tenantLogoInputRef = useRef<HTMLInputElement>(null)

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

  const emailForm = useForm<EmailChangeInput>({
    resolver: zodResolver(EmailChangeSchema),
    defaultValues: {
      email: initialData.email,
      current_password: '',
    },
  })

  const passwordForm = useForm<PasswordChangeInput>({
    resolver: zodResolver(PasswordChangeSchema),
    defaultValues: {
      current_password: '',
      new_password: '',
      confirm_password: '',
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

  useEffect(() => {
    return () => {
      if (avatarCropDraft) {
        URL.revokeObjectURL(avatarCropDraft.previewUrl)
      }
    }
  }, [avatarCropDraft])

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

  async function uploadAvatarFile(file: File) {
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
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      setError(null)
      setSuccess(null)
      if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
        throw new Error('Erlaubt sind PNG, JPG und WEBP bis 2 MB.')
      }
      if (file.size > 2 * 1024 * 1024) {
        throw new Error('Das Bild darf maximal 2 MB gross sein.')
      }

      const imageMeta = await loadImageMeta(file)
      setAvatarCropDraft({
        file,
        previewUrl: imageMeta.previewUrl,
        imageWidth: imageMeta.imageWidth,
        imageHeight: imageMeta.imageHeight,
      })
      setAvatarCropX(0)
      setAvatarCropY(0)
      setAvatarCropZoom(1.2)
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Profilbild konnte nicht hochgeladen werden.'
      )
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  function closeAvatarCropDialog() {
    setAvatarCropDraft((current) => {
      if (current) {
        URL.revokeObjectURL(current.previewUrl)
      }
      return null
    })
    setAvatarCropX(0)
    setAvatarCropY(0)
    setAvatarCropZoom(1.2)
  }

  async function confirmAvatarCrop() {
    if (!avatarCropDraft) {
      return
    }

    try {
      setAvatarPending(true)
      setError(null)
      setSuccess(null)

      const croppedFile = await renderCroppedAvatar(
        avatarCropDraft,
        avatarCropZoom,
        avatarCropX,
        avatarCropY
      )
      await uploadAvatarFile(croppedFile)
      setSuccess('Profilbild wurde aktualisiert.')
      closeAvatarCropDialog()
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Profilbild konnte nicht hochgeladen werden.'
      )
    } finally {
      setAvatarPending(false)
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

  async function handleTenantLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setTenantLogoPending(true)
      setError(null)
      setSuccess(null)

      if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) {
        throw new Error('Erlaubt sind PNG, JPG, WEBP und SVG bis 2 MB.')
      }

      if (file.size > 2 * 1024 * 1024) {
        throw new Error('Das Logo darf maximal 2 MB groß sein.')
      }

      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/tenant/logo', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })
      const payload = (await response.json().catch(() => ({}))) as {
        logoUrl?: string | null
        error?: string
      }

      if (!response.ok) {
        throw new Error(payload.error ?? 'Agentur-Logo konnte nicht hochgeladen werden.')
      }

      setTenantLogoUrl(payload.logoUrl ?? null)
      setSuccess('Agentur-Logo wurde aktualisiert.')
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Agentur-Logo konnte nicht hochgeladen werden.'
      )
    } finally {
      setTenantLogoPending(false)
      if (tenantLogoInputRef.current) {
        tenantLogoInputRef.current.value = ''
      }
    }
  }

  async function removeTenantLogo() {
    try {
      setTenantLogoPending(true)
      setError(null)
      setSuccess(null)

      const response = await fetch('/api/tenant/logo', {
        method: 'DELETE',
        credentials: 'include',
      })
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
      }

      if (!response.ok) {
        throw new Error(payload.error ?? 'Agentur-Logo konnte nicht entfernt werden.')
      }

      setTenantLogoUrl(null)
      setSuccess('Agentur-Logo wurde entfernt.')
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : 'Agentur-Logo konnte nicht entfernt werden.'
      )
    } finally {
      setTenantLogoPending(false)
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

  async function onSubmitEmail(values: EmailChangeInput) {
    try {
      setError(null)
      setSuccess(null)

      const response = await fetch('/api/auth/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type: 'email',
          ...values,
        }),
      })

      const payload = (await response.json().catch(() => ({}))) as {
        email?: string
        error?: string
        details?: Record<string, string[] | undefined>
        message?: string
      }

      if (!response.ok) {
        Object.entries(payload.details ?? {}).forEach(([field, messages]) => {
          const firstMessage = messages?.[0]
          if (!firstMessage) {
            return
          }

          emailForm.setError(field as keyof EmailChangeInput, {
            type: 'server',
            message: firstMessage,
          })
        })

        throw new Error(payload.error ?? 'E-Mail-Adresse konnte nicht aktualisiert werden.')
      }

      emailForm.reset({
        email: payload.email ?? values.email,
        current_password: '',
      })
      setShowCurrentEmailPassword(false)
      setSuccess(payload.message ?? 'Deine E-Mail-Adresse wurde aktualisiert.')
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'E-Mail-Adresse konnte nicht aktualisiert werden.'
      )
    }
  }

  async function onSubmitPassword(values: PasswordChangeInput) {
    try {
      setError(null)
      setSuccess(null)

      const response = await fetch('/api/auth/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type: 'password',
          ...values,
        }),
      })

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
        details?: Record<string, string[] | undefined>
        message?: string
      }

      if (!response.ok) {
        Object.entries(payload.details ?? {}).forEach(([field, messages]) => {
          const firstMessage = messages?.[0]
          if (!firstMessage) {
            return
          }

          passwordForm.setError(field as keyof PasswordChangeInput, {
            type: 'server',
            message: firstMessage,
          })
        })

        throw new Error(payload.error ?? 'Passwort konnte nicht aktualisiert werden.')
      }

      passwordForm.reset({
        current_password: '',
        new_password: '',
        confirm_password: '',
      })
      setShowCurrentPassword(false)
      setShowNewPassword(false)
      setShowConfirmPassword(false)
      setSuccess(payload.message ?? 'Dein Passwort wurde aktualisiert.')
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Passwort konnte nicht aktualisiert werden.'
      )
    }
  }

  const isAdmin = initialData.role === 'admin'
  const submitLabel =
    mode === 'onboarding' ? 'Onboarding abschliessen' : 'Profil speichern'
  const avatarPreviewTransform = avatarCropDraft
    ? getAvatarTransform(
        avatarCropDraft.imageWidth,
        avatarCropDraft.imageHeight,
        avatarCropZoom,
        avatarCropX,
        avatarCropY,
        AVATAR_PREVIEW_SIZE
      )
    : null

  return (
    <>
      <Dialog
        open={Boolean(avatarCropDraft)}
        onOpenChange={(open) => {
          if (!open) {
            closeAvatarCropDialog()
          }
        }}
      >
        <DialogContent className="max-w-2xl rounded-[32px] border border-[#e6ddcf] bg-[#fffaf4] p-0 shadow-[0_24px_80px_rgba(68,48,24,0.22)]">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-xl text-slate-900">Profilbild anpassen</DialogTitle>
            <DialogDescription className="text-sm leading-6 text-slate-600">
              Richte dein Bild in der runden Maske aus. Du kannst es horizontal, vertikal und per Zoom anpassen.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 px-6 pb-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <div className="flex justify-center">
              <div className="relative rounded-[30px] border border-[#eadfce] bg-[radial-gradient(circle_at_top,_#fffdf9,_#f5ede1)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                <div
                  className="relative overflow-hidden rounded-full border-4 border-white bg-[#ede4d7] shadow-[0_16px_40px_rgba(92,63,28,0.18)]"
                  style={{ width: AVATAR_PREVIEW_SIZE, height: AVATAR_PREVIEW_SIZE }}
                >
                  {avatarCropDraft && avatarPreviewTransform && (
                    <Image
                      src={avatarCropDraft.previewUrl}
                      alt="Profilbild-Vorschau"
                      width={Math.round(avatarPreviewTransform.width)}
                      height={Math.round(avatarPreviewTransform.height)}
                      unoptimized
                      className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                      style={{
                        width: avatarPreviewTransform.width,
                        height: avatarPreviewTransform.height,
                        transform: `translate(calc(-50% + ${avatarPreviewTransform.offsetX}px), calc(-50% + ${avatarPreviewTransform.offsetY}px))`,
                      }}
                    />
                  )}
                </div>
                <div className="pointer-events-none absolute inset-x-10 top-10 h-[280px] rounded-full ring-1 ring-black/10" />
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-[24px] border border-[#eadfce] bg-white/85 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Move className="h-4 w-4 text-[#9c4f2c]" />
                  Bild verschieben
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-slate-600">
                      <Label htmlFor="avatar-crop-x">Links / Rechts</Label>
                      <span>{avatarCropX}%</span>
                    </div>
                    <input
                      id="avatar-crop-x"
                      type="range"
                      min={-100}
                      max={100}
                      step={1}
                      value={avatarCropX}
                      onChange={(event) => setAvatarCropX(Number(event.target.value))}
                      className="h-2 w-full cursor-pointer accent-[#b85e34]"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-slate-600">
                      <Label htmlFor="avatar-crop-y">Oben / Unten</Label>
                      <span>{avatarCropY}%</span>
                    </div>
                    <input
                      id="avatar-crop-y"
                      type="range"
                      min={-100}
                      max={100}
                      step={1}
                      value={avatarCropY}
                      onChange={(event) => setAvatarCropY(Number(event.target.value))}
                      className="h-2 w-full cursor-pointer accent-[#b85e34]"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-[#dceee9] bg-white/85 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <ZoomIn className="h-4 w-4 text-[#0d9488]" />
                  Zoom
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-slate-600">
                    <Label htmlFor="avatar-crop-zoom">Ausschnitt vergroessern</Label>
                    <span>{avatarCropZoom.toFixed(1)}x</span>
                  </div>
                  <input
                    id="avatar-crop-zoom"
                    type="range"
                    min={AVATAR_MIN_ZOOM}
                    max={AVATAR_MAX_ZOOM}
                    step={0.1}
                    value={avatarCropZoom}
                    onChange={(event) => setAvatarCropZoom(Number(event.target.value))}
                    className="h-2 w-full cursor-pointer accent-[#0d9488]"
                  />
                </div>
              </div>

              <p className="text-sm leading-6 text-slate-500">
                Der markierte runde Bereich entspricht deinem finalen Profilbild in Sidebar und Account.
              </p>
            </div>
          </div>

          <DialogFooter className="border-t border-[#eadfce] bg-white/70 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-[#d8d0c3] bg-white"
              onClick={closeAvatarCropDialog}
              disabled={avatarPending}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
              onClick={() => void confirmAvatarCrop()}
              disabled={avatarPending || !avatarCropDraft}
            >
              {avatarPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Zuschnitt übernehmen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              : 'Persönliche Daten und Profilbild'}
          </CardTitle>
          <p className="text-sm leading-6 text-slate-600">
            {mode === 'onboarding'
              ? 'Bitte vervollständige jetzt dein Profil. Vorname und Nachname sind für alle verpflichtend.'
              : 'Hier kannst du deine persönlichen Daten jederzeit aktualisieren.'}
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

          <form
            id="tenant-profile-form"
            onSubmit={handleSubmit((values) => void onSubmit(values))}
            className="space-y-8"
          >
            <section className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Profilbild
                </h2>
                <p className="text-sm text-slate-500">
                  Optional, aber hilfreich für Sidebar und Team-Kontext.
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

            {isAdmin && mode !== 'onboarding' && (
              <section className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
                <div className="space-y-2">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Agentur-Logo
                  </h2>
                  <p className="text-sm text-slate-500">
                    Das Logo erscheint in der Sidebar und auf den öffentlichen Auth-Seiten eures Tenants.
                  </p>
                </div>
                <div className="rounded-[28px] border border-[#efe5d8] bg-[#fffaf4] p-5">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                    <div className="flex h-24 w-32 items-center justify-center rounded-[24px] border border-[#eadfce] bg-white px-4 shadow-sm">
                      {tenantLogoUrl ? (
                        <Image
                          src={tenantLogoUrl}
                          alt="Agentur-Logo"
                          width={160}
                          height={96}
                          className="max-h-16 w-auto object-contain"
                          unoptimized
                        />
                      ) : (
                        <div className="text-center text-sm text-slate-400">Noch kein Logo hinterlegt</div>
                      )}
                    </div>
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full border-[#d8d0c3] bg-white"
                          onClick={() => tenantLogoInputRef.current?.click()}
                          disabled={tenantLogoPending}
                        >
                          {tenantLogoPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          {tenantLogoUrl ? 'Logo ändern' : 'Logo hochladen'}
                        </Button>
                        {tenantLogoUrl && (
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-full border-[#ead4c8] bg-white text-[#9f4a24]"
                            onClick={() => void removeTenantLogo()}
                            disabled={tenantLogoPending}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Logo entfernen
                          </Button>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">PNG, JPG, WEBP oder SVG bis 2 MB.</p>
                      <input
                        ref={tenantLogoInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={(event) => void handleTenantLogoChange(event)}
                      />
                    </div>
                  </div>
                </div>
              </section>
            )}

            <section className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Persönliche Daten
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
                      Diese Angaben sind für Admins verpflichtend. Mit * markierte Felder müssen ausgefüllt werden.
                    </p>
                  </div>
                  <div className="grid gap-4 rounded-[28px] border border-[#efe5d8] bg-[#fffaf4] p-5 md:grid-cols-2">
                    {mode === 'onboarding' && (
                      <div className="md:col-span-2 rounded-2xl border border-[#f1d4b7] bg-[#fff4ea] px-4 py-3 text-sm text-[#8c4a19]">
                        Rechnungsdaten sind für Admins Pflichtfelder und werden benötigt, bevor das Onboarding abgeschlossen werden kann.
                      </div>
                    )}
                    <div className="space-y-2 md:col-span-2">
                      <RequiredLabel htmlFor="billing_company">Firma</RequiredLabel>
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
                      <RequiredLabel htmlFor="billing_street">Straße und Hausnummer</RequiredLabel>
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
                      <RequiredLabel htmlFor="billing_zip">PLZ</RequiredLabel>
                      <Input id="billing_zip" className={fieldClassName} {...register('billing_zip')} />
                      {errors.billing_zip && (
                        <p className="text-sm text-destructive">{errors.billing_zip.message}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <RequiredLabel htmlFor="billing_city">Stadt</RequiredLabel>
                      <Input id="billing_city" className={fieldClassName} {...register('billing_city')} />
                      {errors.billing_city && (
                        <p className="text-sm text-destructive">{errors.billing_city.message}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <RequiredLabel htmlFor="billing_country">Land</RequiredLabel>
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

              </>
            )}

          </form>

          {mode !== 'onboarding' && (
            <>
              <div className="space-y-10 pt-8">
                <section className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Login-E-Mail
                    </h2>
                    <p className="text-sm text-slate-500">
                      Diese Adresse verwendest du für den Login in deinen Workspace.
                    </p>
                  </div>
                  <div className="rounded-[28px] border border-[#efe5d8] bg-[#fffaf4] p-5">
                    <form
                      className="grid gap-4 md:grid-cols-2"
                      onSubmit={emailForm.handleSubmit(onSubmitEmail)}
                    >
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="email">Neue E-Mail-Adresse</Label>
                        <Input
                          id="email"
                          type="email"
                          autoComplete="email"
                          className={fieldClassName}
                          disabled={emailForm.formState.isSubmitting}
                          {...emailForm.register('email')}
                        />
                        {emailForm.formState.errors.email && (
                          <p className="text-sm text-destructive">
                            {emailForm.formState.errors.email.message}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="current_email_password">Aktuelles Passwort</Label>
                        <div className="relative">
                          <Input
                            id="current_email_password"
                            type={showCurrentEmailPassword ? 'text' : 'password'}
                            autoComplete="current-password"
                            className={`${fieldClassName} pr-12`}
                            disabled={emailForm.formState.isSubmitting}
                            {...emailForm.register('current_password')}
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:text-slate-700"
                            onClick={() => setShowCurrentEmailPassword((value) => !value)}
                            aria-label={
                              showCurrentEmailPassword
                                ? 'Aktuelles Passwort ausblenden'
                                : 'Aktuelles Passwort anzeigen'
                            }
                          >
                            {showCurrentEmailPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                        {emailForm.formState.errors.current_password && (
                          <p className="text-sm text-destructive">
                            {emailForm.formState.errors.current_password.message}
                          </p>
                        )}
                      </div>
                      <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 pt-2">
                        <p className="text-sm text-slate-500">
                          Zur Sicherheit bestätigen wir die Änderung mit deinem aktuellen Passwort.
                        </p>
                        <Button
                          type="submit"
                          className="rounded-full bg-[#0f766e] px-5 hover:bg-[#0d5f59]"
                          disabled={emailForm.formState.isSubmitting}
                        >
                          {emailForm.formState.isSubmitting ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          E-Mail-Adresse speichern
                        </Button>
                      </div>
                    </form>
                  </div>
                </section>

                <section className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Passwort
                    </h2>
                    <p className="text-sm text-slate-500">
                      Ändere dein Passwort direkt hier, ohne den Reset-Flow nutzen zu müssen.
                    </p>
                  </div>
                  <div className="rounded-[28px] border border-[#efe5d8] bg-[#fffaf4] p-5">
                    <form
                      className="grid gap-4 md:grid-cols-2"
                      onSubmit={passwordForm.handleSubmit(onSubmitPassword)}
                    >
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="current_password">Aktuelles Passwort</Label>
                        <div className="relative">
                          <Input
                            id="current_password"
                            type={showCurrentPassword ? 'text' : 'password'}
                            autoComplete="current-password"
                            className={`${fieldClassName} pr-12`}
                            disabled={passwordForm.formState.isSubmitting}
                            {...passwordForm.register('current_password')}
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:text-slate-700"
                            onClick={() => setShowCurrentPassword((value) => !value)}
                            aria-label={
                              showCurrentPassword
                                ? 'Aktuelles Passwort ausblenden'
                                : 'Aktuelles Passwort anzeigen'
                            }
                          >
                            {showCurrentPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                        {passwordForm.formState.errors.current_password && (
                          <p className="text-sm text-destructive">
                            {passwordForm.formState.errors.current_password.message}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new_password">Neues Passwort</Label>
                        <div className="relative">
                          <Input
                            id="new_password"
                            type={showNewPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            className={`${fieldClassName} pr-12`}
                            disabled={passwordForm.formState.isSubmitting}
                            {...passwordForm.register('new_password')}
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:text-slate-700"
                            onClick={() => setShowNewPassword((value) => !value)}
                            aria-label={
                              showNewPassword
                                ? 'Neues Passwort ausblenden'
                                : 'Neues Passwort anzeigen'
                            }
                          >
                            {showNewPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                        {passwordForm.formState.errors.new_password && (
                          <p className="text-sm text-destructive">
                            {passwordForm.formState.errors.new_password.message}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirm_password">Neues Passwort bestätigen</Label>
                        <div className="relative">
                          <Input
                            id="confirm_password"
                            type={showConfirmPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            className={`${fieldClassName} pr-12`}
                            disabled={passwordForm.formState.isSubmitting}
                            {...passwordForm.register('confirm_password')}
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:text-slate-700"
                            onClick={() => setShowConfirmPassword((value) => !value)}
                            aria-label={
                              showConfirmPassword
                                ? 'Passwort-Bestätigung ausblenden'
                                : 'Passwort-Bestätigung anzeigen'
                            }
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                        {passwordForm.formState.errors.confirm_password && (
                          <p className="text-sm text-destructive">
                            {passwordForm.formState.errors.confirm_password.message}
                          </p>
                        )}
                      </div>
                      <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 pt-2">
                        <p className="text-sm text-slate-500">
                          Das neue Passwort muss mindestens 8 Zeichen lang sein.
                        </p>
                        <Button
                          type="submit"
                          className="rounded-full bg-[#0f766e] px-5 hover:bg-[#0d5f59]"
                          disabled={passwordForm.formState.isSubmitting}
                        >
                          {passwordForm.formState.isSubmitting ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          Passwort aktualisieren
                        </Button>
                      </div>
                    </form>
                  </div>
                </section>
              </div>
            </>
          )}

          {isAdmin && (
            <section className="grid gap-6 pt-6 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Stripe
                </h2>
                <p className="text-sm text-slate-500">
                  {mode === 'onboarding'
                    ? 'Zum Abschluss des Admin-Onboardings ist eine hinterlegte Zahlungsmethode erforderlich.'
                    : 'Zahlungsmethode für Abrechnung und späteres Abo verwalten.'}
                </p>
              </div>
              <div className="space-y-4 rounded-[28px] border border-[#efe5d8] bg-[#fffaf4] p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-[#b85e34]" />
                      <span className="text-sm font-semibold text-slate-900">Zahlungsmethode</span>
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
                        ? 'Zahlungsmethode ändern'
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
          )}

          <div className="mt-10 flex flex-col gap-3 border-t border-[#efe5d8] pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <UserRound className="h-4 w-4" />
              {mode === 'onboarding'
                ? 'Nach dem Abschluss kannst du alles später im Profil ändern.'
                : 'Änderungen werden sofort für deinen Workspace übernommen.'}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {mode !== 'onboarding' && (
                <TenantLogoutButton className="h-[48px] rounded-xl border-[#e3daca] bg-white px-6" />
              )}
              <Button
                type="submit"
                form="tenant-profile-form"
                className="h-[48px] rounded-xl bg-[#1dbfaa] px-6 text-white shadow-[0_4px_14px_rgba(29,191,170,0.28)] transition hover:bg-[#18a896] disabled:opacity-60"
                disabled={isSaving}
              >
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {submitLabel}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </>
  )
}
