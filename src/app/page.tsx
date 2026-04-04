import { MarketingPages } from '@/components/marketing-pages'
import { getMarketingPrices, getMarketingTenantBranding } from '@/lib/marketing'

export default async function HomePage() {
  const [tenant, pricing] = await Promise.all([
    getMarketingTenantBranding(),
    getMarketingPrices(),
  ])

  return <MarketingPages mode="home" tenant={tenant} pricing={pricing} />
}
