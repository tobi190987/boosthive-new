'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  Archive,
  CirclePlay,
  CirclePause,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  RotateCcw,
  SearchX,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  canOwnerToggleTenantStatus,
  ownerToggleTenantStatusDescription,
  ownerToggleTenantStatusLabel,
  tenantStatusBadgeClass,
  tenantStatusLabel,
} from '@/lib/tenant-status'

export interface OwnerTenantRecord {
  id: string
  name: string
  slug: string
  status: string
  created_at: string
  memberCount: number
  is_archived: boolean
  archived_at?: string | null
  archive_reason?: string | null
}

interface OwnerTenantTableProps {
  tenants: OwnerTenantRecord[]
  summary: {
    active: number
    blocked: number
    archived: number
  }
  bulkEditMode: boolean
  selectedTenantIds: string[]
  bulkAction: 'archive' | 'delete' | null
  busyTenantId: string | null
  archivedFilter: 'exclude' | 'include' | 'only'
  onStartBulkEdit: () => void
  onCancelBulkEdit: () => void
  onToggleTenantSelection: (tenantId: string, checked: boolean) => void
  onToggleVisibleSelection: (checked: boolean) => void
  onArchiveSelected: () => Promise<void> | void
  onDeleteSelected: () => Promise<void> | void
  onToggleStatus: (tenant: OwnerTenantRecord) => Promise<void> | void
  onArchiveTenant: (tenant: OwnerTenantRecord) => Promise<void> | void
  onRestoreTenant: (tenant: OwnerTenantRecord) => Promise<void> | void
  onHardDeleteTenant: (tenant: OwnerTenantRecord) => Promise<void> | void
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function OwnerTenantTable({
  tenants,
  summary,
  bulkEditMode,
  selectedTenantIds,
  bulkAction,
  busyTenantId,
  archivedFilter,
  onStartBulkEdit,
  onCancelBulkEdit,
  onToggleTenantSelection,
  onToggleVisibleSelection,
  onArchiveSelected,
  onDeleteSelected,
  onToggleStatus,
  onArchiveTenant,
  onRestoreTenant,
  onHardDeleteTenant,
}: OwnerTenantTableProps) {
  const [confirmTenant, setConfirmTenant] = useState<OwnerTenantRecord | null>(null)
  const [archiveTenant, setArchiveTenant] = useState<OwnerTenantRecord | null>(null)
  const [restoreTenant, setRestoreTenant] = useState<OwnerTenantRecord | null>(null)
  const [deleteTenant, setDeleteTenant] = useState<OwnerTenantRecord | null>(null)
  const selectedCount = selectedTenantIds.length
  const allVisibleSelected = tenants.length > 0 && tenants.every((tenant) => selectedTenantIds.includes(tenant.id))
  const selectedArchivedCount = tenants.filter(
    (tenant) => selectedTenantIds.includes(tenant.id) && tenant.is_archived
  ).length
  const selectedNotArchivedCount = selectedCount - selectedArchivedCount

  if (tenants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-100 dark:border-border bg-white dark:bg-card px-6 py-16 text-center shadow-soft">
        <div className="mb-4 rounded-full bg-blue-50 p-4 text-blue-600">
          <SearchX className="h-6 w-6" />
        </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Keine Tenants im aktuellen Filter</h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
            {archivedFilter === 'only'
              ? 'Im Archiv ist aktuell kein Tenant sichtbar.'
              : 'Passe Suche oder Filter an, um weitere Agenturen zu sehen.'}
          </p>
        </div>
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card shadow-soft">
        <div className="flex flex-col gap-4 border-b border-slate-100 dark:border-border px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-600">
              Owner Directory
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">
              Agenturen im System
            </h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="rounded-full border border-[#d7eadf] bg-[#eff8f2] px-4 py-2 text-sm text-slate-600 dark:text-slate-300">
              {summary.active} aktiv
            </div>
            <div className="rounded-full border border-slate-100 dark:border-border bg-slate-50 dark:bg-card px-4 py-2 text-sm text-slate-600 dark:text-slate-300">
              {summary.blocked} blockiert
            </div>
            <div className="rounded-full border border-slate-200 dark:border-border bg-slate-100 dark:bg-secondary px-4 py-2 text-sm text-slate-600 dark:text-slate-300">
              {summary.archived} archiviert
            </div>
            {bulkEditMode ? (
              <Button
                type="button"
                variant="outline"
                className="border-slate-100 dark:border-border bg-white dark:bg-card"
                onClick={onCancelBulkEdit}
                disabled={bulkAction !== null}
              >
                Bulk-Bearbeitung beenden
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="border-slate-100 dark:border-border bg-white dark:bg-card"
                onClick={onStartBulkEdit}
              >
                Mehrfach bearbeiten
              </Button>
            )}
          </div>
        </div>

        {bulkEditMode ? (
          <div className="flex flex-col gap-3 border-b border-slate-100 dark:border-border bg-slate-50 dark:bg-card px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {selectedCount > 0
                ? `${selectedCount} Agentur${selectedCount === 1 ? '' : 'en'} ausgewählt`
                : 'Wähle Agenturen aus, um Sammelaktionen auszuführen.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-slate-100 dark:border-border"
                onClick={selectedCount > 0 ? () => onToggleVisibleSelection(false) : onCancelBulkEdit}
              >
                {selectedCount > 0 ? 'Auswahl aufheben' : 'Abbrechen'}
              </Button>
              <Button
                type="button"
                className="bg-blue-600 hover:bg-blue-700"
                onClick={() => void onArchiveSelected()}
                disabled={bulkAction !== null || selectedNotArchivedCount === 0}
              >
                {bulkAction === 'archive' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Archive className="mr-2 h-4 w-4" />
                )}
                Ausgewählte archivieren
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-slate-100 dark:border-border text-blue-600"
                onClick={() => void onDeleteSelected()}
                disabled={bulkAction !== null || selectedArchivedCount === 0}
              >
                {bulkAction === 'delete' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Ausgewählte löschen
              </Button>
            </div>
          </div>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {bulkEditMode ? (
                <TableHead className="w-14 pl-6">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={(checked) => onToggleVisibleSelection(checked === true)}
                    aria-label="Alle sichtbaren Agenturen auswählen"
                  />
                </TableHead>
              ) : null}
              <TableHead className="pl-6">Tenant</TableHead>
              <TableHead>Subdomain</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Erstellt</TableHead>
              <TableHead className="pr-6 text-right">Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((tenant) => {
              const isPending = busyTenantId === tenant.id

              return (
                <TableRow key={tenant.id} className="border-slate-100 dark:border-border hover:bg-slate-50 dark:hover:bg-[#1e2635]">
                  {bulkEditMode ? (
                    <TableCell className="pl-6">
                      <Checkbox
                        checked={selectedTenantIds.includes(tenant.id)}
                        onCheckedChange={(checked) => onToggleTenantSelection(tenant.id, checked === true)}
                        aria-label={`${tenant.name} auswählen`}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell className="pl-6">
                    <div>
                      <Link
                        href={`/owner/tenants/${tenant.id}`}
                        className="font-medium text-slate-900 dark:text-slate-100 transition-colors hover:text-blue-600"
                      >
                        {tenant.name}
                      </Link>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Tenant-ID: {tenant.id.slice(0, 8)}...</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-300">{tenant.slug}.boost-hive.de</TableCell>
                  <TableCell>
                    <Badge className={tenantStatusBadgeClass(tenant.status)}>
                      {tenantStatusLabel(tenant.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-500 dark:text-slate-400">{tenant.memberCount}</TableCell>
                  <TableCell className="text-slate-500 dark:text-slate-400">{formatDate(tenant.created_at)}</TableCell>
                  <TableCell className="pr-6">
                    <div className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-full"
                            disabled={isPending}
                            aria-label={`Aktionen für ${tenant.name}`}
                          >
                            {isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <MoreHorizontal className="h-4 w-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-2xl border-slate-100 dark:border-border">
                          <DropdownMenuItem asChild>
                            <Link href={`/owner/tenants/${tenant.id}`} className="cursor-pointer">
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Details öffnen
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => setConfirmTenant(tenant)}
                            disabled={isPending || tenant.is_archived || !canOwnerToggleTenantStatus(tenant.status)}
                          >
                            {tenant.status === 'inactive' ? (
                              <CirclePlay className="mr-2 h-4 w-4" />
                            ) : (
                              <CirclePause className="mr-2 h-4 w-4" />
                            )}
                            {ownerToggleTenantStatusLabel(tenant.status)}
                          </DropdownMenuItem>
                          {tenant.is_archived ? (
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => setRestoreTenant(tenant)}
                              disabled={isPending}
                            >
                              <RotateCcw className="mr-2 h-4 w-4" />
                              Aktivieren
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => setArchiveTenant(tenant)}
                              disabled={isPending}
                            >
                              <Archive className="mr-2 h-4 w-4" />
                              Archivieren
                            </DropdownMenuItem>
                          )}
                          {tenant.is_archived ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="cursor-pointer text-blue-600 focus:text-blue-600"
                                onClick={() => setDeleteTenant(tenant)}
                                disabled={isPending}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Endgültig löschen
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={Boolean(confirmTenant)}
        onOpenChange={(open) => {
          if (!open) setConfirmTenant(null)
        }}
      >
        <AlertDialogTrigger asChild>
          <span className="hidden" />
        </AlertDialogTrigger>
        <AlertDialogContent className="rounded-2xl border-slate-100 dark:border-border bg-slate-50 dark:bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTenant ? `Tenant ${ownerToggleTenantStatusLabel(confirmTenant.status).toLowerCase()}?` : 'Tenant-Status ändern?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="leading-6">
              {confirmTenant
                ? ownerToggleTenantStatusDescription(confirmTenant.status)
                : 'Diese Statusänderung wird für den Tenant bestätigt.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
              onClick={async () => {
                if (!confirmTenant) return
                await onToggleStatus(confirmTenant)
                setConfirmTenant(null)
              }}
            >
              {confirmTenant ? ownerToggleTenantStatusLabel(confirmTenant.status) : 'Bestaetigen'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(archiveTenant)}
        onOpenChange={(open) => {
          if (!open) setArchiveTenant(null)
        }}
      >
        <AlertDialogTrigger asChild>
          <span className="hidden" />
        </AlertDialogTrigger>
        <AlertDialogContent className="rounded-2xl border-slate-100 dark:border-border bg-slate-50 dark:bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Tenant archivieren?</AlertDialogTitle>
            <AlertDialogDescription className="leading-6">
              {archiveTenant?.name} verschwindet aus der Standardansicht und neue Logins werden blockiert.
              Eine Wiederherstellung bleibt später möglich.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-blue-600 hover:bg-blue-700"
              onClick={async () => {
                if (!archiveTenant) return
                await onArchiveTenant(archiveTenant)
                setArchiveTenant(null)
              }}
            >
              Archivieren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(restoreTenant)}
        onOpenChange={(open) => {
          if (!open) setRestoreTenant(null)
        }}
      >
        <AlertDialogTrigger asChild>
          <span className="hidden" />
        </AlertDialogTrigger>
        <AlertDialogContent className="rounded-2xl border-slate-100 dark:border-border bg-slate-50 dark:bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Agentur aktivieren?</AlertDialogTitle>
            <AlertDialogDescription className="leading-6">
              {restoreTenant?.name} erscheint wieder in den normalen Listen und kann danach erneut genutzt werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-blue-600 hover:bg-blue-700"
              onClick={async () => {
                if (!restoreTenant) return
                await onRestoreTenant(restoreTenant)
                setRestoreTenant(null)
              }}
            >
              Aktivieren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleteTenant)}
        onOpenChange={(open) => {
          if (!open) setDeleteTenant(null)
        }}
      >
        <AlertDialogTrigger asChild>
          <span className="hidden" />
        </AlertDialogTrigger>
        <AlertDialogContent className="rounded-2xl border-slate-100 dark:border-border bg-slate-50 dark:bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTenant?.is_archived ? 'Tenant endgültig löschen?' : 'Tenant archivieren?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="leading-6">
              {deleteTenant?.is_archived
                ? `${deleteTenant?.name} wird dauerhaft entfernt. Zugehörige Daten des Tenants werden gelöscht und verwaiste User-Accounts werden ebenfalls bereinigt.`
                : `${deleteTenant?.name} wird standardmäßig archiviert statt sofort entfernt. Für eine harte Löschung muss der Tenant zuerst im Archiv liegen.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-blue-600 hover:bg-blue-700"
              onClick={async () => {
                if (!deleteTenant) return
                if (deleteTenant.is_archived) {
                  await onHardDeleteTenant(deleteTenant)
                } else {
                  await onArchiveTenant(deleteTenant)
                }
                setDeleteTenant(null)
              }}
            >
              {deleteTenant?.is_archived ? 'Endgültig löschen' : 'Archivieren'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
