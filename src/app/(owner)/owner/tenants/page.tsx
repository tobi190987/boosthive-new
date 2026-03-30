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
import { toast } from "@/hooks/use-toast"

type ArchivedFilter = "exclude" | "include" | "only"

interface TenantSummary {
  active: number
  blocked: number
  archived: number
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<OwnerTenantRecord[]>([])
  const [summary, setSummary] = useState<TenantSummary>({
    active: 0,
    blocked: 0,
    archived: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyTenantId, setBusyTenantId] = useState<string | null>(null)
  const [bulkAction, setBulkAction] = useState<null | "archive" | "delete">(null)
  const [bulkEditMode, setBulkEditMode] = useState(false)
  const [archivedFilter, setArchivedFilter] = useState<ArchivedFilter>("exclude")
  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>([])

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
      setSummary(
        payload.summary ?? {
          active: 0,
          blocked: 0,
          archived: 0,
        }
      )
      setSelectedTenantIds((current) =>
        current.filter((tenantId) =>
          (payload.tenants ?? []).some((tenant: OwnerTenantRecord) => tenant.id === tenantId)
        )
      )
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

  function toggleTenantSelection(tenantId: string, checked: boolean) {
    setSelectedTenantIds((current) =>
      checked ? Array.from(new Set([...current, tenantId])) : current.filter((id) => id !== tenantId)
    )
  }

  function toggleVisibleSelection(checked: boolean) {
    if (checked) {
      setSelectedTenantIds(tenants.map((tenant) => tenant.id))
      return
    }

    setSelectedTenantIds([])
  }

  function startBulkEdit() {
    setBulkEditMode(true)
    setSelectedTenantIds([])
    setError(null)
  }

  function cancelBulkEdit() {
    setBulkEditMode(false)
    setSelectedTenantIds([])
    setBulkAction(null)
    setError(null)
  }

  async function archiveSelectedTenants() {
    const tenantsToArchive = tenants.filter(
      (tenant) => selectedTenantIds.includes(tenant.id) && !tenant.is_archived
    )

    if (tenantsToArchive.length === 0) {
      setError("Bitte wähle mindestens eine nicht archivierte Agentur zum Archivieren aus.")
      return
    }

    setBulkAction("archive")
    setError(null)

    const failedTenantNames: string[] = []

    for (const tenant of tenantsToArchive) {
      const response = await fetch(`/api/owner/tenants/${tenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: "archive" }),
      })

      if (!response.ok) {
        failedTenantNames.push(tenant.name)
      }
    }

    await fetchTenants()
    setBulkAction(null)

    if (failedTenantNames.length > 0) {
      setError(`Einige Agenturen konnten nicht archiviert werden: ${failedTenantNames.join(", ")}.`)
      return
    }

    setSelectedTenantIds([])
    toast({
      title: "Agenturen archiviert",
      description: `${tenantsToArchive.length} Agentur${tenantsToArchive.length === 1 ? "" : "en"} archiviert.`,
    })
  }

  async function deleteSelectedTenants() {
    const tenantsToDelete = tenants.filter(
      (tenant) => selectedTenantIds.includes(tenant.id) && tenant.is_archived
    )

    if (tenantsToDelete.length === 0) {
      setError("Bitte wähle mindestens eine archivierte Agentur zum Löschen aus.")
      return
    }

    setBulkAction("delete")
    setError(null)

    const failedTenantNames: string[] = []

    for (const tenant of tenantsToDelete) {
      const response = await fetch(`/api/owner/tenants/${tenant.id}?mode=hard`, {
        method: "DELETE",
        credentials: "include",
      })

      if (!response.ok) {
        failedTenantNames.push(tenant.name)
      }
    }

    await fetchTenants()
    setBulkAction(null)

    if (failedTenantNames.length > 0) {
      setError(`Einige Agenturen konnten nicht gelöscht werden: ${failedTenantNames.join(", ")}.`)
      return
    }

    setSelectedTenantIds([])
    toast({
      title: "Agenturen gelöscht",
      description: `${tenantsToDelete.length} Agentur${tenantsToDelete.length === 1 ? "" : "en"} endgültig gelöscht.`,
    })
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
              className={archivedFilter === "exclude" ? "bg-[#1f2937] hover:bg-[#111827]" : "border-slate-100 dark:border-[#252d3a]"}
              onClick={() => setArchivedFilter("exclude")}
            >
              Nicht archiviert
            </Button>
            <Button
              type="button"
              variant={archivedFilter === "include" ? "default" : "outline"}
              className={archivedFilter === "include" ? "bg-[#1f2937] hover:bg-[#111827]" : "border-slate-100 dark:border-[#252d3a]"}
              onClick={() => setArchivedFilter("include")}
            >
              Alle
            </Button>
            <Button
              type="button"
              variant={archivedFilter === "only" ? "default" : "outline"}
              className={archivedFilter === "only" ? "bg-[#1f2937] hover:bg-[#111827]" : "border-slate-100 dark:border-[#252d3a]"}
              onClick={() => setArchivedFilter("only")}
            >
              Nur archiviert
            </Button>
          </div>
          <p className="text-sm text-gray-500">
            {archivedFilter === "exclude"
              ? "Zeigt nur aktive und blockierte Agenturen. Archivierte Einträge sind ausgeblendet."
              : archivedFilter === "include"
                ? "Zeigt aktive, blockierte und archivierte Agenturen zusammen."
                : "Zeigt nur Agenturen, die bereits im Archiv liegen."}
          </p>
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
        <div className="space-y-4 rounded-xl border bg-white dark:bg-[#151c28] p-5 shadow-sm">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : tenants.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-white dark:bg-[#151c28] px-6 py-16 text-center shadow-sm">
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
          summary={summary}
          bulkEditMode={bulkEditMode}
          selectedTenantIds={selectedTenantIds}
          bulkAction={bulkAction}
          busyTenantId={busyTenantId}
          archivedFilter={archivedFilter}
          onStartBulkEdit={startBulkEdit}
          onCancelBulkEdit={cancelBulkEdit}
          onToggleTenantSelection={toggleTenantSelection}
          onToggleVisibleSelection={toggleVisibleSelection}
          onArchiveSelected={archiveSelectedTenants}
          onDeleteSelected={deleteSelectedTenants}
          onToggleStatus={toggleStatus}
          onArchiveTenant={archiveTenant}
          onRestoreTenant={restoreTenant}
          onHardDeleteTenant={hardDeleteTenant}
        />
      )}
    </div>
  )
}
