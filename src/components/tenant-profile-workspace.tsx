'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useForm, useWatch } from 'react-hook-form'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StripeCardForm } from '@/components/stripe-card-form'
import { Switch } from '@/components/ui/switch'
import { TenantLogoutButton } from '@/components/tenant-logout-button'
import { toast } from '@/hooks/use-toast'
import {
  applyServerFieldErrors,
  fetchJson,
  getPayloadError,
  type ApiFormPayload,
} from '@/lib/client-form'
import { getUserInitials } from '@/lib/profile'
import {
  EmailChangeSchema,
  PasswordChangeSchema,
  type EmailChangeInput,
  type PasswordChangeInput,
} from '@/lib/schemas/auth'

interface BillingModule {
  id: string
  name: string
  description: string
  price: number
  currency: string
  status: string
}

interface BillingResponse {
  subscription_status?: 'none' | 'active' | 'past_due' | 'canceled' | 'canceling'
  payment_method: {
    brand: string
    last4: string
    exp_month: number
    exp_year: number
  } | null
  modules?: BillingModule[]
}

interface ProfileSubmitResponse extends ApiFormPayload {
  success?: boolean
  onboarding_complete?: boolean
}

interface AvatarResponse extends ApiFormPayload {
  avatar_url?: string | null
}

interface TenantLogoResponse extends ApiFormPayload {
  logoUrl?: string | null
}

interface AccountEmailResponse extends ApiFormPayload {
  email?: string
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
    notifyOnApprovalDecision: boolean
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
  notify_on_approval_decision: boolean
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

function normalizeProfileValues(values: Partial<ProfileFormValues> | undefined): ProfileFormValues {
  return {
    first_name: values?.first_name ?? '',
    last_name: values?.last_name ?? '',
    notify_on_approval_decision: values?.notify_on_approval_decision ?? false,
    billing_company: values?.billing_company ?? '',
    billing_street: values?.billing_street ?? '',
    billing_zip: values?.billing_zip ?? '',
    billing_city: values?.billing_city ?? '',
    billing_country: values?.billing_country ?? '',
    billing_vat_id: values?.billing_vat_id ?? '',
  }
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
      <span aria-hidden="true" className="text-red-600">
        *
      </span>
      <span className="sr-only">Pflichtfeld</span>
    </Label>
  )
}

const fieldClassName =
  'h-[48px] rounded-xl border-slate-200 dark:border-border bg-white dark:bg-card px-4 text-[15px] text-slate-900 dark:text-slate-100 shadow-sm transition placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:ring-blue-500/20 focus-visible:ring-offset-0'
const billingCountryOptions = [{ value: 'Deutschland', label: 'Deutschland' }] as const
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
  const isSettingsMode = mode === 'settings'
  const [avatarUrl, setAvatarUrl] = useState(initialData.avatarUrl)
  const [tenantLogoUrl, setTenantLogoUrl] = useState(initialData.tenantLogoUrl)
  const [avatarPending, setAvatarPending] = useState(false)
  const [tenantLogoPending, setTenantLogoPending] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showStripeForm, setShowStripeForm] = useState(false)
  const [billing, setBilling] = useState<BillingResponse | null>(null)
  const [billingLoading, setBillingLoading] = useState(initialData.role === 'admin')
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([])
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
    control,
    getValues,
    reset,
    setValue,
    trigger,
    setError: setFieldError,
    watch,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    defaultValues: {
      first_name: initialData.firstName,
      last_name: initialData.lastName,
      notify_on_approval_decision: initialData.notifyOnApprovalDecision,
      billing_company: initialData.billingCompany,
      billing_street: initialData.billingStreet,
      billing_zip: initialData.billingZip,
      billing_city: initialData.billingCity,
      billing_country:
        initialData.billingCountry === 'Deutschland' ? initialData.billingCountry : '',
      billing_vat_id: initialData.billingVatId,
    },
  })
  const watchedProfileValues = useWatch({ control })
  const profileValues = normalizeProfileValues(watchedProfileValues)
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoSaveHydratedRef = useRef(false)
  const lastSavedProfileSnapshotRef = useRef(JSON.stringify(profileValues))
  const hasExistingSubscription =
    billing?.subscription_status === 'active' || billing?.subscription_status === 'canceling'

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

  const refreshBillingStatus = useCallback(async () => {
    try {
      setBillingLoading(true)
      const { response, payload } = await fetchJson<BillingResponse & ApiFormPayload>(
        '/api/tenant/billing',
        {
          credentials: 'include',
        }
      )

      if (!response.ok || !payload) {
        throw new Error(getPayloadError(payload, 'Stripe-Status konnte nicht geladen werden.'))
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
  }, [])

  useEffect(() => {
    if (initialData.role !== 'admin') {
      return
    }

    void refreshBillingStatus()
  }, [initialData.role, refreshBillingStatus])

  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
      if (avatarCropDraft) {
        URL.revokeObjectURL(avatarCropDraft.previewUrl)
      }
    }
  }, [avatarCropDraft])

  function clearFeedback() {
    setError(null)
    setSuccess(null)
  }

  async function uploadAvatarFile(file: File) {
    const formData = new FormData()
    formData.append('file', file)

    const { response, payload } = await fetchJson<AvatarResponse>('/api/tenant/profile/avatar', {
      method: 'POST',
      body: formData,
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(getPayloadError(payload, 'Profilbild konnte nicht hochgeladen werden.'))
    }

    setAvatarUrl(payload?.avatar_url ?? null)
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      clearFeedback()
      if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
        throw new Error('Erlaubt sind PNG, JPG und WEBP bis 2 MB.')
      }
      if (file.size > 2 * 1024 * 1024) {
        throw new Error('Das Bild darf maximal 2 MB groß sein.')
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
      clearFeedback()

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
      clearFeedback()

      const { response, payload } = await fetchJson<AvatarResponse>('/api/tenant/profile/avatar', {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(getPayloadError(payload, 'Profilbild konnte nicht entfernt werden.'))
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
      clearFeedback()

      if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) {
        throw new Error('Erlaubt sind PNG, JPG, WEBP und SVG bis 2 MB.')
      }

      if (file.size > 2 * 1024 * 1024) {
        throw new Error('Das Logo darf maximal 2 MB groß sein.')
      }

      const formData = new FormData()
      formData.append('file', file)

      const { response, payload } = await fetchJson<TenantLogoResponse>('/api/tenant/logo', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(getPayloadError(payload, 'Agentur-Logo konnte nicht hochgeladen werden.'))
      }

      setTenantLogoUrl(payload?.logoUrl ?? null)
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
      clearFeedback()

      const { response, payload } = await fetchJson<TenantLogoResponse>('/api/tenant/logo', {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(getPayloadError(payload, 'Agentur-Logo konnte nicht entfernt werden.'))
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

  const saveProfile = useCallback(async (values: ProfileFormValues, options?: { showToast?: boolean }) => {
    try {
      setIsSaving(true)
      clearFeedback()
      const submittedValues = normalizeProfileValues(values)
      const submittedSnapshot = JSON.stringify(submittedValues)

      const isAdminOnboarding = mode === 'onboarding' && initialData.role === 'admin'
      const fallbackError =
        mode === 'onboarding'
          ? 'Onboarding konnte nicht abgeschlossen werden.'
          : 'Profil konnte nicht gespeichert werden.'

      // Validate module selection for admin onboarding
      if (isAdminOnboarding && !hasExistingSubscription && selectedModuleIds.length === 0) {
        setError('Bitte wähle mindestens ein Modul aus.')
        return
      }

      const { response, payload } = await fetchJson<ProfileSubmitResponse>('/api/tenant/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...submittedValues,
          complete_onboarding: mode === 'onboarding',
        }),
      })

      if (!response.ok) {
        applyServerFieldErrors(setFieldError, payload?.details)
        throw new Error(getPayloadError(payload, fallbackError))
      }

      // For admin onboarding: create Stripe subscription with selected modules
      if (isAdminOnboarding && !hasExistingSubscription) {
        const subscribeResponse = await fetch('/api/tenant/billing/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ module_ids: selectedModuleIds }),
        })
        const subscribePayload = await subscribeResponse.json().catch(() => ({}))
        if (subscribeResponse.status === 409) {
          // Another admin may already have completed the tenant subscription.
          void refreshBillingStatus()
        } else if (!subscribeResponse.ok) {
          throw new Error(subscribePayload.error ?? 'Abo konnte nicht erstellt werden.')
        }
      }

      if (mode === 'onboarding' && payload?.redirectTo) {
        window.location.assign(payload.redirectTo)
        return
      }

      lastSavedProfileSnapshotRef.current = submittedSnapshot

      const currentValues = normalizeProfileValues(getValues())
      const currentSnapshot = JSON.stringify(currentValues)

      if (currentSnapshot === submittedSnapshot) {
        reset(submittedValues)
      }

      if (options?.showToast) {
        toast({
          description: 'Einstellung gespeichert.',
          duration: 2200,
        })
      } else {
        setSuccess('Deine Profildaten wurden gespeichert.')
      }

      return true
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : mode === 'onboarding'
            ? 'Onboarding konnte nicht abgeschlossen werden.'
            : 'Profil konnte nicht gespeichert werden.'
      )

      return false
    } finally {
      setIsSaving(false)
    }
  }, [getValues, hasExistingSubscription, initialData.role, mode, refreshBillingStatus, reset, selectedModuleIds, setFieldError])

  const handleNotifyOnApprovalDecisionChange = useCallback(
    (checked: boolean) => {
      setValue('notify_on_approval_decision', checked, {
        shouldDirty: true,
        shouldTouch: true,
      })

      if (mode !== 'settings') {
        return
      }

      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
        autoSaveTimeoutRef.current = null
      }

      const nextValues = normalizeProfileValues({
        ...getValues(),
        notify_on_approval_decision: checked,
      })

      void saveProfile(nextValues, { showToast: true })
    },
    [getValues, mode, saveProfile, setValue]
  )

  async function onSubmit(values: ProfileFormValues) {
    await saveProfile(values)
  }

  async function onSubmitEmail(values: EmailChangeInput) {
    try {
      clearFeedback()

      const { response, payload } = await fetchJson<AccountEmailResponse>('/api/auth/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type: 'email',
          ...values,
        }),
      })

      if (!response.ok) {
        applyServerFieldErrors(emailForm.setError, payload?.details)
        throw new Error(getPayloadError(payload, 'E-Mail-Adresse konnte nicht aktualisiert werden.'))
      }

      emailForm.reset({
        email: payload?.email ?? values.email,
        current_password: '',
      })
      setShowCurrentEmailPassword(false)
      setSuccess(payload?.message ?? 'Deine E-Mail-Adresse wurde aktualisiert.')
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
      clearFeedback()

      const { response, payload } = await fetchJson<ApiFormPayload>('/api/auth/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type: 'password',
          ...values,
        }),
      })

      if (!response.ok) {
        applyServerFieldErrors(passwordForm.setError, payload?.details)
        throw new Error(getPayloadError(payload, 'Passwort konnte nicht aktualisiert werden.'))
      }

      passwordForm.reset({
        current_password: '',
        new_password: '',
        confirm_password: '',
      })
      setShowCurrentPassword(false)
      setShowNewPassword(false)
      setShowConfirmPassword(false)
      setSuccess(payload?.message ?? 'Dein Passwort wurde aktualisiert.')
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Passwort konnte nicht aktualisiert werden.'
      )
    }
  }

  const isAdmin = initialData.role === 'admin'
  const billingCountry = watch('billing_country')
  const notifyOnApprovalDecision = watch('notify_on_approval_decision')
  const submitLabel =
    mode === 'onboarding' ? 'Onboarding abschließen' : 'Profil speichern'
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

  useEffect(() => {
    if (!isSettingsMode) {
      return
    }

    const snapshot = JSON.stringify(profileValues)

    if (!autoSaveHydratedRef.current) {
      autoSaveHydratedRef.current = true
      lastSavedProfileSnapshotRef.current = snapshot
      return
    }

    if (snapshot === lastSavedProfileSnapshotRef.current || isSaving) {
      return
    }

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      void (async () => {
        const isValid = await trigger()
        if (!isValid) {
          return
        }

        await saveProfile(profileValues, { showToast: true })
      })()
    }, 700)

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
        autoSaveTimeoutRef.current = null
      }
    }
  }, [isSaving, isSettingsMode, profileValues, saveProfile, trigger])

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
        <DialogContent className="max-w-2xl rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card p-0 shadow-soft">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-xl text-slate-900 dark:text-slate-100">Profilbild anpassen</DialogTitle>
            <DialogDescription className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              Richte dein Bild in der runden Maske aus. Du kannst es horizontal, vertikal und per Zoom anpassen.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 px-6 pb-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <div className="flex justify-center">
              <div className="relative rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card p-5 shadow-soft">
                <div
                  className="relative overflow-hidden rounded-full border-4 border-white bg-slate-100 dark:bg-secondary shadow-soft"
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
              <div className="rounded-2xl border border-slate-100 bg-white/85 p-4 dark:border-border dark:bg-card/85">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                  <Move className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  Bild verschieben
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
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
                      className="h-2 w-full cursor-pointer accent-blue-600"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
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
                      className="h-2 w-full cursor-pointer accent-blue-600"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white/85 p-4 dark:border-border dark:bg-card/85">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                  <ZoomIn className="h-4 w-4 text-blue-600" />
                  Zoom
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
                    <Label htmlFor="avatar-crop-zoom">Ausschnitt vergrößern</Label>
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
                    className="h-2 w-full cursor-pointer accent-blue-600"
                  />
                </div>
              </div>

              <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                Der markierte runde Bereich entspricht deinem finalen Profilbild in Sidebar und Account.
              </p>
            </div>
          </div>

          <DialogFooter className="border-t border-slate-100 bg-white/70 px-6 py-4 dark:border-border dark:bg-card/80">
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-slate-200 dark:border-border bg-white dark:bg-card"
              onClick={closeAvatarCropDialog}
              disabled={avatarPending}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              variant="dark"
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
      <Card className="rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge className="rounded-full bg-blue-50 text-blue-600 hover:bg-blue-50">
              {mode === 'onboarding' ? 'Erster Login' : 'Profil'}
            </Badge>
            <Badge className="rounded-full bg-slate-100 dark:bg-secondary text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#252d3a]">
              {isAdmin ? 'Admin' : 'Member'}
            </Badge>
          </div>
          <CardTitle className="text-2xl text-slate-900 dark:text-slate-100">
            {mode === 'onboarding'
              ? `Willkommen bei ${initialData.tenantName}`
              : 'Persönliche Daten und Profilbild'}
          </CardTitle>
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            {mode === 'onboarding'
              ? 'Bitte vervollständige jetzt dein Profil. Vorname und Nachname sind für alle verpflichtend.'
              : 'Hier kannst du deine persönlichen Daten jederzeit aktualisieren.'}
          </p>
        </CardHeader>
        <CardContent>
          {(error || (success && !isSettingsMode)) && (
            <div className="mb-6 space-y-3">
              {error && (
                <Alert className="rounded-2xl border-red-200 bg-red-50 text-red-700">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {success && (
                <Alert className="rounded-2xl border-blue-200 bg-blue-50 text-blue-600">
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
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                  Profilbild
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Optional, aber hilfreich für Sidebar und Team-Kontext.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card p-5">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                  <Avatar className="h-24 w-24 border border-slate-100 dark:border-border shadow-sm">
                    <AvatarImage src={avatarUrl ?? undefined} alt="Profilbild" />
                    <AvatarFallback className="bg-blue-50 text-xl font-semibold text-blue-600">
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
                        className="rounded-full border-slate-200 dark:border-border bg-white dark:bg-card"
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
                          className="rounded-full border-slate-200 dark:border-border bg-white dark:bg-card text-slate-600 dark:text-slate-300"
                          onClick={() => void removeAvatar()}
                          disabled={avatarPending}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Bild entfernen
                        </Button>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">PNG, JPG oder WEBP bis 2 MB.</p>
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
                  <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                    Agentur-Logo
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Das Logo erscheint in der Sidebar und auf den öffentlichen Auth-Seiten eures Tenants.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card p-5">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                    <div className="flex h-24 w-32 items-center justify-center rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card px-4 shadow-sm">
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
                        <div className="text-center text-sm text-slate-400 dark:text-slate-500">Noch kein Logo hinterlegt</div>
                      )}
                    </div>
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full border-slate-200 dark:border-border bg-white dark:bg-card"
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
                            className="rounded-full border-slate-200 dark:border-border bg-white dark:bg-card text-slate-600 dark:text-slate-300"
                            onClick={() => void removeTenantLogo()}
                            disabled={tenantLogoPending}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Logo entfernen
                          </Button>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">PNG, JPG, WEBP oder SVG bis 2 MB.</p>
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
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                  Persönliche Daten
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Diese Angaben erscheinen in deinem Profil und in der Sidebar.
                </p>
              </div>
              <div className="grid gap-4 rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card p-5 md:grid-cols-2">
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

            <section className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                  Benachrichtigungen
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Lege fest, ob du zusätzlich zur Dashboard-Benachrichtigung auch E-Mails erhalten möchtest.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card p-5">
                <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-border dark:bg-secondary/50">
                  <div className="space-y-1">
                    <Label htmlFor="notify_on_approval_decision" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      E-Mail bei Freigaben und Korrekturwünschen
                    </Label>
                    <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                      Wenn ein Kunde eine Ad oder ein Content Briefing freigibt oder eine Korrektur anfragt, senden wir dir zusätzlich eine E-Mail.
                    </p>
                  </div>
                  <Switch
                    id="notify_on_approval_decision"
                    checked={notifyOnApprovalDecision}
                    onCheckedChange={handleNotifyOnApprovalDecisionChange}
                  />
                </div>
              </div>
            </section>

            {isAdmin && (
              <>
                <section className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                      Rechnungsadresse
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Diese Angaben sind für Admins verpflichtend. Mit * markierte Felder müssen ausgefüllt werden.
                    </p>
                  </div>
                  <div className="grid gap-4 rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card p-5 md:grid-cols-2">
                    {mode === 'onboarding' && (
                      <div className="md:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
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
                      <Select
                        value={billingCountry || undefined}
                        onValueChange={(value) => {
                          setValue('billing_country', value, {
                            shouldDirty: true,
                            shouldTouch: true,
                            shouldValidate: true,
                          })
                        }}
                      >
                        <SelectTrigger id="billing_country" className={fieldClassName}>
                          <SelectValue placeholder="Land auswählen" />
                        </SelectTrigger>
                        <SelectContent>
                          {billingCountryOptions.map((country) => (
                            <SelectItem key={country.value} value={country.value}>
                              {country.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                    <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                      Login-E-Mail
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Diese Adresse verwendest du für den Login in deinen Workspace.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card p-5">
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
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 dark:text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300"
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
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Zur Sicherheit bestätigen wir die Änderung mit deinem aktuellen Passwort.
                        </p>
                        <Button
                          type="submit"
                          className="rounded-full bg-slate-900 px-5 text-white hover:bg-slate-800"
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
                    <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                      Passwort
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Ändere dein Passwort direkt hier, ohne den Reset-Flow nutzen zu müssen.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card p-5">
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
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 dark:text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300"
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
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 dark:text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300"
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
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 dark:text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300"
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
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Das neue Passwort muss mindestens 8 Zeichen lang sein.
                        </p>
                        <Button
                          type="submit"
                          className="rounded-full bg-slate-900 px-5 text-white hover:bg-slate-800"
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
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                  Abrechnung
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {mode === 'onboarding'
                    ? 'Hinterlege deine Zahlungsmethode und wähle mindestens ein Modul aus, das du abonnieren möchtest.'
                    : 'Zahlungsmethode für Abrechnung und späteres Abo verwalten.'}
                </p>
              </div>
              <div className="space-y-4 rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Zahlungsmethode</span>
                      <Badge
                        className={
                          billing?.payment_method
                            ? 'rounded-full bg-blue-50 text-blue-600 hover:bg-blue-50'
                            : 'rounded-full bg-slate-100 dark:bg-secondary text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-[#252d3a]'
                        }
                      >
                        {billing?.payment_method ? 'Verbunden' : 'Fehlt'}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {billingLoading
                        ? 'Stripe-Status wird geladen...'
                        : formatCard(billing?.payment_method ?? null)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="dark"
                    onClick={() => setShowStripeForm((value) => !value)}
                  >
                    {showStripeForm
                      ? 'Formular ausblenden'
                      : billing?.payment_method
                        ? 'Zahlungsmethode ändern'
                        : 'Zahlungsmethode hinterlegen'}
                  </Button>
                </div>

                {showStripeForm && (
                  <div className="rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card p-4">
                    <StripeCardForm
                      onCancel={() => setShowStripeForm(false)}
                      onSuccess={() => {
                        setShowStripeForm(false)
                        setSuccess('Zahlungsmethode wurde gespeichert.')
                        void refreshBillingStatus()
                      }}
                    />
                  </div>
                )}

                {/* Module selection — only during onboarding */}
                {mode === 'onboarding' && hasExistingSubscription && (
                  <div className="rounded-2xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-blue-900">
                    Für diesen Workspace besteht bereits ein aktives Abo. Du kannst dein Onboarding ohne neue
                    Modulauswahl abschließen.
                  </div>
                )}

                {mode === 'onboarding' && !hasExistingSubscription && (billing?.modules ?? []).length > 0 && (
                  <div className="space-y-3 border-t border-slate-100 dark:border-border pt-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Module auswählen</span>
                      <Badge className="rounded-full bg-slate-100 dark:bg-secondary text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-[#252d3a] text-[11px]">
                        Pflichtfeld
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Mindestens ein Modul ist erforderlich. Der Basis-Plan (29 €) ist immer inklusive.
                    </p>
                    <div className="space-y-2">
                      {(billing?.modules ?? []).map((mod) => {
                        const selected = selectedModuleIds.includes(mod.id)
                        return (
                          <button
                            key={mod.id}
                            type="button"
                            onClick={() =>
                              setSelectedModuleIds((prev) =>
                                prev.includes(mod.id)
                                  ? prev.filter((x) => x !== mod.id)
                                  : [...prev, mod.id]
                              )
                            }
                            className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                              selected
                                ? 'border-[#1f2937] bg-slate-50 dark:bg-card'
                                : 'border-slate-100 dark:border-border bg-white dark:bg-card hover:border-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                  selected ? 'border-[#1f2937] bg-slate-900' : 'border-[#c9bfb5]'
                                }`}
                              >
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
                                {new Intl.NumberFormat('de-DE', {
                                  style: 'currency',
                                  currency: mod.currency.toUpperCase(),
                                }).format(mod.price / 100)}
                                <span className="font-normal text-slate-400 dark:text-slate-500"> / 4 Wo.</span>
                              </span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          <div className="mt-10 flex flex-col gap-3 border-t border-slate-100 dark:border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <UserRound className="h-4 w-4" />
              {mode === 'onboarding'
                ? 'Nach dem Abschluss kannst du alles später im Profil ändern.'
                : isSaving
                  ? 'Änderungen werden gespeichert...'
                  : 'Änderungen werden automatisch gespeichert.'}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {mode !== 'onboarding' && (
                <TenantLogoutButton className="h-[48px] rounded-xl border-slate-200 dark:border-border bg-white dark:bg-card px-6" />
              )}
              {mode === 'onboarding' && (
                <Button
                  type="submit"
                  form="tenant-profile-form"
                  className="h-[48px] rounded-xl bg-slate-900 px-6 text-white shadow-[0_4px_14px_rgba(0,0,0,0.15)] transition hover:bg-slate-800 disabled:opacity-60"
                  disabled={isSaving || (isAdmin && billingLoading)}
                >
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {submitLabel}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </>
  )
}
