'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  CirclePause,
  ExternalLink,
  Loader2,
  MoreHorizontal,
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

export interface OwnerTenantRecord {
  id: string
  name: string
  slug: string
  status: 'active' | 'inactive'
  created_at: string
  memberCount: number
}

interface OwnerTenantTableProps {
  tenants: OwnerTenantRecord[]
  togglingId: string | null
  deletingId: string | null
  onToggleStatus: (tenant: OwnerTenantRecord) => Promise<void> | void
  onDeleteTenant: (tenant: OwnerTenantRecord) => Promise<void> | void
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
  togglingId,
  deletingId,
  onToggleStatus,
  onDeleteTenant,
}: OwnerTenantTableProps) {
  const [confirmTenant, setConfirmTenant] = useState<OwnerTenantRecord | null>(null)
  const [deleteTenant, setDeleteTenant] = useState<OwnerTenantRecord | null>(null)

  if (tenants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[30px] border border-dashed border-[#ddd1c4] bg-white px-6 py-16 text-center shadow-[0_16px_50px_rgba(89,71,42,0.06)]">
        <div className="mb-4 rounded-full bg-[#f5efe6] p-4 text-[#b85e34]">
          <SearchX className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">Keine Tenants im aktuellen Filter</h3>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
          Passe Suche oder Statusfilter an, um weitere Agenturen zu sehen.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-[30px] border border-[#e7ddd1] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-6">Tenant</TableHead>
              <TableHead>Subdomain</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Erstellt</TableHead>
              <TableHead className="pr-6 text-right">Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((tenant) => {
              const isPending = togglingId === tenant.id || deletingId === tenant.id

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
                    <Badge
                      className={
                        tenant.status === 'active'
                          ? 'rounded-full bg-[#eff8f2] text-[#166534] hover:bg-[#eff8f2]'
                          : 'rounded-full bg-[#fff4ee] text-[#9f4f2d] hover:bg-[#fff4ee]'
                      }
                    >
                      {tenant.status === 'active' ? 'Aktiv' : 'Pausiert'}
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
                            disabled={isPending}
                          >
                            <CirclePause className="mr-2 h-4 w-4" />
                            {tenant.status === 'active' ? 'Pausieren' : 'Fortsetzen'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="cursor-pointer text-[#9f4f2d] focus:text-[#9f4f2d]"
                            onClick={() => setDeleteTenant(tenant)}
                            disabled={isPending}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Löschen
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
              {confirmTenant?.status === 'active' ? 'Tenant pausieren?' : 'Tenant fortsetzen?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="leading-6">
              {confirmTenant?.status === 'active'
                ? 'Neue Logins werden blockiert. Offene Tenant-Sessions verlieren spätestens beim nächsten Request den Zugriff auf die Subdomain.'
                : 'Der Tenant akzeptiert danach wieder neue Logins und erscheint wieder als aktiv.'}
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
              {confirmTenant?.status === 'active' ? 'Pausieren' : 'Fortsetzen'}
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
            <AlertDialogTitle>Tenant wirklich löschen?</AlertDialogTitle>
            <AlertDialogDescription className="leading-6">
              {deleteTenant?.name} wird dauerhaft entfernt. Zugehörige Daten des Tenants werden
              gelöscht und verwaiste User-Accounts werden ebenfalls bereinigt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-[#9f4f2d] hover:bg-[#7c3d1d]"
              onClick={async () => {
                if (!deleteTenant) return
                await onDeleteTenant(deleteTenant)
                setDeleteTenant(null)
              }}
            >
              Tenant löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
