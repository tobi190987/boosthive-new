/**
 * PROJ-26: GET /api/tenant/keywords/projects/[id]/gsc/status
 *
 * Returns the current GSC connection for the project (or null if not connected).
 * Supports customer GSC fallback when the project has a customer_id assigned
 * and the customer has a connected GSC integration.
 * Never returns encrypted tokens.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse, GSC_READ } from '@/lib/rate-limit'
import {
  getCustomerGscIntegration,
  parseCustomerGscCredentials,
} from '@/lib/gsc-customer-api'

const paramsSchema = z.object({
  id: z.string().uuid('Ungueltige Projekt-ID.'),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`gsc-status:${tenantId}:${getClientIp(request)}`, GSC_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'seo_analyse')
  if ('error' in moduleAccess) return moduleAccess.error

  const parsedParams = paramsSchema.safeParse(await params)
  if (!parsedParams.success) {
    return NextResponse.json({ error: parsedParams.error.issues[0]?.message }, { status: 400 })
  }

  const { id: projectId } = parsedParams.data

  const admin = createAdminClient()

  // Get project to check for customer_id
  const { data: project, error: projectError } = await admin
    .from('keyword_projects')
    .select('id, customer_id')
    .eq('id', projectId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 })
  if (!project) return NextResponse.json({ error: 'Projekt nicht gefunden.' }, { status: 404 })

  // Check project-level GSC connection
  const { data: projectConnection } = await admin
    .from('gsc_connections')
    .select('id, google_email, selected_property, status, connected_at, token_expires_at')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (projectConnection) {
    // Project-level GSC is available
    let customerHasGsc: boolean | undefined
    if (project.customer_id) {
      const customerIntegration = await getCustomerGscIntegration(tenantId, project.customer_id)
      const creds = parseCustomerGscCredentials(customerIntegration?.credentials_encrypted ?? null)
      customerHasGsc = !!(customerIntegration && customerIntegration.status === 'connected' && creds?.selected_property)
    }

    return NextResponse.json({
      connection: {
        id: projectConnection.id,
        google_email: projectConnection.google_email,
        selected_property: projectConnection.selected_property,
        status: projectConnection.status,
        connected_at: projectConnection.connected_at,
        token_expires_at: projectConnection.token_expires_at,
      },
      source: 'project',
      customer_id: project.customer_id ?? null,
      customer_has_gsc: customerHasGsc ?? false,
    })
  }

  // No project-level connection - check customer GSC fallback
  if (project.customer_id) {
    const customerIntegration = await getCustomerGscIntegration(tenantId, project.customer_id)
    const creds = parseCustomerGscCredentials(customerIntegration?.credentials_encrypted ?? null)

    if (customerIntegration && customerIntegration.status === 'connected' && creds?.selected_property) {
      return NextResponse.json({
        connection: {
          id: customerIntegration.id,
          google_email: creds.google_email,
          selected_property: creds.selected_property,
          status: 'connected',
          connected_at: null,
          token_expires_at: null,
        },
        source: 'customer',
        customer_id: project.customer_id,
        customer_has_gsc: true,
      })
    }

    // Customer exists but no GSC
    return NextResponse.json({
      connection: null,
      source: null,
      customer_id: project.customer_id,
      customer_has_gsc: false,
    })
  }

  // No project GSC and no customer
  return NextResponse.json({
    connection: null,
    source: null,
    customer_id: null,
    customer_has_gsc: false,
  })
}
