import { AuthShell } from '@/components/auth-shell'
import { ForgotPasswordForm } from '@/components/forgot-password-form'
import { getTenantAuthBranding } from '@/lib/tenant-branding'

export default async function ForgotPasswordPage() {
  const tenant = await getTenantAuthBranding()

  return (
    <AuthShell
      eyebrow="Passwort Reset"
      title="Passwort vergessen?"
      brandLogoUrl={tenant?.logoUrl}
      brandAlt={tenant ? `${tenant.slug} Logo` : 'BoostHive Logo'}
      contextLabel={tenant ? `Reset für ${tenant.slug}` : 'BoostHive Workspace'}
      description="Gib die E-Mail-Adresse deines Kontos ein. Falls ein passender Zugang in diesem Tenant existiert, senden wir dir einen sicheren Reset-Link."
      backHref="/login"
    >
      <ForgotPasswordForm action="/api/auth/password-reset/request" />
    </AuthShell>
  )
}
