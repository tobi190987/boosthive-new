'use client'

import { useState } from 'react'
import { Check, Copy, Loader2, RefreshCw, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { ApprovalStatusBadge, type ApprovalStatus } from '@/components/approval-status-badge'

interface ApprovalSubmitPanelProps {
  contentType: 'content_brief' | 'ad_generation'
  contentId: string
  approvalStatus: ApprovalStatus
  approvalLink?: string | null
  feedback?: string | null
  onStatusChange?: (newStatus: ApprovalStatus, link?: string) => void
}

export function ApprovalSubmitPanel({
  contentType,
  contentId,
  approvalStatus,
  approvalLink,
  feedback,
  onStatusChange,
}: ApprovalSubmitPanelProps) {
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleSubmitForApproval = async () => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/tenant/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_type: contentType, content_id: contentId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Freigabe konnte nicht eingereicht werden.')
      }
      const data = await res.json()
      toast({ title: 'Eingereicht', description: 'Freigabe-Link wurde generiert.' })
      onStatusChange?.('pending_approval', data.approval_link)
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'Unbekannter Fehler',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleResubmit = async () => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/tenant/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_type: contentType, content_id: contentId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Erneute Einreichung fehlgeschlagen.')
      }
      const data = await res.json()
      toast({ title: 'Erneut eingereicht', description: 'Freigabe-Status wurde zurückgesetzt.' })
      onStatusChange?.('pending_approval', data.approval_link)
    } catch (err) {
      toast({
        title: 'Fehler',
        description: err instanceof Error ? err.message : 'Unbekannter Fehler',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleCopy = async () => {
    if (!approvalLink) return
    try {
      await navigator.clipboard.writeText(approvalLink)
      setCopied(true)
      toast({ title: 'Kopiert', description: 'Freigabe-Link wurde kopiert.' })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ title: 'Fehler', description: 'Link konnte nicht kopiert werden.', variant: 'destructive' })
    }
  }

  // Draft: show submit button
  if (approvalStatus === 'draft') {
    return (
      <div className="flex items-center gap-3">
        <ApprovalStatusBadge status={approvalStatus} />
        <Button
          variant="outline"
          size="sm"
          onClick={handleSubmitForApproval}
          disabled={submitting}
          className="gap-2 rounded-full"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Zur Freigabe einreichen
        </Button>
      </div>
    )
  }

  // Approved: show badge only, no further actions
  if (approvalStatus === 'approved') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <ApprovalStatusBadge status={approvalStatus} />
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Dieses Element wurde bereits freigegeben.
          </span>
        </div>
        {approvalLink && (
          <div className="flex items-center gap-2">
            <Input
              value={approvalLink}
              readOnly
              className="rounded-xl text-xs font-mono"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="shrink-0 gap-2 rounded-full"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Kopiert' : 'Kopieren'}
            </Button>
          </div>
        )}
      </div>
    )
  }

  // Changes requested: show feedback + resubmit
  if (approvalStatus === 'changes_requested') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <ApprovalStatusBadge status={approvalStatus} />
        </div>
        {feedback && (
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-950/30">
            <p className="mb-1 text-xs font-semibold text-orange-700 dark:text-orange-400">Kunden-Feedback:</p>
            <p className="text-sm text-orange-800 dark:text-orange-300 whitespace-pre-wrap">{feedback}</p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResubmit}
            disabled={submitting}
            className="gap-2 rounded-full"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Überarbeiten & erneut einreichen
          </Button>
          {approvalLink && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="shrink-0 gap-2 rounded-full"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Kopiert' : 'Link kopieren'}
            </Button>
          )}
        </div>
      </div>
    )
  }

  // Pending approval: show link + badge
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <ApprovalStatusBadge status={approvalStatus} />
        <span className="text-sm text-slate-500 dark:text-slate-400">
          Wartet auf Kunden-Entscheidung
        </span>
      </div>
      {approvalLink && (
        <div className="flex items-center gap-2">
          <Input
            value={approvalLink}
            readOnly
            className="rounded-xl text-xs font-mono"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="shrink-0 gap-2 rounded-full"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Kopiert' : 'Kopieren'}
          </Button>
        </div>
      )}
    </div>
  )
}
