import { isBillingBlockedSubscriptionStatus } from '@/lib/tenant-status'

export type OwnerBillingAccessState = 'accessible' | 'manual_locked' | 'billing_blocked'
export type OwnerBillingAccessFilter = 'all' | OwnerBillingAccessState

export interface OwnerBillingAccessSource {
  status?: string | null
  subscription_status?: string | null
  owner_locked_at?: string | null
}

export function resolveOwnerBillingAccessState(
  source: OwnerBillingAccessSource
): OwnerBillingAccessState {
  if (source.owner_locked_at || source.status === 'inactive') {
    return 'manual_locked'
  }

  if (isBillingBlockedSubscriptionStatus(source.subscription_status)) {
    return 'billing_blocked'
  }

  return 'accessible'
}

export function normalizeSubscriptionDisplayStatus(status: string | null | undefined) {
  return status === 'inactive' || !status ? 'none' : status
}
