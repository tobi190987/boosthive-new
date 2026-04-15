import { notFound } from 'next/navigation'
import { getSeoAnalysisStatus } from '@/lib/tenant-app-data'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { SeoReportContent } from '@/components/seo-report-content'
import { PrintTrigger } from './print-trigger'

export default async function SeoPrintPage({
  params,
}: {
  params: Promise<{ analysisId: string }>
}) {
  const [context, { analysisId }] = await Promise.all([
    requireTenantShellContext(),
    params,
  ])

  const analysis = await getSeoAnalysisStatus(context.tenant.id, analysisId)

  if (!analysis?.result) {
    notFound()
  }

  return (
    <div className="print-area">
      <PrintTrigger />
      <SeoReportContent
        result={analysis.result}
        tenantName={context.tenant.name}
        tenantSlug={context.tenant.slug}
        tenantLogoUrl={context.tenant.logoUrl}
        createdAt={analysis.createdAt}
        sourceUrl={analysis.config.urls[0] ?? null}
        crawlMode={analysis.config.crawlMode}
      />
    </div>
  )
}
