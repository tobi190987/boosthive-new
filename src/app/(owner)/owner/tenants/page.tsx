"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Building2, Plus } from "lucide-react"
import { OwnerTenantTable, type OwnerTenantRecord } from "@/components/owner-tenant-table"
import {
  canOwnerToggleTenantStatus,
  nextOwnerToggleTenantStatus,
} from "@/lib/tenant-status"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

type ArchivedFilter = "exclude" | "include" | "only"

export default function TenantsPage() {
  const [tenants, setTenants] = useState<OwnerTenantRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyTenantId, setBusyTenantId] = useState<string | null>(null)
  const [archivedFilter, setArchivedFilter] = useState<ArchivedFilter>("exclude")

  const fetchTenants = useCallback(async () => {
    try {
      setError(null)

      const response = await fetch(`/api/owner/tenants?archived=${archivedFilter}`, {
        credentials: "include",
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error || "Fehler beim Laden der Agenturen.")
      }

      setTenants(payload.tenants ?? [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unbekannter Fehler.")
    } finally {
      setLoading(false)
    }
  }, [archivedFilter])

  useEffect(() => {
    void fetchTenants()
  }, [fetchTenants])

  async function toggleStatus(tenant: OwnerTenantRecord) {
    const newStatus = nextOwnerToggleTenantStatus(tenant.status)
    if (!newStatus || !canOwnerToggleTenantStatus(tenant.status)) {
      setError("Dieser Tenant-Status kann derzeit nicht direkt umgeschaltet werden.")
      return
    }

    setBusyTenantId(tenant.id)
    setError(null)

    try {
      const response = await fetch(`/api/owner/tenants/${tenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error || "Statusänderung fehlgeschlagen.")
      }

      await fetchTenants()
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Unbekannter Fehler.")
    } finally {
      setBusyTenantId(null)
    }
  }

  async function archiveTenant(tenant: OwnerTenantRecord) {
    setBusyTenantId(tenant.id)
    setError(null)

    try {
      const response = await fetch(`/api/owner/tenants/${tenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: "archive" }),
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error || "Tenant konnte nicht archiviert werden.")
      }

      await fetchTenants()
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Unbekannter Fehler.")
    } finally {
      setBusyTenantId(null)
    }
  }

  async function restoreTenant(tenant: OwnerTenantRecord) {
    setBusyTenantId(tenant.id)
    setError(null)

    try {
      const response = await fetch(`/api/owner/tenants/${tenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: "restore" }),
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error || "Tenant konnte nicht wiederhergestellt werden.")
      }

      await fetchTenants()
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Unbekannter Fehler.")
    } finally {
      setBusyTenantId(null)
    }
  }

  async function hardDeleteTenant(tenant: OwnerTenantRecord) {
    setBusyTenantId(tenant.id)
    setError(null)

    try {
      const response = await fetch(`/api/owner/tenants/${tenant.id}?mode=hard`, {
        method: "DELETE",
        credentials: "include",
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error || "Tenant konnte nicht endgültig gelöscht werden.")
      }

      await fetchTenants()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unbekannter Fehler.")
    } finally {
      setBusyTenantId(null)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-gray-900">Agenturen</h1>
          <p className="mt-1 text-sm text-gray-500">
            Verwalte Status, Archivierung, Wiederherstellung und endgültige Löschungen für alle registrierten Agenturen.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={archivedFilter === "exclude" ? "default" : "outline"}
              className={archivedFilter === "exclude" ? "bg-[#1f2937] hover:bg-[#111827]" : "border-[#e6ddd0]"}
              onClick={() => setArchivedFilter("exclude")}
            >
              Aktivansicht
            </Button>
            <Button
              type="button"
              variant={archivedFilter === "include" ? "default" : "outline"}
              className={archivedFilter === "include" ? "bg-[#1f2937] hover:bg-[#111827]" : "border-[#e6ddd0]"}
              onClick={() => setArchivedFilter("include")}
            >
              Mit Archiv
            </Button>
            <Button
              type="button"
              variant={archivedFilter === "only" ? "default" : "outline"}
              className={archivedFilter === "only" ? "bg-[#1f2937] hover:bg-[#111827]" : "border-[#e6ddd0]"}
              onClick={() => setArchivedFilter("only")}
            >
              Nur Archiv
            </Button>
          </div>
        </div>

        <Button asChild className="bg-teal-500 hover:bg-teal-600">
          <Link href="/owner/tenants/new">
            <Plus className="mr-2 h-4 w-4" />
            Neue Agentur
          </Link>
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : tenants.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-white px-6 py-16 text-center shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-teal-50">
            <Building2 className="h-6 w-6 text-teal-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Noch keine Agenturen</h3>
          <p className="mt-1 text-sm text-gray-500">
            {archivedFilter === "exclude"
              ? "Erstelle deine erste Agentur, um loszulegen."
              : archivedFilter === "include"
                ? "Im Moment gibt es weder aktive noch archivierte Agenturen in diesem Workspace."
                : "Im Archiv befindet sich aktuell keine Agentur."}
          </p>
          <Button
            asChild
            className="mt-6 bg-teal-500 hover:bg-teal-600"
          >
            <Link href="/owner/tenants/new">
              <Plus className="mr-2 h-4 w-4" />
              Neue Agentur
            </Link>
          </Button>
        </div>
      ) : (
        <OwnerTenantTable
          tenants={tenants}
          busyTenantId={busyTenantId}
          archivedFilter={archivedFilter}
          onToggleStatus={toggleStatus}
          onArchiveTenant={archiveTenant}
          onRestoreTenant={restoreTenant}
          onHardDeleteTenant={hardDeleteTenant}
        />
      )}
    </div>
  )
}
