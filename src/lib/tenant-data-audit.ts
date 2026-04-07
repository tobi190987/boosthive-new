import { logOperationalError } from '@/lib/observability'
import { createAdminClient } from '@/lib/supabase-admin'

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export type TenantDataAuditAction = 'data_export' | 'data_delete'

export interface TenantDataAuditLogRecord {
  id: string
  tenant_id: string
  actor_user_id: string | null
  action_type: TenantDataAuditAction
  resource_type: string
  resource_id: string | null
  context: JsonValue
  created_at: string
}

interface TenantDataAuditEntry {
  tenantId: string
  actorUserId: string
  actionType: TenantDataAuditAction
  resourceType: string
  resourceId?: string | null
  context?: Record<string, unknown>
}

function isMissingRelationError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '42P01'
}

function sanitizeAuditValue(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined
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
        normalizedKey.includes('authorization')
      ) {
        return []
      }

      const sanitized = sanitizeAuditValue(entry)
      return sanitized === undefined ? [] : ([[key, sanitized]] as const)
    })

    return Object.fromEntries(sanitizedEntries)
  }

  return String(value)
}

export async function recordTenantDataAuditLog(entry: TenantDataAuditEntry) {
  const supabaseAdmin = createAdminClient()
  const sanitizedContext = sanitizeAuditValue(entry.context ?? {}) ?? {}

  const { error } = await supabaseAdmin.from('tenant_data_audit_logs').insert({
    tenant_id: entry.tenantId,
    actor_user_id: entry.actorUserId,
    action_type: entry.actionType,
    resource_type: entry.resourceType,
    resource_id: entry.resourceId ?? null,
    context: sanitizedContext,
  })

  if (!error) return

  if (isMissingRelationError(error)) {
    logOperationalError('tenant_data_audit_log_table_missing', error, {
      tenantId: entry.tenantId,
      actorUserId: entry.actorUserId,
      actionType: entry.actionType,
      resourceType: entry.resourceType,
    })
    return
  }

  logOperationalError('tenant_data_audit_log_write_failed', error, {
    tenantId: entry.tenantId,
    actorUserId: entry.actorUserId,
    actionType: entry.actionType,
    resourceType: entry.resourceType,
  })
}

export async function listTenantDataAuditLogs(tenantId: string, limit = 100) {
  const supabaseAdmin = createAdminClient()
  const { data, error } = await supabaseAdmin
    .from('tenant_data_audit_logs')
    .select('id, tenant_id, actor_user_id, action_type, resource_type, resource_id, context, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!error) {
    return (data ?? []) as TenantDataAuditLogRecord[]
  }

  if (isMissingRelationError(error)) {
    return []
  }

  throw error
}
