'use client'

import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Trash2, Users2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useActiveCustomer, type Customer } from '@/lib/active-customer-context'

interface CustomerFormData {
  name: string
  domain: string
  status: 'active' | 'paused'
}

const emptyForm: CustomerFormData = { name: '', domain: '', status: 'active' }

interface CustomersManagementWorkspaceProps {
  isAdmin: boolean
}

export function CustomersManagementWorkspace({ isAdmin }: CustomersManagementWorkspaceProps) {
  const { customers, loading, refetchCustomers } = useActiveCustomer()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null)
  const [form, setForm] = useState<CustomerFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Refresh on mount
  useEffect(() => {
    refetchCustomers()
  }, [refetchCustomers])

  const openCreate = useCallback(() => {
    setEditingCustomer(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }, [])

  const openEdit = useCallback((customer: Customer) => {
    setEditingCustomer(customer)
    setForm({
      name: customer.name,
      domain: customer.domain ?? '',
      status: customer.status,
    })
    setDialogOpen(true)
  }, [])

  const openDelete = useCallback((customer: Customer) => {
    setDeletingCustomer(customer)
    setDeleteDialogOpen(true)
  }, [])

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) {
      toast.error('Bitte gib einen Kundennamen ein.')
      return
    }

    setSaving(true)

    try {
      const isEdit = !!editingCustomer
      const url = isEdit
        ? `/api/tenant/customers/${editingCustomer.id}`
        : '/api/tenant/customers'
      const method = isEdit ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          domain: form.domain.trim() || null,
          status: form.status,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Fehler beim Speichern')
      }

      toast.success(isEdit ? 'Kunde aktualisiert.' : 'Kunde angelegt.')
      setDialogOpen(false)
      await refetchCustomers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten.')
    } finally {
      setSaving(false)
    }
  }, [form, editingCustomer, refetchCustomers])

  const handleDelete = useCallback(async () => {
    if (!deletingCustomer) return

    setDeleting(true)

    try {
      const res = await fetch(`/api/tenant/customers/${deletingCustomer.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Fehler beim Loeschen')
      }

      toast.success('Kunde geloescht.')
      setDeleteDialogOpen(false)
      setDeletingCustomer(null)
      await refetchCustomers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten.')
    } finally {
      setDeleting(false)
    }
  }, [deletingCustomer, refetchCustomers])

  if (loading) {
    return (
      <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft dark:border-slate-800 dark:bg-slate-950">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-9 w-32 rounded-full" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft dark:border-slate-800 dark:bg-slate-950">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100 dark:text-slate-100">
            Kunden ({customers.length})
          </CardTitle>
          {isAdmin && (
            <Button
              onClick={openCreate}
              className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
              size="sm"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Kunde anlegen
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {customers.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 dark:bg-[#151c28] dark:bg-slate-900">
                <Users2 className="h-6 w-6 text-slate-400 dark:text-slate-500 dark:text-slate-500" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 dark:text-slate-100">
                  Noch keine Kunden
                </p>
                <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400 dark:text-slate-400">
                  Lege deinen ersten Kunden an, um mit den Analyse-Tools zu starten.
                </p>
              </div>
              {isAdmin && (
                <Button
                  onClick={openCreate}
                  className="rounded-full bg-[#1f2937] text-white hover:bg-[#111827]"
                  size="sm"
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Ersten Kunden anlegen
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">Name</TableHead>
                    <TableHead className="w-[30%]">Domain</TableHead>
                    <TableHead className="w-[15%]">Status</TableHead>
                    {isAdmin && <TableHead className="w-[15%] text-right">Aktionen</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium text-slate-900 dark:text-slate-100 dark:text-slate-100">
                        {customer.name}
                      </TableCell>
                      <TableCell className="text-slate-500 dark:text-slate-400 dark:text-slate-400">
                        {customer.domain || '\u2014'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            customer.status === 'active'
                              ? 'rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/30'
                              : 'rounded-full bg-slate-100 dark:bg-[#1e2635] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#252d3a] dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-800'
                          }
                        >
                          {customer.status === 'active' ? 'Aktiv' : 'Pausiert'}
                        </Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEdit(customer)}
                              aria-label={`${customer.name} bearbeiten`}
                              className="h-8 w-8"
                            >
                              <Pencil className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openDelete(customer)}
                              aria-label={`${customer.name} loeschen`}
                              className="h-8 w-8 text-red-500 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingCustomer ? 'Kunde bearbeiten' : 'Neuen Kunden anlegen'}
            </DialogTitle>
            <DialogDescription>
              {editingCustomer
                ? 'Aendere die Kundendaten und speichere die Aenderungen.'
                : 'Gib die Daten des neuen Kunden ein.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="customer-name">Name *</Label>
              <Input
                id="customer-name"
                placeholder="z.B. Muster GmbH"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-domain">Domain (optional)</Label>
              <Input
                id="customer-domain"
                placeholder="z.B. muster-gmbh.de"
                value={form.domain}
                onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(val) =>
                  setForm((f) => ({ ...f, status: val as 'active' | 'paused' }))
                }
              >
                <SelectTrigger id="customer-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Aktiv</SelectItem>
                  <SelectItem value="paused">Pausiert</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Abbrechen
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#1f2937] text-white hover:bg-[#111827]"
            >
              {saving ? 'Speichert...' : editingCustomer ? 'Speichern' : 'Anlegen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kunde loeschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Moechtest du &quot;{deletingCustomer?.name}&quot; wirklich loeschen? Die zugehoerigen
              Analyse-Daten bleiben erhalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleting ? 'Loescht...' : 'Loeschen'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
