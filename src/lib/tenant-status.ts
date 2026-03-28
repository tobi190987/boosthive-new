import type { SupabaseClient } from '@supabase/supabase-js'

export const KNOWN_TENANT_STATUSES = [
  'active',
  'inactive',
  'setup_incomplete',
  'billing_blocked',
  'archived',
] as const

export type TenantStatus = (typeof KNOWN_TENANT_STATUSES)[number]
export const MANUAL_TENANT_STATUSES = ['active', 'inactive'] as const
export type ManualTenantStatus = (typeof MANUAL_TENANT_STATUSES)[number]
export type TenantStatusReason =
  | 'active'
  | 'archived'
  | 'manual_inactive'
  | 'billing_blocked'
  | 'setup_incomplete'
  | 'unknown'
export type TenantLoginBlockReason = 'tenant_inactive' | 'tenant_billing_blocked'

export interface TenantStatusSource {
  status?: string | null
  subscription_status?: string | null
  billing_onboarding_completed_at?: string | null
  archived_at?: string | null
}

export interface TenantStatusResolution {
  baseStatus: TenantStatus | null
  effectiveStatus: TenantStatus
  reason: TenantStatusReason
  allowsLogin: boolean
  blocksProtectedAppAccess: boolean
  loginBlockReason: TenantLoginBlockReason | null
}

export function hasMissingTenantStatusColumnError(error: unknown, column?: string) {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const code = 'code' in error && typeof error.code === 'string' ? error.code : null
  const message = 'message' in error && typeof error.message === 'string' ? error.message : null

  if (code === '42703') {
    return true
  }

  if (code === 'PGRST204' && column) {
    return message?.includes(column) === true
  }

  if (column) {
    return message?.includes(`'${column}'`) === true
  }

  return false
}

export function getErrorMessage(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) {
    return null
  }

  const message =
    'message' in error && typeof error.message === 'string' ? error.message : null

  return message
}

interface TenantStatusLookupResult {
  data: Record<string, unknown> | null
  error: unknown
}

function applyTenantLookupFilter(query: any, lookup: { id?: string; slug?: string }) {
  if (lookup.id) {
    return query.eq('id', lookup.id)
  }

  if (lookup.slug) {
    return query.eq('slug', lookup.slug)
  }

  throw new Error('Tenant lookup requires either id or slug.')
}

export async function loadTenantStatusRecord(
  supabase: SupabaseClient,
  lookup: { id?: string; slug?: string },
  extraColumns: string[] = []
): Promise<TenantStatusLookupResult> {
  const optionalColumns = ['subscription_status', 'billing_onboarding_completed_at', 'archived_at']
  const requestedColumns = Array.from(
    new Set(['id', 'slug', 'status', ...extraColumns, ...optionalColumns])
  )

  let activeColumns = requestedColumns

  while (true) {
    const query = applyTenantLookupFilter(
      supabase.from('tenants').select(activeColumns.join(', ')),
      lookup
    )

    const result: any = await query.maybeSingle()
    const missingColumn = optionalColumns.find(
      (column) =>
        activeColumns.includes(column) && hasMissingTenantStatusColumnError(result.error, column)
    )

    if (!missingColumn) {
      return {
        data: (result.data as Record<string, unknown> | null | undefined) ?? null,
        error: result.error,
      }
    }

    activeColumns = activeColumns.filter((column) => column !== missingColumn)
  }
}

const BILLING_BLOCKING_SUBSCRIPTION_STATUSES = [
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
] as const

export function isTenantStatus(value: string): value is TenantStatus {
  return KNOWN_TENANT_STATUSES.includes(value as TenantStatus)
}

export function isManualTenantStatus(value: string): value is ManualTenantStatus {
  return MANUAL_TENANT_STATUSES.includes(value as ManualTenantStatus)
}

export function normalizeTenantStatus(value: string | null | undefined): TenantStatus | null {
  if (!value) return null
  return isTenantStatus(value) ? value : null
}

export function normalizeManualTenantStatus(value: string | null | undefined): ManualTenantStatus | null {
  if (!value) return null
  return isManualTenantStatus(value) ? value : null
}

export function isBillingBlockedSubscriptionStatus(value: string | null | undefined) {
  if (!value) return false
  return BILLING_BLOCKING_SUBSCRIPTION_STATUSES.includes(
    value as (typeof BILLING_BLOCKING_SUBSCRIPTION_STATUSES)[number]
  )
}

export function resolveTenantStatus(source: TenantStatusSource): TenantStatusResolution {
  const baseStatus = normalizeTenantStatus(source.status)

  if (source.archived_at || baseStatus === 'archived') {
    return {
      baseStatus,
      effectiveStatus: 'archived',
      reason: 'archived',
      allowsLogin: false,
      blocksProtectedAppAccess: true,
      loginBlockReason: 'tenant_inactive',
    }
  }

  if (baseStatus === 'inactive') {
    return {
      baseStatus,
      effectiveStatus: 'inactive',
      reason: 'manual_inactive',
      allowsLogin: false,
      blocksProtectedAppAccess: true,
      loginBlockReason: 'tenant_inactive',
    }
  }

  if (isBillingBlockedSubscriptionStatus(source.subscription_status)) {
    return {
      baseStatus,
      effectiveStatus: 'billing_blocked',
      reason: 'billing_blocked',
      allowsLogin: false,
      blocksProtectedAppAccess: true,
      loginBlockReason: 'tenant_billing_blocked',
    }
  }

  if (!source.billing_onboarding_completed_at) {
    return {
      baseStatus,
      effectiveStatus: 'setup_incomplete',
      reason: 'setup_incomplete',
      allowsLogin: true,
      blocksProtectedAppAccess: false,
      loginBlockReason: null,
    }
  }

  return {
    baseStatus,
    effectiveStatus: 'active',
    reason: baseStatus === null ? 'unknown' : 'active',
    allowsLogin: true,
    blocksProtectedAppAccess: false,
    loginBlockReason: null,
  }
}

export function tenantStatusLabel(status: string | null | undefined) {
  switch (normalizeTenantStatus(status)) {
    case 'active':
      return 'Aktiv'
    case 'inactive':
      return 'Pausiert'
    case 'setup_incomplete':
      return 'Setup unvollständig'
    case 'billing_blocked':
      return 'Billing-Block'
    case 'archived':
      return 'Archiviert'
    default:
      return 'Unbekannt'
  }
}

export function tenantStatusDescription(status: string | null | undefined) {
  switch (normalizeTenantStatus(status)) {
    case 'active':
      return 'Der Tenant ist freigeschaltet und akzeptiert neue Logins.'
    case 'inactive':
      return 'Der Tenant wurde manuell pausiert oder ist fachlich deaktiviert.'
    case 'setup_incomplete':
      return 'Onboarding, Billing-Setup oder Erstkonfiguration sind noch nicht abgeschlossen.'
    case 'billing_blocked':
      return 'Der Tenant ist wegen eines Billing-Problems oder eines gesperrten Abos blockiert.'
    case 'archived':
      return 'Der Tenant wurde archiviert und ist fuer neue Logins sowie geschuetzte Bereiche gesperrt.'
    default:
      return 'Der aktuelle Tenant-Status konnte noch nicht eindeutig eingeordnet werden.'
  }
}

export function tenantStatusBadgeClass(status: string | null | undefined) {
  switch (normalizeTenantStatus(status)) {
    case 'active':
      return 'rounded-full bg-[#eff8f2] text-[#166534] hover:bg-[#eff8f2]'
    case 'inactive':
      return 'rounded-full bg-[#fff4ee] text-[#9f4f2d] hover:bg-[#fff4ee]'
    case 'setup_incomplete':
      return 'rounded-full bg-[#fff8ed] text-[#b85e34] hover:bg-[#fff8ed]'
    case 'billing_blocked':
      return 'rounded-full bg-[#fef2f2] text-[#dc2626] hover:bg-[#fef2f2]'
    case 'archived':
      return 'rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100'
    default:
      return 'rounded-full bg-[#f1f5f9] text-[#64748b] hover:bg-[#f1f5f9]'
  }
}

export function tenantStatusTextClass(status: string | null | undefined) {
  switch (normalizeTenantStatus(status)) {
    case 'active':
      return 'text-emerald-700'
    case 'inactive':
      return 'text-[#b85e34]'
    case 'setup_incomplete':
      return 'text-[#a16207]'
    case 'billing_blocked':
      return 'text-[#dc2626]'
    case 'archived':
      return 'text-slate-700'
    default:
      return 'text-slate-600'
  }
}

export function canOwnerToggleTenantStatus(status: string | null | undefined) {
  const normalized = normalizeTenantStatus(status)
  return normalized === 'active' || normalized === 'inactive'
}

export function nextOwnerToggleTenantStatus(status: string | null | undefined): TenantStatus | null {
  const normalized = normalizeTenantStatus(status)
  if (normalized === 'active') return 'inactive'
  if (normalized === 'inactive') return 'active'
  return null
}

export function ownerToggleTenantStatusLabel(status: string | null | undefined) {
  const normalized = normalizeTenantStatus(status)
  if (normalized === 'active') return 'Pausieren'
  if (normalized === 'inactive') return 'Aktivieren'
  return 'Status prüfen'
}

export function ownerToggleTenantStatusDescription(status: string | null | undefined) {
  const normalized = normalizeTenantStatus(status)
  if (normalized === 'active') {
    return 'Neue Logins werden blockiert. Offene Tenant-Sessions verlieren spaetestens beim naechsten Request den Zugriff auf die Subdomain.'
  }

  if (normalized === 'inactive') {
    return 'Der Tenant akzeptiert danach wieder neue Logins, sofern kein Setup- oder Billing-Blocker aktiv ist.'
  }

  return tenantStatusDescription(normalized)
}
