import { createAdminClient } from '@/lib/supabase-admin'
import { getTenantContext } from '@/lib/tenant'

export async function getTenantLogoUrl() {
  const tenant = await getTenantContext()

  if (!tenant?.id) {
    return undefined
  }

  const supabaseAdmin = createAdminClient()
  const { data } = await supabaseAdmin
    .from('tenants')
    .select('logo_url')
    .eq('id', tenant.id)
    .maybeSingle()

  return data?.logo_url ?? undefined
}
