import { createAdminClient } from '@/lib/supabase-admin'
import { getTenantContext } from '@/lib/tenant'

export interface TenantAuthBranding {
  id: string
  slug: string
  logoUrl?: string
}

export async function getTenantAuthBranding(): Promise<TenantAuthBranding | null> {
  const tenant = await getTenantContext()

  if (!tenant?.id) {
    return null
  }

  const supabaseAdmin = createAdminClient()
  const { data } = await supabaseAdmin
    .from('tenants')
    .select('logo_url')
    .eq('id', tenant.id)
    .maybeSingle()

  return {
    id: tenant.id,
    slug: tenant.slug,
    logoUrl: data?.logo_url ?? undefined,
  }
}

export async function getTenantLogoUrl() {
  const branding = await getTenantAuthBranding()
  return branding?.logoUrl
}
