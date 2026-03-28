'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  Archive,
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
  busyTenantId: string | null
  archivedFilter: 'exclude' | 'include' | 'only'
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
  busyTenantId,
  archivedFilter,
  onToggleStatus,
  onArchiveTenant,
  onRestoreTenant,
  onHardDeleteTenant,
}: OwnerTenantTableProps) {
  const [confirmTenant, setConfirmTenant] = useState<OwnerTenantRecord | null>(null)
  const [archiveTenant, setArchiveTenant] = useState<OwnerTenantRecord | null>(null)
  const [restoreTenant, setRestoreTenant] = useState<OwnerTenantRecord | null>(null)
  const [deleteTenant, setDeleteTenant] = useState<OwnerTenantRecord | null>(null)
  const activeCount = tenants.filter((tenant) => !tenant.is_archived && tenant.status === 'active').length
  const blockedCount = tenants.filter((tenant) => !tenant.is_archived && tenant.status !== 'active').length
  const archivedCount = tenants.filter((tenant) => tenant.is_archived).length

  if (tenants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[30px] border border-dashed border-[#ddd1c4] bg-white px-6 py-16 text-center shadow-[0_16px_50px_rgba(89,71,42,0.06)]">
        <div className="mb-4 rounded-full bg-[#f5efe6] p-4 text-[#b85e34]">
          <SearchX className="h-6 w-6" />
        </div>
          <h3 className="text-lg font-semibold text-slate-900">Keine Tenants im aktuellen Filter</h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
            {archivedFilter === 'only'
              ? 'Im Archiv ist aktuell kein Tenant sichtbar.'
              : 'Passe Suche oder Filter an, um weitere Agenturen zu sehen.'}
          </p>
        </div>
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-[30px] border border-[#e7ddd1] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
        <div className="flex flex-col gap-4 border-b border-[#ece2d5] px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#b85e34]">
              Owner Directory
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">
              Agenturen im System
            </h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="rounded-full border border-[#d7eadf] bg-[#eff8f2] px-4 py-2 text-sm text-slate-600">
              {activeCount} aktiv
            </div>
            <div className="rounded-full border border-[#e9ddcf] bg-[#faf5ee] px-4 py-2 text-sm text-slate-600">
              {blockedCount} blockiert
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-sm text-slate-600">
              {archivedCount} archiviert
            </div>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
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
                <TableRow key={tenant.id} className="border-[#f0e9df] hover:bg-[#fcfaf6]">
                  <TableCell className="pl-6">
                    <div>
                      <Link
                        href={`/owner/tenants/${tenant.id}`}
                        className="font-medium text-slate-900 transition-colors hover:text-[#0d9488]"
                      >
                        {tenant.name}
                      </Link>
                      <p className="text-sm text-slate-500">Tenant-ID: {tenant.id.slice(0, 8)}...</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600">{tenant.slug}.boost-hive.de</TableCell>
                  <TableCell>
                    <Badge className={tenantStatusBadgeClass(tenant.status)}>
                      {tenantStatusLabel(tenant.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-500">{tenant.memberCount}</TableCell>
                  <TableCell className="text-slate-500">{formatDate(tenant.created_at)}</TableCell>
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
                        <DropdownMenuContent align="end" className="rounded-2xl border-[#e6ddd0]">
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
                            <CirclePause className="mr-2 h-4 w-4" />
                            {ownerToggleTenantStatusLabel(tenant.status)}
                          </DropdownMenuItem>
                          {tenant.is_archived ? (
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => setRestoreTenant(tenant)}
                              disabled={isPending}
                            >
                              <RotateCcw className="mr-2 h-4 w-4" />
                              Wiederherstellen
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
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="cursor-pointer text-[#9f4f2d] focus:text-[#9f4f2d]"
                            onClick={() => setDeleteTenant(tenant)}
                            disabled={isPending}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {tenant.is_archived ? 'Endgültig löschen' : 'Archivieren über Löschen'}
                          </DropdownMenuItem>
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
        <AlertDialogContent className="rounded-[28px] border-[#e7ddd1] bg-[#fffdf9]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTenant ? `Tenant ${ownerToggleTenantStatusLabel(confirmTenant.status).toLowerCase()}?` : 'Tenant-Status aendern?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="leading-6">
              {confirmTenant
                ? ownerToggleTenantStatusDescription(confirmTenant.status)
                : 'Diese Statusaenderung wird fuer den Tenant bestaetigt.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-[#1f2937] hover:bg-[#111827]"
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
        <AlertDialogContent className="rounded-[28px] border-[#e7ddd1] bg-[#fffdf9]">
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
              className="rounded-full bg-[#9f4f2d] hover:bg-[#7c3d1d]"
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
        <AlertDialogContent className="rounded-[28px] border-[#e7ddd1] bg-[#fffdf9]">
          <AlertDialogHeader>
            <AlertDialogTitle>Tenant wiederherstellen?</AlertDialogTitle>
            <AlertDialogDescription className="leading-6">
              {restoreTenant?.name} erscheint wieder in den normalen Listen und kann danach erneut genutzt werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-[#0d9488] hover:bg-[#0b7c72]"
              onClick={async () => {
                if (!restoreTenant) return
                await onRestoreTenant(restoreTenant)
                setRestoreTenant(null)
              }}
            >
              Wiederherstellen
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
        <AlertDialogContent className="rounded-[28px] border-[#e7ddd1] bg-[#fffdf9]">
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
              className="rounded-full bg-[#9f4f2d] hover:bg-[#7c3d1d]"
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
