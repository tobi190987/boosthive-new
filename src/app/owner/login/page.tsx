import { AuthShell } from '@/components/auth-shell'
import { LoginForm } from '@/components/login-form'

interface OwnerLoginPageProps {
  searchParams: Promise<{ returnTo?: string }>
}

export default async function OwnerLoginPage({ searchParams }: OwnerLoginPageProps) {
  const params = await searchParams
  const rawReturnTo = params.returnTo
  const returnTo = rawReturnTo?.startsWith('/') && !rawReturnTo.startsWith('//') ? rawReturnTo : '/owner'

  return (
    <AuthShell
      eyebrow="Owner Access"
      title="Plattform-Zugang für BoostHive Owner"
      description="Melde dich für systemweite Steuerung, Tenant-Verwaltung und Billing-Übersichten an."
      asideTitle="Die Plattform-Ebene im selben Produktgefühl."
      asideDescription="Der Owner-Login nutzt dieselbe ruhige, markenkonsistente Oberfläche wie die Tenant-Subdomains, nur mit globalem Blick auf das gesamte System."
    >
      <LoginForm
        action="/api/auth/owner/login"
        returnTo={returnTo}
        title="BoostHive Plattformsteuerung"
      />
    </AuthShell>
  )
}
