import type { PlatformId } from '@/lib/ad-limits'
import type {
  BriefingData,
  GenerationResult,
  GenerationDetail,
  SelectedAdType,
} from './types'

// ─── API Functions ───────────────────────────────────────────────────────────

export async function apiGenerate(
  briefing: BriefingData,
  platforms: PlatformId[],
  categories: 'social' | 'paid' | 'both',
  selectedAdTypes: SelectedAdType[],
  customerId: string | null
): Promise<{ id: string; result: GenerationResult }> {
  const res = await fetch('/api/tenant/ad-generator/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      briefing: { ...briefing, platforms, categories, selectedAdTypes },
      customerId,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Generierung fehlgeschlagen')
  }
  return res.json()
}

export async function apiGetGeneration(id: string): Promise<GenerationDetail> {
  const res = await fetch(`/api/tenant/ad-generator/${id}`)
  if (!res.ok) throw new Error('Generierung konnte nicht geladen werden')
  const data = await res.json()
  return data.generation
}

export function exportUrl(id: string): string {
  return `/api/tenant/ad-generator/${id}/export`
}
