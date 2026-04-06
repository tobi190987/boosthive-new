import { AuthShell } from '@/components/auth-shell'
import { ResetPasswordForm } from '@/components/reset-password-form'
import { getTenantAuthBranding } from '@/lib/tenant-branding'

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string }>
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams
  const tenant = await getTenantAuthBranding()

  return (
    <AuthShell
      eyebrow="Neues Passwort"
      title="Passwort neu setzen"
      brandLogoUrl={tenant?.logoUrl}
      brandAlt={tenant ? `${tenant.slug} Logo` : 'BoostHive Logo'}
      contextLabel={tenant ? `Neues Passwort fuer ${tenant.slug}` : 'BoostHive Workspace'}
      description="Lege ein neues Passwort fest und bestätige es. Danach geht es direkt weiter in deinen geschützten Tenant-Bereich."
      backHref="/forgot-password"
      backLabel="Neuen Link anfordern"
    >
      <ResetPasswordForm action="/api/auth/password-reset/confirm" token={params.token} />
    </AuthShell>
  )
}
