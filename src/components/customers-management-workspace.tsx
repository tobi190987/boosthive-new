'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Search, Plus, Trash2, Users, Pencil, Globe } from 'lucide-react'
import { CustomerDetailWorkspace } from '@/components/customer-detail-workspace'
import { FilterChips } from '@/components/filter-chips'
import { useActiveCustomer } from '@/lib/active-customer-context'
import { readSessionCache, writeSessionCache } from '@/lib/client-cache'

// Extended customer type for enhanced features
interface CustomerExtended {
  id: string
  name: string
  domain?: string | null
  status: 'active' | 'paused'
  created_at: string
  updated_at: string
  industry?: string
  integration_count?: number
  last_activity?: string
}

interface CustomerForm {
  name: string
  domain: string
  industry: string
  status: 'active' | 'paused'
}

const emptyForm: CustomerForm = {
  name: '',
  domain: '',
  industry: '',
  status: 'active'
}

const CUSTOMERS_CACHE_KEY = 'customers:list'

const PAGE_SIZE = 20

export function CustomersManagementWorkspace({ isAdmin }: { isAdmin: boolean }) {
  const { refetchCustomers: refetchSidebar } = useActiveCustomer()
  const [customers, setCustomers] = useState<CustomerExtended[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [form, setForm] = useState<CustomerForm>(emptyForm)
  const [editingCustomer, setEditingCustomer] = useState<CustomerExtended | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingCustomer, setDeletingCustomer] = useState<CustomerExtended | null>(null)
  const [detailCustomer, setDetailCustomer] = useState<CustomerExtended | null>(null)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const refetchCustomers = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/tenant/customers')
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Fehler beim Laden der Kunden')
      }
      const data = await response.json()
      setCustomers(data.customers || [])
      writeSessionCache(CUSTOMERS_CACHE_KEY, data.customers || [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten.')
      setCustomers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const cachedCustomers = readSessionCache<CustomerExtended[]>(CUSTOMERS_CACHE_KEY)
    if (cachedCustomers) {
      setCustomers(cachedCustomers)
      setLoading(false)
    }
    refetchCustomers()
  }, [refetchCustomers])

  const filteredCustomers = customers.filter(customer => {
    const matchesSearch = customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (customer.domain && customer.domain.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesStatus = statusFilter === 'all' || customer.status === statusFilter
    return matchesSearch && matchesStatus
  })
  const hasActiveFilters = searchQuery.trim().length > 0 || statusFilter !== 'all'
  const totalPages = Math.ceil(filteredCustomers.length / PAGE_SIZE)
  const pagedCustomers = filteredCustomers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const openCreate = useCallback(() => {
    setEditingCustomer(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }, [])

  const openEdit = useCallback((customer: CustomerExtended) => {
    setEditingCustomer(customer)
    setForm({
      name: customer.name,
      domain: customer.domain || '',
      industry: customer.industry || '',
      status: customer.status,
    })
    setDialogOpen(true)
  }, [])

  const openDelete = useCallback((customer: CustomerExtended) => {
    setDeletingCustomer(customer)
    setDeleteDialogOpen(true)
  }, [])

  const openDetail = useCallback((customer: CustomerExtended) => {
    setDetailCustomer(customer)
    setDetailDialogOpen(true)
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
      const method = isEdit ? 'PUT' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Fehler beim Speichern')
      }

      toast.success(isEdit ? 'Kunde aktualisiert.' : 'Kunde angelegt.')
      setDialogOpen(false)
      setForm(emptyForm)
      setEditingCustomer(null)
      await Promise.all([refetchCustomers(), refetchSidebar()])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten.')
    } finally {
      setSaving(false)
    }
  }, [form, editingCustomer, refetchCustomers, refetchSidebar])

  const handleDelete = useCallback(async () => {
    if (!deletingCustomer) return

    setDeleting(true)
    try {
      const response = await fetch(`/api/tenant/customers/${deletingCustomer.id}`, {
        method: 'DELETE',
        headers: {}
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Fehler beim Löschen')
      }

      toast.success('Kunde gelöscht')
      setDeleteDialogOpen(false)
      setDeletingCustomer(null)
      await Promise.all([refetchCustomers(), refetchSidebar()])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten.')
    } finally {
      setDeleting(false)
    }
  }, [deletingCustomer, refetchCustomers, refetchSidebar])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Kundenverwaltung
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Kunden suchen..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
                  className="pl-10"
                />
              </div>
              {isAdmin && (
                <Button onClick={openCreate}>
                  <Plus className="w-4 h-4 mr-2" />
                  Neuer Kunde
                </Button>
              )}
            </div>
            <FilterChips
              chips={[
                { id: 'active', label: 'Aktiv' },
                { id: 'paused', label: 'Pausiert' },
              ]}
              activeIds={statusFilter === 'all' ? [] : [statusFilter]}
              onToggle={(id) => {
                setCurrentPage(1)
                setStatusFilter((prev) => (prev === id ? 'all' : id as typeof statusFilter))
              }}
              onClear={() => { setStatusFilter('all'); setCurrentPage(1) }}
            />
          </div>

          {loading ? (
            <div className="space-y-2 mt-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 w-full bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              ))}
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center dark:border-border dark:bg-card">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white dark:bg-secondary">
                <Users className="h-5 w-5 text-slate-400 dark:text-slate-500" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                {hasActiveFilters ? 'Keine passenden Kunden' : 'Noch keine Kunden angelegt'}
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
                {hasActiveFilters
                  ? 'Passe Suche oder Statusfilter an, um andere Kunden zu sehen.'
                  : 'Lege deinen ersten Kunden an, um Domains, Dokumente und Arbeitskontexte strukturiert zu verwalten.'}
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                {hasActiveFilters && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchQuery('')
                      setStatusFilter('all')
                    }}
                  >
                    Filter zurücksetzen
                  </Button>
                )}
                {!hasActiveFilters && isAdmin && (
                  <Button onClick={openCreate}>
                    <Plus className="w-4 h-4 mr-2" />
                    Ersten Kunden anlegen
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Website</TableHead>
                    <TableHead>Branche</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedCustomers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4 text-slate-400" />
                          {customer.domain}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-600 dark:text-slate-300">
                          {customer.industry || 'Nicht angegeben'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            customer.status === 'active'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
                              : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400'
                          }
                        >
                          {customer.status === 'active' ? 'Aktiv' : 'Pausiert'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDetail(customer)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDelete(customer)}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-slate-500 dark:text-slate-400">
              <span>
                {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredCustomers.length)} von {filteredCustomers.length}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                >
                  Zurück
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  Weiter
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCustomer ? 'Kunde bearbeiten' : 'Neuen Kunden anlegen'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Kundenname"
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="domain">Website</Label>
              <Input
                id="domain"
                value={form.domain}
                onChange={(e) => setForm({ ...form, domain: e.target.value })}
                placeholder="https://beispiel.de"
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="industry">Branche</Label>
              <Input
                id="industry"
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                placeholder="z.B. E-Commerce"
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as 'active' | 'paused' })}>
                <SelectTrigger disabled={saving}>
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
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Speichern...' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kunde löschen</AlertDialogTitle>
            <AlertDialogDescription>
              Möchtest du den Kunden &quot;{deletingCustomer?.name}&quot; wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Löschen...' : 'Löschen'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Customer Detail - eigenes Dialog in CustomerDetailWorkspace */}
      {detailCustomer && (
        <CustomerDetailWorkspace
          customer={detailCustomer}
          open={detailDialogOpen}
          isAdmin={isAdmin}
          onClose={() => setDetailDialogOpen(false)}
          onUpdate={refetchCustomers}
        />
      )}
    </div>
  )
}
