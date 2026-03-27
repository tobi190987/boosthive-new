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
      eyebrow="Owner Login"
      title="Plattform-Admin anmelden"
      description="Zugriff auf Owner-Funktionen, Tenant-Verwaltung und systemweite Uebersichten."
      asideTitle="Ein eigener Einstieg fuer die Plattform-Ebene."
      asideDescription="Auch der Owner-Bereich nutzt jetzt dieselbe ruhige, markenkonsistente Auth-Oberflaeche wie die Tenant-Logins."
    >
      <LoginForm action="/api/auth/owner/login" returnTo={returnTo} title="BoostHive Plattformsteuerung" />
    </AuthShell>
  )
}
