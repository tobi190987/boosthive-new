'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell, Check, ExternalLink } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useRealtimeSubscription } from '@/hooks/use-realtime-subscription'

interface Notification {
  id: string
  type: string
  title: string
  body: string
  link: string | null
  read_at: string | null
  created_at: string
}

interface TenantShellSummaryResponse {
  notifications?: Notification[]
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

export function NotificationBell({ initialNotifications = [] }: { initialNotifications?: Notification[] }) {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications)
  const [open, setOpen] = useState(false)

  const unreadCount = notifications.filter((n) => !n.read_at).length

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/tenant/shell')
      if (!res.ok) return
      const data = (await res.json()) as TenantShellSummaryResponse
      setNotifications(data.notifications ?? [])
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    if (initialNotifications.length === 0) {
      void fetchNotifications()
    }
  }, [fetchNotifications, initialNotifications.length])

  useRealtimeSubscription('notifications', fetchNotifications)

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

  const handleClick = (n: Notification) => {
    if (!n.read_at) handleMarkRead(n.id)
    if (n.link) {
      setOpen(false)
      router.push(n.link)
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          aria-label={`Benachrichtigungen${unreadCount > 0 ? ` (${unreadCount} ungelesen)` : ''}`}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-border">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Benachrichtigungen</p>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              Alle gelesen
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
              Keine Benachrichtigungen
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-[#252d3a]">
              {notifications.slice(0, 10).map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleClick(n)}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-[#1e2635]/60',
                      !n.read_at && 'bg-blue-50/40 dark:bg-blue-950/20'
                    )}
                  >
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                      {n.type === 'approval_approved' ? (
                        <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <ExternalLink className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn(
                        'text-sm',
                        !n.read_at
                          ? 'font-semibold text-slate-900 dark:text-slate-100'
                          : 'font-medium text-slate-600 dark:text-slate-300'
                      )}>
                        {n.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{n.body}</p>
                      <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">{formatRelativeTime(n.created_at)}</p>
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
      </PopoverContent>
    </Popover>
  )
}
