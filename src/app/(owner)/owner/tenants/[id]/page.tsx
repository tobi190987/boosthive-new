import { notFound } from "next/navigation"
import { OwnerTenantDetailWorkspace } from "@/components/owner-tenant-detail-workspace"
import { createAdminClient } from "@/lib/supabase-admin"

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function OwnerTenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  if (!UUID_REGEX.test(id)) {
    notFound()
  }

  const supabaseAdmin = createAdminClient()
  const { data: tenant, error } = await supabaseAdmin
    .from("tenants")
    .select("id")
    .eq("id", id)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!tenant) {
    notFound()
  }

  return <OwnerTenantDetailWorkspace tenantId={id} />
}
