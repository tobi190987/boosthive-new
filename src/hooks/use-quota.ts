'use client'

import { useEffect, useState } from 'react'
import type { QuotaMetric } from '@/lib/usage-limits'

export interface QuotaState {
  current: number
  limit: number
  reset_at: string
  loading: boolean
}

export function useQuota(metric: QuotaMetric): QuotaState {
  const [state, setState] = useState<QuotaState>({ current: 0, limit: 0, reset_at: '', loading: true })

  useEffect(() => {
    fetch(`/api/tenant/usage-quota?metric=${metric}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data.current === 'number') {
          setState({ current: data.current, limit: data.limit, reset_at: data.reset_at, loading: false })
        }
      })
      .catch(() => setState((prev) => ({ ...prev, loading: false })))
  }, [metric])

  return state
}
