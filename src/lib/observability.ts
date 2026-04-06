type LogContext = Record<string, unknown>
type ServerTimingMetric = {
  name: string
  duration: number
  description?: string
}

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

export function createServerTimer(label: string, baseContext: LogContext = {}) {
  const startedAt = performance.now()
  const marks: ServerTimingMetric[] = []

  function addMark(name: string, startTime: number, description?: string) {
    marks.push({
      name,
      duration: Number((performance.now() - startTime).toFixed(1)),
      description,
    })
  }

  function mark(name: string, description?: string) {
    const markStartedAt = performance.now()
    return () => addMark(name, markStartedAt, description)
  }

  function finish(context: LogContext = {}) {
    const total = Number((performance.now() - startedAt).toFixed(1))
    emit('info', 'ops', `${label}.timing`, {
      ...baseContext,
      ...context,
      duration_ms: total,
      marks,
    })

    return {
      total,
      marks,
    }
  }

  return {
    mark,
    finish,
  }
}

export function applyServerTimingHeaders(
  response: Response,
  timing: ReturnType<ReturnType<typeof createServerTimer>['finish']>
) {
  const serverTiming = [
    `total;dur=${timing.total}`,
    ...timing.marks.map((mark) =>
      mark.description
        ? `${mark.name};dur=${mark.duration};desc="${mark.description}"`
        : `${mark.name};dur=${mark.duration}`
    ),
  ].join(', ')

  response.headers.set('Server-Timing', serverTiming)
  response.headers.set('X-Response-Time', `${timing.total}ms`)
  return response
}
