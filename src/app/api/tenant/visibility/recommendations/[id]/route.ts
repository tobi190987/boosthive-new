import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'

const updateRecommendationSchema = z.object({
  status: z.enum(['open', 'done']),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'ai_visibility')
  if ('error' in moduleAccess) return moduleAccess.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungueltiger JSON-Body.' }, { status: 400 })
  }

  const parsed = updateRecommendationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validierungsfehler.', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { id } = await params
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('visibility_recommendations')
    .update({ status: parsed.data.status })
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select()
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'Empfehlung nicht gefunden.' }, { status: 404 })
  }

  return NextResponse.json({ recommendation: data })
}
