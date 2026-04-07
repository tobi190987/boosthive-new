'use client'

import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Clock, MessageSquare, FileEdit } from 'lucide-react'

export type ApprovalStatus = 'draft' | 'pending_approval' | 'approved' | 'changes_requested'

const STATUS_CONFIG: Record<ApprovalStatus, {
  label: string
  icon: typeof Clock
  className: string
}> = {
  draft: {
    label: 'Entwurf',
    icon: FileEdit,
    className: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400',
  },
  pending_approval: {
    label: 'Warte auf Freigabe',
    icon: Clock,
    className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-400',
  },
  approved: {
    label: 'Freigegeben',
    icon: CheckCircle2,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400',
  },
  changes_requested: {
    label: 'Korrektur angefragt',
    icon: MessageSquare,
    className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400',
  },
}

interface ApprovalStatusBadgeProps {
  status: ApprovalStatus
  className?: string
}

export function ApprovalStatusBadge({ status, className }: ApprovalStatusBadgeProps) {
  const config = STATUS_CONFIG[status]
  const Icon = config.icon

  return (
    <Badge
      variant="outline"
      className={`rounded-full gap-1.5 ${config.className} ${className ?? ''}`}
    >
      <Icon className="h-4 w-4" />
      {config.label}
    </Badge>
  )
}
