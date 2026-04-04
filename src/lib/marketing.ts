import { createAdminClient } from '@/lib/supabase-admin'
import { stripe } from '@/lib/stripe'
import { getTenantContext } from '@/lib/tenant'

export interface MarketingTenantBranding {
  id: string
  slug: string
  name: string
  logoUrl?: string
}

export interface MarketingPriceItem {
  code: string
  name: string
  description: string
  amount: number | null
  currency: string
  interval: string
  isBasePlan?: boolean
}

interface ModuleRow {
  code: string
  name: string
  description: string
  stripe_price_id: string
}

const FALLBACK_MODULES: ModuleRow[] = [
  {
    code: 'seo_analyse',
    name: 'SEO Analyse',
    description: 'Technische und inhaltliche SEO-Analyse für Websites und Landingpages.',
    stripe_price_id: '',
  },
  {
    code: 'ai_performance',
    name: 'AI Performance Analyse',
    description: 'KI-gestützte Performance-Auswertung für Kampagnen und Reportings.',
    stripe_price_id: '',
  },
  {
    code: 'ai_visibility',
    name: 'AI Visibility Tool',
    description: 'Sichtbarkeit in KI-Suchsystemen wie ChatGPT und Perplexity nachvollziehen.',
    stripe_price_id: '',
  },
  {
    code: 'content_briefs',
    name: 'Content Brief Generator',
    description: 'SEO- und KI-orientierte Briefings für Content-Produktion.',
    stripe_price_id: '',
  },
  {
    code: 'ad_generator',
    name: 'Ad Text Generator',
    description: 'Anzeigentexte für Social Ads und Paid Kampagnen generieren.',
    stripe_price_id: '',
  },
]

export async function getMarketingTenantBranding(): Promise<MarketingTenantBranding | null> {
  const tenant = await getTenantContext()
  if (!tenant?.id) {
    return null
  }

  const supabaseAdmin = createAdminClient()
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('id, slug, name, logo_url')
    .eq('id', tenant.id)
    .maybeSingle()

  if (error || !data) {
    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.slug,
    }
  }

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    logoUrl: data.logo_url ?? undefined,
  }
}

export async function getMarketingPrices(): Promise<MarketingPriceItem[]> {
  const supabaseAdmin = createAdminClient()

  let modules: ModuleRow[] = FALLBACK_MODULES

  const { data: moduleRows } = await supabaseAdmin
    .from('modules')
    .select('code, name, description, stripe_price_id')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (moduleRows && moduleRows.length > 0) {
    modules = moduleRows
  }

  const items: MarketingPriceItem[] = []
  const priceCache = new Map<string, { amount: number | null; currency: string }>()

  async function loadPrice(priceId: string | undefined, fallbackAmount?: number) {
    if (!priceId) {
      return { amount: fallbackAmount ?? null, currency: 'eur' }
    }

    if (priceCache.has(priceId)) {
      return priceCache.get(priceId)!
    }

    try {
      const price = await stripe.prices.retrieve(priceId, { expand: ['tiers'] })
      let amount = price.unit_amount

      if (amount === null && Array.isArray((price as { tiers?: Array<{ unit_amount?: number | null; flat_amount?: number | null }> }).tiers)) {
        const firstTier = (price as { tiers?: Array<{ unit_amount?: number | null; flat_amount?: number | null }> }).tiers?.[0]
        amount = firstTier?.unit_amount ?? firstTier?.flat_amount ?? null
      }

      const resolved = { amount, currency: price.currency }
      priceCache.set(priceId, resolved)
      return resolved
    } catch {
      const fallback = { amount: fallbackAmount ?? null, currency: 'eur' }
      priceCache.set(priceId, fallback)
      return fallback
    }
  }

  const basePrice = await loadPrice(process.env.STRIPE_BASIS_PLAN_PRICE_ID, 4900)
  items.push({
    code: 'basis_plan',
    name: 'Basis-Plan',
    description: 'White-Label Workspace, Nutzerzugang, Teamverwaltung, Tenant-Shell und Billing-Grundlage.',
    amount: basePrice.amount,
    currency: basePrice.currency,
    interval: '4 Wochen',
    isBasePlan: true,
  })

  for (const mod of modules) {
    const price = await loadPrice(mod.stripe_price_id)
    items.push({
      code: mod.code,
      name: mod.name,
      description: mod.description,
      amount: price.amount,
      currency: price.currency,
      interval: '4 Wochen',
    })
  }

  return items
}

export function formatPrice(amount: number | null, currency = 'eur') {
  if (amount === null) {
    return 'Preis im Workspace'
  }

  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(amount / 100)
}
