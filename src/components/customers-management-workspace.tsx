'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Search, Plus, Trash2, Users, Pencil, Globe, Euro } from 'lucide-react'
import { CustomerDetailWorkspace } from '@/components/customer-detail-workspace'
import { FilterChips } from '@/components/filter-chips'
import { useActiveCustomer } from '@/lib/active-customer-context'
import { readSessionCache, writeSessionCache } from '@/lib/client-cache'
import { triggerMarketingDashboardRefresh } from '@/lib/marketing-dashboard-refresh'
import { CUSTOMER_INDUSTRIES, isCustomerIndustry } from '@/lib/customer-industries'

type CrmStatus = 'lead' | 'prospect' | 'active' | 'paused' | 'churned'

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
  crm_status?: CrmStatus
  monthly_volume?: number | null
  has_due_follow_up?: boolean
}

const CRM_STATUS_LABEL: Record<CrmStatus, string> = {
  lead: 'Lead',
  prospect: 'Prospect',
  active: 'Aktiv',
  paused: 'Pausiert',
  churned: 'Churned',
}

const CRM_STATUS_BADGE: Record<CrmStatus, string> = {
  lead: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-400',
  prospect:
    'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-400',
  active:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400',
  paused:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400',
  churned:
    'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400',
}

const CRM_STATUS_CHIPS: Array<{ id: CrmStatus; label: string }> = [
  { id: 'active', label: 'Aktiv' },
  { id: 'paused', label: 'Pausiert' },
  { id: 'churned', label: 'Churned' },
]

const EUR_FORMATTER = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

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

function formatIntegrationQueryError(error: string): string {
  switch (error) {
    case 'access_denied':
      return 'Der Login wurde abgebrochen.'
    case 'missing_code':
      return 'Google hat keinen gueltigen Autorisierungscode zurueckgegeben.'
    case 'no_refresh_token':
      return 'Google hat kein Refresh-Token geliefert. Bitte die Verbindung erneut starten.'
    case 'customer_not_found':
      return 'Der ausgewaehlte Kunde wurde nicht gefunden.'
    case 'unknown_error':
      return 'Die Verbindung konnte nicht abgeschlossen werden.'
    default: {
      const normalized = error.toLowerCase()

      if (normalized.includes('customer_credentials_encryption_key')) {
        return 'Die sichere Speicherung der Zugangsdaten ist aktuell nicht korrekt konfiguriert. Bitte CUSTOMER_CREDENTIALS_ENCRYPTION_KEY pruefen.'
      }

      if (
        normalized.includes('unable_to_authenticate_data') ||
        normalized.includes('unsupported_state') ||
        normalized.includes('ungueltiges_credentials-format')
      ) {
        return 'Die gespeicherten Zugangsdaten konnten nicht verarbeitet werden. Bitte die Verbindung trennen und erneut herstellen.'
      }

      return error.replace(/_/g, ' ')
    }
  }
}

export function CustomersManagementWorkspace({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { refetchCustomers: refetchSidebar } = useActiveCustomer()
  const [customers, setCustomers] = useState<CustomerExtended[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all')
  const [crmStatusFilter, setCrmStatusFilter] = useState<CrmStatus[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [form, setForm] = useState<CustomerForm>(emptyForm)
  const [editingCustomer, setEditingCustomer] = useState<CustomerExtended | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingCustomer, setDeletingCustomer] = useState<CustomerExtended | null>(null)
  const [detailCustomer, setDetailCustomer] = useState<CustomerExtended | null>(null)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [detailInitialTab, setDetailInitialTab] = useState<'master-data' | 'integrations' | 'documents' | 'notes'>('master-data')
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
    const customerCrmStatus: CrmStatus = customer.crm_status ?? 'active'
    const matchesCrmStatus = crmStatusFilter.length === 0 || crmStatusFilter.includes(customerCrmStatus)
    return matchesSearch && matchesStatus && matchesCrmStatus
  })
  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    statusFilter !== 'all' ||
    crmStatusFilter.length > 0

  const totalMrr = customers
    .filter((c) => (c.crm_status ?? 'active') === 'active')
    .reduce((sum, c) => sum + (typeof c.monthly_volume === 'number' ? c.monthly_volume : 0), 0)
  const filteredMrr = filteredCustomers.reduce(
    (sum, c) => sum + (typeof c.monthly_volume === 'number' ? c.monthly_volume : 0),
    0
  )
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
      industry: isCustomerIndustry(customer.industry) ? customer.industry : '',
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
    setDetailInitialTab('master-data')
    setDetailDialogOpen(true)
  }, [])

  const closeDetail = useCallback(() => {
    setDetailDialogOpen(false)

    const params = new URLSearchParams(searchParams.toString())
    let shouldReplace = false
    for (const key of ['customer', 'tab', 'ga4', 'ga4_error', 'meta_ads', 'meta_ads_error', 'tiktok', 'tiktok_error', 'google_ads', 'google_ads_error', 'gsc', 'gsc_error']) {
      if (params.has(key)) {
        params.delete(key)
        shouldReplace = true
      }
    }

    if (shouldReplace) {
      const next = params.toString()
      router.replace(next ? `/tools/customers?${next}` : '/tools/customers', { scroll: false })
    }
  }, [router, searchParams])

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) {
      toast.error('Bitte gib einen Kundennamen ein.')
      return
    }

    if (!form.industry) {
      toast.error('Bitte wähle eine Branche aus.')
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

  useEffect(() => {
    const customerId = searchParams.get('customer')
    const tab = searchParams.get('tab')
    const ga4 = searchParams.get('ga4')
    const ga4Error = searchParams.get('ga4_error')
    const metaAds = searchParams.get('meta_ads')
    const metaAdsError = searchParams.get('meta_ads_error')
    const tiktok = searchParams.get('tiktok')
    const tiktokError = searchParams.get('tiktok_error')
    const googleAds = searchParams.get('google_ads')
    const googleAdsError = searchParams.get('google_ads_error')
    const gsc = searchParams.get('gsc')
    const gscError = searchParams.get('gsc_error')

    if (!customerId) return

    const resolvedCustomerId = customerId

    let cancelled = false

    async function openCustomerFromQuery() {
      try {
        const response = await fetch(`/api/tenant/customers/${resolvedCustomerId}`)
        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data.error || 'Kunde konnte nicht geladen werden.')
        }

        const data = await response.json()
        if (cancelled) return

        setDetailCustomer(data.customer)
        setDetailInitialTab(
          tab === 'integrations' || tab === 'documents' || tab === 'notes' ? tab : 'master-data'
        )
        setDetailDialogOpen(true)

        if (ga4 === 'connected') {
          triggerMarketingDashboardRefresh(resolvedCustomerId)
          toast.success('Google Analytics 4 wurde verbunden.')
        }
        if (ga4Error) {
          toast.error(`GA4-Verbindung fehlgeschlagen: ${formatIntegrationQueryError(ga4Error)}`)
        }
        if (metaAds === 'connected') {
          triggerMarketingDashboardRefresh(resolvedCustomerId)
          toast.success('Meta Ads wurde verbunden.')
        }
        if (metaAdsError) {
          toast.error(`Meta-Ads-Verbindung fehlgeschlagen: ${metaAdsError}`)
        }
        if (tiktok === 'connected') {
          triggerMarketingDashboardRefresh(resolvedCustomerId)
          toast.success('TikTok Ads wurde verbunden.')
        }
        if (tiktokError) {
          toast.error(`TikTok-Verbindung fehlgeschlagen: ${tiktokError}`)
        }
        if (googleAds === 'connected') {
          triggerMarketingDashboardRefresh(resolvedCustomerId)
          toast.success('Google Ads wurde verbunden.')
        }
        if (googleAdsError) {
          toast.error(`Google-Ads-Verbindung fehlgeschlagen: ${formatIntegrationQueryError(googleAdsError)}`)
        }
        if (gsc === 'connected') {
          triggerMarketingDashboardRefresh(resolvedCustomerId)
          toast.success('Google Search Console wurde verbunden.')
        }
        if (gscError) {
          toast.error(`GSC-Verbindung fehlgeschlagen: ${formatIntegrationQueryError(gscError)}`)
        }
      } catch (err) {
        if (cancelled) return
        toast.error(err instanceof Error ? err.message : 'Kunde konnte nicht geladen werden.')
      }
    }

    void openCustomerFromQuery()

    return () => {
      cancelled = true
    }
  }, [searchParams])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Kundenverwaltung
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
                aria-label="Gesamter monatlicher Umsatz aktiver Kunden"
              >
                <Euro className="w-3.5 h-3.5 mr-1" />
                MRR: {EUR_FORMATTER.format(totalMrr)}
              </Badge>
              {crmStatusFilter.length > 0 && filteredCustomers.length > 0 && (
                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
                  {filteredCustomers.length} {filteredCustomers.length === 1 ? 'Kunde' : 'Kunden'}
                  {filteredMrr > 0 && ` · ${EUR_FORMATTER.format(filteredMrr)}`}
                </Badge>
              )}
            </div>
          </div>
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
            <FilterChips
              chips={CRM_STATUS_CHIPS}
              activeIds={crmStatusFilter}
              onToggle={(id) => {
                setCurrentPage(1)
                setCrmStatusFilter((prev) => {
                  const typedId = id as CrmStatus
                  return prev.includes(typedId)
                    ? prev.filter((s) => s !== typedId)
                    : [...prev, typedId]
                })
              }}
              onClear={() => {
                setCrmStatusFilter([])
                setCurrentPage(1)
              }}
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
                      setCrmStatusFilter([])
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
                    <TableHead>CRM-Status</TableHead>
                    <TableHead>MRR</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedCustomers.map((customer) => {
                    const crmStatus: CrmStatus = customer.crm_status ?? 'active'
                    return (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">
                        <span>{customer.name}</span>
                      </TableCell>
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
                        <Badge variant="outline" className={CRM_STATUS_BADGE[crmStatus]}>
                          {CRM_STATUS_LABEL[crmStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-600 dark:text-slate-300">
                          {typeof customer.monthly_volume === 'number' && customer.monthly_volume > 0
                            ? EUR_FORMATTER.format(customer.monthly_volume)
                            : '—'}
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
                  )})}
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingCustomer ? 'Kunde bearbeiten' : 'Neuen Kunden anlegen'}
            </DialogTitle>
            <DialogDescription>
              {editingCustomer
                ? 'Ändere die Kundendaten und speichere die Änderungen.'
                : 'Füge einen neuen Kunden zu deiner Datenbank hinzu.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name <span className="text-destructive">*</span></Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Kundenname"
                disabled={saving}
                autoFocus
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
              <Label htmlFor="industry">Branche <span className="text-destructive">*</span></Label>
              <Select
                value={form.industry}
                onValueChange={(value) => setForm({ ...form, industry: value })}
              >
                <SelectTrigger id="industry" disabled={saving}>
                  <SelectValue placeholder="Branche auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOMER_INDUSTRIES.map((industry) => (
                    <SelectItem key={industry} value={industry}>
                      {industry}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim() || !form.industry}>
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
          onClose={closeDetail}
          onUpdate={refetchCustomers}
          initialTab={detailInitialTab}
        />
      )}
    </div>
  )
}
