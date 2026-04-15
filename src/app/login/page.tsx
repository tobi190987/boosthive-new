import { AuthShell } from '@/components/auth-shell'
import { LoginForm } from '@/components/login-form'
import { getTenantAuthBranding } from '@/lib/tenant-branding'

interface LoginPageProps {
  searchParams: Promise<{ returnTo?: string; reason?: string }>
}

export default async function TenantLoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const tenant = await getTenantAuthBranding()
  const rawReturnTo = params.returnTo
  const returnTo = rawReturnTo?.startsWith('/') && !rawReturnTo.startsWith('//') ? rawReturnTo : '/dashboard'
  const notice =
    params.reason === 'tenant_inactive'
      ? 'Dieser Tenant wurde deaktiviert. Deine Sitzung wurde beendet und neue Logins sind aktuell blockiert.'
      : params.reason === 'tenant_billing_blocked'
        ? 'Dieser Tenant ist aktuell wegen eines Billing-Problems blockiert. Neue Logins sind vorübergehend gesperrt.'
        : undefined

  return (
    <AuthShell
      variant="tenant"
      eyebrow="Tenant Login"
      hideEyebrow
      title="Willkommen"
      description="Melde dich an, um in deinen Workspace zu gelangen."
      brandLogoUrl={tenant?.logoUrl}
      brandAlt={tenant ? `${tenant.slug} Logo` : 'BoostHive Logo'}
      brandLogoClassName="h-[4.5rem] w-auto max-w-[300px] object-contain sm:h-20 sm:max-w-[340px]"
    >
      <LoginForm
        action="/api/auth/login"
        returnTo={returnTo}
        showForgotPasswordLink
        notice={notice}
      />
    </AuthShell>
  )
}
