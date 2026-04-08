'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Check, ExternalLink, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface Notification {
  id: string
  type: string
  title: string
  body: string
  link: string | null
  read_at: string | null
  created_at: string
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Gerade eben'
  if (minutes < 60) return `Vor ${minutes} Min.`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Vor ${hours} Std.`
  const days = Math.floor(hours / 24)
  return `Vor ${days} Tag${days > 1 ? 'en' : ''}`
}

const TYPE_LABELS: Record<string, string> = {
  approval_approved: 'Freigabe erteilt',
  approval_rejected: 'Freigabe abgelehnt',
  approval_requested: 'Freigabe angefragt',
  system: 'System',
}

export function NotificationsHistoryWorkspace({ notifications: initial }: { notifications: Notification[] }) {
  const router = useRouter()
  const [notifications, setNotifications] = useState(initial)
  const [filterRead, setFilterRead] = useState<'all' | 'unread' | 'read'>('all')
  const [filterType, setFilterType] = useState<string>('all')

  const unreadCount = notifications.filter((n) => !n.read_at).length

  const types = Array.from(new Set(notifications.map((n) => n.type)))

  const filtered = notifications.filter((n) => {
    if (filterRead === 'unread' && n.read_at) return false
    if (filterRead === 'read' && !n.read_at) return false
    if (filterType !== 'all' && n.type !== filterType) return false
    return true
  })

  const handleMarkRead = async (id: string) => {
    try {
      await fetch(`/api/tenant/notifications/${id}/read`, { method: 'PATCH' })
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      )
    } catch {
      // silent
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/tenant/notifications/read-all', { method: 'PATCH' })
      setNotifications((prev) =>
        prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() }))
      )
    } catch {
      // silent
    }
  }

  const handleClick = (n: Notification) => {
    if (!n.read_at) void handleMarkRead(n.id)
    if (n.link) router.push(n.link)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <Select value={filterRead} onValueChange={(v) => setFilterRead(v as typeof filterRead)}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="unread">Ungelesen</SelectItem>
              <SelectItem value="read">Gelesen</SelectItem>
            </SelectContent>
          </Select>
          {types.length > 1 && (
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Typen</SelectItem>
                {types.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_LABELS[t] ?? t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {unreadCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {unreadCount} ungelesen
            </Badge>
          )}
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAllRead} className="h-8 text-xs">
              <Check className="mr-1.5 h-3 w-3" />
              Alle gelesen
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
              <Bell className="h-5 w-5 text-slate-400" />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Keine Benachrichtigungen</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-[#252d3a]">
            {filtered.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => handleClick(n)}
                  className={cn(
                    'flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-[#1e2635]/60',
                    !n.read_at && 'bg-blue-50/40 dark:bg-blue-950/20'
                  )}
                >
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                    {n.type === 'approval_approved' ? (
                      <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <ExternalLink className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className={cn(
                        'text-sm',
                        !n.read_at
                          ? 'font-semibold text-slate-900 dark:text-slate-100'
                          : 'font-medium text-slate-600 dark:text-slate-300'
                      )}>
                        {n.title}
                      </p>
                      <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">
                        {formatRelativeTime(n.created_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{n.body}</p>
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                      {TYPE_LABELS[n.type] ?? n.type}
                    </p>
                  </div>
                  {!n.read_at && (
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
