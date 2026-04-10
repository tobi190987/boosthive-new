import { redirect } from 'next/navigation'
import { OnboardingTourTrigger } from '@/components/onboarding-tour'
import { TenantAppShell } from '@/components/tenant-app-shell'
import { TenantProfileWorkspace } from '@/components/tenant-profile-workspace'
import { getTenantShellSummary } from '@/lib/tenant-app-data'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function OnboardingPage() {
  const context = await requireTenantShellContext()
  const shellSummary = await getTenantShellSummary(context.tenant.id, context.user.id)

  if (context.onboarding.isComplete) {
    redirect('/dashboard')
  }

  return (
    <TenantAppShell
      context={context}
      shellSummary={shellSummary}
      eyebrow="Onboarding"
      title="Richte dein Profil und euren Workspace ein"
      description="Beim ersten Login sammeln wir die Pflichtdaten für dein Profil. Admins hinterlegen zusätzlich die verpflichtenden Rechnungsdaten und Stripe."
    >
      <OnboardingTourTrigger tenantId={context.tenant.id} userId={context.user.id} />
      <TenantProfileWorkspace
        mode="onboarding"
        initialData={{
          role: context.membership.role,
          email: context.user.email,
          tenantName: context.tenant.name,
          tenantLogoUrl: context.tenant.logoUrl,
          firstName: context.user.firstName ?? '',
          lastName: context.user.lastName ?? '',
          avatarUrl: context.user.avatarUrl,
          notifyOnApprovalDecision: context.user.notifyOnApprovalDecision,
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
