import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { collectUrls, normalizeInputUrl } from '@/lib/seo-analysis'

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'seo_analyse')
  if ('error' in moduleAccess) return moduleAccess.error

  const rawUrl = request.nextUrl.searchParams.get('url') ?? ''
  const url = normalizeInputUrl(rawUrl)

  if (!url) {
    return NextResponse.json({ count: null, hasSitemap: false })
  }

  const urls = await collectUrls([url], 'full-domain', 50)
  const normalizedOrigin = new URL(url).origin
  const hasSitemap =
    urls.length > 1 ||
    (urls.length === 1 && !urls[0].startsWith(normalizedOrigin))

  return NextResponse.json({
    count: urls.length,
    hasSitemap,
  })
}
