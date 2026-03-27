import { AuthShell } from '@/components/auth-shell'
import { ResetPasswordForm } from '@/components/reset-password-form'
import { getTenantContext } from '@/lib/tenant'

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string }>
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams
  const tenant = await getTenantContext()

  return (
    <AuthShell
      eyebrow="Neues Passwort"
      title="Passwort neu setzen"
      description="Lege ein neues Passwort fest und bestätige es. Danach geht es direkt weiter in deinen geschützten Tenant-Bereich."
      asideTitle="Klare Fehlerzustände, schneller Wiedereinstieg."
      asideDescription={`Auch wenn ein Link abgelaufen ist oder auf dem falschen Tenant landet, bleibt der Flow eindeutig und führt Nutzer in ${tenant?.slug ?? 'BoostHive'} sicher zurück.`}
      backHref="/forgot-password"
      backLabel="Neuen Link anfordern"
    >
      <ResetPasswordForm action="/api/auth/password-reset/confirm" token={params.token} />
    </AuthShell>
  )
}
