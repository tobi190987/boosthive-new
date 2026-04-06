import { redirect } from 'next/navigation'
import { MarketingPages } from '@/components/marketing-pages'
import { getMarketingPrices, getMarketingTenantBranding } from '@/lib/marketing'
import { getTenantContext } from '@/lib/tenant'

export default async function HomePage() {
  const tenant = await getTenantContext()

  if (tenant) {
    redirect('/login')
  }

  const [marketingTenant, pricing] = await Promise.all([
    getMarketingTenantBranding(),
    getMarketingPrices(),
  ])

  return <MarketingPages mode="home" tenant={marketingTenant} pricing={pricing} />
}
