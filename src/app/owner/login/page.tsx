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
      variant="owner"
      eyebrow="Owner Access"
      title="Owner Login"
      description="Melde dich an, um Tenants, Billing und Plattformfunktionen zu verwalten."
      contextLabel="Nur für interne Plattformverwaltung"
      brandAlt="BoostHive Owner"
    >
      <LoginForm
        action="/api/auth/owner/login"
        returnTo={returnTo}
        title="BoostHive Plattformsteuerung"
        submitLabel="Als Owner anmelden"
      />
    </AuthShell>
  )
}
