export const MARKETING_DASHBOARD_REFRESH_EVENT = 'marketing-dashboard-refresh'
export const MARKETING_DASHBOARD_REFRESH_STORAGE_KEY = 'marketing-dashboard:refresh'

export interface MarketingDashboardRefreshPayload {
  customerId: string
  at: number
}

export function triggerMarketingDashboardRefresh(customerId: string) {
  if (typeof window === 'undefined') return

  const payload: MarketingDashboardRefreshPayload = {
    customerId,
    at: Date.now(),
  }

  window.localStorage.setItem(
    MARKETING_DASHBOARD_REFRESH_STORAGE_KEY,
    JSON.stringify(payload)
  )
  window.dispatchEvent(
    new CustomEvent<MarketingDashboardRefreshPayload>(MARKETING_DASHBOARD_REFRESH_EVENT, {
      detail: payload,
    })
  )
}

export function readMarketingDashboardRefreshPayload(
  raw: string | null
): MarketingDashboardRefreshPayload | null {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<MarketingDashboardRefreshPayload>
    if (typeof parsed.customerId !== 'string' || typeof parsed.at !== 'number') {
      return null
    }

    return {
      customerId: parsed.customerId,
      at: parsed.at,
    }
  } catch {
    return null
  }
}
