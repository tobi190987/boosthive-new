"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import {
  Archive,
  AlertTriangle,
  ArrowLeft,
  Building2,
  Clock3,
  Copy,
  CreditCard,
  Globe,
  ImageIcon,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Package,
  Phone,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Unlock,
  UserRound,
  Users2,
  X,
} from "lucide-react"

import { CreateTenantSchema } from "@/lib/schemas/tenant"
import {
  tenantStatusBadgeClass,
  tenantStatusDescription,
  tenantStatusLabel,
  tenantStatusTextClass,
  type TenantStatus,
} from "@/lib/tenant-status"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type MemberRole = "admin" | "member"
type MemberStatus = "active" | "inactive"
type OwnerAuditEventType =
  | "tenant_created"
  | "tenant_status_updated"
  | "tenant_archived"
  | "tenant_restored"
  | "tenant_basics_updated"
  | "tenant_billing_updated"
  | "tenant_contact_updated"
  | "tenant_deleted"
  | "tenant_admin_reassigned"
  | "tenant_admin_setup_resent"
  | "tenant_user_deleted"

const BILLING_COUNTRY_OPTIONS = [{ value: "Deutschland", label: "Deutschland" }] as const

type AuditValue =
  | string
  | number
  | boolean
  | null
  | AuditValue[]
  | {
      [key: string]: AuditValue
    }

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

interface OwnerAuditLogRecord {
  id: string
  actor_user_id: string | null
  tenant_id: string | null
  target_user_id: string | null
  event_type: OwnerAuditEventType
  context: AuditValue
  created_at: string
}

interface TenantDetailRecord {
  id: string
  name: string
  slug: string
  status: TenantStatus
  created_at: string
  is_archived?: boolean
  archived_at?: string | null
  archive_reason?: string | null
  logo_url?: string | null
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
  auditLogs?: OwnerAuditLogRecord[]
}

const BasicsSchema = CreateTenantSchema.pick({
  name: true,
  slug: true,
})

const BillingSchema = z
  .object({
    billing_company: z.string().trim().max(120, "Firmenname darf maximal 120 Zeichen lang sein."),
    billing_street: z.string().trim().max(120, "Straße darf maximal 120 Zeichen lang sein."),
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

function memberRoleCopy(role: MemberRole) {
  return role === "admin" ? "Admin" : "User"
}

function memberStatusCopy(status: MemberStatus) {
  return status === "active" ? "Aktiv" : "Pausiert"
}

function tenantUrl(slug: string) {
  return `https://${slug}.boost-hive.de`
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

function asAuditContext(value: AuditValue): Record<string, AuditValue> {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return {}
  }

  return value as Record<string, AuditValue>
}

function auditEventLabel(eventType: OwnerAuditEventType) {
  switch (eventType) {
    case "tenant_created":
      return "Tenant angelegt"
    case "tenant_status_updated":
      return "Status geändert"
    case "tenant_archived":
      return "Tenant archiviert"
    case "tenant_restored":
      return "Tenant wiederhergestellt"
    case "tenant_basics_updated":
      return "Basisdaten aktualisiert"
    case "tenant_billing_updated":
      return "Rechnungsdaten aktualisiert"
    case "tenant_contact_updated":
      return "Kontaktdaten aktualisiert"
    case "tenant_deleted":
      return "Tenant gelöscht"
    case "tenant_admin_reassigned":
      return "Admin neu zugewiesen"
    case "tenant_admin_setup_resent":
      return "Admin-Setup erneut versendet"
    case "tenant_user_deleted":
      return "User entfernt"
  }
}

function auditEventBadgeClass(eventType: OwnerAuditEventType) {
  switch (eventType) {
    case "tenant_deleted":
      return "rounded-full bg-blue-50 text-blue-600 hover:bg-blue-50"
    case "tenant_archived":
      return "rounded-full bg-slate-100 dark:bg-secondary text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#252d3a]"
    case "tenant_restored":
      return "rounded-full bg-blue-50 text-blue-600 hover:bg-blue-50"
    case "tenant_admin_reassigned":
    case "tenant_admin_setup_resent":
      return "rounded-full bg-blue-50 text-blue-700 hover:bg-blue-50"
    case "tenant_created":
    case "tenant_status_updated":
      return "rounded-full bg-blue-50 text-amber-800 hover:bg-blue-50"
    default:
      return "rounded-full bg-blue-50 text-blue-600 hover:bg-blue-50"
  }
}

function formatAuditLogDescription(log: OwnerAuditLogRecord) {
  const context = asAuditContext(log.context)
  const status = typeof context.status === "string" ? context.status : null
  const email = typeof context.email === "string" ? context.email : null
  const slug = typeof context.slug === "string" ? context.slug : null
  const name = typeof context.name === "string" ? context.name : null
  const tenantName = typeof context.tenantName === "string" ? context.tenantName : null
  const archiveReason = typeof context.archiveReason === "string" ? context.archiveReason : null
  const deletedAuthUsers = typeof context.deletedAuthUsers === "number" ? context.deletedAuthUsers : null
  const authDeleted = typeof context.authDeleted === "boolean" ? context.authDeleted : null
  const createdUserId = typeof context.createdUserId === "string" ? context.createdUserId : null
  const previousAdminUserId =
    typeof context.previousAdminUserId === "string" ? context.previousAdminUserId : null

  switch (log.event_type) {
    case "tenant_created":
      return [name ? `Name: ${name}` : null, slug ? `Slug: ${slug}` : null, email ? `Admin: ${email}` : null]
        .filter(Boolean)
        .join(" • ")
    case "tenant_status_updated":
      return status === "active"
        ? "Die Agentur wurde wieder aktiviert."
        : status === "inactive"
          ? "Die Agentur wurde pausiert."
          : "Der Tenant-Status wurde aktualisiert."
    case "tenant_archived":
      return archiveReason
        ? `Der Tenant wurde archiviert. Grund: ${archiveReason}`
        : "Der Tenant wurde archiviert und aus der Standardansicht entfernt."
    case "tenant_restored":
      return "Der Tenant wurde wieder in die aktive Verwaltung zurückgeführt."
    case "tenant_basics_updated":
      return [name ? `Name: ${name}` : null, slug ? `Neue Subdomain: ${slug}` : null]
        .filter(Boolean)
        .join(" • ")
    case "tenant_billing_updated":
      return "Die Rechnungsadresse oder USt-Informationen wurden angepasst."
    case "tenant_contact_updated":
      return "Ansprechperson, Telefonnummer oder Website wurden aktualisiert."
    case "tenant_admin_reassigned":
      return [
        email ? `Neuer Admin: ${email}` : null,
        createdUserId ? "Ein neuer Zugang wurde vorbereitet." : null,
        previousAdminUserId ? "Der bisherige Haupt-Admin wurde zurückgestuft." : null,
      ]
        .filter(Boolean)
        .join(" • ")
    case "tenant_admin_setup_resent":
      return email
        ? `Die Einrichtungs-Mail wurde erneut an ${email} versendet.`
        : "Die Einrichtungs-Mail für den Admin wurde erneut versendet."
    case "tenant_user_deleted":
      return authDeleted === false
        ? "Die Tenant-Zuordnung wurde entfernt. Der Auth-Account bleibt bestehen."
        : "Der User wurde aus Tenant und Auth entfernt."
    case "tenant_deleted":
      return [
        tenantName ? `Agentur: ${tenantName}` : null,
        deletedAuthUsers !== null ? `${deletedAuthUsers} Auth-Accounts bereinigt` : null,
      ]
        .filter(Boolean)
        .join(" • ")
    default:
      return "Diese Owner-Aktion wurde protokolliert."
  }
}

async function extractPayload(response: Response) {
  return response.json().catch(() => ({}))
}

const VALID_TABS = ["general", "billing", "contact", "admin", "users", "audit", "subscription"] as const

export function OwnerTenantDetailWorkspace({ tenantId }: { tenantId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const initialTab = VALID_TABS.includes(tabParam as typeof VALID_TABS[number])
    ? (tabParam as string)
    : "general"

  const [tenant, setTenant] = useState<TenantDetailRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [serverError, setServerError] = useState<string | null>(null)
  const [apiPendingMessage, setApiPendingMessage] = useState<string | null>(null)
  const [savingSection, setSavingSection] = useState<null | "basics" | "billing" | "contact" | "admin">(null)
  const [lifecycleAction, setLifecycleAction] = useState<null | "archive" | "restore" | "hard-delete">(null)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<TenantUserRecord | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const logoFileInputRef = useRef<HTMLInputElement>(null)

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

  const hydrateTenant = useCallback((nextTenant: TenantDetailRecord) => {
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
  }, [basicsForm, billingForm, contactForm])

  async function refreshTenantData() {
    const response = await fetch(`/api/owner/tenants/${tenantId}`, {
      credentials: "include",
    })
    const payload = await extractPayload(response)

    if (!response.ok) {
      throw new Error(payload.error || "Tenant-Details konnten nicht geladen werden.")
    }

    const nextTenant = payload.tenant ?? payload
    hydrateTenant(nextTenant)
    return nextTenant as TenantDetailRecord
  }

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
        hydrateTenant(nextTenant)
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
  }, [tenantId, basicsForm, billingForm, contactForm, hydrateTenant])

  const tenantHost = useMemo(() => {
    if (!watchedSlug) return "boost-hive.de"
    return `${watchedSlug}.boost-hive.de`
  }, [watchedSlug])
  const activeUsers = tenant?.users?.filter((entry) => entry.status === "active").length ?? 0
  const adminUsers = tenant?.users?.filter((entry) => entry.role === "admin" && entry.status === "active").length ?? 0

  async function runLifecycleAction(action: "archive" | "restore" | "hard-delete") {
    setLifecycleAction(action)
    setServerError(null)

    try {
      const response = await fetch(
        action === "hard-delete"
          ? `/api/owner/tenants/${tenantId}?mode=hard`
          : `/api/owner/tenants/${tenantId}`,
        {
          method: action === "hard-delete" ? "DELETE" : "PATCH",
          headers: action === "hard-delete" ? undefined : { "Content-Type": "application/json" },
          credentials: "include",
          body:
            action === "archive"
              ? JSON.stringify({ type: "archive" })
              : action === "restore"
                ? JSON.stringify({ type: "restore" })
                : undefined,
        }
      )
      const payload = await extractPayload(response)

      if (!response.ok) {
        throw new Error(payload.error || "Aktion fehlgeschlagen.")
      }

      if (action === "hard-delete") {
        toast({
          title: "Tenant endgültig gelöscht",
          description: "Die Agentur wurde dauerhaft aus dem System entfernt.",
        })
        router.push("/owner/tenants")
        router.refresh()
        return
      }

      await refreshTenantData()
      toast({
        title: action === "archive" ? "Tenant archiviert" : "Tenant wiederhergestellt",
        description:
          action === "archive"
            ? "Die Agentur wurde aus der Standardansicht entfernt und neue Logins sind blockiert."
            : "Die Agentur ist wieder sichtbar und kann normal verwaltet werden.",
      })
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Aktion fehlgeschlagen.")
    } finally {
      setLifecycleAction(null)
    }
  }

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

      await refreshTenantData().catch(() => undefined)
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

      try {
        await refreshTenantData()
      } catch {
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
      }

      adminForm.reset({ email: "" })

      toast({
        title: payload.resent ? "Setup-Mail erneut gesendet" : "Neuer Admin vorbereitet",
        description: payload.resent
          ? "Eine neue Einrichtungs-E-Mail wurde an den Admin verschickt."
          : "Die Admin-Zuweisung wurde angestossen und die Einladung wird versendet.",
      })
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Admin-Wechsel fehlgeschlagen.")
    } finally {
      setSavingSection(null)
    }
  }

  function handleLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      setServerError("Logo darf maximal 2 MB groß sein.")
      return
    }
    setLogoFile(file)
    if (logoPreview) URL.revokeObjectURL(logoPreview)
    setLogoPreview(URL.createObjectURL(file))
    setServerError(null)
  }

  async function uploadLogo() {
    if (!logoFile || !tenant) return
    setUploadingLogo(true)
    setServerError(null)
    try {
      const formData = new FormData()
      formData.append("file", logoFile)
      const response = await fetch(`/api/owner/tenants/${tenantId}/logo`, {
        method: "POST",
        credentials: "include",
        body: formData,
      })
      const payload = await extractPayload(response)
      if (!response.ok) throw new Error(payload.error || "Logo-Upload fehlgeschlagen.")
      setTenant((current) => current ? { ...current, logo_url: payload.logoUrl } : current)
      setLogoFile(null)
      if (logoPreview) URL.revokeObjectURL(logoPreview)
      setLogoPreview(null)
      if (logoFileInputRef.current) logoFileInputRef.current.value = ""
      toast({ title: "Logo gespeichert", description: "Das Agentur-Logo wurde aktualisiert." })
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Logo-Upload fehlgeschlagen.")
    } finally {
      setUploadingLogo(false)
    }
  }

  async function deleteLogo() {
    if (!tenant?.logo_url) return
    setUploadingLogo(true)
    setServerError(null)
    try {
      const response = await fetch(`/api/owner/tenants/${tenantId}/logo`, {
        method: "DELETE",
        credentials: "include",
      })
      const payload = await extractPayload(response)
      if (!response.ok) throw new Error(payload.error || "Logo-Löschung fehlgeschlagen.")
      setTenant((current) => current ? { ...current, logo_url: null } : current)
      toast({ title: "Logo entfernt", description: "Das Agentur-Logo wurde gelöscht." })
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Logo-Löschung fehlgeschlagen.")
    } finally {
      setUploadingLogo(false)
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

      await refreshTenantData().catch(() => undefined)

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
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-[520px] w-full rounded-2xl" />
      </div>
    )
  }

  if (!tenant && serverError) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild className="-ml-3 w-fit text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
          <Link href="/owner/tenants">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurück zu Agenturen
          </Link>
        </Button>

        <Alert variant="destructive" className="rounded-2xl border-red-200 bg-red-50/80">
          <AlertTitle>Tenant-Details konnten nicht geladen werden</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <Button variant="ghost" asChild className="-ml-3 w-fit text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
        <Link href="/owner/tenants">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurück zu Agenturen
        </Link>
      </Button>

      <section className="relative overflow-hidden rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card p-6 shadow-soft sm:p-8">
        <div className="absolute left-[-2rem] top-[-2rem] h-36 w-36 rounded-full bg-blue-600/12 blur-3xl" />
        <div className="absolute bottom-[-3rem] right-[-2rem] h-40 w-40 rounded-full bg-blue-500/10 blur-3xl" />

        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 space-y-4 xl:flex-1">
            <Badge className="w-fit rounded-full bg-slate-900 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-white hover:bg-slate-900">
              Tenant Profile
            </Badge>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-600">
                Owner / Tenant Detail
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {tenant?.name ?? "Tenant-Details"}
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                Pflege Stammdaten, Rechnungsadresse, Kontaktinformationen und die
                verantwortliche Admin-Person für diese Agentur.
              </p>
            </div>
          </div>

          <div className="grid w-full min-w-0 gap-3 sm:grid-cols-3 xl:max-w-[560px]">
            <div className="min-w-0 rounded-2xl border border-white/70 bg-white/80 px-4 py-3 backdrop-blur dark:border-border dark:bg-card/85">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                Status
              </p>
              <p
                className={cn(
                  "mt-2 text-lg font-semibold",
                  tenantStatusTextClass(tenant?.status)
                )}
              >
                {tenantStatusLabel(tenant?.status)}
              </p>
              <Badge className={cn("mt-2 rounded-full", tenantStatusBadgeClass(tenant?.status))}>
                {tenantStatusLabel(tenant?.status)}
              </Badge>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {tenantStatusDescription(tenant?.status)}
              </p>
            </div>
            <div className="min-w-0 rounded-2xl border border-white/70 bg-white/80 px-4 py-3 backdrop-blur dark:border-border dark:bg-card/85">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                Erstellt
              </p>
              <p className="mt-2 break-words text-base font-semibold text-slate-900 dark:text-slate-100 sm:text-lg">
                {tenant?.created_at ? formatDate(tenant.created_at) : "-"}
              </p>
            </div>
            <div className="min-w-0 rounded-2xl border border-white/70 bg-white/80 px-4 py-3 backdrop-blur dark:border-border dark:bg-card/85">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                  Tenant-ID
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 rounded-full text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-[#252d3a] hover:text-slate-700 dark:hover:text-slate-300"
                  onClick={copyTenantId}
                  aria-label="Tenant-ID kopieren"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="mt-2 break-all font-mono text-xs leading-5 text-slate-700 dark:text-slate-300 sm:text-sm">
                {tenant?.id ?? tenantId}
              </p>
            </div>
          </div>
        </div>

        <div className="relative mt-8 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/70 bg-white/80 p-5 backdrop-blur-sm dark:border-border dark:bg-card/85">
            <Globe className="h-5 w-5 text-blue-600" />
            <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Subdomain und Einstieg</p>
            <a
              href={tenant?.slug ? tenantUrl(tenant.slug) : undefined}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block break-all text-sm leading-6 text-slate-600 dark:text-slate-300 underline-offset-4 hover:text-slate-900 dark:hover:text-slate-100 hover:underline"
            >
              {tenant?.slug ? tenantUrl(tenant.slug) : tenantHost}
            </a>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 p-5 backdrop-blur-sm dark:border-border dark:bg-card/85">
            <Users2 className="h-5 w-5 text-blue-600" />
            <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Aktive Nutzerbasis</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">{activeUsers}</p>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">aktive Accounts in dieser Agentur</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 p-5 backdrop-blur-sm dark:border-border dark:bg-card/85">
            <ShieldCheck className="h-5 w-5 text-[#1f2937]" />
            <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Administrative Abdeckung</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">{adminUsers}</p>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">aktive Admins mit Zugriff auf den Tenant</p>
          </div>
        </div>
      </section>

      {serverError && tenant ? (
        <Alert variant="destructive" className="rounded-2xl border-red-200 bg-red-50/80">
          <AlertTitle>Aktion fehlgeschlagen</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      {apiPendingMessage ? (
        <Alert className="rounded-2xl border-amber-200 bg-amber-50 text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Backend-Schritt noch offen</AlertTitle>
          <AlertDescription>{apiPendingMessage}</AlertDescription>
        </Alert>
      ) : null}

      {tenant?.is_archived ? (
        <Alert className="rounded-2xl border-slate-200 dark:border-border bg-slate-50 dark:bg-card text-slate-700 dark:text-slate-300">
          <Archive className="h-4 w-4" />
          <AlertTitle>Dieser Tenant ist archiviert</AlertTitle>
          <AlertDescription>
            Neue Logins und geschützte Bereiche sind blockiert. Owner können den Tenant hier prüfen,
            wiederherstellen oder bewusst endgültig löschen.
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue={initialTab} className="space-y-6">
        <TabsList className="h-auto flex-wrap rounded-full bg-slate-100 dark:bg-secondary p-1">
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
          <TabsTrigger value="audit" className="rounded-full px-4 py-2">
            Historie
          </TabsTrigger>
          <TabsTrigger value="subscription" className="rounded-full px-4 py-2">
            Abo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-0">
          <Card className="rounded-2xl border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-blue-50 p-3 text-blue-600">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-xl text-slate-900 dark:text-slate-100">Allgemeine Angaben</CardTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
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
                    <Alert className="rounded-2xl border-amber-200 bg-amber-50 text-amber-800">
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
                      variant="dark" className="px-5"
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
          {/* Logo-Karte */}
          <Card className="mt-4 rounded-2xl border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-blue-50 p-3 text-blue-600">
                  <ImageIcon className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-xl text-slate-900 dark:text-slate-100">Agentur-Logo</CardTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Wird auf der Login-Seite dieser Subdomain angezeigt.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Aktuelles Logo */}
              {tenant?.logo_url && !logoPreview && (
                <div className="flex items-center gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={tenant.logo_url}
                    alt="Aktuelles Logo"
                    className="h-14 w-auto max-w-[200px] rounded-xl border border-slate-100 dark:border-border object-contain p-2"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-slate-500 dark:text-slate-400 hover:text-red-600"
                    disabled={uploadingLogo}
                    onClick={deleteLogo}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Entfernen
                  </Button>
                </div>
              )}

              {/* Neue Datei ausgewählt */}
              {logoPreview && (
                <div className="flex items-center gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoPreview}
                    alt="Logo Vorschau"
                    className="h-14 w-auto max-w-[200px] rounded-xl border border-slate-100 dark:border-border object-contain p-2"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-slate-500 dark:text-slate-400"
                    onClick={() => {
                      setLogoFile(null)
                      if (logoPreview) URL.revokeObjectURL(logoPreview)
                      setLogoPreview(null)
                      if (logoFileInputRef.current) logoFileInputRef.current.value = ""
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                    Verwerfen
                  </Button>
                </div>
              )}

              {/* Upload-Fläche */}
              {!logoPreview && (
                <button
                  type="button"
                  onClick={() => logoFileInputRef.current?.click()}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-100 dark:border-border px-4 py-3 text-sm text-slate-500 dark:text-slate-400 transition hover:border-blue-600/50 hover:text-blue-600"
                >
                  <ImageIcon className="h-4 w-4 shrink-0" />
                  {tenant?.logo_url ? "Neues Logo hochladen" : "Logo hochladen"} · PNG, JPG, SVG · max. 2 MB
                </button>
              )}
              <input
                ref={logoFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                className="hidden"
                onChange={handleLogoFileChange}
              />

              {logoFile && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="dark" className="px-5"
                    disabled={uploadingLogo}
                    onClick={uploadLogo}
                  >
                    {uploadingLogo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Logo speichern
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-4 rounded-2xl border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-slate-100 dark:bg-secondary p-3 text-slate-700 dark:text-slate-300">
                  <Archive className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-xl text-slate-900 dark:text-slate-100">Archivierung & Lebenszyklus</CardTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Archivierte Tenants verschwinden aus der Standardansicht, bleiben für Support aber wiederherstellbar.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-100 dark:border-border bg-slate-50 dark:bg-card px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Archivstatus</p>
                  <p className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                    {tenant?.is_archived ? "Archiviert" : "Aktiv sichtbar"}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-100 dark:border-border bg-slate-50 dark:bg-card px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Archiviert am</p>
                  <p className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                    {tenant?.archived_at ? formatDateTime(tenant.archived_at) : "Noch nicht archiviert"}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-100 dark:border-border bg-slate-50 dark:bg-card px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Archivgrund</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                    {tenant?.archive_reason || "Kein Grund hinterlegt"}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card p-5">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {tenant?.is_archived
                    ? "Der Tenant liegt aktuell im Archiv."
                    : "Dieser Tenant ist aktuell im normalen Betrieb sichtbar."}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {tenant?.is_archived
                    ? "Wiederherstellen bringt den Tenant zurück in Listen und erlaubt wieder reguläre Nutzung. Eine harte Löschung ist nur hier als separater, bewusster Schritt möglich."
                    : "Archivieren blendet den Tenant in Owner-Listen standardmäßig aus und blockiert neue Logins, ohne Stammdaten oder Audit-Historie zu verlieren."}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                {tenant?.is_archived ? (
                  <>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          className="rounded-full bg-slate-900 px-5 text-white hover:bg-slate-800"
                          disabled={lifecycleAction !== null}
                        >
                          {lifecycleAction === "restore" ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCcw className="mr-2 h-4 w-4" />
                          )}
                          Wiederherstellen
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-2xl border-slate-100 dark:border-border bg-slate-50 dark:bg-card">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Tenant wiederherstellen?</AlertDialogTitle>
                          <AlertDialogDescription className="leading-6">
                            {tenant.name} erscheint danach wieder in den normalen Owner-Listen und kann erneut genutzt werden.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-full">Abbrechen</AlertDialogCancel>
                          <AlertDialogAction
                            className="rounded-full bg-slate-900 text-white hover:bg-slate-800"
                            onClick={() => void runLifecycleAction("restore")}
                          >
                            Wiederherstellen
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                          disabled={lifecycleAction !== null}
                        >
                          {lifecycleAction === "hard-delete" ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="mr-2 h-4 w-4" />
                          )}
                          Endgültig löschen
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-2xl border-slate-100 dark:border-border bg-slate-50 dark:bg-card">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Tenant endgültig löschen?</AlertDialogTitle>
                          <AlertDialogDescription className="leading-6">
                            Dieser Schritt entfernt {tenant.name} dauerhaft. Zugehörige Daten des Tenants und verwaiste Auth-Accounts werden bereinigt.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-full">Abbrechen</AlertDialogCancel>
                          <AlertDialogAction
                            className="rounded-full bg-slate-900 text-white hover:bg-slate-800"
                            onClick={() => void runLifecycleAction("hard-delete")}
                          >
                            Endgültig löschen
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full border-amber-300 text-blue-600 hover:bg-amber-50 hover:text-amber-800"
                        disabled={lifecycleAction !== null}
                      >
                        {lifecycleAction === "archive" ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Archive className="mr-2 h-4 w-4" />
                        )}
                        Tenant archivieren
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-2xl border-slate-100 dark:border-border bg-slate-50 dark:bg-card">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Tenant archivieren?</AlertDialogTitle>
                        <AlertDialogDescription className="leading-6">
                          {tenant?.name ?? "Dieser Tenant"} wird aus der Standardansicht entfernt. Neue Logins und geschützte Bereiche werden blockiert, eine spätere Wiederherstellung bleibt aber möglich.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-full">Abbrechen</AlertDialogCancel>
                        <AlertDialogAction
                          className="rounded-full bg-slate-900 text-white hover:bg-slate-800"
                          onClick={() => void runLifecycleAction("archive")}
                        >
                          Archivieren
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="mt-0">
          <Card className="rounded-2xl border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-blue-50 p-3 text-blue-600">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-xl text-slate-900 dark:text-slate-100">Rechnungsadresse</CardTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
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
                          <FormLabel>Straße und Hausnummer</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Musterstraße 12" />
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
                          <Select
                            value={field.value === "Deutschland" ? field.value : ""}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Land auswählen" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {BILLING_COUNTRY_OPTIONS.map((country) => (
                                <SelectItem key={country.value} value={country.value}>
                                  {country.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
                      variant="dark" className="px-5"
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
          <Card className="rounded-2xl border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                  <Phone className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-xl text-slate-900 dark:text-slate-100">Kontaktdaten</CardTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
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
                      variant="dark" className="px-5"
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
            <Card className="rounded-2xl border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
              <CardHeader className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-xl text-slate-900 dark:text-slate-100">Aktueller Haupt-Admin</CardTitle>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Diese Person hat aktuell die administrative Hauptverantwortung.
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
                  <div className="flex items-start gap-4">
                    <div className="rounded-2xl bg-white dark:bg-card p-3 text-blue-700 shadow-sm">
                      <UserRound className="h-5 w-5" />
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                          Name
                        </p>
                        <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                          {tenant?.currentAdmin?.name || "Noch nicht verfügbar"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <Mail className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                        <span>{tenant?.currentAdmin?.email || "Keine E-Mail geladen"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <Globe className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                        <span>{tenant?.slug ? `${tenant.slug}.boost-hive.de` : tenantHost}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
              <CardHeader className="space-y-3">
                <CardTitle className="text-xl text-slate-900 dark:text-slate-100">Neuen Admin zuweisen</CardTitle>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Der bisherige Admin bleibt im Tenant und wird dabei auf die Rolle Member umgestellt.
                </p>
              </CardHeader>
              <CardContent>
                <Form {...adminForm}>
                  <form onSubmit={adminForm.handleSubmit(submitAdmin)} className="space-y-6">
                    <Alert className="rounded-[22px] border-blue-200 bg-blue-50 text-blue-800">
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
                        variant="dark" className="px-5"
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
          <Card className="rounded-2xl border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-blue-50 p-3 text-blue-600">
                  <Users2 className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-xl text-slate-900 dark:text-slate-100">Alle User dieser Agentur</CardTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Owner sehen hier alle Accounts inklusive Rolle, Status und Löschoption.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {tenant?.users?.length ? (
                <div className="overflow-hidden rounded-2xl border border-slate-100 dark:border-border">
                  <div className="overflow-x-auto">
                    <div className="min-w-[760px]">
                      <div className="grid grid-cols-[minmax(0,1.4fr)_120px_120px_180px_92px] gap-4 border-b border-slate-100 dark:border-border bg-slate-50 dark:bg-card px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                        <p>User</p>
                        <p>Rolle</p>
                        <p>Status</p>
                        <p>Seit</p>
                        <p className="text-right">Aktion</p>
                      </div>

                      <div className="divide-y divide-slate-100">
                        {tenant.users.map((user) => {
                          const isPending = deletingUserId === user.userId

                          return (
                            <div
                              key={user.memberId}
                              className="grid grid-cols-[minmax(0,1.4fr)_120px_120px_180px_92px] gap-4 px-5 py-4 text-sm text-slate-600 dark:text-slate-300"
                            >
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
                                  {user.name || user.email || "Unbekannter User"}
                                </p>
                                <p className="truncate text-slate-500 dark:text-slate-400">{user.email || user.userId}</p>
                              </div>

                              <div>
                                <Badge
                                  className={
                                    user.role === "admin"
                                      ? "rounded-full bg-blue-50 text-blue-700 hover:bg-blue-50"
                                      : "rounded-full bg-blue-50 text-blue-600 hover:bg-blue-50"
                                  }
                                >
                                  {memberRoleCopy(user.role)}
                                </Badge>
                              </div>

                              <div>
                                <Badge
                                  className={
                                    user.status === "active"
                                      ? "rounded-full bg-[#eff8f2] text-[#166534] hover:bg-[#eff8f2] dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                                      : "rounded-full bg-amber-50 text-blue-600 hover:bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/40"
                                  }
                                >
                                  {memberStatusCopy(user.status)}
                                </Badge>
                              </div>

                              <div className="text-slate-500 dark:text-slate-400">
                                {formatDateTime(user.joinedAt || user.invitedAt)}
                              </div>

                              <div className="flex justify-end">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 rounded-full text-blue-600 hover:bg-amber-50 hover:text-blue-600"
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
                <div className="rounded-2xl border border-dashed border-slate-100 dark:border-border bg-slate-50 dark:bg-card px-6 py-12 text-center">
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">Keine User gefunden</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Für diese Agentur wurden aktuell keine zugeordneten User geladen.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-0">
          <Card className="rounded-2xl border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-blue-50 p-3 text-blue-600">
                  <Clock3 className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-xl text-slate-900 dark:text-slate-100">Owner-Historie</CardTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Die letzten Owner-Aktionen rund um diese Agentur werden hier nachvollziehbar protokolliert.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {tenant?.auditLogs?.length ? (
                <div className="space-y-4">
                  {tenant.auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-2xl border border-slate-100 dark:border-border bg-slate-50 dark:bg-card p-5"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={auditEventBadgeClass(log.event_type)}>
                              {auditEventLabel(log.event_type)}
                            </Badge>
                            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                              {formatDateTime(log.created_at)}
                            </span>
                          </div>
                          <p className="text-sm leading-6 text-slate-700 dark:text-slate-300">
                            {formatAuditLogDescription(log)}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-white dark:bg-card px-4 py-3 text-xs leading-5 text-slate-500 dark:text-slate-400 shadow-sm">
                          <p>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">Actor:</span>{" "}
                            {log.actor_user_id ?? "unbekannt"}
                          </p>
                          {log.target_user_id ? (
                            <p>
                              <span className="font-semibold text-slate-700 dark:text-slate-300">Target:</span>{" "}
                              {log.target_user_id}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-100 dark:border-border bg-slate-50 dark:bg-card px-6 py-12 text-center">
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">Noch keine Historie vorhanden</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Sobald Owner-Aktionen auf dieser Agentur ausgeführt werden, erscheinen sie hier chronologisch.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscription" className="mt-0">
          <OwnerTenantSubscriptionTab tenantId={tenantId} />
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
        <AlertDialogContent className="rounded-2xl border-slate-100 dark:border-border bg-slate-50 dark:bg-card">
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
              className="rounded-full bg-blue-600 hover:bg-blue-700"
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

/* -------------------------------------------------------------------------- */
/*  Subscription Tab (PROJ-16)                                                */
/* -------------------------------------------------------------------------- */

interface SubscriptionDetail {
  subscriptionStatus: string
  subscriptionPeriodEnd: string | null
  totalAmount: number
  currency: string
  accessState: string
  ownerLockedAt: string | null
  ownerLockReason: string | null
  modules: {
    id: string
    name: string
    status: string
    price: number
    currency: string
    currentPeriodEnd: string | null
  }[]
}

function OwnerTenantSubscriptionTab({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<SubscriptionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lockLoading, setLockLoading] = useState(false)

  const loadBilling = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/owner/tenants/${tenantId}/billing`, {
        credentials: "include",
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error ?? "Billing-Details konnten nicht geladen werden.")
      }

      setData(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Billing-Details konnten nicht geladen werden.")
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    void loadBilling()
  }, [loadBilling])

  async function handleLock() {
    try {
      setLockLoading(true)
      setError(null)

      const response = await fetch(`/api/owner/tenants/${tenantId}/billing/lock`, {
        method: "POST",
        credentials: "include",
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error ?? "Tenant konnte nicht gesperrt werden.")
      }

      await loadBilling()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tenant konnte nicht gesperrt werden.")
    } finally {
      setLockLoading(false)
    }
  }

  async function handleUnlock() {
    try {
      setLockLoading(true)
      setError(null)

      const response = await fetch(`/api/owner/tenants/${tenantId}/billing/unlock`, {
        method: "POST",
        credentials: "include",
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error ?? "Tenant konnte nicht freigeschaltet werden.")
      }

      await loadBilling()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tenant konnte nicht freigeschaltet werden.")
    } finally {
      setLockLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <Alert className="rounded-2xl border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900/70 dark:bg-orange-950/30 dark:text-orange-300">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Fehler</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-100 dark:border-border bg-slate-50 dark:bg-card px-6 py-12 text-center">
        <CreditCard className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Keine Billing-Daten</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Fuer diesen Tenant liegen noch keine Abo-Informationen vor.
        </p>
      </div>
    )
  }

  function subStatusLabel(status: string) {
    switch (status) {
      case "active":
        return "Aktiv"
      case "past_due":
        return "Überfällig"
      case "canceling":
        return "In Kündigung"
      case "canceled":
        return "Gekündigt"
      default:
        return "Kein Abo"
    }
  }

  function subStatusBadgeClasses(status: string) {
    switch (status) {
      case "active":
        return "bg-blue-50 text-blue-600 hover:bg-blue-50"
      case "past_due":
        return "bg-red-50 text-[#dc2626] hover:bg-red-50"
      case "canceling":
        return "bg-blue-50 text-blue-600 hover:bg-blue-50"
      case "canceled":
        return "bg-[#f1f5f9] text-[#64748b] hover:bg-[#f1f5f9]"
      default:
        return "bg-[#f1f5f9] text-[#94a3b8] hover:bg-[#f1f5f9]"
    }
  }

  function accessLabel(state: string) {
    switch (state) {
      case "accessible":
        return "Zugang aktiv"
      case "manual_locked":
        return "Manuell gesperrt"
      case "billing_blocked":
        return "Billing-Block"
      default:
        return state
    }
  }

  function accessBadgeClasses(state: string) {
    switch (state) {
      case "accessible":
        return "bg-blue-50 text-blue-600 hover:bg-blue-50"
      case "manual_locked":
        return "bg-red-50 text-[#dc2626] hover:bg-red-50"
      case "billing_blocked":
        return "bg-blue-50 text-blue-600 hover:bg-blue-50"
      default:
        return "bg-[#f1f5f9] text-[#94a3b8] hover:bg-[#f1f5f9]"
    }
  }

  const isLocked = data.accessState === "manual_locked"

  return (
    <div className="space-y-6">
      {error && (
        <Alert className="rounded-2xl border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900/70 dark:bg-orange-950/30 dark:text-orange-300">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Subscription Status */}
        <Card className="rounded-2xl border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
          <CardHeader className="space-y-3">
            <CardTitle className="flex items-center gap-3 text-lg text-slate-950 dark:text-slate-50">
              <CreditCard className="h-5 w-5 text-blue-600" />
              Abo-Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-300">Status</span>
              <Badge className={`rounded-full ${subStatusBadgeClasses(data.subscriptionStatus)}`}>
                {subStatusLabel(data.subscriptionStatus)}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-300">Nächste Abrechnung</span>
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {data.subscriptionPeriodEnd
                  ? new Intl.DateTimeFormat("de-DE", { dateStyle: "long" }).format(
                      new Date(data.subscriptionPeriodEnd)
                    )
                  : "--"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-300">Gesamtbetrag / Periode</span>
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {data.totalAmount > 0
                  ? new Intl.NumberFormat("de-DE", {
                      style: "currency",
                      currency: data.currency.toUpperCase(),
                    }).format(data.totalAmount / 100)
                  : "--"}
              </span>
            </div>

            {data.subscriptionStatus === "past_due" && (
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-[#dc2626]">
                <AlertTriangle className="mb-1 inline h-4 w-4" /> Die letzte Zahlung dieses
                Tenants ist fehlgeschlagen.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Access Override */}
        <Card className="rounded-2xl border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
          <CardHeader className="space-y-3">
            <CardTitle className="flex items-center gap-3 text-lg text-slate-950 dark:text-slate-50">
              <ShieldCheck className="h-5 w-5 text-blue-600" />
              Zugang
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-300">Zugangs-Status</span>
              <Badge className={`rounded-full ${accessBadgeClasses(data.accessState)}`}>
                {accessLabel(data.accessState)}
              </Badge>
            </div>

            {data.ownerLockedAt && (
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-[#dc2626]">
                <Lock className="mb-1 inline h-4 w-4" /> Manuell gesperrt am{" "}
                {new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(
                  new Date(data.ownerLockedAt)
                )}
                {data.ownerLockReason && (
                  <>
                    <br />
                    Grund: {data.ownerLockReason}
                  </>
                )}
              </div>
            )}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                {isLocked ? (
                  <Button
                    variant="outline"
                    className="w-full rounded-full border-blue-600 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                    disabled={lockLoading}
                  >
                    {lockLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Unlock className="mr-2 h-4 w-4" />
                    )}
                    Tenant freischalten
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full rounded-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    disabled={lockLoading}
                  >
                    {lockLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Lock className="mr-2 h-4 w-4" />
                    )}
                    Tenant sperren
                  </Button>
                )}
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-2xl border-slate-100 dark:border-border bg-slate-50 dark:bg-card">
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {isLocked ? "Tenant freischalten?" : "Tenant sperren?"}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="leading-6">
                    {isLocked
                      ? "Der Tenant erhält wieder Zugang zur Plattform, sofern der Billing-Status dies zulässt."
                      : "Der Tenant verliert sofort den Zugang zur Plattform, unabhängig vom Abo-Status. Das Abo bei Stripe bleibt davon unberührt."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-full">Abbrechen</AlertDialogCancel>
                  <AlertDialogAction
                    className={cn(
                      "rounded-full",
                      isLocked
                        ? "bg-slate-900 text-white hover:bg-slate-800"
                        : "bg-slate-900 text-white hover:bg-slate-800"
                    )}
                    onClick={() => void (isLocked ? handleUnlock() : handleLock())}
                  >
                    {isLocked ? "Freischalten" : "Sperren"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>

      {/* Module Breakdown */}
      <Card className="rounded-2xl border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
        <CardHeader className="space-y-3">
          <CardTitle className="flex items-center gap-3 text-lg text-slate-950 dark:text-slate-50">
            <Package className="h-5 w-5 text-blue-600" />
            Gebuchte Module
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.modules.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-100 dark:border-border bg-slate-50 dark:bg-card px-6 py-10 text-center">
              <Package className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Keine Module gebucht</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Dieser Tenant hat noch keine zusaetzlichen Module abonniert.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.modules.map((mod) => (
                <div
                  key={mod.id}
                  className="flex items-center justify-between rounded-2xl border border-slate-100 dark:border-border bg-slate-50 dark:bg-card px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{mod.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {mod.status === "active"
                        ? "Aktiv"
                        : mod.status === "canceling"
                          ? `Endet am ${mod.currentPeriodEnd ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(mod.currentPeriodEnd)) : "--"}`
                          : "Beendet"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {new Intl.NumberFormat("de-DE", {
                        style: "currency",
                        currency: mod.currency.toUpperCase(),
                      }).format(mod.price / 100)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">/ 4 Wochen</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
