'use client'

/* eslint-disable @next/next/no-img-element */

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  Clapperboard,
  Download,
  FileImage,
  Grid2x2,
  HardDrive,
  List,
  Play,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'
import { useActiveCustomer } from '@/lib/active-customer-context'
import { clearSessionCache, readSessionCache, writeSessionCache } from '@/lib/client-cache'
import { ApprovalSubmitPanel } from '@/components/approval-submit-panel'
import type { ApprovalStatus } from '@/components/approval-status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
} from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { CUSTOMER_INDUSTRIES } from '@/lib/customer-industries'

interface AdAsset {
  id: string
  customer_id: string
  created_by?: string
  title: string
  media_type: 'image' | 'video'
  mime_type: string
  file_format: string
  width_px: number
  height_px: number
  duration_seconds: number | null
  file_size_bytes: number
  public_url: string
  aspect_ratio: number
  approval_status: ApprovalStatus | 'draft'
  notes: string | null
  uploader_name?: string
  created_at: string
  updated_at: string
}

interface AssetApprovalInfo {
  status: ApprovalStatus | 'draft'
  link: string | null
  feedback: string | null
  history: Array<{
    id: string
    event_type: 'submitted' | 'resubmitted' | 'approved' | 'changes_requested' | 'content_updated'
    status_after: ApprovalStatus
    feedback: string | null
    actor_label: string | null
    created_at: string
  }>
}

interface UploadMetadata {
  mediaType: 'image' | 'video'
  mimeType: string
  fileFormat: string
  widthPx: number
  heightPx: number
  durationSeconds: number | null
  fileSizeBytes: number
}

interface CustomerForm {
  name: string
  domain: string
  industry: string
  status: 'active' | 'paused'
}

type LibraryViewMode = 'grid' | 'list'
type UploadDialogMode = 'upload' | 'customer'

const PAGE_SIZE = 100

const emptyCustomerForm: CustomerForm = {
  name: '',
  domain: '',
  industry: '',
  status: 'active',
}

const CREATE_CUSTOMER_SELECT_VALUE = '__create_customer__'

// ── Utilities ──────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  return debouncedValue
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatDuration(value: number | null) {
  if (!value || value <= 0) return '0:00'
  const totalSeconds = Math.round(value)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function formatAspectRatio(width: number, height: number): string {
  const ratio = width / height
  const known: [number, number][] = [
    [1, 1], [4, 3], [3, 4], [16, 9], [9, 16], [4, 5], [5, 4], [3, 2], [2, 3], [21, 9], [9, 21],
  ]
  for (const [w, h] of known) {
    if (Math.abs(ratio - w / h) < 0.025) return `${w}:${h}`
  }
  return `${ratio.toFixed(2)}:1`
}

function cacheKey(customerId: string, mediaFilter: string) {
  return `ad-library:v2:${customerId}:${mediaFilter}`
}

function invalidateAdLibraryCache(customerId: string) {
  for (const cId of [customerId, 'all']) {
    for (const mType of ['all', 'image', 'video']) {
      clearSessionCache(cacheKey(cId, mType))
    }
  }
}

async function readMetadata(file: File): Promise<UploadMetadata> {
  const fileFormat =
    file.name.split('.').pop()?.toUpperCase() ??
    file.type.split('/').pop()?.toUpperCase() ??
    'DATEI'

  if (file.type.startsWith('image/')) {
    const objectUrl = URL.createObjectURL(file)
    try {
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
        img.onerror = () => reject(new Error('Bildmetadaten konnten nicht gelesen werden.'))
        img.src = objectUrl
      })
      return {
        mediaType: 'image',
        mimeType: file.type,
        fileFormat,
        widthPx: dimensions.width,
        heightPx: dimensions.height,
        durationSeconds: null,
        fileSizeBytes: file.size,
      }
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  if (file.type.startsWith('video/')) {
    const objectUrl = URL.createObjectURL(file)
    try {
      const metadata = await new Promise<{ width: number; height: number; duration: number }>(
        (resolve, reject) => {
          const video = document.createElement('video')
          video.preload = 'metadata'
          video.onloadedmetadata = () => {
            resolve({
              width: video.videoWidth,
              height: video.videoHeight,
              duration: Number.isFinite(video.duration) ? video.duration : 0,
            })
          }
          video.onerror = () => reject(new Error('Videometadaten konnten nicht gelesen werden.'))
          video.src = objectUrl
        }
      )
      return {
        mediaType: 'video',
        mimeType: file.type,
        fileFormat,
        widthPx: metadata.width,
        heightPx: metadata.height,
        durationSeconds: metadata.duration,
        fileSizeBytes: file.size,
      }
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  throw new Error('Dieses Dateiformat wird aktuell nicht unterstützt.')
}

function baseTitleFromFilename(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Neue Anzeige'
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface AssetGridCardProps {
  asset: AdAsset
  customerName: string
  isAdmin: boolean
  isSelected: boolean
  onOpen: (asset: AdAsset) => void
  onDelete: (asset: AdAsset) => void
  onToggleSelect: (assetId: string, checked: boolean) => void
}

function AssetGridCard({
  asset,
  customerName,
  isAdmin,
  isSelected,
  onOpen,
  onDelete,
  onToggleSelect,
}: AssetGridCardProps) {
  return (
    <article className={cn(
      "group overflow-hidden rounded-[1.5rem] border bg-white shadow-sm transition-all hover:shadow-lg dark:bg-[#101723]",
      isSelected
        ? "border-blue-500 ring-2 ring-blue-500/40 dark:border-blue-400 dark:ring-blue-400/30"
        : "border-slate-200 dark:border-border"
    )}>
      <div
        role="button"
        tabIndex={0}
        className="block w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 focus-visible:ring-offset-2"
        onClick={() => onOpen(asset)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpen(asset)
          }
        }}
        aria-label={`${asset.title} öffnen`}
      >
        <div
          className="relative bg-slate-100 dark:bg-[#0b1220]"
          style={{ aspectRatio: `${asset.width_px} / ${asset.height_px}` }}
        >
          {asset.media_type === 'image' ? (
            <img src={asset.public_url} alt={asset.title} className="h-full w-full object-cover" />
          ) : (
            <>
              <video
                src={asset.public_url}
                className="h-full w-full object-cover"
                muted
                playsInline
                preload="metadata"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-md">
                  <Play className="h-5 w-5 translate-x-0.5 text-slate-900" />
                </div>
              </div>
            </>
          )}
          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            <Badge className="rounded-full bg-white/90 text-slate-900 hover:bg-white">
              {asset.media_type === 'image' ? 'Bild' : 'Video'}
            </Badge>
            <Badge className="rounded-full bg-slate-900/85 text-white hover:bg-slate-900/85">
              {asset.file_format}
            </Badge>
          </div>
          {isAdmin ? (
            <div
              className={cn(
                "absolute right-3 top-3 z-10 transition-opacity",
                isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={(checked) => onToggleSelect(asset.id, checked === true)}
                aria-label={`${asset.title} auswählen`}
                className="h-5 w-5 rounded border-2 border-white bg-white/90 shadow-sm data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              className="truncate text-left text-base font-semibold text-slate-950 dark:text-slate-50"
              onClick={() => onOpen(asset)}
            >
              {asset.title}
            </button>
            <div className="mt-2">
              <Badge className="rounded-full border border-sky-200 bg-sky-100 text-sky-800 hover:bg-sky-100 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200">
                {customerName}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Hochgeladen von {asset.uploader_name ?? 'Teammitglied'}
            </p>
          </div>
          {isAdmin ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full text-slate-400 opacity-100 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
              onClick={() => onDelete(asset)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-[#172131]">
            <dt className="text-slate-500 dark:text-slate-400">Pixel</dt>
            <dd className="mt-1 font-medium text-slate-900 dark:text-slate-100">
              {asset.width_px} × {asset.height_px}
            </dd>
          </div>
          <div className="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-[#172131]">
            <dt className="text-slate-500 dark:text-slate-400">Verhältnis</dt>
            <dd className="mt-1 font-medium text-slate-900 dark:text-slate-100">
              {formatAspectRatio(asset.width_px, asset.height_px)}
            </dd>
          </div>
          <div className="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-[#172131]">
            <dt className="text-slate-500 dark:text-slate-400">Dateigröße</dt>
            <dd className="mt-1 font-medium text-slate-900 dark:text-slate-100">
              {formatBytes(asset.file_size_bytes)}
            </dd>
          </div>
          <div className="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-[#172131]">
            <dt className="text-slate-500 dark:text-slate-400">
              {asset.media_type === 'video' ? 'Laufzeit' : 'Upload'}
            </dt>
            <dd className="mt-1 font-medium text-slate-900 dark:text-slate-100">
              {asset.media_type === 'video'
                ? formatDuration(asset.duration_seconds)
                : formatDate(asset.created_at)}
            </dd>
          </div>
        </dl>

        {asset.notes ? (
          <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">{asset.notes}</p>
        ) : null}
      </div>
    </article>
  )
}

interface AssetListRowProps {
  asset: AdAsset
  customerName: string
  maxWidthPx: number
  isAdmin: boolean
  isSelected: boolean
  onOpen: (asset: AdAsset) => void
  onDelete: (asset: AdAsset) => void
  onToggleSelect: (assetId: string, checked: boolean) => void
}

function AssetListRow({
  asset,
  customerName,
  maxWidthPx,
  isAdmin,
  isSelected,
  onOpen,
  onDelete,
  onToggleSelect,
}: AssetListRowProps) {
  const previewWidth = Math.max(140, Math.min(240, Math.round(140 + (asset.width_px / maxWidthPx) * 100)))

  return (
    <article className={cn(
      "group flex flex-col gap-4 rounded-[1.5rem] border bg-white p-4 shadow-sm transition-all dark:bg-[#101723] md:flex-row md:items-start",
      isSelected
        ? "border-blue-500 ring-2 ring-blue-500/40 dark:border-blue-400 dark:ring-blue-400/30"
        : "border-slate-200 dark:border-border"
    )}>
      <div
        className="relative overflow-hidden rounded-[1.25rem] bg-slate-100 dark:bg-[#0b1220]"
        style={{
          width: `min(100%, ${previewWidth}px)`,
          aspectRatio: `${asset.width_px} / ${asset.height_px}`,
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          className="h-full w-full"
          onClick={() => onOpen(asset)}
        >
          {asset.media_type === 'image' ? (
            <img src={asset.public_url} alt={asset.title} className="h-full w-full object-cover" />
          ) : (
            <>
              <video
                src={asset.public_url}
                className="h-full w-full object-cover"
                muted
                playsInline
                preload="metadata"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow">
                  <Play className="h-4 w-4 translate-x-0.5 text-slate-900" />
                </div>
              </div>
            </>
          )}
        </button>
        {isAdmin ? (
          <div
            className={cn(
              "absolute left-2 top-2 z-10 transition-opacity",
              isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onToggleSelect(asset.id, checked === true)}
              aria-label={`${asset.title} auswählen`}
              className="h-5 w-5 rounded border-2 border-white bg-white/90 shadow-sm data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
            />
          </div>
        ) : null}
      </div>

      <div className="flex-1 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100 dark:bg-[#172131] dark:text-slate-200">
                {asset.media_type === 'image' ? 'Bild' : 'Video'}
              </Badge>
              <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100 dark:bg-[#172131] dark:text-slate-200">
                {asset.file_format}
              </Badge>
              <Badge className="rounded-full border border-sky-200 bg-sky-100 text-sky-800 hover:bg-sky-100 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200">
                {customerName}
              </Badge>
            </div>
            <button
              type="button"
              className="mt-3 text-left text-base font-semibold text-slate-950 dark:text-slate-50"
              onClick={() => onOpen(asset)}
            >
              {asset.title}
            </button>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Hochgeladen von {asset.uploader_name ?? 'Teammitglied'} · {formatDate(asset.created_at)}
            </p>
          </div>
          {isAdmin ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
              onClick={() => onDelete(asset)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-[#172131]">
            <dt className="text-slate-500 dark:text-slate-400">Pixel</dt>
            <dd className="mt-1 font-medium text-slate-900 dark:text-slate-100">
              {asset.width_px} × {asset.height_px}
            </dd>
          </div>
          <div className="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-[#172131]">
            <dt className="text-slate-500 dark:text-slate-400">Verhältnis</dt>
            <dd className="mt-1 font-medium text-slate-900 dark:text-slate-100">
              {formatAspectRatio(asset.width_px, asset.height_px)}
            </dd>
          </div>
          <div className="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-[#172131]">
            <dt className="text-slate-500 dark:text-slate-400">Dateigröße</dt>
            <dd className="mt-1 font-medium text-slate-900 dark:text-slate-100">
              {formatBytes(asset.file_size_bytes)}
            </dd>
          </div>
          <div className="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-[#172131]">
            <dt className="text-slate-500 dark:text-slate-400">
              {asset.media_type === 'video' ? 'Laufzeit' : 'Mime'}
            </dt>
            <dd className="mt-1 truncate font-medium text-slate-900 dark:text-slate-100">
              {asset.media_type === 'video' ? formatDuration(asset.duration_seconds) : asset.mime_type}
            </dd>
          </div>
        </dl>

        {asset.notes ? (
          <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">{asset.notes}</p>
        ) : null}
      </div>
    </article>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function AdsLibraryWorkspace({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { activeCustomer, customers, refetchCustomers } = useActiveCustomer()
  const actionFromUrl = searchParams.get('action')

  // List state
  const [assets, setAssets] = useState<AdAsset[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('all')
  const [mediaFilter, setMediaFilter] = useState<'all' | 'image' | 'video'>('all')
  const [viewMode, setViewMode] = useState<LibraryViewMode>('grid')
  const debouncedSearch = useDebounce(searchQuery, 300)

  // Upload dialog state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [uploadDialogMode, setUploadDialogMode] = useState<UploadDialogMode>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<UploadMetadata | null>(null)
  const [uploadCustomerId, setUploadCustomerId] = useState<string>('')
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadNotes, setUploadNotes] = useState('')
  const [extractingMetadata, setExtractingMetadata] = useState(false)
  const [savingUpload, setSavingUpload] = useState(false)

  // Customer dialog state
  const [customerForm, setCustomerForm] = useState<CustomerForm>(emptyCustomerForm)
  const [savingCustomer, setSavingCustomer] = useState(false)

  // Delete / detail state
  const [deletingAsset, setDeletingAsset] = useState<AdAsset | null>(null)
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<AdAsset | null>(null)
  const [selectedAssetApproval, setSelectedAssetApproval] = useState<AssetApprovalInfo | null>(null)
  const [downloadingAssetId, setDownloadingAssetId] = useState<string | null>(null)

  const assetIdFromUrl = searchParams.get('assetId')

  useEffect(() => {
    if (!file) {
      setFilePreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
      return
    }
    const objectUrl = URL.createObjectURL(file)
    setFilePreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return objectUrl
    })
    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [file])

  useEffect(() => {
    if (!activeCustomer?.id) return
    setUploadCustomerId((current) => current || activeCustomer.id)
  }, [activeCustomer?.id])

  useEffect(() => {
    setSelectedAssetIds((current) => current.filter((assetId) => assets.some((asset) => asset.id === assetId)))
  }, [assets])

  useEffect(() => {
    if (!assetIdFromUrl) return
    const matchingAsset = assets.find((asset) => asset.id === assetIdFromUrl)
    if (matchingAsset) {
      setSelectedAsset(matchingAsset)
      return
    }

    let cancelled = false

    async function loadAssetById() {
      try {
        const response = await fetch(`/api/tenant/ad-library/${assetIdFromUrl}`)
        if (!response.ok) return
        const payload = await response.json()
        if (cancelled) return
        setSelectedAsset((payload.asset ?? null) as AdAsset | null)
      } catch {
        // ignore optional deep-link fetch
      }
    }

    void loadAssetById()

    return () => {
      cancelled = true
    }
  }, [assetIdFromUrl, assets])

  useEffect(() => {
    if (!selectedAsset) {
      setSelectedAssetApproval(null)
      return
    }

    const asset = selectedAsset
    let cancelled = false

    async function loadApproval() {
      try {
        const params = new URLSearchParams({
          content_type: 'ad_library_asset',
          content_id: asset.id,
        })
        const response = await fetch(`/api/tenant/approvals?${params.toString()}`)
        if (!response.ok) throw new Error('Freigabe konnte nicht geladen werden.')

        const payload = await response.json()
        const first = Array.isArray(payload.approvals) ? payload.approvals[0] : null

        if (cancelled) return

        if (!first) {
          setSelectedAssetApproval({
            status: asset.approval_status ?? 'draft',
            link: null,
            feedback: null,
            history: [],
          })
          return
        }

        setSelectedAssetApproval({
          status: first.status as ApprovalStatus,
          link: `${window.location.origin}/approval/${first.public_token}`,
          feedback: first.feedback ?? null,
          history: Array.isArray(first.history) ? first.history : [],
        })
      } catch {
        if (cancelled) return
        setSelectedAssetApproval({
          status: asset.approval_status ?? 'draft',
          link: null,
          feedback: null,
          history: [],
        })
      }
    }

    void loadApproval()

    return () => {
      cancelled = true
    }
  }, [selectedAsset])

  const loadAssets = useCallback(
    async (signal?: AbortSignal, appendOffset = 0) => {
      const activeFilterCustomerId = selectedCustomerId || 'all'
      const isFreshLoad = appendOffset === 0

      const cached =
        isFreshLoad && !debouncedSearch.trim()
          ? readSessionCache<{ assets: AdAsset[]; total: number }>(
              cacheKey(activeFilterCustomerId, mediaFilter)
            )
          : null

      if (cached && isFreshLoad) {
        setAssets(cached.assets)
        setTotal(cached.total)
        setLoading(false)
      } else if (isFreshLoad) {
        setLoading(true)
      } else {
        setLoadingMore(true)
      }

      try {
        const params = new URLSearchParams()
        if (activeFilterCustomerId !== 'all') params.set('customer_id', activeFilterCustomerId)
        if (mediaFilter !== 'all') params.set('media_type', mediaFilter)
        if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
        params.set('offset', String(appendOffset))
        params.set('limit', String(PAGE_SIZE))

        const response = await fetch(
          `/api/tenant/ad-library${params.toString() ? `?${params}` : ''}`,
          { signal }
        )

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error || 'Ads konnten nicht geladen werden.')
        }

        const payload = await response.json()
        const nextAssets = (payload.assets ?? []) as AdAsset[]
        const nextTotal = (payload.total ?? nextAssets.length) as number

        setTotal(nextTotal)

        if (appendOffset > 0) {
          setAssets((prev) => [...prev, ...nextAssets])
        } else {
          setAssets(nextAssets)
          if (!debouncedSearch.trim()) {
            writeSessionCache(cacheKey(activeFilterCustomerId, mediaFilter), {
              assets: nextAssets,
              total: nextTotal,
            })
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        toast.error(error instanceof Error ? error.message : 'Ads konnten nicht geladen werden.')
        if (isFreshLoad) setAssets([])
      } finally {
        if (isFreshLoad) {
          setLoading(false)
        } else {
          setLoadingMore(false)
        }
      }
    },
    [mediaFilter, debouncedSearch, selectedCustomerId]
  )

  useEffect(() => {
    setOffset(0)
    const controller = new AbortController()
    void loadAssets(controller.signal, 0)
    return () => controller.abort()
  }, [loadAssets])

  const handleLoadMore = useCallback(async () => {
    const nextOffset = offset + PAGE_SIZE
    setOffset(nextOffset)
    await loadAssets(undefined, nextOffset)
  }, [loadAssets, offset])

  const customerMap = useMemo(() => {
    return new Map(customers.map((customer) => [customer.id, customer]))
  }, [customers])

  const metrics = useMemo(() => {
    const imageCount = assets.filter((asset) => asset.media_type === 'image').length
    const videoCount = assets.filter((asset) => asset.media_type === 'video').length
    const totalSize = assets.reduce((sum, asset) => sum + asset.file_size_bytes, 0)
    return { total: assets.length, imageCount, videoCount, totalSize }
  }, [assets])

  const maxWidthPx = useMemo(() => {
    return assets.reduce((current, asset) => Math.max(current, asset.width_px), 1)
  }, [assets])

  const resetUploadDialog = useCallback(() => {
    const shouldClearAction = searchParams.get('action') === 'upload'
    setFile(null)
    setMetadata(null)
    setUploadTitle('')
    setUploadNotes('')
    setUploadDialogMode('upload')
    setCustomerForm(emptyCustomerForm)
    setExtractingMetadata(false)
    setSavingUpload(false)
    setUploadDialogOpen(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (shouldClearAction) {
      startTransition(() => {
        router.replace('/tools/ads-library', { scroll: false })
      })
    }
  }, [router, searchParams])

  const openCreateCustomerDialog = useCallback(() => {
    setCustomerForm(emptyCustomerForm)
    setUploadDialogOpen(true)
    setUploadDialogMode('customer')
  }, [])

  const closeCreateCustomerDialog = useCallback(() => {
    if (savingCustomer) return
    setCustomerForm(emptyCustomerForm)
    setUploadDialogMode('upload')
  }, [savingCustomer])

  const handleFileSelect = useCallback(async (nextFile: File | null) => {
    setFile(nextFile)
    setMetadata(null)
    if (!nextFile) return

    setExtractingMetadata(true)
    try {
      const nextMetadata = await readMetadata(nextFile)
      setMetadata(nextMetadata)
      setUploadTitle(baseTitleFromFilename(nextFile.name))
    } catch (error) {
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      toast.error(error instanceof Error ? error.message : 'Metadaten konnten nicht gelesen werden.')
    } finally {
      setExtractingMetadata(false)
    }
  }, [])

  const handleUpload = useCallback(async () => {
    if (!file || !metadata) {
      toast.error('Bitte wähle zuerst eine Bild- oder Videodatei aus.')
      return
    }
    if (!uploadCustomerId) {
      toast.error('Bitte ordne die Anzeige einem Kunden zu.')
      return
    }

    setSavingUpload(true)
    try {
      const formData = new FormData()
      formData.set('file', file)
      formData.set('customer_id', uploadCustomerId)
      formData.set('title', uploadTitle.trim() || baseTitleFromFilename(file.name))
      formData.set('notes', uploadNotes.trim())
      formData.set('width_px', String(metadata.widthPx))
      formData.set('height_px', String(metadata.heightPx))
      formData.set('duration_seconds', String(metadata.durationSeconds ?? ''))
      formData.set('file_size_bytes', String(metadata.fileSizeBytes))

      const response = await fetch('/api/tenant/ad-library', { method: 'POST', body: formData })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Anzeige konnte nicht hochgeladen werden.')
      }

      toast.success('Anzeige wurde zur Bibliothek hinzugefügt.')
      invalidateAdLibraryCache(uploadCustomerId)
      resetUploadDialog()
      await loadAssets(undefined, 0)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Anzeige konnte nicht hochgeladen werden.')
    } finally {
      setSavingUpload(false)
    }
  }, [file, loadAssets, metadata, resetUploadDialog, uploadCustomerId, uploadNotes, uploadTitle])

  const handleCreateCustomer = useCallback(async () => {
    if (!customerForm.name.trim()) {
      toast.error('Bitte gib einen Kundennamen ein.')
      return
    }

    if (!customerForm.industry) {
      toast.error('Bitte wähle eine Branche aus.')
      return
    }

    setSavingCustomer(true)
    try {
      const response = await fetch('/api/tenant/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: customerForm.name.trim(),
          domain: customerForm.domain.trim() || null,
          industry: customerForm.industry,
          status: customerForm.status,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Kunde konnte nicht angelegt werden.')
      }

      const payload = await response.json()
      await refetchCustomers()
      const newCustomerId = payload.customer?.id as string | undefined
      if (newCustomerId) {
        setSelectedCustomerId(newCustomerId)
        setUploadCustomerId(newCustomerId)
      }
      setCustomerForm(emptyCustomerForm)
      setUploadDialogMode('upload')
      toast.success('Kunde wurde angelegt.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Kunde konnte nicht angelegt werden.')
    } finally {
      setSavingCustomer(false)
    }
  }, [customerForm.domain, customerForm.industry, customerForm.name, customerForm.status, refetchCustomers])

  const handleUploadCustomerChange = useCallback(
    (value: string) => {
      if (value === CREATE_CUSTOMER_SELECT_VALUE) {
        openCreateCustomerDialog()
        return
      }
      setUploadCustomerId(value)
    },
    [openCreateCustomerDialog]
  )

  const toggleAssetSelection = useCallback((assetId: string, checked: boolean) => {
    setSelectedAssetIds((current) => {
      if (checked) {
        return current.includes(assetId) ? current : [...current, assetId]
      }
      return current.filter((id) => id !== assetId)
    })
  }, [])

  const handleDeleteAsset = useCallback(async () => {
    if (!deletingAsset) return

    const targets = selectedAssetIds.includes(deletingAsset.id)
      ? assets.filter((asset) => selectedAssetIds.includes(asset.id))
      : [deletingAsset]

    setDeleting(true)
    try {
      for (const target of targets) {
        const response = await fetch(`/api/tenant/ad-library/${target.id}`, {
          method: 'DELETE',
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error || 'Anzeige konnte nicht gelöscht werden.')
        }
      }

      toast.success(targets.length === 1 ? 'Anzeige wurde entfernt.' : `${targets.length} Anzeigen wurden entfernt.`)
      for (const customerId of new Set(targets.map((asset) => asset.customer_id))) {
        invalidateAdLibraryCache(customerId)
      }
      if (selectedAsset && targets.some((asset) => asset.id === selectedAsset.id)) {
        setSelectedAsset(null)
        setSelectedAssetApproval(null)
      }
      setSelectedAssetIds((current) => current.filter((assetId) => !targets.some((asset) => asset.id === assetId)))
      setDeletingAsset(null)
      await loadAssets(undefined, 0)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Anzeige konnte nicht gelöscht werden.')
    } finally {
      setDeleting(false)
    }
  }, [assets, deletingAsset, loadAssets, selectedAsset, selectedAssetIds])

  const handleDownloadAsset = useCallback(async (asset: AdAsset) => {
    setDownloadingAssetId(asset.id)
    try {
      const response = await fetch(asset.public_url)
      if (!response.ok) throw new Error('Datei konnte nicht geladen werden.')

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const safeTitle =
        asset.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'ad'
      link.href = objectUrl
      link.download = `${safeTitle}.${asset.file_format.toLowerCase()}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(objectUrl)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Download konnte nicht gestartet werden.')
    } finally {
      setDownloadingAssetId(null)
    }
  }, [])

  const openAssetDetail = useCallback((asset: AdAsset) => {
    setSelectedAsset(asset)
    const params = new URLSearchParams(searchParams.toString())
    params.set('assetId', asset.id)
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [router, searchParams])

  const customerOptions = customers.filter((customer) => customer.status === 'active')

  useEffect(() => {
    if (actionFromUrl !== 'upload' || uploadDialogOpen) return

    if (customerOptions.length === 0) {
      if (isAdmin) {
        openCreateCustomerDialog()
      } else {
        toast.error('Es gibt noch keinen aktiven Kunden für einen Upload.')
        router.replace('/tools/ads-library', { scroll: false })
      }
      return
    }

    setUploadDialogMode('upload')
    setUploadDialogOpen(true)
  }, [actionFromUrl, customerOptions.length, isAdmin, openCreateCustomerDialog, router, uploadDialogOpen])
  const hasMore = assets.length < total
  const allVisibleSelected = assets.length > 0 && assets.every((asset) => selectedAssetIds.includes(asset.id))
  const selectedVisibleCount = assets.filter((asset) => selectedAssetIds.includes(asset.id)).length

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
        <Card className="rounded-[1.75rem] border-slate-100 dark:border-border dark:bg-card">
          <CardContent className="flex items-center justify-between px-5 py-5">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Gesamt</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-50">
                {metrics.total}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-3 dark:bg-secondary">
              <Grid2x2 className="h-5 w-5 text-slate-600 dark:text-slate-300" />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[1.75rem] border-slate-100 dark:border-border dark:bg-card">
          <CardContent className="flex items-center justify-between px-5 py-5">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Bilder</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-50">
                {metrics.imageCount}
              </p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-3 dark:bg-emerald-950/30">
              <FileImage className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[1.75rem] border-slate-100 dark:border-border dark:bg-card">
          <CardContent className="flex items-center justify-between px-5 py-5">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Videos</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-50">
                {metrics.videoCount}
              </p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-3 dark:bg-amber-950/30">
              <Clapperboard className="h-5 w-5 text-amber-600 dark:text-amber-300" />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[1.75rem] border-slate-100 dark:border-border dark:bg-card">
          <CardContent className="flex items-center justify-between px-5 py-5">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Speicher</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-50">
                {formatBytes(metrics.totalSize)}
              </p>
            </div>
            <div className="rounded-2xl bg-violet-50 p-3 dark:bg-violet-950/30">
              <HardDrive className="h-5 w-5 text-violet-600 dark:text-violet-300" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Library */}
      <Card className="rounded-2xl border-slate-100 shadow-soft dark:border-border dark:bg-card">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-xl text-slate-950 dark:text-slate-50">
                Mediathek pro Kunde
              </CardTitle>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                Hinterlege Bild- und Videoanzeigen je Kunde. Dateiformat, Auflösung, Größe und
                Videolänge werden automatisch erkannt.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="dark"
                onClick={() => {
                  if (customerOptions.length === 0) {
                    toast.error('Lege zuerst einen Kunden an, bevor du Ads hochlädst.')
                    return
                  }
                  setUploadDialogOpen(true)
                }}
              >
                <Upload className="mr-2 h-4 w-4" />
                Anzeige hochladen
              </Button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_220px_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Titel der Anzeige suchen..."
                className="rounded-full pl-10"
              />
            </div>
            <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
              <SelectTrigger className="rounded-full">
                <SelectValue placeholder="Kunde wählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Kunden</SelectItem>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={mediaFilter}
              onValueChange={(value) => setMediaFilter(value as 'all' | 'image' | 'video')}
            >
              <SelectTrigger className="rounded-full">
                <SelectValue placeholder="Medientyp" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Medien</SelectItem>
                <SelectItem value="image">Nur Bilder</SelectItem>
                <SelectItem value="video">Nur Videos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-end">
            <div className="flex flex-wrap items-center justify-end gap-2">
              {isAdmin && assets.length > 0 ? (
                <>
                  <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm dark:border-border dark:bg-[#101723]">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={(checked) =>
                        setSelectedAssetIds(checked === true ? assets.map((asset) => asset.id) : [])
                      }
                      aria-label="Alle sichtbaren Anzeigen auswählen"
                    />
                    <span className="text-slate-600 dark:text-slate-300">
                      {selectedVisibleCount > 0 ? `${selectedVisibleCount} ausgewählt` : 'Alle wählen'}
                    </span>
                  </div>
                  {selectedVisibleCount > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900/40 dark:hover:bg-red-950/30"
                      disabled={deleting}
                      onClick={() => {
                        const firstSelected = assets.find((asset) => selectedAssetIds.includes(asset.id))
                        if (firstSelected) setDeletingAsset(firstSelected)
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {selectedVisibleCount === 1 ? 'Löschen' : `${selectedVisibleCount} löschen`}
                    </Button>
                  ) : null}
                </>
              ) : null}
              <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 dark:border-border dark:bg-[#101723]">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  'rounded-full px-4',
                  viewMode === 'grid'
                    ? 'bg-slate-900 text-white hover:bg-slate-900 hover:text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-100'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                )}
                onClick={() => setViewMode('grid')}
              >
                <Grid2x2 className="mr-2 h-4 w-4" />
                Raster
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  'rounded-full px-4',
                  viewMode === 'list'
                    ? 'bg-slate-900 text-white hover:bg-slate-900 hover:text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-100'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                )}
                onClick={() => setViewMode('list')}
              >
                <List className="mr-2 h-4 w-4" />
                Liste
              </Button>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-72 animate-pulse rounded-[1.5rem] bg-slate-100 dark:bg-secondary"
                />
              ))}
            </div>
          ) : customers.length === 0 ? (
            <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center dark:border-border dark:bg-card">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Noch keine Kunden angelegt
              </h3>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                Die Ads-Bibliothek organisiert Anzeigen immer je Kunde. Lege zuerst einen Kunden an
                und lade danach Bilder oder Videos hoch.
              </p>
              {isAdmin ? (
                <Button
                  className="mt-5 rounded-full"
                  onClick={openCreateCustomerDialog}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Ersten Kunden anlegen
                </Button>
              ) : null}
            </div>
          ) : assets.length === 0 ? (
            <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center dark:border-border dark:bg-card">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Keine Anzeigen gefunden
              </h3>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                Passe Filter an oder lade neue Ads hoch. Die Vorschau skaliert ihre Kacheln anhand
                der echten Pixelbreite und des Formats.
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {assets.map((asset) => (
                  <AssetGridCard
                    key={asset.id}
                    asset={asset}
                    customerName={customerMap.get(asset.customer_id)?.name ?? 'Unbekannter Kunde'}
                    isAdmin={isAdmin}
                    isSelected={selectedAssetIds.includes(asset.id)}
                    onOpen={openAssetDetail}
                    onDelete={setDeletingAsset}
                    onToggleSelect={toggleAssetSelection}
                  />
                ))}
              </div>
              {hasMore ? (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    className="rounded-full"
                    disabled={loadingMore}
                    onClick={() => void handleLoadMore()}
                  >
                    {loadingMore ? 'Lädt...' : `${total - assets.length} weitere laden`}
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="space-y-4">
                {assets.map((asset) => (
                  <AssetListRow
                    key={asset.id}
                    asset={asset}
                    customerName={customerMap.get(asset.customer_id)?.name ?? 'Unbekannter Kunde'}
                    maxWidthPx={maxWidthPx}
                    isAdmin={isAdmin}
                    isSelected={selectedAssetIds.includes(asset.id)}
                    onOpen={openAssetDetail}
                    onDelete={setDeletingAsset}
                    onToggleSelect={toggleAssetSelection}
                  />
                ))}
              </div>
              {hasMore ? (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    className="rounded-full"
                    disabled={loadingMore}
                    onClick={() => void handleLoadMore()}
                  >
                    {loadingMore ? 'Lädt...' : `${total - assets.length} weitere laden`}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {/* Upload dialog */}
      <Dialog
        open={uploadDialogOpen}
        onOpenChange={(open) => { if (open) { setUploadDialogOpen(true) } else if (!savingUpload) { resetUploadDialog() } }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {uploadDialogMode === 'customer' ? 'Neuen Kunden anlegen' : 'Anzeige hochladen'}
            </DialogTitle>
          </DialogHeader>

          {uploadDialogMode === 'customer' ? (
            <>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="customer-name">Name *</Label>
                  <Input
                    id="customer-name"
                    value={customerForm.name}
                    onChange={(event) =>
                      setCustomerForm((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Kundenname"
                    disabled={savingCustomer}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer-domain">Website</Label>
                  <Input
                    id="customer-domain"
                    value={customerForm.domain}
                    onChange={(event) =>
                      setCustomerForm((current) => ({ ...current, domain: event.target.value }))
                    }
                    placeholder="https://beispiel.de"
                    disabled={savingCustomer}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer-industry">Branche *</Label>
                  <Select
                    value={customerForm.industry}
                    onValueChange={(value) =>
                      setCustomerForm((current) => ({ ...current, industry: value }))
                    }
                  >
                    <SelectTrigger id="customer-industry" disabled={savingCustomer}>
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
                  <Label htmlFor="customer-status">Status</Label>
                  <Select
                    value={customerForm.status}
                    onValueChange={(value) =>
                      setCustomerForm((current) => ({
                        ...current,
                        status: value as 'active' | 'paused',
                      }))
                    }
                  >
                    <SelectTrigger id="customer-status" disabled={savingCustomer}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Aktiv</SelectItem>
                      <SelectItem value="paused">Pausiert</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:justify-end">
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={closeCreateCustomerDialog}
                  disabled={savingCustomer}
                >
                  Zurück
                </Button>
                <Button
                  className="rounded-full"
                  disabled={savingCustomer}
                  onClick={() => void handleCreateCustomer()}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {savingCustomer ? 'Speichern...' : 'Kunde speichern'}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="ad-file">Datei</Label>
                    <Input
                      ref={fileInputRef}
                      id="ad-file"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                      onChange={(event) => void handleFileSelect(event.target.files?.[0] ?? null)}
                    />
                    <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                      Unterstützt: JPG, PNG, WebP, GIF, MP4, WebM und MOV. Breite, Höhe,
                      Dateigröße und Laufzeit werden automatisch erkannt.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="ad-customer">Kunde</Label>
                      <Select value={uploadCustomerId} onValueChange={handleUploadCustomerChange}>
                        <SelectTrigger id="ad-customer">
                          <SelectValue placeholder="Kunde auswählen" />
                        </SelectTrigger>
                        <SelectContent>
                          {customerOptions.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              {customer.name}
                            </SelectItem>
                          ))}
                          {isAdmin ? (
                            <>
                              <SelectSeparator />
                              <SelectItem value={CREATE_CUSTOMER_SELECT_VALUE}>
                                + Neuen Kunden anlegen
                              </SelectItem>
                            </>
                          ) : null}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ad-title">Titel</Label>
                      <Input
                        id="ad-title"
                        value={uploadTitle}
                        onChange={(event) => setUploadTitle(event.target.value)}
                        placeholder="z. B. Frühlingskampagne 1080x1350"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ad-notes">Notizen</Label>
                    <Textarea
                      id="ad-notes"
                      value={uploadNotes}
                      onChange={(event) => setUploadNotes(event.target.value)}
                      placeholder="Optional: Kampagne, Hook, CTA oder Produktionshinweise"
                      rows={4}
                    />
                  </div>

                  {filePreviewUrl ? (
                    <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-50 dark:border-border dark:bg-[#0f1726]">
                      <div
                        className={cn(
                          'mx-auto max-h-[360px] overflow-hidden bg-slate-100 dark:bg-[#0b1220]',
                          metadata ? '' : 'min-h-[200px]'
                        )}
                        style={
                          metadata
                            ? { aspectRatio: `${metadata.widthPx} / ${metadata.heightPx}` }
                            : undefined
                        }
                      >
                        {metadata?.mediaType === 'image' ? (
                          <img
                            src={filePreviewUrl}
                            alt="Vorschau"
                            className="h-full w-full object-contain"
                          />
                        ) : metadata?.mediaType === 'video' ? (
                          <video
                            src={filePreviewUrl}
                            className="h-full w-full object-contain"
                            controls
                            muted
                            playsInline
                          />
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 dark:border-border dark:bg-card">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Automatische Asset-Daten
                  </h3>
                  <div className="mt-4 space-y-3 text-sm">
                    {[
                      {
                        label: 'Typ',
                        value: extractingMetadata
                          ? 'Wird erkannt...'
                          : metadata?.mediaType === 'video'
                            ? 'Video'
                            : metadata?.mediaType === 'image'
                              ? 'Bild'
                              : 'Noch keine Datei',
                      },
                      { label: 'Format', value: metadata?.fileFormat ?? '-' },
                      {
                        label: 'Auflösung',
                        value: metadata ? `${metadata.widthPx} × ${metadata.heightPx}px` : '-',
                      },
                      {
                        label: 'Verhältnis',
                        value: metadata ? formatAspectRatio(metadata.widthPx, metadata.heightPx) : '-',
                      },
                      {
                        label: 'Dateigröße',
                        value: metadata ? formatBytes(metadata.fileSizeBytes) : '-',
                      },
                      {
                        label: 'Laufzeit',
                        value:
                          metadata?.mediaType === 'video'
                            ? formatDuration(metadata.durationSeconds)
                            : '-',
                      },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-2xl bg-white px-3 py-2 dark:bg-[#172131]">
                        <p className="text-slate-500 dark:text-slate-400">{label}</p>
                        <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:justify-end">
                <Button variant="outline" className="rounded-full" onClick={resetUploadDialog} disabled={savingUpload}>
                  Abbrechen
                </Button>
                <Button
                  className="rounded-full"
                  onClick={() => void handleUpload()}
                  disabled={savingUpload || extractingMetadata || !file || !metadata || !uploadCustomerId}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {savingUpload ? 'Wird gespeichert...' : 'Anzeige speichern'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deletingAsset} onOpenChange={(open) => !open && setDeletingAsset(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Anzeige entfernen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingAsset
                ? `Die Anzeige "${deletingAsset.title}" wird aus der Bibliothek entfernt.`
                : 'Diese Anzeige wird aus der Bibliothek entfernt.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-red-600 text-white hover:bg-red-700"
              onClick={(event) => {
                event.preventDefault()
                void handleDeleteAsset()
              }}
            >
              {deleting ? 'Wird gelöscht...' : 'Löschen'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Asset detail */}
      <Dialog
        open={!!selectedAsset}
        onOpenChange={(open) => {
          if (open) return
          setSelectedAsset(null)
          setSelectedAssetApproval(null)
          const params = new URLSearchParams(searchParams.toString())
          params.delete('assetId')
          router.replace(params.toString() ? `?${params.toString()}` : '/tools/ads-library', { scroll: false })
        }}
      >
        <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden rounded-2xl">
          {selectedAsset ? (
            <>
              <DialogHeader className="shrink-0 pr-10">
                <DialogTitle className="text-left text-xl">{selectedAsset.title}</DialogTitle>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100 dark:bg-[#172131] dark:text-slate-200">
                    {selectedAsset.media_type === 'image' ? 'Bild' : 'Video'}
                  </Badge>
                  <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100 dark:bg-[#172131] dark:text-slate-200">
                    {selectedAsset.file_format}
                  </Badge>
                  <Badge className="rounded-full border border-sky-200 bg-sky-100 text-sky-800 hover:bg-sky-100 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200">
                    {customerMap.get(selectedAsset.customer_id)?.name ?? 'Unbekannter Kunde'}
                  </Badge>
                </div>
                {selectedAssetApproval ? (
                  <div className="pt-1">
                    <ApprovalSubmitPanel
                      contentType="ad_library_asset"
                      contentId={selectedAsset.id}
                      approvalStatus={selectedAssetApproval.status}
                      approvalLink={selectedAssetApproval.link}
                      feedback={selectedAssetApproval.feedback}
                      onStatusChange={(status, link) => {
                        setSelectedAssetApproval((current) => ({
                          status,
                          link: link ?? current?.link ?? null,
                          feedback: status === 'changes_requested' ? current?.feedback ?? null : null,
                          history: current?.history ?? [],
                        }))
                        setAssets((current) =>
                          current.map((asset) =>
                            asset.id === selectedAsset.id ? { ...asset, approval_status: status } : asset
                          )
                        )
                        setSelectedAsset((current) =>
                          current ? { ...current, approval_status: status } : current
                        )
                      }}
                    />
                  </div>
                ) : null}
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,360px)]">
                <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-100 dark:border-border dark:bg-[#0b1220]">
                  <div
                    className="mx-auto"
                    style={{
                      aspectRatio: `${selectedAsset.width_px} / ${selectedAsset.height_px}`,
                    }}
                  >
                    {selectedAsset.media_type === 'image' ? (
                      <img
                        src={selectedAsset.public_url}
                        alt={selectedAsset.title}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <video
                        src={selectedAsset.public_url}
                        className="h-full w-full object-contain"
                        controls
                        playsInline
                        preload="metadata"
                      />
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <div className="rounded-[1.25rem] bg-slate-50 px-4 py-3 dark:bg-[#172131]">
                      <p className="text-sm text-slate-500 dark:text-slate-400">Auflösung</p>
                      <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                        {selectedAsset.width_px} × {selectedAsset.height_px} px
                      </p>
                    </div>
                    <div className="rounded-[1.25rem] bg-slate-50 px-4 py-3 dark:bg-[#172131]">
                      <p className="text-sm text-slate-500 dark:text-slate-400">Seitenverhältnis</p>
                      <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                        {formatAspectRatio(selectedAsset.width_px, selectedAsset.height_px)}
                      </p>
                    </div>
                    <div className="rounded-[1.25rem] bg-slate-50 px-4 py-3 dark:bg-[#172131]">
                      <p className="text-sm text-slate-500 dark:text-slate-400">Dateigröße</p>
                      <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                        {formatBytes(selectedAsset.file_size_bytes)}
                      </p>
                    </div>
                    <div className="rounded-[1.25rem] bg-slate-50 px-4 py-3 dark:bg-[#172131]">
                      <p className="text-sm text-slate-500 dark:text-slate-400">Mime-Type</p>
                      <p className="mt-1 break-all font-medium text-slate-900 dark:text-slate-100">
                        {selectedAsset.mime_type}
                      </p>
                    </div>
                    {selectedAsset.media_type === 'video' ? (
                      <div className="rounded-[1.25rem] bg-slate-50 px-4 py-3 dark:bg-[#172131]">
                        <p className="text-sm text-slate-500 dark:text-slate-400">Laufzeit</p>
                        <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                          {formatDuration(selectedAsset.duration_seconds)}
                        </p>
                      </div>
                    ) : null}
                    <div className="rounded-[1.25rem] bg-slate-50 px-4 py-3 dark:bg-[#172131]">
                      <p className="text-sm text-slate-500 dark:text-slate-400">Hochgeladen am</p>
                      <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                        {formatDate(selectedAsset.created_at)}
                      </p>
                    </div>
                    <div className="rounded-[1.25rem] bg-slate-50 px-4 py-3 dark:bg-[#172131]">
                      <p className="text-sm text-slate-500 dark:text-slate-400">Hochgeladen von</p>
                      <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                        {selectedAsset.uploader_name ?? 'Teammitglied'}
                      </p>
                    </div>
                    <div className="rounded-[1.25rem] bg-slate-50 px-4 py-3 dark:bg-[#172131]">
                      <p className="text-sm text-slate-500 dark:text-slate-400">Zuletzt aktualisiert</p>
                      <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                        {formatDate(selectedAsset.updated_at)}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-[1.25rem] bg-slate-50 px-4 py-3 dark:bg-[#172131]">
                    <p className="text-sm text-slate-500 dark:text-slate-400">Notizen</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                      {selectedAsset.notes || 'Keine zusätzlichen Notizen hinterlegt.'}
                    </p>
                  </div>

                  {selectedAssetApproval?.history.length ? (
                    <div className="rounded-[1.25rem] bg-slate-50 px-4 py-3 dark:bg-[#172131]">
                      <p className="text-sm text-slate-500 dark:text-slate-400">Freigabeverlauf</p>
                      <div className="mt-3 space-y-3">
                        {selectedAssetApproval.history.map((entry) => (
                          <div
                            key={entry.id}
                            className="border-l-2 border-slate-200 pl-3 dark:border-[#2d3847]"
                          >
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              {entry.event_type === 'submitted'
                                ? 'Freigabe angefordert'
                                : entry.event_type === 'resubmitted'
                                  ? 'Freigabe erneut angefordert'
                                  : entry.event_type === 'approved'
                                    ? 'Freigabe erteilt'
                                    : entry.event_type === 'changes_requested'
                                      ? 'Korrektur angefragt'
                                      : 'Inhalt ueberarbeitet'}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {formatDate(entry.created_at)}
                              {entry.actor_label ? ` · ${entry.actor_label}` : ''}
                            </p>
                            {entry.feedback ? (
                              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
                                {entry.feedback}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              </div>

              <DialogFooter className="shrink-0 border-t border-slate-100 pt-4 dark:border-[#1e2d42]">
                <div className="flex w-full items-center justify-between gap-2">
                  {isAdmin ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900/40 dark:hover:bg-red-950/30"
                      onClick={() => setDeletingAsset(selectedAsset)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Löschen
                    </Button>
                  ) : (
                    <span />
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => void handleDownloadAsset(selectedAsset)}
                    disabled={downloadingAssetId === selectedAsset.id}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {downloadingAssetId === selectedAsset.id ? 'Lädt...' : 'Downloaden'}
                  </Button>
                </div>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
