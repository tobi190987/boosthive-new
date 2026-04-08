"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, ImageIcon, Loader2, X } from "lucide-react"

import { CreateTenantSchema, type CreateTenantInput } from "@/lib/schemas/tenant"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

export default function NewTenantPage() {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const form = useForm<CreateTenantInput>({
    resolver: zodResolver(CreateTenantSchema),
    defaultValues: {
      name: "",
      slug: "",
      adminEmail: "",
    },
  })

  const slugValue = form.watch("slug")

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      setServerError("Logo darf maximal 2 MB groß sein.")
      return
    }
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
    setServerError(null)
  }

  function removeLogo() {
    setLogoFile(null)
    if (logoPreview) URL.revokeObjectURL(logoPreview)
    setLogoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  async function onSubmit(data: CreateTenantInput) {
    setSubmitting(true)
    setServerError(null)

    try {
      const res = await fetch("/api/owner/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || "Fehler beim Erstellen der Agentur.")
      }

      const body = await res.json().catch(() => ({}))
      const tenantId = (body.tenant as { id?: string } | undefined)?.id

      // Logo hochladen falls vorhanden
      if (logoFile && tenantId) {
        const formData = new FormData()
        formData.append("file", logoFile)
        await fetch(`/api/owner/tenants/${tenantId}/logo`, {
          method: "POST",
          body: formData,
        })
        // Logo-Upload-Fehler sind non-fatal – Tenant wurde bereits erstellt
      }

      router.push("/owner/tenants")
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Unbekannter Fehler.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      {/* Back link */}
      <Button
        variant="ghost"
        asChild
        className="mb-6 -ml-3 text-gray-500 hover:text-gray-900"
      >
        <Link href="/owner/tenants">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurück zu Agenturen
        </Link>
      </Button>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Neue Agentur anlegen
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Erstelle einen neuen Tenant mit eigenem Branding und Admin-Zugang.
        </p>
      </div>

      {/* Error */}
      {serverError && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      {/* Form */}
      <div className="max-w-lg rounded-xl border bg-white dark:bg-card p-6 shadow-sm">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Agentur-Name</FormLabel>
                  <FormControl>
                    <Input placeholder="z.B. Marketing Pro GmbH" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subdomain-Slug</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="z.B. marketing-pro"
                      {...field}
                      onChange={(e) => {
                        const value = e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, "")
                        field.onChange(value)
                      }}
                    />
                  </FormControl>
                  {slugValue && (
                    <p className="text-sm text-gray-500">
                      &rarr; {slugValue}.boost-hive.de
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="adminEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Admin-E-Mail</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="admin@agentur.de"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Logo Upload */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">
                Logo <span className="font-normal text-gray-400">(optional)</span>
              </p>
              {logoPreview ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoPreview}
                    alt="Logo Vorschau"
                    className="h-12 w-auto max-w-[160px] rounded-lg border border-gray-200 object-contain p-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-gray-500"
                    onClick={removeLogo}
                  >
                    <X className="h-3.5 w-3.5" />
                    Entfernen
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 transition hover:border-teal-400 hover:text-teal-600"
                >
                  <ImageIcon className="h-4 w-4" />
                  PNG, JPG oder SVG · max. 2 MB
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                className="hidden"
                onChange={handleLogoChange}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="submit"
                disabled={submitting}
                className="bg-teal-500 hover:bg-teal-600"
              >
                {submitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Agentur erstellen
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/owner/tenants")}
                disabled={submitting}
              >
                Abbrechen
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  )
}
