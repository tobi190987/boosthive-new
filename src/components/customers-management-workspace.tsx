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
import { useActiveCustomer } from '@/lib/active-customer-context'

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

export function CustomersManagementWorkspace({ isAdmin }: { isAdmin: boolean }) {
  const { refetchCustomers: refetchSidebar } = useActiveCustomer()
  const [customers, setCustomers] = useState<CustomerExtended[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all')
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten.')
      setCustomers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refetchCustomers()
  }, [refetchCustomers])

  const filteredCustomers = customers.filter(customer => {
    const matchesSearch = customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (customer.domain && customer.domain.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesStatus = statusFilter === 'all' || customer.status === statusFilter
    return matchesSearch && matchesStatus
  })

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
  }, [form, editingCustomer, refetchCustomers])

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
  }, [deletingCustomer, refetchCustomers])

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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Kunden suchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | 'active' | 'paused')}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="active">Aktiv</SelectItem>
                  <SelectItem value="paused">Pausiert</SelectItem>
                </SelectContent>
              </Select>
              {isAdmin && (
                <Button onClick={openCreate}>
                  <Plus className="w-4 h-4 mr-2" />
                  Neuer Kunde
                </Button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="space-y-2 mt-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 w-full bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              ))}
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
                  {filteredCustomers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4 text-slate-400" />
                          {customer.domain}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={customer.status === 'active' ? 'default' : 'secondary'}>
                          {customer.industry || 'Nicht angegeben'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={customer.status === 'active' ? 'default' : 'secondary'}>
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
