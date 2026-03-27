import { redirect } from 'next/navigation'
import { TenantAppShell } from '@/components/tenant-app-shell'
import { TenantProfileWorkspace } from '@/components/tenant-profile-workspace'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function OnboardingPage() {
  const context = await requireTenantShellContext()

  if (context.onboarding.isComplete) {
    redirect('/dashboard')
  }

  return (
    <TenantAppShell
      context={context}
      eyebrow="Onboarding"
      title="Richte dein Profil und euren Workspace ein"
      description="Beim ersten Login sammeln wir die Pflichtdaten fuer dein Profil. Admins hinterlegen zusaetzlich Rechnungsadresse und Stripe."
    >
      <TenantProfileWorkspace
        mode="onboarding"
        initialData={{
          role: context.membership.role,
          tenantName: context.tenant.name,
          firstName: context.user.firstName ?? '',
          lastName: context.user.lastName ?? '',
          avatarUrl: context.user.avatarUrl,
          billingCompany: context.tenant.billingCompany ?? '',
          billingStreet: context.tenant.billingStreet ?? '',
          billingZip: context.tenant.billingZip ?? '',
          billingCity: context.tenant.billingCity ?? '',
          billingCountry: context.tenant.billingCountry ?? '',
          billingVatId: context.tenant.billingVatId ?? '',
        }}
      />
    </TenantAppShell>
  )
}
