'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Building2,
  Globe,
  Shield,
  Link2,
  FileText,
  Edit3,
  Trash2,
  Upload,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  HelpCircle,
  File,
  ExternalLink,
} from 'lucide-react'

interface CustomerExtended {
  id: string
  name: string
  domain?: string | null
  status: 'active' | 'paused'
  created_at: string
  updated_at: string
  industry?: string
  contact_email?: string | null
  logo_url?: string
  internal_notes?: string
}

interface CustomerFormData {
  name: string
  domain: string
  industry: string
  contact_email: string
  internal_notes: string
  status: 'active' | 'paused'
}

interface IntegrationData {
  id: string
  integration_type: string
  status: 'connected' | 'active' | 'disconnected'
  last_activity?: string
}

interface DocumentLink {
  id: string
  title: string
  url: string
  description?: string
  doc_type?: 'link' | 'file'
  file_name?: string
}

interface CustomerDetailWorkspaceProps {
  customer: CustomerExtended
  open: boolean
  onClose: () => void
  isAdmin: boolean
  onUpdate: () => void
}

const integrationTypes = [
  {
    key: 'google_ads',
    label: 'Google Ads',
    icon: Building2,
    tooltip: 'Die Customer ID findest du in Google Ads oben rechts im Format 123-456-7890. Kein Trennzeichen nötig.',
  },
  {
    key: 'meta_pixel',
    label: 'Meta Pixel',
    icon: Shield,
    tooltip: 'Die Pixel-ID findest du im Meta Business Manager unter Events Manager → Datenquellen. Format: 15-stellige Zahl.',
  },
  {
    key: 'gsc',
    label: 'Google Search Console',
    icon: Globe,
    tooltip: 'Die Property-URL aus der Google Search Console, z.B. "https://example.com/" oder "sc-domain:example.com".',
  },
]

export function CustomerDetailWorkspace({
  customer,
  open,
  onClose,
  isAdmin,
  onUpdate,
}: CustomerDetailWorkspaceProps) {
  const [activeTab, setActiveTab] = useState('master-data')
  const [form, setForm] = useState<CustomerFormData>({
    name: customer.name,
    domain: customer.domain ?? '',
    industry: customer.industry ?? '',
    contact_email: customer.contact_email ?? '',
    internal_notes: customer.internal_notes ?? '',
    status: customer.status,
  })
  const [localLogoUrl, setLocalLogoUrl] = useState<string | null>(customer.logo_url ?? null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [integrations, setIntegrations] = useState<IntegrationData[]>([])
  const [documents, setDocuments] = useState<DocumentLink[]>([])
  const [loadingIntegrations, setLoadingIntegrations] = useState(false)
  const [loadingDocuments, setLoadingDocuments] = useState(false)
  const [integrationForm, setIntegrationForm] = useState<Record<string, string>>({})
  const [showCredentials, setShowCredentials] = useState<Record<string, boolean>>({})
  const [documentForm, setDocumentForm] = useState({ title: '', url: '', description: '' })
  const [editingDocument, setEditingDocument] = useState<DocumentLink | null>(null)
  const [docInputMode, setDocInputMode] = useState<'link' | 'file'>('link')
  const [uploadingDocument, setUploadingDocument] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const docFileInputRef = useRef<HTMLInputElement>(null)

  // Sync props → state when customer changes
  useEffect(() => {
    setForm({
      name: customer.name,
      domain: customer.domain ?? '',
      industry: customer.industry ?? '',
      contact_email: customer.contact_email ?? '',
      internal_notes: customer.internal_notes ?? '',
      status: customer.status,
    })
    setLocalLogoUrl(customer.logo_url ?? null)
  }, [customer])

  const loadIntegrations = useCallback(async () => {
    setLoadingIntegrations(true)
    try {
      const res = await fetch(`/api/tenant/customers/${customer.id}/integrations`)
      if (res.ok) {
        const data = await res.json()
        setIntegrations(data.integrations || [])
      }
    } catch {
      // silent
    } finally {
      setLoadingIntegrations(false)
    }
  }, [customer.id])

  const loadDocuments = useCallback(async () => {
    setLoadingDocuments(true)
    try {
      const res = await fetch(`/api/tenant/customers/${customer.id}/documents`)
      if (res.ok) {
        const data = await res.json()
        setDocuments(data.documents || [])
      }
    } catch {
      // silent
    } finally {
      setLoadingDocuments(false)
    }
  }, [customer.id])

  useEffect(() => {
    if (open && activeTab === 'integrations' && integrations.length === 0) {
      loadIntegrations()
    }
  }, [activeTab, integrations.length, loadIntegrations, open])

  useEffect(() => {
    if (open && activeTab === 'documents' && documents.length === 0) {
      loadDocuments()
    }
  }, [activeTab, documents.length, loadDocuments, open])

  const handleSaveMasterData = async () => {
    if (!form.name.trim()) {
      toast.error('Bitte gib einen Kundennamen ein.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/tenant/customers/${customer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          domain: form.domain || null,
          industry: form.industry || null,
          contact_email: form.contact_email || null,
          status: form.status,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Fehler beim Speichern')
      }
      toast.success('Kundendaten gespeichert.')
      onUpdate()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveNotes = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/tenant/customers/${customer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internal_notes: form.internal_notes }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Fehler beim Speichern')
      }
      toast.success('Notizen gespeichert.')
      onUpdate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setSaving(false)
    }
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Ungültiges Format. Erlaubt: JPG, PNG, SVG, WebP.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Datei zu groß. Max. 5 MB.')
      return
    }

    setUploadingLogo(true)
    try {
      const formData = new FormData()
      formData.append('logo', file)
      const res = await fetch(`/api/tenant/customers/${customer.id}/logo`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Fehler beim Upload')
      }
      const result = await res.json()
      setLocalLogoUrl(result.logo_url)
      toast.success('Logo hochgeladen.')
      onUpdate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setUploadingLogo(false)
      e.target.value = ''
    }
  }

  const handleSaveIntegrations = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/tenant/customers/${customer.id}/integrations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrations: integrationForm }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Fehler beim Speichern')
      }
      toast.success('Integrationen gespeichert.')
      await loadIntegrations()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveDocument = async () => {
    if (!documentForm.title.trim() || !documentForm.url.trim()) {
      toast.error('Titel und URL sind erforderlich.')
      return
    }
    setSaving(true)
    try {
      const url = editingDocument
        ? `/api/tenant/customers/${customer.id}/documents/${editingDocument.id}`
        : `/api/tenant/customers/${customer.id}/documents`
      const method = editingDocument ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(documentForm),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Fehler beim Speichern')
      }
      toast.success(editingDocument ? 'Dokument aktualisiert.' : 'Dokument hinzugefügt.')
      setDocumentForm({ title: '', url: '', description: '' })
      setEditingDocument(null)
      await loadDocuments()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setSaving(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
    // Dateiname als Titel vorschlagen, falls noch leer
    if (!documentForm.title.trim()) {
      setDocumentForm((f) => ({ ...f, title: file.name }))
    }
  }

  const handleFileUpload = async () => {
    if (!pendingFile) return

    setUploadingDocument(true)
    try {
      const fd = new FormData()
      fd.append('file', pendingFile)
      if (documentForm.title.trim()) fd.append('title', documentForm.title.trim())
      if (documentForm.description.trim()) fd.append('description', documentForm.description.trim())

      const res = await fetch(`/api/tenant/customers/${customer.id}/documents/upload`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Fehler beim Hochladen')
      }
      toast.success('Datei hochgeladen.')
      setDocumentForm({ title: '', url: '', description: '' })
      setPendingFile(null)
      if (docFileInputRef.current) docFileInputRef.current.value = ''
      await loadDocuments()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setUploadingDocument(false)
    }
  }

  const handleDeleteDocument = async (docId: string) => {
    try {
      const res = await fetch(`/api/tenant/customers/${customer.id}/documents/${docId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Fehler beim Löschen')
      }
      toast.success('Dokument gelöscht.')
      await loadDocuments()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unbekannter Fehler')
    }
  }

  const getStatusBadge = (status: string) => {
    if (status === 'connected' || status === 'active') {
      return (
        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
          <CheckCircle className="w-3 h-3 mr-1" />Verbunden
        </Badge>
      )
    }
    return (
      <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
        <XCircle className="w-3 h-3 mr-1" />Nicht verbunden
      </Badge>
    )
  }

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-4">
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                {customer.name}
              </DialogTitle>
              {isAdmin && (
                <Select
                  value={form.status}
                  onValueChange={async (v: 'active' | 'paused') => {
                    setForm((f) => ({ ...f, status: v }))
                    try {
                      const res = await fetch(`/api/tenant/customers/${customer.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: v }),
                      })
                      if (!res.ok) throw new Error()
                      toast.success('Status gespeichert.')
                      onUpdate()
                    } catch {
                      toast.error('Fehler beim Speichern des Status.')
                    }
                  }}
                >
                  <SelectTrigger className="w-36 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Aktiv</SelectItem>
                    <SelectItem value="paused">Pausiert</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <DialogDescription>
              Stammdaten, Integrationen, Dokumente und Notizen verwalten.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="master-data">Stammdaten</TabsTrigger>
              <TabsTrigger value="integrations">Integrationen</TabsTrigger>
              <TabsTrigger value="documents">Dokumente</TabsTrigger>
              <TabsTrigger value="notes">Notizen</TabsTrigger>
            </TabsList>

            {/* Stammdaten */}
            <TabsContent value="master-data" className="space-y-4">
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Kundenname *</Label>
                      <Input
                        id="name"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="z.B. Müller GmbH"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="domain">Website</Label>
                      <Input
                        id="domain"
                        value={form.domain}
                        onChange={(e) => setForm({ ...form, domain: e.target.value })}
                        placeholder="https://www.beispiel.de"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contact_email">Kontakt-E-Mail (für Freigabe-Links)</Label>
                    <Input
                      id="contact_email"
                      type="email"
                      value={form.contact_email}
                      onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                      placeholder="kunde@beispiel.de"
                    />
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      Wenn hinterlegt, erhält der Kunde automatisch eine E-Mail wenn ein Freigabe-Link erstellt wird.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="industry">Branche</Label>
                      <Input
                        id="industry"
                        value={form.industry}
                        onChange={(e) => setForm({ ...form, industry: e.target.value })}
                        placeholder="z.B. E-Commerce"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="status">Status</Label>
                      <Select
                        value={form.status}
                        onValueChange={(v: 'active' | 'paused') => setForm({ ...form, status: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Aktiv</SelectItem>
                          <SelectItem value="paused">Pausiert</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Logo Upload */}
                  <div className="space-y-2">
                    <Label>Logo</Label>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg flex items-center justify-center overflow-hidden bg-slate-50 dark:bg-slate-900">
                        {localLogoUrl ? (
                          <img
                            src={localLogoUrl}
                            alt="Logo"
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <Upload className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                      <div className="space-y-1">
                        <input
                          type="file"
                          id="logo-upload"
                          accept="image/jpeg,image/png,image/svg+xml,image/webp"
                          onChange={handleLogoUpload}
                          className="hidden"
                          disabled={!isAdmin || uploadingLogo}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!isAdmin || uploadingLogo}
                          onClick={() => document.getElementById('logo-upload')?.click()}
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          {uploadingLogo ? 'Lädt hoch...' : 'Logo hochladen'}
                        </Button>
                        <p className="text-xs text-slate-500">Max. 5 MB · JPG, PNG, SVG, WebP</p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Abbrechen</Button>
                    <Button onClick={handleSaveMasterData} disabled={saving}>
                      {saving ? 'Speichern...' : 'Speichern'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Integrationen */}
            <TabsContent value="integrations" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Credentials Vault</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {loadingIntegrations ? (
                    <div className="space-y-3">
                      <Skeleton className="h-20 w-full" />
                      <Skeleton className="h-20 w-full" />
                    </div>
                  ) : (
                    integrationTypes.map((type) => {
                      const integration = integrations.find((i) => i.integration_type === type.key)
                      const Icon = type.icon
                      return (
                        <div key={type.key} className="border rounded-lg p-4 space-y-3 dark:border-slate-800">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Icon className="w-4 h-4 text-slate-500" />
                              <span className="font-medium text-sm">{type.label}</span>
                              {integration && getStatusBadge(integration.status)}
                            </div>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="w-4 h-4 text-slate-400 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-xs">
                                <p className="text-xs">{type.tooltip}</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>

                          {isAdmin && (
                            <div className="flex items-center gap-2">
                              <Input
                                type={showCredentials[type.key] ? 'text' : 'password'}
                                placeholder={`${type.label} Key / ID`}
                                value={integrationForm[type.key] ?? ''}
                                onChange={(e) =>
                                  setIntegrationForm({ ...integrationForm, [type.key]: e.target.value })
                                }
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() =>
                                  setShowCredentials({
                                    ...showCredentials,
                                    [type.key]: !showCredentials[type.key],
                                  })
                                }
                              >
                                {showCredentials[type.key] ? (
                                  <EyeOff className="w-4 h-4" />
                                ) : (
                                  <Eye className="w-4 h-4" />
                                )}
                              </Button>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}

                  {isAdmin && (
                    <>
                      <Separator />
                      <div className="flex justify-end">
                        <Button onClick={handleSaveIntegrations} disabled={saving}>
                          {saving ? 'Speichern...' : 'Integrationen speichern'}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Dokumente */}
            <TabsContent value="documents" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Link2 className="w-4 h-4" />
                    Dokumente & Links
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {loadingDocuments ? (
                    <div className="space-y-3">
                      <Skeleton className="h-14 w-full" />
                      <Skeleton className="h-14 w-full" />
                    </div>
                  ) : documents.length > 0 ? (
                    <div className="space-y-2">
                      {documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-3 border rounded-lg dark:border-slate-800"
                        >
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            {doc.doc_type === 'file' ? (
                              <File className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                            ) : (
                              <Link2 className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{doc.title}</p>
                              <a
                                href={doc.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-500 hover:underline truncate block flex items-center gap-1"
                              >
                                {doc.doc_type === 'file' ? (doc.file_name ?? 'Datei öffnen') : doc.url}
                                <ExternalLink className="w-3 h-3 inline shrink-0" />
                              </a>
                              {doc.description && (
                                <p className="text-xs text-slate-500 mt-0.5">{doc.description}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1 ml-2 shrink-0">
                            {doc.doc_type !== 'file' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setEditingDocument(doc)
                                  setDocInputMode('link')
                                  setDocumentForm({
                                    title: doc.title,
                                    url: doc.url,
                                    description: doc.description ?? '',
                                  })
                                }}
                              >
                                <Edit3 className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteDocument(doc.id)}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 text-center py-6">
                      Noch keine Dokumente vorhanden.
                    </p>
                  )}

                  <Separator />

                  {/* Toggle Link / Datei */}
                  {!editingDocument && (
                    <div className="flex gap-2">
                      <Button
                        variant={docInputMode === 'link' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setDocInputMode('link')}
                      >
                        <Link2 className="w-3.5 h-3.5 mr-1.5" />
                        Link
                      </Button>
                      <Button
                        variant={docInputMode === 'file' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setDocInputMode('file')}
                      >
                        <Upload className="w-3.5 h-3.5 mr-1.5" />
                        Datei hochladen
                      </Button>
                    </div>
                  )}

                  {docInputMode === 'file' && !editingDocument ? (
                    <div className="space-y-3">
                      <p className="text-sm font-medium">Datei hochladen</p>
                      <div className="space-y-2">
                        <Input
                          placeholder="Titel (optional – sonst Dateiname)"
                          value={documentForm.title}
                          onChange={(e) => setDocumentForm({ ...documentForm, title: e.target.value })}
                        />
                        <Textarea
                          placeholder="Beschreibung (optional)"
                          value={documentForm.description}
                          onChange={(e) => setDocumentForm({ ...documentForm, description: e.target.value })}
                          rows={2}
                        />
                      </div>
                      <input
                        ref={docFileInputRef}
                        type="file"
                        accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.jpg,.jpeg,.png,.webp"
                        onChange={handleFileSelect}
                        className="hidden"
                        disabled={uploadingDocument}
                      />
                      {pendingFile ? (
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2 flex-1 px-3 py-2 border rounded-md bg-slate-50 dark:bg-slate-900 text-sm">
                            <File className="w-4 h-4 shrink-0 text-slate-400" />
                            <span className="truncate">{pendingFile.name}</span>
                            <button
                              className="ml-auto text-slate-400 hover:text-slate-600"
                              onClick={() => { setPendingFile(null); if (docFileInputRef.current) docFileInputRef.current.value = '' }}
                            >
                              ×
                            </button>
                          </div>
                          <Button
                            onClick={handleFileUpload}
                            disabled={uploadingDocument}
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            {uploadingDocument ? 'Lädt hoch...' : 'Hochladen'}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <Button
                            variant="outline"
                            disabled={uploadingDocument}
                            onClick={() => docFileInputRef.current?.click()}
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            Datei auswählen
                          </Button>
                          <p className="text-xs text-slate-500">Max. 20 MB · PDF, Word, Excel, CSV, Bild</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm font-medium">
                        {editingDocument ? 'Link bearbeiten' : 'Link hinzufügen'}
                      </p>
                      <div className="space-y-2">
                        <Input
                          placeholder="Titel *"
                          value={documentForm.title}
                          onChange={(e) => setDocumentForm({ ...documentForm, title: e.target.value })}
                        />
                        <Input
                          placeholder="URL * (https://...)"
                          value={documentForm.url}
                          onChange={(e) => setDocumentForm({ ...documentForm, url: e.target.value })}
                        />
                        <Textarea
                          placeholder="Beschreibung (optional)"
                          value={documentForm.description}
                          onChange={(e) =>
                            setDocumentForm({ ...documentForm, description: e.target.value })
                          }
                          rows={2}
                        />
                      </div>
                      <div className="flex gap-2">
                        {editingDocument && (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setEditingDocument(null)
                              setDocumentForm({ title: '', url: '', description: '' })
                            }}
                          >
                            Abbrechen
                          </Button>
                        )}
                        <Button onClick={handleSaveDocument} disabled={saving}>
                          {saving ? 'Speichern...' : editingDocument ? 'Aktualisieren' : 'Hinzufügen'}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Notizen */}
            <TabsContent value="notes" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="w-4 h-4" />
                    Interne Notizen
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder="Interne Notizen für das Team... (nur für Team-Mitglieder sichtbar)"
                    value={form.internal_notes}
                    onChange={(e) => setForm({ ...form, internal_notes: e.target.value })}
                    rows={10}
                    className="min-h-[220px]"
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Schließen</Button>
                    <Button onClick={handleSaveNotes} disabled={saving}>
                      {saving ? 'Speichern...' : 'Notizen speichern'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
