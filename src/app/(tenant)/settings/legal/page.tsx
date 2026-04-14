import { forbidden, redirect } from 'next/navigation'
import { LegalPrivacyWorkspace } from '@/components/legal-privacy-workspace'
import { getSubprocessorEntries } from '@/lib/legal'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { createAdminClient } from '@/lib/supabase-admin'
import { TenantShellHeader } from '@/components/tenant-shell-header'

export default async function LegalSettingsPage() {
  const context = await requireTenantShellContext()
  const subprocessorEntries = getSubprocessorEntries()

  if (!context.onboarding.isComplete) {
    redirect('/onboarding')
  }

  if (context.membership.role !== 'admin') {
    forbidden()
  }

  const admin = createAdminClient()
  const { data: tenantRow } = await admin
    .from('tenants')
    .select('avv_accepted_at')
    .eq('id', context.tenant.id)
    .single()

  const avvAcceptedAt = (tenantRow as { avv_accepted_at?: string | null } | null)?.avv_accepted_at ?? null

  return (
    <div className="space-y-6">
      <TenantShellHeader
        context={context}
        eyebrow="Verwaltung"
        title="Rechtliches & Datenschutz"
        description="Verwalte Auftragsverarbeitungsverträge, Datenschutzhinweise und Unterauftragsverarbeiter."
      />
      <LegalPrivacyWorkspace subprocessorEntries={subprocessorEntries} avvAcceptedAt={avvAcceptedAt} />
    </div>
  )
}
