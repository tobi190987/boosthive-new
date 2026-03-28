import { logOperationalError } from '@/lib/observability'
import { createAdminClient } from '@/lib/supabase-admin'

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export type OwnerAuditEventType =
  | 'tenant_created'
  | 'tenant_status_updated'
  | 'tenant_archived'
  | 'tenant_restored'
  | 'tenant_basics_updated'
  | 'tenant_billing_updated'
  | 'tenant_contact_updated'
  | 'tenant_deleted'
  | 'tenant_admin_reassigned'
  | 'tenant_admin_setup_resent'
  | 'tenant_user_deleted'

export interface OwnerAuditLogRecord {
  id: string
  actor_user_id: string | null
  tenant_id: string | null
  target_user_id: string | null
  event_type: OwnerAuditEventType
  context: JsonValue
  created_at: string
}

interface OwnerAuditEntry {
  actorUserId: string
  tenantId?: string | null
  targetUserId?: string | null
  eventType: OwnerAuditEventType
  context?: Record<string, unknown>
}

function isMissingRelationError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '42P01'
  )
}

function sanitizeAuditValue(value: unknown): JsonValue | undefined {
  if (value === undefined) {
    return undefined
  }

  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeAuditValue(entry))
      .filter((entry): entry is JsonValue => entry !== undefined)
  }

  if (typeof value === 'object') {
    const recordValue = value as Record<string, unknown>
    const sanitizedEntries = Object.entries(recordValue).flatMap(([key, entry]) => {
      const normalizedKey = key.toLowerCase()
      if (
        normalizedKey.includes('password') ||
        normalizedKey.includes('token') ||
        normalizedKey.includes('secret') ||
        normalizedKey.includes('action_link')
      ) {
        return []
      }

      const sanitizedValue = sanitizeAuditValue(entry)
      return sanitizedValue === undefined ? [] : ([[key, sanitizedValue]] as const)
    })

    return Object.fromEntries(sanitizedEntries)
  }

  return String(value)
}

export async function recordOwnerAuditLog(entry: OwnerAuditEntry) {
  const supabaseAdmin = createAdminClient()
  const sanitizedContext = sanitizeAuditValue(entry.context ?? {}) ?? {}

  const { error } = await supabaseAdmin.from('owner_audit_logs').insert({
    actor_user_id: entry.actorUserId,
    tenant_id: entry.tenantId ?? null,
    target_user_id: entry.targetUserId ?? null,
    event_type: entry.eventType,
    context: sanitizedContext,
  })

  if (!error) {
    return
  }

  if (isMissingRelationError(error)) {
    logOperationalError('owner_audit_log_table_missing', error, {
      actorUserId: entry.actorUserId,
      tenantId: entry.tenantId ?? null,
      eventType: entry.eventType,
    })
    return
  }

  logOperationalError('owner_audit_log_write_failed', error, {
    actorUserId: entry.actorUserId,
    tenantId: entry.tenantId ?? null,
    eventType: entry.eventType,
  })
}

export async function listOwnerAuditLogsForTenant(tenantId: string, limit = 20) {
  const supabaseAdmin = createAdminClient()
  const { data, error } = await supabaseAdmin
    .from('owner_audit_logs')
    .select('id, actor_user_id, tenant_id, target_user_id, event_type, context, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!error) {
    return data as OwnerAuditLogRecord[]
  }

  if (isMissingRelationError(error)) {
    return []
  }

  throw error
}
