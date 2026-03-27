"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Copy,
  Globe,
  Loader2,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Trash2,
  UserRound,
  Users2,
} from "lucide-react"

import { CreateTenantSchema } from "@/lib/schemas/tenant"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type TenantStatus = "active" | "inactive"
type MemberRole = "admin" | "member"
type MemberStatus = "active" | "inactive"

interface TenantUserRecord {
  memberId: string
  userId: string
  email: string | null
  name: string | null
  role: MemberRole
  status: MemberStatus
  invitedAt: string | null
  joinedAt: string | null
}

interface TenantDetailRecord {
  id: string
  name: string
  slug: string
  status: TenantStatus
  created_at: string
  billing_company?: string | null
  billing_street?: string | null
  billing_zip?: string | null
  billing_city?: string | null
  billing_country?: string | null
  billing_vat_id?: string | null
  contact_person?: string | null
  contact_phone?: string | null
  contact_website?: string | null
  currentAdmin?: {
    name?: string | null
    email?: string | null
  } | null
  users?: TenantUserRecord[]
}

const BasicsSchema = CreateTenantSchema.pick({
  name: true,
  slug: true,
})

const BillingSchema = z
  .object({
    billing_company: z.string().trim().max(120, "Firmenname darf maximal 120 Zeichen lang sein."),
    billing_street: z.string().trim().max(120, "Strasse darf maximal 120 Zeichen lang sein."),
    billing_zip: z.string().trim().max(20, "PLZ darf maximal 20 Zeichen lang sein."),
    billing_city: z.string().trim().max(80, "Stadt darf maximal 80 Zeichen lang sein."),
    billing_country: z.string().trim().max(80, "Land darf maximal 80 Zeichen lang sein."),
    billing_vat_id: z.string().trim().max(40, "USt-IdNr. darf maximal 40 Zeichen lang sein."),
  })
  .superRefine((value, ctx) => {
    const hasAdditionalValue = [
      value.billing_street,
      value.billing_zip,
      value.billing_city,
      value.billing_country,
      value.billing_vat_id,
    ].some((field) => field.length > 0)

    if (hasAdditionalValue && value.billing_company.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["billing_company"],
        message: "Bitte zuerst einen Firmennamen angeben.",
      })
    }
  })

const ContactSchema = z.object({
  contact_person: z.string().trim().max(120, "Ansprechpartner darf maximal 120 Zeichen lang sein."),
  contact_phone: z.string().trim().max(40, "Telefon darf maximal 40 Zeichen lang sein."),
  contact_website: z
    .string()
    .trim()
    .max(160, "Website darf maximal 160 Zeichen lang sein.")
    .refine((value) => value.length === 0 || /^https?:\/\//.test(value), {
      message: "Bitte eine Website mit http:// oder https:// angeben.",
    }),
})

const AdminSchema = z.object({
  email: z.string().trim().email("Bitte eine gültige E-Mail-Adresse eingeben."),
})

type BasicsInput = z.infer<typeof BasicsSchema>
type BillingInput = z.infer<typeof BillingSchema>
type ContactInput = z.infer<typeof ContactSchema>
type AdminInput = z.infer<typeof AdminSchema>

function emptyString(value?: string | null) {
  return value ?? ""
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function statusCopy(status: TenantStatus) {
  return status === "active" ? "Aktiv" : "Pausiert"
}

function memberRoleCopy(role: MemberRole) {
  return role === "admin" ? "Admin" : "User"
}

function memberStatusCopy(status: MemberStatus) {
  return status === "active" ? "Aktiv" : "Pausiert"
}

function formatDateTime(value?: string | null) {
  if (!value) return "Noch nicht verfügbar"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

async function extractPayload(response: Response) {
  return response.json().catch(() => ({}))
}

export function OwnerTenantDetailWorkspace({ tenantId }: { tenantId: string }) {
  const [tenant, setTenant] = useState<TenantDetailRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [serverError, setServerError] = useState<string | null>(null)
  const [apiPendingMessage, setApiPendingMessage] = useState<string | null>(null)
  const [savingSection, setSavingSection] = useState<null | "basics" | "billing" | "contact" | "admin">(null)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<TenantUserRecord | null>(null)

  const basicsForm = useForm<BasicsInput>({
    resolver: zodResolver(BasicsSchema),
    defaultValues: {
      name: "",
      slug: "",
    },
  })

  const billingForm = useForm<BillingInput>({
    resolver: zodResolver(BillingSchema),
    defaultValues: {
      billing_company: "",
      billing_street: "",
      billing_zip: "",
      billing_city: "",
      billing_country: "",
      billing_vat_id: "",
    },
  })

  const contactForm = useForm<ContactInput>({
    resolver: zodResolver(ContactSchema),
    defaultValues: {
      contact_person: "",
      contact_phone: "",
      contact_website: "",
    },
  })

  const adminForm = useForm<AdminInput>({
    resolver: zodResolver(AdminSchema),
    defaultValues: {
      email: "",
    },
  })

  const watchedSlug = basicsForm.watch("slug")
  const slugChanged = tenant ? watchedSlug.trim() !== tenant.slug : false

  async function copyTenantId() {
    const idToCopy = tenant?.id ?? tenantId

    try {
      await navigator.clipboard.writeText(idToCopy)
      toast({
        title: "Tenant-ID kopiert",
        description: "Die vollständige Tenant-ID liegt jetzt in deiner Zwischenablage.",
      })
    } catch {
      toast({
        title: "Kopieren fehlgeschlagen",
        description: "Bitte kopiere die Tenant-ID manuell aus dem Feld.",
        variant: "destructive",
      })
    }
  }

  useEffect(() => {
    let active = true

    async function loadTenant() {
      try {
        setLoading(true)
        setServerError(null)
        setApiPendingMessage(null)

        const response = await fetch(`/api/owner/tenants/${tenantId}`, {
          credentials: "include",
        })
        const payload = await extractPayload(response)

        if (!response.ok) {
          if (response.status === 405) {
            setApiPendingMessage(
              "Die Detail-API für diese Seite wird im Backend-Schritt vervollständigt. Das Frontend ist bereits vorbereitet."
            )
            return
          }

          throw new Error(payload.error || "Tenant-Details konnten nicht geladen werden.")
        }

        if (!active) return

        const nextTenant = payload.tenant ?? payload
        setTenant(nextTenant)

        basicsForm.reset({
          name: emptyString(nextTenant.name),
          slug: emptyString(nextTenant.slug),
        })
        billingForm.reset({
          billing_company: emptyString(nextTenant.billing_company),
          billing_street: emptyString(nextTenant.billing_street),
          billing_zip: emptyString(nextTenant.billing_zip),
          billing_city: emptyString(nextTenant.billing_city),
          billing_country: emptyString(nextTenant.billing_country),
          billing_vat_id: emptyString(nextTenant.billing_vat_id),
        })
        contactForm.reset({
          contact_person: emptyString(nextTenant.contact_person),
          contact_phone: emptyString(nextTenant.contact_phone),
          contact_website: emptyString(nextTenant.contact_website),
        })
      } catch (error) {
        if (!active) return
        setServerError(
          error instanceof Error ? error.message : "Tenant-Details konnten nicht geladen werden."
        )
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadTenant()

    return () => {
      active = false
    }
  }, [tenantId, basicsForm, billingForm, contactForm])

  const tenantHost = useMemo(() => {
    if (!watchedSlug) return "boost-hive.de"
    return `${watchedSlug}.boost-hive.de`
  }, [watchedSlug])

  async function submitPatch<T extends Record<string, unknown>>(
    type: "basics" | "billing" | "contact",
    values: T
  ) {
    setSavingSection(type)
    setServerError(null)

    try {
      const response = await fetch(`/api/owner/tenants/${tenantId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          type,
          ...values,
        }),
      })

      const payload = await extractPayload(response)

      if (!response.ok) {
        if (response.status === 405) {
          throw new Error("Diese Speicheraktion wird im Backend-Schritt aktiviert.")
        }

        if (payload.details && typeof payload.details === "object") {
          const targetForm =
            type === "basics" ? basicsForm : type === "billing" ? billingForm : contactForm

          for (const [fieldName, messages] of Object.entries(payload.details)) {
            if (Array.isArray(messages) && messages[0]) {
              targetForm.setError(fieldName as never, {
                type: "server",
                message: String(messages[0]),
              })
            }
          }
        }

        throw new Error(payload.error || "Speichern fehlgeschlagen.")
      }

      const nextTenant = payload.tenant ?? payload
      if (nextTenant && typeof nextTenant === "object") {
        setTenant((current) => ({
          ...(current ?? { id: tenantId, created_at: new Date().toISOString(), status: "active" as const }),
          ...nextTenant,
        }))
      }

      toast({
        title: "Änderungen gespeichert",
        description:
          type === "basics"
            ? "Die Agentur-Basisdaten wurden aktualisiert."
            : type === "billing"
              ? "Die Rechnungsadresse wurde aktualisiert."
              : "Die Kontaktdaten wurden aktualisiert.",
      })
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Speichern fehlgeschlagen.")
    } finally {
      setSavingSection(null)
    }
  }

  async function submitAdmin(values: AdminInput) {
    setSavingSection("admin")
    setServerError(null)
    adminForm.clearErrors()

    try {
      const response = await fetch(`/api/owner/tenants/${tenantId}/admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(values),
      })
      const payload = await extractPayload(response)

      if (!response.ok) {
        if (payload.details && typeof payload.details === "object") {
          for (const [fieldName, messages] of Object.entries(payload.details)) {
            if (Array.isArray(messages) && messages[0]) {
              adminForm.setError(fieldName as never, {
                type: "server",
                message: String(messages[0]),
              })
            }
          }
        }

        throw new Error(payload.error || "Admin-Wechsel fehlgeschlagen.")
      }

      setTenant((current) =>
        current
          ? {
              ...current,
              currentAdmin: payload.currentAdmin ?? {
                email: values.email,
                name: values.email.split("@")[0],
              },
            }
          : current
      )
      adminForm.reset({ email: "" })

      toast({
        title: "Neuer Admin vorbereitet",
        description: "Die Admin-Zuweisung wurde angestossen und die Einladung wird versendet.",
      })
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Admin-Wechsel fehlgeschlagen.")
    } finally {
      setSavingSection(null)
    }
  }

  async function deleteUser(user: TenantUserRecord) {
    setDeletingUserId(user.userId)
    setServerError(null)

    try {
      const response = await fetch(`/api/owner/tenants/${tenantId}/users/${user.userId}`, {
        method: "DELETE",
        credentials: "include",
      })
      const payload = await extractPayload(response)

      if (!response.ok) {
        throw new Error(payload.error || "User konnte nicht gelöscht werden.")
      }

      setTenant((current) => {
        if (!current) return current

        const nextUsers = (current.users ?? []).filter((entry) => entry.userId !== user.userId)
        const nextActiveAdmin = nextUsers.find(
          (entry) => entry.role === "admin" && entry.status === "active"
        )
        const nextCurrentAdmin =
          current.currentAdmin?.email && current.currentAdmin.email === user.email
            ? nextActiveAdmin
              ? {
                  email: nextActiveAdmin.email,
                  name: nextActiveAdmin.name,
                }
              : null
            : current.currentAdmin

        return {
          ...current,
          users: nextUsers,
          currentAdmin: nextCurrentAdmin,
        }
      })

      toast({
        title: "User gelöscht",
        description:
          payload.authDeleted === false
            ? "Die Tenant-Zuordnung wurde entfernt. Der Account bleibt bestehen, weil er noch an anderer Stelle genutzt wird."
            : "Der User wurde aus der Agentur entfernt und vollständig bereinigt.",
      })
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "User konnte nicht gelöscht werden.")
    } finally {
      setDeletingUserId(null)
      setConfirmDeleteUser(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-44 w-full rounded-[32px]" />
        <Skeleton className="h-[520px] w-full rounded-[32px]" />
      </div>
    )
  }

  if (!tenant && serverError) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild className="-ml-3 w-fit text-slate-500 hover:text-slate-900">
          <Link href="/owner/tenants">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurück zu Agenturen
          </Link>
        </Button>

        <Alert variant="destructive" className="rounded-[24px] border-red-200 bg-red-50/80">
          <AlertTitle>Tenant-Details konnten nicht geladen werden</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <Button variant="ghost" asChild className="-ml-3 w-fit text-slate-500 hover:text-slate-900">
        <Link href="/owner/tenants">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurück zu Agenturen
        </Link>
      </Button>

      <section className="relative overflow-hidden rounded-[34px] border border-[#ddd3c6] bg-[linear-gradient(135deg,#fffaf2_0%,#f5efe6_54%,#eef7f5_100%)] p-6 shadow-[0_24px_80px_rgba(89,71,42,0.08)] sm:p-8">
        <div className="absolute left-[-2rem] top-[-2rem] h-36 w-36 rounded-full bg-[#1dbfaa]/12 blur-3xl" />
        <div className="absolute bottom-[-3rem] right-[-2rem] h-40 w-40 rounded-full bg-[#eb6f3d]/12 blur-3xl" />

        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 space-y-4 xl:flex-1">
            <Badge className="w-fit rounded-full bg-[#1f2937] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-white hover:bg-[#1f2937]">
              Tenant Profile
            </Badge>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                {tenant?.name ?? "Tenant-Details"}
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-600">
                Pflege Stammdaten, Rechnungsadresse, Kontaktinformationen und die
                verantwortliche Admin-Person für diese Agentur.
              </p>
            </div>
          </div>

          <div className="grid w-full min-w-0 gap-3 sm:grid-cols-3 xl:max-w-[560px]">
            <div className="min-w-0 rounded-[24px] border border-white/70 bg-white/80 px-4 py-3 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Status
              </p>
              <p
                className={cn(
                  "mt-2 text-lg font-semibold",
                  tenant?.status === "active" ? "text-emerald-700" : "text-[#b85e34]"
                )}
              >
                {tenant ? statusCopy(tenant.status) : "Unbekannt"}
              </p>
            </div>
            <div className="min-w-0 rounded-[24px] border border-white/70 bg-white/80 px-4 py-3 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Erstellt
              </p>
              <p className="mt-2 break-words text-base font-semibold text-slate-900 sm:text-lg">
                {tenant?.created_at ? formatDate(tenant.created_at) : "-"}
              </p>
            </div>
            <div className="min-w-0 rounded-[24px] border border-white/70 bg-white/80 px-4 py-3 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Tenant-ID
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  onClick={copyTenantId}
                  aria-label="Tenant-ID kopieren"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="mt-2 break-all font-mono text-xs leading-5 text-slate-700 sm:text-sm">
                {tenant?.id ?? tenantId}
              </p>
            </div>
          </div>
        </div>
      </section>

      {serverError && tenant ? (
        <Alert variant="destructive" className="rounded-[24px] border-red-200 bg-red-50/80">
          <AlertTitle>Aktion fehlgeschlagen</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      {apiPendingMessage ? (
        <Alert className="rounded-[24px] border-[#f0d2b8] bg-[#fff7ef] text-[#7c3d1d]">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Backend-Schritt noch offen</AlertTitle>
          <AlertDescription>{apiPendingMessage}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="h-auto flex-wrap rounded-full bg-[#f4eee6] p-1">
          <TabsTrigger value="general" className="rounded-full px-4 py-2">
            Allgemein
          </TabsTrigger>
          <TabsTrigger value="billing" className="rounded-full px-4 py-2">
            Rechnungsadresse
          </TabsTrigger>
          <TabsTrigger value="contact" className="rounded-full px-4 py-2">
            Kontakt
          </TabsTrigger>
          <TabsTrigger value="admin" className="rounded-full px-4 py-2">
            Admin
          </TabsTrigger>
          <TabsTrigger value="users" className="rounded-full px-4 py-2">
            User
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-0">
          <Card className="rounded-[30px] border-[#e7ddd1] bg-white shadow-[0_16px_50px_rgba(89,71,42,0.06)]">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-[#f5efe6] p-3 text-[#b85e34]">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-xl text-slate-900">Allgemeine Angaben</CardTitle>
                  <p className="text-sm text-slate-500">
                    Name und Subdomain der Agentur können hier angepasst werden.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Form {...basicsForm}>
                <form
                  onSubmit={basicsForm.handleSubmit((values) => submitPatch("basics", values))}
                  className="space-y-6"
                >
                  <div className="grid gap-6 lg:grid-cols-2">
                    <FormField
                      control={basicsForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Agentur-Name</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="z.B. Nordstern Studio" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={basicsForm.control}
                      name="slug"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Subdomain-Slug</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="z.B. nordstern"
                              onChange={(event) => {
                                field.onChange(
                                  event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
                                )
                              }}
                            />
                          </FormControl>
                          <FormDescription>Vorschau: {tenantHost}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {slugChanged ? (
                    <Alert className="rounded-[24px] border-[#f0d2b8] bg-[#fff7ef] text-[#7c3d1d]">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Subdomain wird geändert</AlertTitle>
                      <AlertDescription>
                        Die URL der Agentur ändert sich. Bestehende Bookmarks werden ungültig.
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      className="rounded-full bg-[#1f2937] px-5 hover:bg-[#111827]"
                      disabled={savingSection === "basics" || Boolean(apiPendingMessage)}
                    >
                      {savingSection === "basics" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Allgemein speichern
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="mt-0">
          <Card className="rounded-[30px] border-[#e7ddd1] bg-white shadow-[0_16px_50px_rgba(89,71,42,0.06)]">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-[#eef7f5] p-3 text-[#0d9488]">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-xl text-slate-900">Rechnungsadresse</CardTitle>
                  <p className="text-sm text-slate-500">
                    Optionaler Billing-Bereich für Buchhaltung und Vertragsdaten.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Form {...billingForm}>
                <form
                  onSubmit={billingForm.handleSubmit((values) => submitPatch("billing", values))}
                  className="space-y-6"
                >
                  <div className="grid gap-6 md:grid-cols-2">
                    <FormField
                      control={billingForm.control}
                      name="billing_company"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Firma</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="z.B. Nordstern Studio GmbH" />
                          </FormControl>
                          <FormDescription>
                            Wenn weitere Billing-Felder genutzt werden, sollte hier der Firmenname stehen.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={billingForm.control}
                      name="billing_street"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Strasse und Hausnummer</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Musterstrasse 12" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={billingForm.control}
                      name="billing_zip"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>PLZ</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="10115" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={billingForm.control}
                      name="billing_city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Stadt</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Berlin" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={billingForm.control}
                      name="billing_country"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Land</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Deutschland" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={billingForm.control}
                      name="billing_vat_id"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>USt-IdNr.</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="DE123456789" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      className="rounded-full bg-[#1f2937] px-5 hover:bg-[#111827]"
                      disabled={savingSection === "billing" || Boolean(apiPendingMessage)}
                    >
                      {savingSection === "billing" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Rechnungsadresse speichern
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contact" className="mt-0">
          <Card className="rounded-[30px] border-[#e7ddd1] bg-white shadow-[0_16px_50px_rgba(89,71,42,0.06)]">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-[#f1f7ff] p-3 text-[#2b6cb0]">
                  <Phone className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-xl text-slate-900">Kontaktdaten</CardTitle>
                  <p className="text-sm text-slate-500">
                    Damit Owner und Team die Agentur schnell erreichen können.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Form {...contactForm}>
                <form
                  onSubmit={contactForm.handleSubmit((values) => submitPatch("contact", values))}
                  className="space-y-6"
                >
                  <div className="grid gap-6 md:grid-cols-2">
                    <FormField
                      control={contactForm.control}
                      name="contact_person"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ansprechpartner</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="z.B. Anna Becker" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={contactForm.control}
                      name="contact_phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Telefon</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="+49 30 12345678" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={contactForm.control}
                      name="contact_website"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Website</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="https://agentur.de" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      className="rounded-full bg-[#1f2937] px-5 hover:bg-[#111827]"
                      disabled={savingSection === "contact" || Boolean(apiPendingMessage)}
                    >
                      {savingSection === "contact" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Kontakt speichern
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="admin" className="mt-0">
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="rounded-[30px] border-[#e7ddd1] bg-white shadow-[0_16px_50px_rgba(89,71,42,0.06)]">
              <CardHeader className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-[#eef4ff] p-3 text-[#3457c2]">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-xl text-slate-900">Aktueller Haupt-Admin</CardTitle>
                    <p className="text-sm text-slate-500">
                      Diese Person hat aktuell die administrative Hauptverantwortung.
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-[26px] border border-[#e8eef9] bg-[#f8fbff] p-5">
                  <div className="flex items-start gap-4">
                    <div className="rounded-2xl bg-white p-3 text-[#3457c2] shadow-sm">
                      <UserRound className="h-5 w-5" />
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Name
                        </p>
                        <p className="mt-1 text-lg font-semibold text-slate-900">
                          {tenant?.currentAdmin?.name || "Noch nicht verfügbar"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Mail className="h-4 w-4 text-slate-400" />
                        <span>{tenant?.currentAdmin?.email || "Keine E-Mail geladen"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Globe className="h-4 w-4 text-slate-400" />
                        <span>{tenant?.slug ? `${tenant.slug}.boost-hive.de` : tenantHost}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[30px] border-[#e7ddd1] bg-white shadow-[0_16px_50px_rgba(89,71,42,0.06)]">
              <CardHeader className="space-y-3">
                <CardTitle className="text-xl text-slate-900">Neuen Admin zuweisen</CardTitle>
                <p className="text-sm text-slate-500">
                  Der bisherige Admin bleibt im Tenant und wird dabei auf die Rolle Member umgestellt.
                </p>
              </CardHeader>
              <CardContent>
                <Form {...adminForm}>
                  <form onSubmit={adminForm.handleSubmit(submitAdmin)} className="space-y-6">
                    <Alert className="rounded-[22px] border-[#d8e5ff] bg-[#f5f8ff] text-[#2c4a99]">
                      <ShieldCheck className="h-4 w-4" />
                      <AlertTitle>Owner-Aktion</AlertTitle>
                      <AlertDescription>
                        Beim Absenden wird der neue Haupt-Admin vorbereitet und die Einladung versendet.
                      </AlertDescription>
                    </Alert>

                    <FormField
                      control={adminForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Neue Admin-E-Mail</FormLabel>
                          <FormControl>
                            <Input {...field} type="email" placeholder="admin@agentur.de" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        className="rounded-full bg-[#1f2937] px-5 hover:bg-[#111827]"
                        disabled={savingSection === "admin" || Boolean(apiPendingMessage)}
                      >
                        {savingSection === "admin" ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Admin zuweisen
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users" className="mt-0">
          <Card className="rounded-[30px] border-[#e7ddd1] bg-white shadow-[0_16px_50px_rgba(89,71,42,0.06)]">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-[#eef7f5] p-3 text-[#0d9488]">
                  <Users2 className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-xl text-slate-900">Alle User dieser Agentur</CardTitle>
                  <p className="text-sm text-slate-500">
                    Owner sehen hier alle Accounts inklusive Rolle, Status und Löschoption.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {tenant?.users?.length ? (
                <div className="overflow-hidden rounded-[24px] border border-[#efe6d9]">
                  <div className="overflow-x-auto">
                    <div className="min-w-[760px]">
                      <div className="grid grid-cols-[minmax(0,1.4fr)_120px_120px_180px_92px] gap-4 border-b border-[#efe6d9] bg-[#fcfaf6] px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                        <p>User</p>
                        <p>Rolle</p>
                        <p>Status</p>
                        <p>Seit</p>
                        <p className="text-right">Aktion</p>
                      </div>

                      <div className="divide-y divide-[#f2eadf]">
                        {tenant.users.map((user) => {
                          const isPending = deletingUserId === user.userId

                          return (
                            <div
                              key={user.memberId}
                              className="grid grid-cols-[minmax(0,1.4fr)_120px_120px_180px_92px] gap-4 px-5 py-4 text-sm text-slate-600"
                            >
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-slate-900">
                                  {user.name || user.email || "Unbekannter User"}
                                </p>
                                <p className="truncate text-slate-500">{user.email || user.userId}</p>
                              </div>

                              <div>
                                <Badge
                                  className={
                                    user.role === "admin"
                                      ? "rounded-full bg-[#eef4ff] text-[#3457c2] hover:bg-[#eef4ff]"
                                      : "rounded-full bg-[#eef7f5] text-[#0d9488] hover:bg-[#eef7f5]"
                                  }
                                >
                                  {memberRoleCopy(user.role)}
                                </Badge>
                              </div>

                              <div>
                                <Badge
                                  className={
                                    user.status === "active"
                                      ? "rounded-full bg-[#eff8f2] text-[#166534] hover:bg-[#eff8f2]"
                                      : "rounded-full bg-[#fff4ee] text-[#9f4f2d] hover:bg-[#fff4ee]"
                                  }
                                >
                                  {memberStatusCopy(user.status)}
                                </Badge>
                              </div>

                              <div className="text-slate-500">
                                {formatDateTime(user.joinedAt || user.invitedAt)}
                              </div>

                              <div className="flex justify-end">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 rounded-full text-[#b85e34] hover:bg-[#fff4ee] hover:text-[#9f4f2d]"
                                  disabled={isPending}
                                  onClick={() => setConfirmDeleteUser(user)}
                                  aria-label={`User ${user.email || user.userId} löschen`}
                                >
                                  {isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-[24px] border border-dashed border-[#ddd1c4] bg-[#fcfaf6] px-6 py-12 text-center">
                  <p className="text-lg font-semibold text-slate-900">Keine User gefunden</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Für diese Agentur wurden aktuell keine zugeordneten User geladen.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog
        open={Boolean(confirmDeleteUser)}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteUser(null)
        }}
      >
        <AlertDialogTrigger asChild>
          <span className="hidden" />
        </AlertDialogTrigger>
        <AlertDialogContent className="rounded-[28px] border-[#e7ddd1] bg-[#fffdf9]">
          <AlertDialogHeader>
            <AlertDialogTitle>User wirklich löschen?</AlertDialogTitle>
            <AlertDialogDescription className="leading-6">
              {confirmDeleteUser?.email || "Dieser User"} wird aus der Agentur entfernt. Wenn der
              Account sonst nirgends mehr verwendet wird, wird er zusätzlich vollständig aus Auth und
              den verknüpften Datensätzen entfernt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-[#9f4f2d] hover:bg-[#7c3d1d]"
              onClick={async () => {
                if (!confirmDeleteUser) return
                await deleteUser(confirmDeleteUser)
              }}
            >
              User löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
