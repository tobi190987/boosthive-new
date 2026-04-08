'use client'

import { useEffect, useRef } from 'react'
import { createBrowserClient } from '@/lib/supabase-browser'

let channelCounter = 0

/**
 * Subscribes to Supabase Realtime postgres_changes for a given table.
 * Calls `onchange` whenever any INSERT/UPDATE/DELETE occurs on the table.
 * Security: actual data is fetched via tenant-scoped API endpoints, not directly.
 */
export function useRealtimeSubscription(table: string, onchange: () => void) {
  const onchangeRef = useRef(onchange)
  onchangeRef.current = onchange
  const channelNameRef = useRef(`realtime:${table}:${++channelCounter}`)

  useEffect(() => {
    const supabase = createBrowserClient()
    const channel = supabase
      .channel(channelNameRef.current)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        onchangeRef.current()
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [table])
}
