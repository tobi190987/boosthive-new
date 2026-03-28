import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'

export interface ApiFormPayload {
  error?: string
  details?: Record<string, string[] | undefined>
  message?: string
  redirectTo?: string | null
}

export async function readJsonResponse<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<{ response: Response; payload: T | null }> {
  const response = await fetch(input, init)
  const payload = await readJsonResponse<T>(response)

  return { response, payload }
}

export function getPayloadError(
  payload: Pick<ApiFormPayload, 'error'> | null | undefined,
  fallback: string
) {
  return payload?.error ?? fallback
}

export function applyServerFieldErrors<TFieldValues extends FieldValues>(
  setError: UseFormSetError<TFieldValues>,
  details?: Record<string, string[] | undefined>
) {
  if (!details) {
    return
  }

  for (const [field, messages] of Object.entries(details)) {
    const firstMessage = messages?.[0]
    if (!firstMessage) {
      continue
    }

    setError(field as Path<TFieldValues>, {
      type: 'server',
      message: firstMessage,
    })
  }
}
