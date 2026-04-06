import type { PlatformId } from '@/lib/ad-limits'
import type { ApprovalStatus } from '@/components/approval-status-badge'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BriefingData {
  product: string
  audience: string
  goal: 'awareness' | 'conversion' | 'traffic' | ''
  usp: string
  tone: 'professional' | 'casual' | 'emotional' | ''
}

export interface SelectedAdType {
  platformId: PlatformId
  adTypeId: string
}

/** A single text field value in the result */
export type FieldValue = string | string[]

/** One variant of an ad type: field name -> text(s) */
export type VariantFields = Record<string, FieldValue>

/** An ad type result: variant 1-3 */
export interface AdTypeResult {
  variants: [VariantFields, VariantFields, VariantFields]
}

/** Platform results: adTypeId -> result */
export type PlatformResult = Record<string, AdTypeResult>

/** Full generation result: platformId -> platform result */
export type GenerationResult = Record<string, PlatformResult>

export interface ApprovalInfo {
  status: ApprovalStatus
  link: string | null
  feedback: string | null
  history: Array<{
    id: string
    event_type: 'submitted' | 'resubmitted' | 'approved' | 'changes_requested' | 'content_updated'
    feedback: string | null
    actor_label: string | null
    created_at: string
  }>
}

export interface GenerationSummary {
  id: string
  product: string
  platforms: PlatformId[]
  customer_id: string | null
  customer_name: string | null
  created_at: string
  status: 'pending' | 'completed' | 'failed'
  approval_status: ApprovalStatus | 'draft'
}

export interface GenerationDetail {
  id: string
  briefing: BriefingData & {
    platforms: PlatformId[]
    categories: 'social' | 'paid' | 'both'
    selectedAdTypes: SelectedAdType[]
  }
  result: GenerationResult
  customer_id: string | null
  customer_name: string | null
  created_at: string
  status: 'pending' | 'completed' | 'failed'
}

export type ViewState = 'wizard' | 'generating' | 'results' | 'history'
