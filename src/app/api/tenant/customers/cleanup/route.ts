import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  CUSTOMERS_WRITE,
} from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`customers-write:${tenantId}:${getClientIp(request)}`, CUSTOMERS_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  try {
    const admin = createAdminClient()
    
    // Execute the cleanup function
    const { data, error } = await admin
      .rpc('cleanup_soft_deleted_customers')

    if (error) {
      console.error('Cleanup error:', error)
      return NextResponse.json({ error: 'Fehler beim Cleanup.' }, { status: 500 })
    }

    return NextResponse.json({ 
      message: 'Cleanup erfolgreich ausgeführt.',
      cleaned: data 
    })

  } catch (error) {
    console.error('Cleanup error:', error)
    return NextResponse.json({ error: 'Interner Server-Fehler.' }, { status: 500 })
  }
}
