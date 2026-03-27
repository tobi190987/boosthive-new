import Image from 'next/image'
import Link from 'next/link'
import { AuthShell } from '@/components/auth-shell'
import { LoginForm } from '@/components/login-form'
import { getTenantContext } from '@/lib/tenant'
import { createAdminClient } from '@/lib/supabase-admin'

interface LoginPageProps {
  searchParams: Promise<{ returnTo?: string; reason?: string }>
}

export default async function TenantLoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const tenant = await getTenantContext()

  let tenantLogoUrl: string | undefined
  if (tenant?.id) {
    const supabaseAdmin = createAdminClient()
    const { data } = await supabaseAdmin
      .from('tenants')
      .select('logo_url')
      .eq('id', tenant.id)
      .maybeSingle()
    tenantLogoUrl = data?.logo_url ?? undefined
  }
  const rawReturnTo = params.returnTo
  const returnTo = rawReturnTo?.startsWith('/') && !rawReturnTo.startsWith('//') ? rawReturnTo : '/dashboard'
  const notice =
    params.reason === 'tenant_inactive'
      ? 'Dieser Tenant wurde deaktiviert. Deine Sitzung wurde beendet und neue Logins sind aktuell blockiert.'
      : undefined

  return (
    <AuthShell
      eyebrow="Login"
      title="Willkommen zurück"
      tenantLogoUrl={tenantLogoUrl}
      description="Melde dich in deinem Tenant an, verwalte dein Team und starte von dort aus auch den sicheren Passwort-Reset."
      asideTitle="Recovery ohne Reibung, abgestimmt auf deinen Tenant."
      asideDescription="Der Zugang bleibt klar, ruhig und markenkonform. Von der Anmeldung bis zum Passwort-Reset führt dich derselbe BoostHive-Flow sicher durch den Prozess."
      footer={
        <div className="flex flex-col gap-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {tenantLogoUrl ? (
              <Image
                src={tenantLogoUrl}
                alt={`${tenant?.slug ?? 'Tenant'} Logo`}
                width={180}
                height={48}
                unoptimized
                className="h-5 w-auto max-w-[120px] object-contain"
              />
            ) : (
              <Image src="/boosthive_light.png" alt="BoostHive Logo" width={759} height={213} className="h-5 w-auto object-contain" />
            )}
            <span>{tenant ? `Tenant: ${tenant.slug}` : 'BoostHive Zugang'}</span>
          </div>
          <Link href="/forgot-password" className="font-medium text-[#0d9488] underline-offset-4 hover:underline">
            Passwort vergessen?
          </Link>
        </div>
      }
    >
      <LoginForm
        action="/api/auth/login"
        returnTo={returnTo}
        title={tenant ? `Anmeldung bei ${tenant.slug}` : undefined}
        showForgotPasswordLink
        notice={notice}
      />
    </AuthShell>
  )
}
