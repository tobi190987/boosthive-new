import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  CONTENT_BRIEFS_READ,
  CONTENT_BRIEFS_WRITE,
} from '@/lib/rate-limit'

// ─── Zod Validation ──────────────────────────────────────────────────────────

const createBriefSchema = z.object({
  customer_id: z.string().uuid('Ungueltige Customer-ID.'),
  keyword: z
    .string()
    .trim()
    .min(2, 'Keyword muss mindestens 2 Zeichen haben.')
    .max(200, 'Keyword darf maximal 200 Zeichen haben.'),
  language: z
    .enum(['de', 'en', 'fr', 'es', 'it'], { error: 'Ungueltige Sprache.' })
    .default('de'),
  tone: z
    .enum(['informativ', 'werblich', 'neutral'], { error: 'Ungueltige Tonalitaet.' })
    .default('informativ'),
  word_count_target: z
    .number()
    .int()
    .min(300, 'Wortanzahl-Ziel muss mindestens 300 sein.')
    .max(5000, 'Wortanzahl-Ziel darf maximal 5000 sein.')
    .default(1000),
  target_url: z
    .string()
    .trim()
    .url('Ungueltige URL.')
    .max(2000)
    .nullable()
    .optional()
    .transform((v) => v || null),
})

// ─── GET: List briefs ────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`content-briefs-read:${tenantId}:${getClientIp(request)}`, CONTENT_BRIEFS_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'content_briefs')
  if ('error' in moduleAccess) return moduleAccess.error

  const customerId = request.nextUrl.searchParams.get('customer_id')

  const admin = createAdminClient()

  let query = admin
    .from('content_briefs')
    .select('id, keyword, language, tone, word_count_target, target_url, status, error_message, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (customerId) {
    query = query.eq('customer_id', customerId)
  }

  const { data: briefs, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ briefs: briefs ?? [] })
}

// ─── POST: Create brief + trigger worker ─────────────────────────────────────

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`content-briefs-write:${tenantId}:${getClientIp(request)}`, CONTENT_BRIEFS_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'content_briefs')
  if ('error' in moduleAccess) return moduleAccess.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungueltiger JSON-Body.' }, { status: 400 })
  }

  const parsed = createBriefSchema.safeParse(body)
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors
    const firstDetail = Object.values(details).flat().find(Boolean)
    return NextResponse.json(
      { error: firstDetail ?? 'Validierungsfehler.', details },
      { status: 400 }
    )
  }

  const { customer_id, keyword, language, tone, word_count_target, target_url } = parsed.data

  const admin = createAdminClient()

  // BUG-3 fix: Verify that customer_id belongs to this tenant
  const { data: customer } = await admin
    .from('customers')
    .select('id')
    .eq('id', customer_id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!customer) {
    return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })
  }

  // Insert the brief record with status "pending"
  const { data: brief, error } = await admin
    .from('content_briefs')
    .insert({
      tenant_id: tenantId,
      customer_id,
      created_by: authResult.auth.userId,
      keyword,
      language,
      tone,
      word_count_target,
      target_url,
      status: 'pending',
    })
    .select('id, keyword, language, tone, word_count_target, target_url, status, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fire-and-forget: trigger the worker
  triggerContentWorker(brief.id).catch((err) => {
    console.error('[content-briefs] Failed to trigger worker:', err)
  })

  return NextResponse.json({ brief }, { status: 201 })
}

// ─── Worker trigger ──────────────────────────────────────────────────────────

async function triggerContentWorker(briefId: string): Promise<void> {
  const workerSecret = process.env.CONTENT_WORKER_SECRET
  if (!workerSecret) {
    console.error('[content-briefs] CONTENT_WORKER_SECRET not configured')
    return
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  await fetch(`${baseUrl}/api/tenant/content/worker`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-worker-secret': workerSecret,
    },
    body: JSON.stringify({ brief_id: briefId }),
  })
}
