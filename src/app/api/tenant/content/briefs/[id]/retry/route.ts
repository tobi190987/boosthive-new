import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse, CONTENT_BRIEFS_WRITE } from '@/lib/rate-limit'

const idSchema = z.string().uuid('Ungültige Brief-ID.')

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`content-briefs-write:${tenantId}:${getClientIp(request)}`, CONTENT_BRIEFS_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'content_briefs')
  if ('error' in moduleAccess) return moduleAccess.error

  const { id } = await params
  const idParsed = idSchema.safeParse(id)
  if (!idParsed.success) return NextResponse.json({ error: 'Ungültige Brief-ID.' }, { status: 400 })

  const admin = createAdminClient()

  const { data: brief, error: fetchError } = await admin
    .from('content_briefs')
    .select('id, status')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()

  if (fetchError || !brief) {
    return NextResponse.json({ error: 'Brief nicht gefunden.' }, { status: 404 })
  }

  if (brief.status !== 'failed') {
    return NextResponse.json(
      { error: `Brief kann nicht neu gestartet werden. Aktueller Status: ${brief.status}` },
      { status: 400 }
    )
  }

  // Reset to pending
  const { error: updateError } = await admin
    .from('content_briefs')
    .update({ status: 'pending', brief_json: null, error_message: null })
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // Re-trigger worker
  triggerContentWorker(id).catch((err) => {
    console.error('[content-briefs/retry] Failed to trigger worker:', err)
  })

  return NextResponse.json({ success: true, status: 'pending' })
}

async function triggerContentWorker(briefId: string): Promise<void> {
  const workerSecret = process.env.CONTENT_WORKER_SECRET
  if (!workerSecret) {
    console.error('[content-briefs/retry] CONTENT_WORKER_SECRET not configured')
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
