import { AuthShell } from '@/components/auth-shell'
import { ForgotPasswordForm } from '@/components/forgot-password-form'
import { getTenantLogoUrl } from '@/lib/tenant-branding'
import { getTenantContext } from '@/lib/tenant'

export default async function ForgotPasswordPage() {
  const tenant = await getTenantContext()
  const tenantLogoUrl = await getTenantLogoUrl()

  return (
    <AuthShell
      eyebrow="Passwort Reset"
      title="Passwort vergessen?"
      tenantLogoUrl={tenantLogoUrl}
      description="Gib die E-Mail-Adresse deines Kontos ein. Falls ein passender Zugang in diesem Tenant existiert, senden wir dir einen sicheren Reset-Link."
      asideTitle="Sicheres Recovery für deinen Arbeitsbereich."
      asideDescription={`Der Reset bleibt an ${tenant?.slug ?? 'deinen Tenant'} gebunden, zeigt keine Kontoinformationen nach aussen und führt dich sauber zurück in dein Dashboard.`}
      backHref="/login"
    >
      <ForgotPasswordForm action="/api/auth/password-reset/request" />
    </AuthShell>
  )
}
