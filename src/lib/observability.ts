type LogContext = Record<string, unknown>

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return error
}

function emit(
  level: 'info' | 'warn' | 'error',
  channel: 'audit' | 'security' | 'ops',
  event: string,
  context: LogContext = {}
) {
  console[level](`[${channel}] ${event}`, {
    timestamp: new Date().toISOString(),
    ...context,
  })
}

export function logAudit(event: string, context: LogContext = {}) {
  emit('info', 'audit', event, context)
}

export function logSecurity(event: string, context: LogContext = {}) {
  emit('warn', 'security', event, context)
}

export function logOperationalError(scope: string, error: unknown, context: LogContext = {}) {
  emit('error', 'ops', scope, {
    ...context,
    error: serializeError(error),
  })
}
