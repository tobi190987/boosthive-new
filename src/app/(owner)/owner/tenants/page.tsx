"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { Plus, MoreHorizontal, Building2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface Tenant {
  id: string
  name: string
  slug: string
  status: "active" | "inactive"
  created_at: string
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const fetchTenants = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch("/api/owner/tenants")
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Fehler beim Laden der Agenturen.")
      }
      const data = await res.json()
      setTenants(data.tenants ?? data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTenants()
  }, [fetchTenants])

  async function toggleStatus(tenant: Tenant) {
    const newStatus = tenant.status === "active" ? "inactive" : "active"
    setTogglingId(tenant.id)
    try {
      const res = await fetch(`/api/owner/tenants/${tenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Statusänderung fehlgeschlagen.")
      }
      setTenants((prev) =>
        prev.map((t) => (t.id === tenant.id ? { ...t, status: newStatus } : t))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.")
    } finally {
      setTogglingId(null)
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenturen</h1>
          <p className="mt-1 text-sm text-gray-500">
            Verwalte alle registrierten Agenturen und deren Status.
          </p>
        </div>
        <Button asChild className="bg-teal-500 hover:bg-teal-600">
          <Link href="/owner/tenants/new">
            <Plus className="mr-2 h-4 w-4" />
            Neue Agentur
          </Link>
        </Button>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading */}
      {loading && (
        <div className="rounded-xl border bg-white shadow-sm">
          <div className="p-4 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-8" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && tenants.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-white px-6 py-16 shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-teal-50">
            <Building2 className="h-6 w-6 text-teal-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            Noch keine Agenturen
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Erstelle deine erste Agentur, um loszulegen.
          </p>
          <Button asChild className="mt-6 bg-teal-500 hover:bg-teal-600">
            <Link href="/owner/tenants/new">
              <Plus className="mr-2 h-4 w-4" />
              Neue Agentur
            </Link>
          </Button>
        </div>
      )}

      {/* Table */}
      {!loading && tenants.length > 0 && (
        <div className="rounded-xl border bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Subdomain</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Erstellt</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Aktionen</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((tenant) => (
                <TableRow key={tenant.id} className="hover:bg-gray-50">
                  <TableCell>
                    <Link
                      href={`/owner/tenants/${tenant.id}`}
                      className="font-medium text-gray-900 transition-colors hover:text-teal-600"
                    >
                      {tenant.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-gray-500">
                    {tenant.slug}.boost-hive.de
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={tenant.status === "active" ? "default" : "secondary"}
                      className={
                        tenant.status === "active"
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-100"
                      }
                    >
                      {tenant.status === "active" ? "Aktiv" : "Inaktiv"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-gray-500">
                    {formatDate(tenant.created_at)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={togglingId === tenant.id}
                          aria-label={`Aktionen für ${tenant.name}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/owner/tenants/${tenant.id}`}>
                            Details öffnen
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => toggleStatus(tenant)}
                          disabled={togglingId === tenant.id}
                        >
                          {tenant.status === "active"
                            ? "Deaktivieren"
                            : "Aktivieren"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
