'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
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
  DialogFooter,
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
  Building2,
  Globe,
  Link2,
  FileText,
  Edit3,
  Trash2,
  Upload,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  File,
  ExternalLink,
  Loader2,
  Unlink,
  BarChart3,
  AlertCircle,
  Zap,
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
  status: 'connected' | 'active' | 'disconnected' | 'token_expired'
  last_activity?: string
  credentials?: Record<string, unknown>
}

interface GA4Property {
  propertyId: string
  displayName: string
  name?: string
}

interface MetaAdsAccount {
  id: string
  name: string
  businessName?: string
  currency?: string
}

interface TikTokAdvertiser {
  id: string
  name: string
  currency?: string
}

interface GoogleAdsAccount {
  id: string
  name: string
  currency?: string
  isManager?: boolean
}

interface GscProperty {
  siteUrl: string
  permissionLevel?: string
}

interface DocumentLink {
  id: string
  title: string
  url: string
  description?: string
  doc_type?: 'link' | 'file'
  file_name?: string
}

type CustomerDetailTab = 'master-data' | 'integrations' | 'documents' | 'notes'

async function getResponseErrorMessage(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({}))
  return typeof data.error === 'string'
    ? data.error
    : typeof data.message === 'string'
      ? data.message
      : fallback
}

interface CustomerDetailWorkspaceProps {
  customer: CustomerExtended
  open: boolean
  onClose: () => void
  isAdmin: boolean
  onUpdate: () => void
  initialTab?: CustomerDetailTab
}

export function CustomerDetailWorkspace({
  customer,
  open,
  onClose,
  isAdmin,
  onUpdate,
  initialTab = 'master-data',
}: CustomerDetailWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<CustomerDetailTab>(initialTab)
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
  const [ga4Properties, setGa4Properties] = useState<GA4Property[]>([])
  const [loadingGa4Properties, setLoadingGa4Properties] = useState(false)
  const [connectingGa4, setConnectingGa4] = useState(false)
  const [disconnectingGa4, setDisconnectingGa4] = useState(false)
  const [savingGa4Property, setSavingGa4Property] = useState(false)
  const [ga4DisconnectOpen, setGa4DisconnectOpen] = useState(false)
  const [metaAdsAccounts, setMetaAdsAccounts] = useState<MetaAdsAccount[]>([])
  const [loadingMetaAdsAccounts, setLoadingMetaAdsAccounts] = useState(false)
  const [connectingMetaAds, setConnectingMetaAds] = useState(false)
  const [disconnectingMetaAds, setDisconnectingMetaAds] = useState(false)
  const [savingMetaAdsAccount, setSavingMetaAdsAccount] = useState(false)
  const [metaAdsDisconnectOpen, setMetaAdsDisconnectOpen] = useState(false)
  const [tikTokAdvertisers, setTikTokAdvertisers] = useState<TikTokAdvertiser[]>([])
  const [loadingTikTokAdvertisers, setLoadingTikTokAdvertisers] = useState(false)
  const [connectingTikTok, setConnectingTikTok] = useState(false)
  const [disconnectingTikTok, setDisconnectingTikTok] = useState(false)
  const [savingTikTokAdvertiser, setSavingTikTokAdvertiser] = useState(false)
  const [tikTokDisconnectOpen, setTikTokDisconnectOpen] = useState(false)
  const [googleAdsAccounts, setGoogleAdsAccounts] = useState<GoogleAdsAccount[]>([])
  const [loadingGoogleAdsAccounts, setLoadingGoogleAdsAccounts] = useState(false)
  const [connectingGoogleAds, setConnectingGoogleAds] = useState(false)
  const [disconnectingGoogleAds, setDisconnectingGoogleAds] = useState(false)
  const [savingGoogleAdsAccount, setSavingGoogleAdsAccount] = useState(false)
  const [googleAdsDisconnectOpen, setGoogleAdsDisconnectOpen] = useState(false)
  const [gscProperties, setGscProperties] = useState<GscProperty[]>([])
  const [loadingGscProperties, setLoadingGscProperties] = useState(false)
  const [connectingGsc, setConnectingGsc] = useState(false)
  const [disconnectingGsc, setDisconnectingGsc] = useState(false)
  const [savingGscProperty, setSavingGscProperty] = useState(false)
  const [gscDisconnectOpen, setGscDisconnectOpen] = useState(false)
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

  useEffect(() => {
    if (!open) return
    setActiveTab(initialTab)
  }, [initialTab, open])

  useEffect(() => {
    setIntegrations([])
    setDocuments([])
    setIntegrationForm({})
    setShowCredentials({})
    setGa4Properties([])
    setMetaAdsAccounts([])
    setTikTokAdvertisers([])
    setGoogleAdsAccounts([])
    setGscProperties([])
    setEditingDocument(null)
    setDocumentForm({ title: '', url: '', description: '' })
    setPendingFile(null)
    setDocInputMode('link')
  }, [customer.id])

  const handleTabChange = (value: string) => {
    setActiveTab(value as CustomerDetailTab)
  }

  const loadIntegrations = useCallback(async () => {
    setLoadingIntegrations(true)
    try {
      const res = await fetch(`/api/tenant/customers/${customer.id}/integrations`)
      if (res.ok) {
        const data = await res.json()
        const nextIntegrations = data.integrations || []
        setIntegrations(nextIntegrations)
        setIntegrationForm(
          nextIntegrations.reduce((acc: Record<string, string>, integration: IntegrationData) => {
            const credentials = integration.credentials
            const value =
              typeof credentials?.value === 'string'
                ? credentials.value
                : typeof credentials?.id === 'string'
                  ? credentials.id
                  : typeof credentials?.key === 'string'
                    ? credentials.key
                    : ''

            if (value) {
              acc[integration.integration_type] = value
            }

            return acc
          }, {})
        )
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

  const ga4Integration = integrations.find((integration) => integration.integration_type === 'ga4')
  const ga4Credentials = (ga4Integration?.credentials ?? {}) as Record<string, unknown>
  const ga4PropertyId =
    typeof ga4Credentials.ga4_property_id === 'string' ? ga4Credentials.ga4_property_id : ''
  const ga4PropertyName =
    typeof ga4Credentials.ga4_property_name === 'string' ? ga4Credentials.ga4_property_name : ''
  const ga4GoogleEmail =
    typeof ga4Credentials.google_email === 'string' ? ga4Credentials.google_email : ''
  const ga4NeedsReconnect = ga4Integration?.status === 'token_expired'
  const ga4IsConnected = Boolean(ga4Integration && !ga4NeedsReconnect)
  const metaAdsIntegration = integrations.find(
    (integration) => integration.integration_type === 'meta_ads'
  )
  const metaAdsCredentials = (metaAdsIntegration?.credentials ?? {}) as Record<string, unknown>
  const metaAdsAccountId =
    typeof metaAdsCredentials.selected_ad_account_id === 'string'
      ? metaAdsCredentials.selected_ad_account_id
      : ''
  const metaAdsAccountName =
    typeof metaAdsCredentials.selected_ad_account_name === 'string'
      ? metaAdsCredentials.selected_ad_account_name
      : ''
  const metaAdsBusinessName =
    typeof metaAdsCredentials.business_name === 'string'
      ? metaAdsCredentials.business_name
      : ''
  const metaAdsUserName =
    typeof metaAdsCredentials.meta_user_name === 'string'
      ? metaAdsCredentials.meta_user_name
      : ''
  const metaAdsCurrency =
    typeof metaAdsCredentials.currency === 'string' ? metaAdsCredentials.currency : ''
  const metaAdsNeedsReconnect = metaAdsIntegration?.status === 'token_expired'
  const metaAdsIsConnected = Boolean(metaAdsIntegration && !metaAdsNeedsReconnect)
  const tikTokIntegration = integrations.find(
    (integration) => integration.integration_type === 'tiktok_ads'
  )
  const tikTokCredentials = (tikTokIntegration?.credentials ?? {}) as Record<string, unknown>
  const tikTokAdvertiserId =
    typeof tikTokCredentials.selected_advertiser_id === 'string'
      ? tikTokCredentials.selected_advertiser_id
      : ''
  const tikTokAdvertiserName =
    typeof tikTokCredentials.selected_advertiser_name === 'string'
      ? tikTokCredentials.selected_advertiser_name
      : ''
  const tikTokDisplayName =
    typeof tikTokCredentials.tiktok_display_name === 'string'
      ? tikTokCredentials.tiktok_display_name
      : ''
  const tikTokCurrency =
    typeof tikTokCredentials.currency === 'string' ? tikTokCredentials.currency : ''
  const tikTokNeedsReconnect = tikTokIntegration?.status === 'token_expired'
  const tikTokIsConnected = Boolean(tikTokIntegration && !tikTokNeedsReconnect)
  const googleAdsIntegration = integrations.find(
    (integration) => integration.integration_type === 'google_ads'
  )
  const googleAdsCredentials = (googleAdsIntegration?.credentials ?? {}) as Record<string, unknown>
  const googleAdsAccountId =
    typeof googleAdsCredentials.google_ads_customer_id === 'string'
      ? googleAdsCredentials.google_ads_customer_id
      : ''
  const googleAdsAccountName =
    typeof googleAdsCredentials.google_ads_customer_name === 'string'
      ? googleAdsCredentials.google_ads_customer_name
      : ''
  const googleAdsGoogleEmail =
    typeof googleAdsCredentials.google_email === 'string' ? googleAdsCredentials.google_email : ''
  const googleAdsCurrency =
    typeof googleAdsCredentials.currency_code === 'string' ? googleAdsCredentials.currency_code : ''
  const googleAdsNeedsReconnect = googleAdsIntegration?.status === 'token_expired'
  const googleAdsIsConnected = Boolean(googleAdsIntegration && !googleAdsNeedsReconnect)
  const gscIntegration = integrations.find((integration) => integration.integration_type === 'gsc')
  const gscCredentials = (gscIntegration?.credentials ?? {}) as Record<string, unknown>
  const gscSelectedProperty =
    typeof gscCredentials.selected_property === 'string' ? gscCredentials.selected_property : ''
  const gscGoogleEmail =
    typeof gscCredentials.google_email === 'string' ? gscCredentials.google_email : ''
  const gscNeedsReconnect = gscIntegration?.status === 'token_expired'
  const gscIsConnected = Boolean(gscIntegration && !gscNeedsReconnect)

  const loadGa4Properties = useCallback(async () => {
    if (!ga4Integration || !open) return

    setLoadingGa4Properties(true)
    try {
      const res = await fetch(`/api/tenant/integrations/ga4/${customer.id}/properties`)
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || 'GA4-Properties konnten nicht geladen werden.')
      }

      const data = await res.json()
      setGa4Properties(data.properties ?? [])
    } catch (err) {
      setGa4Properties([])
      toast.error(err instanceof Error ? err.message : 'GA4-Properties konnten nicht geladen werden.')
    } finally {
      setLoadingGa4Properties(false)
    }
  }, [customer.id, ga4Integration, open])

  useEffect(() => {
    if (!open || activeTab !== 'integrations' || !ga4IsConnected) return
    void loadGa4Properties()
  }, [activeTab, ga4IsConnected, loadGa4Properties, open])

  const loadMetaAdsAccounts = useCallback(async () => {
    if (!metaAdsIntegration || !open) return

    setLoadingMetaAdsAccounts(true)
    try {
      const res = await fetch(`/api/tenant/integrations/meta-ads/${customer.id}/accounts`)

      if (!res.ok) {
        if (res.status === 404 || res.status === 405) {
          setMetaAdsAccounts([])
          return
        }

        throw new Error(
          await getResponseErrorMessage(res, 'Meta-Ad-Accounts konnten nicht geladen werden.')
        )
      }

      const data = await res.json()
      setMetaAdsAccounts(data.accounts ?? [])
    } catch (err) {
      setMetaAdsAccounts([])
      toast.error(
        err instanceof Error ? err.message : 'Meta-Ad-Accounts konnten nicht geladen werden.'
      )
    } finally {
      setLoadingMetaAdsAccounts(false)
    }
  }, [customer.id, metaAdsIntegration, open])

  useEffect(() => {
    if (!open || activeTab !== 'integrations' || !metaAdsIsConnected || !isAdmin) return
    void loadMetaAdsAccounts()
  }, [activeTab, isAdmin, loadMetaAdsAccounts, metaAdsIsConnected, open])

  const loadTikTokAdvertisers = useCallback(async () => {
    if (!tikTokIntegration || !open) return

    setLoadingTikTokAdvertisers(true)
    try {
      const res = await fetch(`/api/tenant/integrations/tiktok-ads/${customer.id}/advertisers`)

      if (!res.ok) {
        if (res.status === 404 || res.status === 405) {
          setTikTokAdvertisers([])
          return
        }

        throw new Error(
          await getResponseErrorMessage(res, 'TikTok-Advertiser konnten nicht geladen werden.')
        )
      }

      const data = await res.json()
      setTikTokAdvertisers(data.advertisers ?? [])
    } catch (err) {
      setTikTokAdvertisers([])
      toast.error(
        err instanceof Error ? err.message : 'TikTok-Advertiser konnten nicht geladen werden.'
      )
    } finally {
      setLoadingTikTokAdvertisers(false)
    }
  }, [customer.id, open, tikTokIntegration])

  useEffect(() => {
    if (!open || activeTab !== 'integrations' || !tikTokIsConnected || !isAdmin) return
    void loadTikTokAdvertisers()
  }, [activeTab, isAdmin, loadTikTokAdvertisers, open, tikTokIsConnected])

  const loadGoogleAdsAccounts = useCallback(async () => {
    if (!googleAdsIntegration || !open) return

    setLoadingGoogleAdsAccounts(true)
    try {
      const res = await fetch(`/api/tenant/integrations/google-ads/${customer.id}/accounts`)

      if (!res.ok) {
        if (res.status === 404 || res.status === 405) {
          setGoogleAdsAccounts([])
          return
        }

        throw new Error(
          await getResponseErrorMessage(res, 'Google-Ads-Accounts konnten nicht geladen werden.')
        )
      }

      const data = await res.json()
      setGoogleAdsAccounts(data.accounts ?? [])
    } catch (err) {
      setGoogleAdsAccounts([])
      toast.error(
        err instanceof Error ? err.message : 'Google-Ads-Accounts konnten nicht geladen werden.'
      )
    } finally {
      setLoadingGoogleAdsAccounts(false)
    }
  }, [customer.id, googleAdsIntegration, open])

  useEffect(() => {
    if (!open || activeTab !== 'integrations' || !googleAdsIsConnected || !isAdmin) return
    void loadGoogleAdsAccounts()
  }, [activeTab, googleAdsIsConnected, isAdmin, loadGoogleAdsAccounts, open])

  const loadGscProperties = useCallback(async () => {
    if (!gscIntegration || !open) return

    setLoadingGscProperties(true)
    try {
      const res = await fetch(`/api/tenant/integrations/gsc/${customer.id}/properties`)

      if (!res.ok) {
        if (res.status === 404 || res.status === 405) {
          setGscProperties([])
          return
        }

        throw new Error(
          await getResponseErrorMessage(res, 'GSC-Properties konnten nicht geladen werden.')
        )
      }

      const data = await res.json()
      setGscProperties(data.properties ?? [])
    } catch (err) {
      setGscProperties([])
      toast.error(err instanceof Error ? err.message : 'GSC-Properties konnten nicht geladen werden.')
    } finally {
      setLoadingGscProperties(false)
    }
  }, [customer.id, gscIntegration, open])

  useEffect(() => {
    if (!open || activeTab !== 'integrations' || !gscIsConnected || !isAdmin) return
    void loadGscProperties()
  }, [activeTab, gscIsConnected, isAdmin, loadGscProperties, open])

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

  const handleConnectGa4 = async () => {
    setConnectingGa4(true)
    try {
      const res = await fetch(`/api/tenant/integrations/ga4/oauth/start?customerId=${customer.id}`, {
        credentials: 'include',
      })

      if (res.redirected) {
        window.location.href = res.url
        return
      }

      const data = await res.json().catch(() => ({}))
      const redirectUrl = typeof data.url === 'string' ? data.url : null

      if (!res.ok || !redirectUrl) {
        throw new Error(data.error || 'GA4-Verbindung konnte nicht gestartet werden.')
      }

      window.location.href = redirectUrl
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'GA4-Verbindung konnte nicht gestartet werden.')
      setConnectingGa4(false)
    }
  }

  const handleSelectGa4Property = async (propertyId: string) => {
    setSavingGa4Property(true)
    try {
      const selected = ga4Properties.find((property) => property.propertyId === propertyId)
      const res = await fetch(`/api/tenant/integrations/ga4/${customer.id}/select-property`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          propertyName: selected?.displayName ?? propertyId,
        }),
      })

      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || 'GA4-Property konnte nicht gespeichert werden.')
      }

      toast.success('GA4-Property gespeichert.')
      await loadIntegrations()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'GA4-Property konnte nicht gespeichert werden.')
    } finally {
      setSavingGa4Property(false)
    }
  }

  const handleDisconnectGa4 = async () => {
    setDisconnectingGa4(true)
    try {
      const res = await fetch(`/api/tenant/integrations/ga4/${customer.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || 'GA4-Verbindung konnte nicht getrennt werden.')
      }

      toast.success('GA4-Verbindung getrennt.')
      setGa4DisconnectOpen(false)
      setGa4Properties([])
      await loadIntegrations()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'GA4-Verbindung konnte nicht getrennt werden.')
    } finally {
      setDisconnectingGa4(false)
    }
  }

  const handleConnectMetaAds = async () => {
    setConnectingMetaAds(true)
    try {
      const res = await fetch(
        `/api/tenant/integrations/meta-ads/oauth/start?customerId=${customer.id}`,
        {
          credentials: 'include',
        }
      )

      if (res.redirected) {
        window.location.href = res.url
        return
      }

      const data = await res.json().catch(() => ({}))
      const redirectUrl = typeof data.url === 'string' ? data.url : null

      if (!res.ok || !redirectUrl) {
        throw new Error(
          data.error || 'Meta-Ads-Verbindung konnte nicht gestartet werden.'
        )
      }

      window.location.href = redirectUrl
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Meta-Ads-Verbindung konnte nicht gestartet werden.'
      )
      setConnectingMetaAds(false)
    }
  }

  const handleSelectMetaAdsAccount = async (accountId: string) => {
    setSavingMetaAdsAccount(true)
    try {
      const selected = metaAdsAccounts.find((account) => account.id === accountId)
      const res = await fetch(`/api/tenant/integrations/meta-ads/${customer.id}/select-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          accountName: selected?.name ?? accountId,
          businessName: selected?.businessName,
          currency: selected?.currency,
        }),
      })

      if (!res.ok) {
        throw new Error(
          await getResponseErrorMessage(res, 'Meta-Ad-Account konnte nicht gespeichert werden.')
        )
      }

      toast.success('Meta-Ad-Account gespeichert.')
      await loadIntegrations()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Meta-Ad-Account konnte nicht gespeichert werden.'
      )
    } finally {
      setSavingMetaAdsAccount(false)
    }
  }

  const handleDisconnectMetaAds = async () => {
    setDisconnectingMetaAds(true)
    try {
      const res = await fetch(`/api/tenant/integrations/meta-ads/${customer.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        throw new Error(
          await getResponseErrorMessage(res, 'Meta-Ads-Verbindung konnte nicht getrennt werden.')
        )
      }

      toast.success('Meta-Ads-Verbindung getrennt.')
      setMetaAdsDisconnectOpen(false)
      setMetaAdsAccounts([])
      await loadIntegrations()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Meta-Ads-Verbindung konnte nicht getrennt werden.'
      )
    } finally {
      setDisconnectingMetaAds(false)
    }
  }

  const handleConnectTikTok = async () => {
    setConnectingTikTok(true)
    try {
      const res = await fetch(
        `/api/tenant/integrations/tiktok-ads/oauth/start?customerId=${customer.id}`,
        {
          credentials: 'include',
        }
      )

      if (res.redirected) {
        window.location.href = res.url
        return
      }

      const data = await res.json().catch(() => ({}))
      const redirectUrl = typeof data.url === 'string' ? data.url : null

      if (!res.ok || !redirectUrl) {
        throw new Error(
          data.error || 'TikTok-Verbindung konnte nicht gestartet werden.'
        )
      }

      window.location.href = redirectUrl
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'TikTok-Verbindung konnte nicht gestartet werden.'
      )
      setConnectingTikTok(false)
    }
  }

  const handleSelectTikTokAdvertiser = async (advertiserId: string) => {
    setSavingTikTokAdvertiser(true)
    try {
      const selected = tikTokAdvertisers.find((advertiser) => advertiser.id === advertiserId)
      const res = await fetch(
        `/api/tenant/integrations/tiktok-ads/${customer.id}/select-advertiser`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            advertiserId,
            advertiserName: selected?.name ?? advertiserId,
            currency: selected?.currency,
          }),
        }
      )

      if (!res.ok) {
        throw new Error(
          await getResponseErrorMessage(
            res,
            'TikTok-Advertiser konnte nicht gespeichert werden.'
          )
        )
      }

      toast.success('TikTok-Advertiser gespeichert.')
      await loadIntegrations()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'TikTok-Advertiser konnte nicht gespeichert werden.'
      )
    } finally {
      setSavingTikTokAdvertiser(false)
    }
  }

  const handleConnectGoogleAds = async () => {
    setConnectingGoogleAds(true)
    try {
      const res = await fetch(
        `/api/tenant/integrations/google-ads/oauth/start?customerId=${customer.id}`,
        {
          credentials: 'include',
        }
      )

      if (res.redirected) {
        window.location.href = res.url
        return
      }

      const data = await res.json().catch(() => ({}))
      const redirectUrl = typeof data.url === 'string' ? data.url : null

      if (!res.ok || !redirectUrl) {
        throw new Error(data.error || 'Google-Ads-Verbindung konnte nicht gestartet werden.')
      }

      window.location.href = redirectUrl
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Google-Ads-Verbindung konnte nicht gestartet werden.'
      )
      setConnectingGoogleAds(false)
    }
  }

  const handleSelectGoogleAdsAccount = async (accountId: string) => {
    setSavingGoogleAdsAccount(true)
    try {
      const selected = googleAdsAccounts.find((account) => account.id === accountId)
      const res = await fetch(`/api/tenant/integrations/google-ads/${customer.id}/select-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          accountName: selected?.name ?? accountId,
          currency: selected?.currency,
        }),
      })

      if (!res.ok) {
        throw new Error(
          await getResponseErrorMessage(res, 'Google-Ads-Account konnte nicht gespeichert werden.')
        )
      }

      toast.success('Google-Ads-Account gespeichert.')
      await loadIntegrations()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Google-Ads-Account konnte nicht gespeichert werden.'
      )
    } finally {
      setSavingGoogleAdsAccount(false)
    }
  }

  const handleDisconnectGoogleAds = async () => {
    setDisconnectingGoogleAds(true)
    try {
      const res = await fetch(`/api/tenant/integrations/google-ads/${customer.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        throw new Error(
          await getResponseErrorMessage(res, 'Google-Ads-Verbindung konnte nicht getrennt werden.')
        )
      }

      toast.success('Google-Ads-Verbindung getrennt.')
      setGoogleAdsDisconnectOpen(false)
      setGoogleAdsAccounts([])
      await loadIntegrations()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Google-Ads-Verbindung konnte nicht getrennt werden.'
      )
    } finally {
      setDisconnectingGoogleAds(false)
    }
  }

  const handleConnectGsc = async () => {
    setConnectingGsc(true)
    try {
      const res = await fetch(`/api/tenant/integrations/gsc/oauth/start?customerId=${customer.id}`, {
        credentials: 'include',
      })

      if (res.redirected) {
        window.location.href = res.url
        return
      }

      const data = await res.json().catch(() => ({}))
      const redirectUrl = typeof data.url === 'string' ? data.url : null

      if (!res.ok || !redirectUrl) {
        throw new Error(data.error || 'GSC-Verbindung konnte nicht gestartet werden.')
      }

      window.location.href = redirectUrl
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'GSC-Verbindung konnte nicht gestartet werden.')
      setConnectingGsc(false)
    }
  }

  const handleSelectGscProperty = async (property: string) => {
    setSavingGscProperty(true)
    try {
      const res = await fetch(`/api/tenant/integrations/gsc/${customer.id}/select-property`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property }),
      })

      if (!res.ok) {
        throw new Error(await getResponseErrorMessage(res, 'GSC-Property konnte nicht gespeichert werden.'))
      }

      toast.success('GSC-Property gespeichert.')
      await loadIntegrations()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'GSC-Property konnte nicht gespeichert werden.')
    } finally {
      setSavingGscProperty(false)
    }
  }

  const handleDisconnectGsc = async () => {
    setDisconnectingGsc(true)
    try {
      const res = await fetch(`/api/tenant/integrations/gsc/${customer.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        throw new Error(await getResponseErrorMessage(res, 'GSC-Verbindung konnte nicht getrennt werden.'))
      }

      toast.success('GSC-Verbindung getrennt.')
      setGscDisconnectOpen(false)
      setGscProperties([])
      await loadIntegrations()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'GSC-Verbindung konnte nicht getrennt werden.')
    } finally {
      setDisconnectingGsc(false)
    }
  }

  const handleDisconnectTikTok = async () => {
    setDisconnectingTikTok(true)
    try {
      const res = await fetch(`/api/tenant/integrations/tiktok-ads/${customer.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        throw new Error(
          await getResponseErrorMessage(res, 'TikTok-Verbindung konnte nicht getrennt werden.')
        )
      }

      toast.success('TikTok-Verbindung getrennt.')
      setTikTokDisconnectOpen(false)
      setTikTokAdvertisers([])
      await loadIntegrations()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'TikTok-Verbindung konnte nicht getrennt werden.'
      )
    } finally {
      setDisconnectingTikTok(false)
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
    if (status === 'token_expired') {
      return (
        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
          <AlertCircle className="w-3 h-3 mr-1" />Erneut verbinden
        </Badge>
      )
    }
    return (
      <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
        <XCircle className="w-3 h-3 mr-1" />Nicht verbunden
      </Badge>
    )
  }

  const renderGa4IntegrationCard = () => (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-4 dark:border-slate-800 dark:from-orange-950/20 dark:via-slate-950 dark:to-amber-950/10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400">
              <BarChart3 className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Google Analytics 4</p>
                {getStatusBadge(ga4Integration?.status ?? 'disconnected')}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Besucher, Nutzer und Seitenaufrufe werden per Google OAuth angebunden.
              </p>
            </div>
          </div>

          {!ga4Integration && (
            <div className="space-y-2">
              <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                Verbinde ein Google-Konto und waehle danach die passende GA4-Property fuer diesen Kunden aus.
              </p>
              {!isAdmin && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Nur Admins koennen die Verbindung einrichten.
                </p>
              )}
            </div>
          )}

          {ga4Integration && (
            <div className="space-y-3">
              {ga4GoogleEmail && (
                <div className="rounded-lg border border-white/70 bg-white/80 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/60">
                  <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Google-Konto</p>
                  <p className="truncate font-medium text-slate-700 dark:text-slate-200">{ga4GoogleEmail}</p>
                </div>
              )}

              {ga4NeedsReconnect && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                  Das gespeicherte Token ist nicht mehr gueltig. Bitte verbinde das Konto erneut, damit das Dashboard wieder Daten laden kann.
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="ga4-property-select">GA4-Property</Label>
                {ga4IsConnected && isAdmin ? (
                  <>
                    {loadingGa4Properties ? (
                      <div className="flex items-center gap-2 py-2 text-sm text-slate-500 dark:text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Properties werden geladen...
                      </div>
                    ) : ga4Properties.length === 0 ? (
                      <div className="rounded-lg border border-slate-200 bg-white/80 px-3 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                        Fuer dieses Konto wurden noch keine GA4-Properties gefunden.
                      </div>
                    ) : (
                      <Select value={ga4PropertyId} onValueChange={handleSelectGa4Property} disabled={savingGa4Property}>
                        <SelectTrigger id="ga4-property-select" className="w-full sm:w-[26rem]">
                          <SelectValue placeholder="Property auswaehlen..." />
                        </SelectTrigger>
                        <SelectContent>
                          {ga4Properties.map((property) => (
                            <SelectItem key={property.propertyId} value={property.propertyId}>
                              {property.displayName} ({property.propertyId})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {!loadingGa4Properties && ga4Properties.length > 0 && (
                      <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <AlertCircle className="h-3 w-3" />
                        Die Auswahl wird direkt gespeichert.
                      </p>
                    )}
                    {savingGa4Property && (
                      <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Property wird gespeichert...
                      </p>
                    )}
                  </>
                ) : (
                  <div className="rounded-lg border border-white/70 bg-white/80 px-3 py-3 text-sm dark:border-slate-800 dark:bg-slate-900/60">
                    <p className="font-medium text-slate-700 dark:text-slate-200">
                      {ga4PropertyName || 'Noch keine Property ausgewaehlt'}
                    </p>
                    {ga4PropertyId && (
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Property-ID: {ga4PropertyId}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          {isAdmin ? (
            <>
              {(!ga4Integration || ga4NeedsReconnect) && (
                <Button onClick={handleConnectGa4} disabled={connectingGa4} className="rounded-xl">
                  {connectingGa4 ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="mr-2 h-4 w-4" />
                  )}
                  {ga4NeedsReconnect ? 'Erneut verbinden' : 'Mit Google verbinden'}
                </Button>
              )}
              {ga4Integration && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setGa4DisconnectOpen(true)}
                  className="rounded-xl text-red-600 hover:text-red-700"
                >
                  <Unlink className="mr-2 h-4 w-4" />
                  Verbindung trennen
                </Button>
              )}
            </>
          ) : (
            <Button asChild variant="outline" className="rounded-xl">
              <Link href="/dashboard">Zum Dashboard</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  )

  const renderMetaAdsIntegrationCard = () => (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-4 dark:border-slate-800 dark:from-blue-950/20 dark:via-slate-950 dark:to-cyan-950/10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <Eye className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Meta Ads</p>
                {getStatusBadge(metaAdsIntegration?.status ?? 'disconnected')}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Facebook- und Instagram-Kampagnen werden pro Kunde ueber Meta OAuth angebunden.
              </p>
            </div>
          </div>

          {!metaAdsIntegration && (
            <div className="space-y-2">
              <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                Verbinde ein Meta-Konto und waehle danach den passenden Werbe-Account fuer diesen Kunden aus.
              </p>
              {!isAdmin && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Nur Admins koennen die Verbindung einrichten.
                </p>
              )}
            </div>
          )}

          {metaAdsIntegration && (
            <div className="space-y-3">
              {metaAdsUserName && (
                <div className="rounded-lg border border-white/70 bg-white/80 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/60">
                  <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Meta-Konto</p>
                  <p className="truncate font-medium text-slate-700 dark:text-slate-200">{metaAdsUserName}</p>
                </div>
              )}

              {metaAdsNeedsReconnect && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                  Die gespeicherte Meta-Ads-Verbindung ist nicht mehr gueltig. Bitte verbinde das Konto erneut, damit das Dashboard wieder Daten laden kann.
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="meta-ads-account-select">Ad Account</Label>
                {metaAdsIsConnected && isAdmin ? (
                  <>
                    {loadingMetaAdsAccounts ? (
                      <div className="flex items-center gap-2 py-2 text-sm text-slate-500 dark:text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Werbekonten werden geladen...
                      </div>
                    ) : metaAdsAccounts.length === 0 ? (
                      <div className="rounded-lg border border-slate-200 bg-white/80 px-3 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                        Sobald die Backend-Anbindung verfuegbar ist, erscheinen hier die Meta Ad Accounts zur Auswahl.
                      </div>
                    ) : (
                      <Select
                        value={metaAdsAccountId}
                        onValueChange={handleSelectMetaAdsAccount}
                        disabled={savingMetaAdsAccount}
                      >
                        <SelectTrigger id="meta-ads-account-select" className="w-full sm:w-[26rem]">
                          <SelectValue placeholder="Ad Account auswaehlen..." />
                        </SelectTrigger>
                        <SelectContent>
                          {metaAdsAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name} ({account.id})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {savingMetaAdsAccount && (
                      <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Ad Account wird gespeichert...
                      </p>
                    )}
                  </>
                ) : (
                  <div className="rounded-lg border border-white/70 bg-white/80 px-3 py-3 text-sm dark:border-slate-800 dark:bg-slate-900/60">
                    <p className="font-medium text-slate-700 dark:text-slate-200">
                      {metaAdsAccountName || 'Noch kein Ad Account ausgewaehlt'}
                    </p>
                    <div className="mt-1 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                      {metaAdsAccountId && <p>Account-ID: {metaAdsAccountId}</p>}
                      {metaAdsBusinessName && <p>Business: {metaAdsBusinessName}</p>}
                      {metaAdsCurrency && <p>Waehrung: {metaAdsCurrency}</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          {isAdmin ? (
            <>
              <Button onClick={handleConnectMetaAds} disabled={connectingMetaAds} className="rounded-xl">
                {connectingMetaAds ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="mr-2 h-4 w-4" />
                )}
                {metaAdsIntegration
                  ? metaAdsNeedsReconnect
                    ? 'Erneut verbinden'
                    : 'Meta-Konto wechseln'
                  : 'Mit Meta verbinden'}
              </Button>
              {metaAdsIntegration && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setMetaAdsDisconnectOpen(true)}
                  className="rounded-xl text-red-600 hover:text-red-700"
                >
                  <Unlink className="mr-2 h-4 w-4" />
                  Verbindung trennen
                </Button>
              )}
            </>
          ) : (
            <Button asChild variant="outline" className="rounded-xl">
              <Link href="/dashboard">Zum Dashboard</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  )

  const renderTikTokIntegrationCard = () => (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-pink-50 via-white to-rose-50 p-4 dark:border-slate-800 dark:from-pink-950/20 dark:via-slate-950 dark:to-rose-950/10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pink-100 text-pink-600 dark:bg-pink-950/40 dark:text-pink-400">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">TikTok Ads</p>
                {getStatusBadge(tikTokIntegration?.status ?? 'disconnected')}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Kampagnen, Video Views und Kosten werden pro Kunde ueber TikTok OAuth angebunden.
              </p>
            </div>
          </div>

          {!tikTokIntegration && (
            <div className="space-y-2">
              <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                Verbinde ein TikTok-for-Business-Konto und waehle danach den passenden Advertiser fuer diesen Kunden aus.
              </p>
              <div className="rounded-lg border border-pink-100 bg-pink-50/80 px-3 py-2 text-xs text-pink-700 dark:border-pink-900/40 dark:bg-pink-950/20 dark:text-pink-200">
                Die UI ist vorbereitet. Sobald der Backend-Flow verfuegbar ist, startet hier direkt der OAuth-Connect.
              </div>
              {!isAdmin && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Nur Admins koennen die Verbindung einrichten.
                </p>
              )}
            </div>
          )}

          {tikTokIntegration && (
            <div className="space-y-3">
              {tikTokDisplayName && (
                <div className="rounded-lg border border-white/70 bg-white/80 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/60">
                  <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">TikTok-Konto</p>
                  <p className="truncate font-medium text-slate-700 dark:text-slate-200">{tikTokDisplayName}</p>
                </div>
              )}

              {tikTokNeedsReconnect && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                  Die gespeicherte TikTok-Verbindung ist nicht mehr gueltig. Bitte verbinde das Konto erneut, damit das Dashboard wieder Daten laden kann.
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="tiktok-advertiser-select">Advertiser</Label>
                {tikTokIsConnected && isAdmin ? (
                  <>
                    {loadingTikTokAdvertisers ? (
                      <div className="flex items-center gap-2 py-2 text-sm text-slate-500 dark:text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Advertiser werden geladen...
                      </div>
                    ) : tikTokAdvertisers.length === 0 ? (
                      <div className="rounded-lg border border-slate-200 bg-white/80 px-3 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                        Sobald die Backend-Anbindung verfuegbar ist, erscheinen hier die TikTok Advertiser zur Auswahl.
                      </div>
                    ) : (
                      <Select
                        value={tikTokAdvertiserId}
                        onValueChange={handleSelectTikTokAdvertiser}
                        disabled={savingTikTokAdvertiser}
                      >
                        <SelectTrigger id="tiktok-advertiser-select" className="w-full sm:w-[26rem]">
                          <SelectValue placeholder="Advertiser auswaehlen..." />
                        </SelectTrigger>
                        <SelectContent>
                          {tikTokAdvertisers.map((advertiser) => (
                            <SelectItem key={advertiser.id} value={advertiser.id}>
                              {advertiser.name} ({advertiser.id})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {savingTikTokAdvertiser && (
                      <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Advertiser wird gespeichert...
                      </p>
                    )}
                  </>
                ) : (
                  <div className="rounded-lg border border-white/70 bg-white/80 px-3 py-3 text-sm dark:border-slate-800 dark:bg-slate-900/60">
                    <p className="font-medium text-slate-700 dark:text-slate-200">
                      {tikTokAdvertiserName || 'Noch kein Advertiser ausgewaehlt'}
                    </p>
                    <div className="mt-1 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                      {tikTokAdvertiserId && <p>Advertiser-ID: {tikTokAdvertiserId}</p>}
                      {tikTokCurrency && <p>Waehrung: {tikTokCurrency}</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          {isAdmin ? (
            <>
              <Button onClick={handleConnectTikTok} disabled={connectingTikTok} className="rounded-xl">
                {connectingTikTok ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="mr-2 h-4 w-4" />
                )}
                {tikTokIntegration
                  ? tikTokNeedsReconnect
                    ? 'Erneut verbinden'
                    : 'TikTok-Konto wechseln'
                  : 'Mit TikTok verbinden'}
              </Button>
              {tikTokIntegration && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setTikTokDisconnectOpen(true)}
                  className="rounded-xl text-red-600 hover:text-red-700"
                >
                  <Unlink className="mr-2 h-4 w-4" />
                  Verbindung trennen
                </Button>
              )}
            </>
          ) : (
            <Button asChild variant="outline" className="rounded-xl">
              <Link href="/dashboard">Zum Dashboard</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  )

  const renderGoogleAdsIntegrationCard = () => (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-emerald-50 via-white to-lime-50 p-4 dark:border-slate-800 dark:from-emerald-950/20 dark:via-slate-950 dark:to-lime-950/10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Google Ads</p>
                {getStatusBadge(googleAdsIntegration?.status ?? 'disconnected')}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Kampagnen-, Kosten- und Conversion-Daten werden per Google OAuth angebunden.
              </p>
            </div>
          </div>

          {!googleAdsIntegration && (
            <div className="space-y-2">
              <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                Verbinde ein Google-Konto und waehle danach den passenden Google-Ads-Account fuer diesen Kunden aus.
              </p>
              {!isAdmin && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Nur Admins koennen die Verbindung einrichten.
                </p>
              )}
            </div>
          )}

          {googleAdsIntegration && (
            <div className="space-y-3">
              {googleAdsGoogleEmail && (
                <div className="rounded-lg border border-white/70 bg-white/80 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/60">
                  <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Google-Konto</p>
                  <p className="truncate font-medium text-slate-700 dark:text-slate-200">{googleAdsGoogleEmail}</p>
                </div>
              )}

              {googleAdsNeedsReconnect && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                  Die gespeicherte Google-Ads-Verbindung ist nicht mehr gueltig. Bitte verbinde das Konto erneut, damit das Dashboard wieder Daten laden kann.
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="google-ads-account-select">Google Ads Account</Label>
                {googleAdsIsConnected && isAdmin ? (
                  <>
                    {loadingGoogleAdsAccounts ? (
                      <div className="flex items-center gap-2 py-2 text-sm text-slate-500 dark:text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Google-Ads-Accounts werden geladen...
                      </div>
                    ) : googleAdsAccounts.length === 0 ? (
                      <div className="rounded-lg border border-slate-200 bg-white/80 px-3 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                        Fuer dieses Konto wurden noch keine Google-Ads-Accounts gefunden.
                      </div>
                    ) : (
                      <Select
                        value={googleAdsAccountId}
                        onValueChange={handleSelectGoogleAdsAccount}
                        disabled={savingGoogleAdsAccount}
                      >
                        <SelectTrigger id="google-ads-account-select" className="w-full sm:w-[26rem]">
                          <SelectValue placeholder="Google-Ads-Account auswaehlen..." />
                        </SelectTrigger>
                        <SelectContent>
                          {googleAdsAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name} ({account.id})
                              {account.isManager ? ' · MCC' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {savingGoogleAdsAccount && (
                      <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Google-Ads-Account wird gespeichert...
                      </p>
                    )}
                  </>
                ) : (
                  <div className="rounded-lg border border-white/70 bg-white/80 px-3 py-3 text-sm dark:border-slate-800 dark:bg-slate-900/60">
                    <p className="font-medium text-slate-700 dark:text-slate-200">
                      {googleAdsAccountName || 'Noch kein Google-Ads-Account ausgewaehlt'}
                    </p>
                    <div className="mt-1 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                      {googleAdsAccountId && <p>Customer ID: {googleAdsAccountId}</p>}
                      {googleAdsCurrency && <p>Waehrung: {googleAdsCurrency}</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          {isAdmin ? (
            <>
              <Button onClick={handleConnectGoogleAds} disabled={connectingGoogleAds} className="rounded-xl">
                {connectingGoogleAds ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="mr-2 h-4 w-4" />
                )}
                {googleAdsIntegration
                  ? googleAdsNeedsReconnect
                    ? 'Erneut verbinden'
                    : 'Google-Konto wechseln'
                  : 'Mit Google verbinden'}
              </Button>
              {googleAdsIntegration && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setGoogleAdsDisconnectOpen(true)}
                  className="rounded-xl text-red-600 hover:text-red-700"
                >
                  <Unlink className="mr-2 h-4 w-4" />
                  Verbindung trennen
                </Button>
              )}
            </>
          ) : (
            <Button asChild variant="outline" className="rounded-xl">
              <Link href="/dashboard">Zum Dashboard</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  )

  const renderGscIntegrationCard = () => (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-sky-50 via-white to-indigo-50 p-4 dark:border-slate-800 dark:from-sky-950/20 dark:via-slate-950 dark:to-indigo-950/10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
              <Globe className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Google Search Console</p>
                {getStatusBadge(gscIntegration?.status ?? 'disconnected')}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Search-Console-Properties werden pro Kunde per Google OAuth angebunden.
              </p>
            </div>
          </div>

          {!gscIntegration && (
            <div className="space-y-2">
              <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                Verbinde ein Google-Konto und waehle danach die passende Search-Console-Property fuer diesen Kunden aus.
              </p>
              {!isAdmin && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Nur Admins koennen die Verbindung einrichten.
                </p>
              )}
            </div>
          )}

          {gscIntegration && (
            <div className="space-y-3">
              {gscGoogleEmail && (
                <div className="rounded-lg border border-white/70 bg-white/80 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/60">
                  <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Google-Konto</p>
                  <p className="truncate font-medium text-slate-700 dark:text-slate-200">{gscGoogleEmail}</p>
                </div>
              )}

              {gscNeedsReconnect && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                  Die gespeicherte GSC-Verbindung ist nicht mehr gueltig. Bitte verbinde das Konto erneut, damit das Dashboard wieder Daten laden kann.
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="gsc-property-select">Search Console Property</Label>
                {gscIsConnected && isAdmin ? (
                  <>
                    {loadingGscProperties ? (
                      <div className="flex items-center gap-2 py-2 text-sm text-slate-500 dark:text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Properties werden geladen...
                      </div>
                    ) : gscProperties.length === 0 ? (
                      <div className="rounded-lg border border-slate-200 bg-white/80 px-3 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                        Fuer dieses Konto wurden noch keine Search-Console-Properties gefunden.
                      </div>
                    ) : (
                      <Select
                        value={gscSelectedProperty}
                        onValueChange={handleSelectGscProperty}
                        disabled={savingGscProperty}
                      >
                        <SelectTrigger id="gsc-property-select" className="w-full sm:w-[26rem]">
                          <SelectValue placeholder="Property auswaehlen..." />
                        </SelectTrigger>
                        <SelectContent>
                          {gscProperties.map((property) => (
                            <SelectItem key={property.siteUrl} value={property.siteUrl}>
                              {property.siteUrl}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {savingGscProperty && (
                      <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Property wird gespeichert...
                      </p>
                    )}
                  </>
                ) : (
                  <div className="rounded-lg border border-white/70 bg-white/80 px-3 py-3 text-sm dark:border-slate-800 dark:bg-slate-900/60">
                    <p className="font-medium text-slate-700 dark:text-slate-200">
                      {gscSelectedProperty || 'Noch keine Property ausgewaehlt'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          {isAdmin ? (
            <>
              <Button onClick={handleConnectGsc} disabled={connectingGsc} className="rounded-xl">
                {connectingGsc ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="mr-2 h-4 w-4" />
                )}
                {gscIntegration
                  ? gscNeedsReconnect
                    ? 'Erneut verbinden'
                    : 'Google-Konto wechseln'
                  : 'Mit Google verbinden'}
              </Button>
              {gscIntegration && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setGscDisconnectOpen(true)}
                  className="rounded-xl text-red-600 hover:text-red-700"
                >
                  <Unlink className="mr-2 h-4 w-4" />
                  Verbindung trennen
                </Button>
              )}
            </>
          ) : (
            <Button asChild variant="outline" className="rounded-xl">
              <Link href="/dashboard">Zum Dashboard</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <>
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

          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
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
                  {renderGa4IntegrationCard()}
                  {renderGoogleAdsIntegrationCard()}
                  {renderMetaAdsIntegrationCard()}
                  {renderGscIntegrationCard()}
                  {renderTikTokIntegrationCard()}

                  {loadingIntegrations ? (
                    <div className="space-y-3">
                      <Skeleton className="h-20 w-full" />
                      <Skeleton className="h-20 w-full" />
                    </div>
                  ) : null}
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

      <Dialog open={ga4DisconnectOpen} onOpenChange={setGa4DisconnectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>GA4-Verbindung trennen?</DialogTitle>
            <DialogDescription>
              Das verbundene Google-Konto und die ausgewaehlte Property werden fuer diesen Kunden entfernt. Bereits angezeigte Berichte bleiben erhalten, neue GA4-Daten koennen danach aber nicht mehr geladen werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGa4DisconnectOpen(false)} disabled={disconnectingGa4}>
              Abbrechen
            </Button>
            <Button variant="destructive" onClick={handleDisconnectGa4} disabled={disconnectingGa4}>
              {disconnectingGa4 && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verbindung trennen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={googleAdsDisconnectOpen} onOpenChange={setGoogleAdsDisconnectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Google Ads trennen?</DialogTitle>
            <DialogDescription>
              Die gespeicherten Tokens und die ausgewaehlte Customer ID werden fuer diesen Kunden entfernt.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGoogleAdsDisconnectOpen(false)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisconnectGoogleAds}
              disabled={disconnectingGoogleAds}
            >
              {disconnectingGoogleAds ? 'Trenne...' : 'Verbindung trennen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={metaAdsDisconnectOpen} onOpenChange={setMetaAdsDisconnectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Meta-Ads-Verbindung trennen?</DialogTitle>
            <DialogDescription>
              Das verbundene Meta-Konto und der ausgewaehlte Werbe-Account werden fuer diesen Kunden entfernt. Bereits angezeigte Berichte bleiben erhalten, neue Meta-Ads-Daten koennen danach aber nicht mehr geladen werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMetaAdsDisconnectOpen(false)}
              disabled={disconnectingMetaAds}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisconnectMetaAds}
              disabled={disconnectingMetaAds}
            >
              {disconnectingMetaAds && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verbindung trennen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tikTokDisconnectOpen} onOpenChange={setTikTokDisconnectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>TikTok-Verbindung trennen?</DialogTitle>
            <DialogDescription>
              Das verbundene TikTok-Konto und der ausgewaehlte Advertiser werden fuer diesen Kunden entfernt. Bereits angezeigte Berichte bleiben erhalten, neue TikTok-Daten koennen danach aber nicht mehr geladen werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTikTokDisconnectOpen(false)}
              disabled={disconnectingTikTok}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisconnectTikTok}
              disabled={disconnectingTikTok}
            >
              {disconnectingTikTok && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verbindung trennen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={gscDisconnectOpen} onOpenChange={setGscDisconnectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Google Search Console trennen?</DialogTitle>
            <DialogDescription>
              Die gespeicherten Tokens und die ausgewaehlte Property werden fuer diesen Kunden entfernt.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGscDisconnectOpen(false)}>
              Abbrechen
            </Button>
            <Button variant="destructive" onClick={handleDisconnectGsc} disabled={disconnectingGsc}>
              {disconnectingGsc ? 'Trenne...' : 'Verbindung trennen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
