import { MarketingPages } from '@/components/marketing-pages'
import { getMarketingTenantBranding } from '@/lib/marketing'

interface AccessPageProps {
  searchParams: Promise<{ returnTo?: string }>
}

export default async function AccessPage({ searchParams }: AccessPageProps) {
  const params = await searchParams
  const tenant = await getMarketingTenantBranding()

  return <MarketingPages mode="access" tenant={tenant} returnTo={params.returnTo} />
}
