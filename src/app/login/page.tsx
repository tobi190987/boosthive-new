import Image from 'next/image'
import Link from 'next/link'
import { AuthShell } from '@/components/auth-shell'
import { LoginForm } from '@/components/login-form'
import { getTenantContext } from '@/lib/tenant'

interface LoginPageProps {
  searchParams: Promise<{ returnTo?: string }>
}

export default async function TenantLoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const tenant = await getTenantContext()
  const rawReturnTo = params.returnTo
  const returnTo = rawReturnTo?.startsWith('/') && !rawReturnTo.startsWith('//') ? rawReturnTo : '/dashboard'

  return (
    <AuthShell
      eyebrow="Login"
      title="Willkommen zurueck"
      description="Melde dich in deinem Tenant an, verwalte dein Team und starte von dort aus auch den sicheren Passwort-Reset."
      asideTitle="Recovery ohne Reibung, abgestimmt auf deinen Tenant."
      asideDescription="Der Zugang bleibt klar, ruhig und markenkonform. Von der Anmeldung bis zum Passwort-Reset fuehrt dich derselbe BoostHive-Flow sicher durch den Prozess."
      footer={
        <div className="flex flex-col gap-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Image src="/favicon_dark.png" alt="BoostHive Logo" width={1264} height={842} className="h-6 w-auto object-contain" />
            <span>{tenant ? `Tenant: ${tenant.slug}` : 'BoostHive Zugang'}</span>
          </div>
          <Link href="/forgot-password" className="font-medium text-[#9c4f2c] underline-offset-4 hover:underline">
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
      />
    </AuthShell>
  )
}
