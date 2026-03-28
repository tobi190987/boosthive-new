'use client'

import Image from 'next/image'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  AlertCircle,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  LogOut,
  Move,
  Trash2,
  ZoomIn,
} from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
  applyServerFieldErrors,
  fetchJson,
  getPayloadError,
  type ApiFormPayload,
} from '@/lib/client-form'
import { getUserInitials } from '@/lib/profile'
import { BaseProfileSchema, type ProfileUpdateInput } from '@/lib/schemas/profile'
import {
  EmailChangeSchema,
  PasswordChangeSchema,
  type EmailChangeInput,
  type PasswordChangeInput,
} from '@/lib/schemas/auth'

interface OwnerProfileWorkspaceProps {
  initialData: {
    email: string
    firstName: string
    lastName: string
    avatarUrl: string | null
  }
}

interface AvatarCropDraft {
  file: File
  previewUrl: string
  imageWidth: number
  imageHeight: number
}

interface AvatarResponse extends ApiFormPayload {
  avatar_url?: string | null
}

interface AccountEmailResponse extends ApiFormPayload {
  email?: string
}

type OwnerProfileFormValues = Pick<ProfileUpdateInput, 'first_name' | 'last_name'>

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

export function OwnerProfileWorkspace({ initialData }: OwnerProfileWorkspaceProps) {
  const [avatarUrl, setAvatarUrl] = useState(initialData.avatarUrl)
  const [avatarPending, setAvatarPending] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
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

  const form = useForm<OwnerProfileFormValues>({
    resolver: zodResolver(BaseProfileSchema),
    defaultValues: {
      first_name: initialData.firstName,
      last_name: initialData.lastName,
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
    return () => {
      if (avatarCropDraft) {
        URL.revokeObjectURL(avatarCropDraft.previewUrl)
      }
    }
  }, [avatarCropDraft])

  function clearFeedback() {
    setError(null)
    setSuccess(null)
  }

  function closeAvatarCropDialog() {
    if (avatarCropDraft) {
      URL.revokeObjectURL(avatarCropDraft.previewUrl)
    }
    setAvatarCropDraft(null)
    setAvatarCropX(0)
    setAvatarCropY(0)
    setAvatarCropZoom(1.2)
  }

  async function uploadAvatar(file: File) {
    const formData = new FormData()
    formData.set('file', file)

    const { response, payload } = await fetchJson<AvatarResponse>('/api/owner/profile/avatar', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    })

    if (!response.ok) {
      throw new Error(getPayloadError(payload, 'Profilbild konnte nicht gespeichert werden.'))
    }

    setAvatarUrl(payload?.avatar_url ?? null)
  }

  async function handleLogout() {
    try {
      setIsLoggingOut(true)
      await fetch('/api/auth/logout', { method: 'POST' })
      window.location.href = '/owner/login'
    } finally {
      setIsLoggingOut(false)
    }
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('Das Bild darf maximal 2 MB gross sein.')
      return
    }

    try {
      clearFeedback()
      const meta = await loadImageMeta(file)
      setAvatarCropDraft({
        file,
        previewUrl: meta.previewUrl,
        imageWidth: meta.imageWidth,
        imageHeight: meta.imageHeight,
      })
      setAvatarCropX(0)
      setAvatarCropY(0)
      setAvatarCropZoom(1.2)
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Bild konnte nicht geladen werden.')
    }
  }

  async function confirmAvatarCrop() {
    if (!avatarCropDraft) return

    try {
      setAvatarPending(true)
      clearFeedback()

      const croppedFile = await renderCroppedAvatar(
        avatarCropDraft,
        avatarCropZoom,
        avatarCropX,
        avatarCropY
      )
      await uploadAvatar(croppedFile)
      closeAvatarCropDialog()
      setSuccess('Dein Profilbild wurde aktualisiert.')
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Profilbild konnte nicht aktualisiert werden.'
      )
    } finally {
      setAvatarPending(false)
    }
  }

  async function removeAvatar() {
    try {
      setAvatarPending(true)
      clearFeedback()

      const { response, payload } = await fetchJson<AvatarResponse>('/api/owner/profile/avatar', {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(getPayloadError(payload, 'Profilbild konnte nicht entfernt werden.'))
      }

      setAvatarUrl(payload?.avatar_url ?? null)
      setSuccess('Dein Profilbild wurde entfernt.')
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

  async function onSubmit(values: OwnerProfileFormValues) {
    try {
      setIsSaving(true)
      clearFeedback()

      const { response, payload } = await fetchJson<ApiFormPayload>('/api/owner/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(values),
      })

      if (!response.ok) {
        applyServerFieldErrors(form.setError, payload?.details)
        throw new Error(getPayloadError(payload, 'Profil konnte nicht gespeichert werden.'))
      }

      setSuccess('Deine Profildaten wurden gespeichert.')
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Profil konnte nicht gespeichert werden.'
      )
    } finally {
      setIsSaving(false)
    }
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
        submitError instanceof Error ? submitError.message : 'Passwort konnte nicht aktualisiert werden.'
      )
    }
  }

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
                      <Label htmlFor="owner-avatar-crop-x">Links / Rechts</Label>
                      <span>{avatarCropX}%</span>
                    </div>
                    <input
                      id="owner-avatar-crop-x"
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
                      <Label htmlFor="owner-avatar-crop-y">Oben / Unten</Label>
                      <span>{avatarCropY}%</span>
                    </div>
                    <input
                      id="owner-avatar-crop-y"
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
                    <Label htmlFor="owner-avatar-crop-zoom">Ausschnitt vergroessern</Label>
                    <span>{avatarCropZoom.toFixed(1)}x</span>
                  </div>
                  <input
                    id="owner-avatar-crop-zoom"
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
                Owner Profil
              </Badge>
              <Badge className="rounded-full bg-[#f6efe4] text-[#8b5e34] hover:bg-[#f6efe4]">
                Plattform
              </Badge>
            </div>
            <CardTitle className="text-2xl text-slate-900">
              Persönliche Daten und Profilbild
            </CardTitle>
            <p className="text-sm leading-6 text-slate-600">
              Hier kannst du deine persönlichen Daten als Plattform-Owner jederzeit aktualisieren.
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
              id="owner-profile-form"
              onSubmit={form.handleSubmit((values) => void onSubmit(values))}
              className="space-y-8"
            >
              <section className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
                <div className="space-y-2">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Profilbild
                  </h2>
                  <p className="text-sm text-slate-500">
                    Optional, aber hilfreich fuer Sidebar und Account-Kontext.
                  </p>
                </div>
                <div className="rounded-[28px] border border-[#efe5d8] bg-[#fffaf4] p-5">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                    <Avatar className="h-24 w-24 border border-[#dceee9] shadow-sm">
                      <AvatarImage src={avatarUrl ?? undefined} alt="Profilbild" />
                      <AvatarFallback className="bg-[#e8f8f3] text-xl font-semibold text-[#0d9488]">
                        {getUserInitials(
                          {
                            first_name: form.watch('first_name'),
                            last_name: form.watch('last_name'),
                          },
                          initialData.email
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
                    Persönliche Daten
                  </h2>
                  <p className="text-sm text-slate-500">
                    Diese Angaben erscheinen in deinem Profil und in der Sidebar.
                  </p>
                </div>
                <div className="grid gap-4 rounded-[28px] border border-[#efe5d8] bg-[#fffaf4] p-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="owner-first_name">Vorname</Label>
                    <Input id="owner-first_name" className={fieldClassName} {...form.register('first_name')} />
                    {form.formState.errors.first_name && (
                      <p className="text-sm text-destructive">{form.formState.errors.first_name.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="owner-last_name">Nachname</Label>
                    <Input id="owner-last_name" className={fieldClassName} {...form.register('last_name')} />
                    {form.formState.errors.last_name && (
                      <p className="text-sm text-destructive">{form.formState.errors.last_name.message}</p>
                    )}
                  </div>
                </div>
              </section>

            </form>
          </CardContent>
        </Card>

        <Card className="rounded-[30px] border border-[#e4dbcf] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
          <CardHeader>
            <CardTitle className="text-xl text-slate-900">Login-E-Mail</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={emailForm.handleSubmit(onSubmitEmail)}>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="owner-email">Neue E-Mail-Adresse</Label>
                <Input
                  id="owner-email"
                  type="email"
                  autoComplete="email"
                  className={fieldClassName}
                  disabled={emailForm.formState.isSubmitting}
                  {...emailForm.register('email')}
                />
                {emailForm.formState.errors.email && (
                  <p className="text-sm text-destructive">{emailForm.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="owner-current_email_password">Aktuelles Passwort</Label>
                <div className="relative">
                  <Input
                    id="owner-current_email_password"
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
                    aria-label={showCurrentEmailPassword ? 'Passwort ausblenden' : 'Passwort anzeigen'}
                  >
                    {showCurrentEmailPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {emailForm.formState.errors.current_password && (
                  <p className="text-sm text-destructive">
                    {emailForm.formState.errors.current_password.message}
                  </p>
                )}
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button
                  type="submit"
                  className="rounded-full bg-[#1f2937] px-6 text-white hover:bg-[#111827]"
                  disabled={emailForm.formState.isSubmitting}
                >
                  {emailForm.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  E-Mail aktualisieren
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="rounded-[30px] border border-[#e4dbcf] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
          <CardHeader>
            <CardTitle className="text-xl text-slate-900">Passwort ändern</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={passwordForm.handleSubmit(onSubmitPassword)}>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="owner-current_password">Aktuelles Passwort</Label>
                <div className="relative">
                  <Input
                    id="owner-current_password"
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
                    aria-label={showCurrentPassword ? 'Passwort ausblenden' : 'Passwort anzeigen'}
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {passwordForm.formState.errors.current_password && (
                  <p className="text-sm text-destructive">
                    {passwordForm.formState.errors.current_password.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="owner-new_password">Neues Passwort</Label>
                <div className="relative">
                  <Input
                    id="owner-new_password"
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
                    aria-label={showNewPassword ? 'Passwort ausblenden' : 'Passwort anzeigen'}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {passwordForm.formState.errors.new_password && (
                  <p className="text-sm text-destructive">{passwordForm.formState.errors.new_password.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="owner-confirm_password">Neues Passwort wiederholen</Label>
                <div className="relative">
                  <Input
                    id="owner-confirm_password"
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
                    aria-label={showConfirmPassword ? 'Passwort ausblenden' : 'Passwort anzeigen'}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {passwordForm.formState.errors.confirm_password && (
                  <p className="text-sm text-destructive">
                    {passwordForm.formState.errors.confirm_password.message}
                  </p>
                )}
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button
                  type="submit"
                  className="rounded-full bg-[#1f2937] px-6 text-white hover:bg-[#111827]"
                  disabled={passwordForm.formState.isSubmitting}
                >
                  {passwordForm.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Passwort aktualisieren
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="mt-10 flex flex-col gap-3 border-t border-[#efe5d8] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <AlertCircle className="h-4 w-4" />
            Änderungen werden sofort für deinen Owner-Zugang übernommen.
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="outline"
              className="h-[48px] rounded-xl border-[#e3daca] bg-white px-6"
              onClick={() => void handleLogout()}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="mr-2 h-4 w-4" />
              )}
              Abmelden
            </Button>
            <Button
              type="submit"
              form="owner-profile-form"
              className="h-[48px] rounded-xl bg-[#1f2937] px-6 text-white hover:bg-[#111827]"
              disabled={isSaving}
            >
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Profil speichern
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
