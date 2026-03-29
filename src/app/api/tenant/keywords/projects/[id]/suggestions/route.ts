import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { loadProjectSuggestionContext, generateKeywordProjectSuggestions } from '@/lib/keyword-project-suggestions'
import { checkRateLimit, getClientIp, rateLimitResponse, VISIBILITY_READ } from '@/lib/rate-limit'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`kw-suggestions:${tenantId}:${getClientIp(request)}`, VISIBILITY_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'seo_analyse')
  if ('error' in moduleAccess) return moduleAccess.error

  try {
    const { id: projectId } = await params
    const context = await loadProjectSuggestionContext(tenantId, projectId)
    const suggestions = await generateKeywordProjectSuggestions({
      targetDomain: context.project.target_domain,
      languageCode: context.project.language_code,
      countryCode: context.project.country_code,
      existingKeywords: context.existingKeywords,
      existingCompetitors: context.existingCompetitors,
    })

    return NextResponse.json(suggestions)
  } catch (error) {
    console.error('[keyword-project-suggestions] failed', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Vorschläge konnten nicht generiert werden.',
      },
      { status: 500 }
    )
  }
}
