import { AuthShell } from '@/components/auth-shell'
import { AcceptInviteForm } from '@/components/accept-invite-form'
import { getTenantAuthBranding } from '@/lib/tenant-branding'

interface AcceptInvitePageProps {
  searchParams: Promise<{ token?: string }>
}

export default async function AcceptInvitePage({ searchParams }: AcceptInvitePageProps) {
  const params = await searchParams
  const tenant = await getTenantAuthBranding()
  const token = typeof params.token === 'string' && params.token.trim().length > 0 ? params.token : undefined
  const hasToken = Boolean(token)

  return (
    <AuthShell
      eyebrow="Einladung"
      title={hasToken ? 'Willkommen im Team' : 'Einladung prüfen'}
      brandLogoUrl={tenant?.logoUrl}
      brandAlt={tenant ? `${tenant.slug} Logo` : 'BoostHive Logo'}
      contextLabel={tenant ? `Einladung fuer ${tenant.slug}` : 'BoostHive Workspace'}
      description={
        hasToken
          ? 'Lege dein Passwort fest, um deinen Zugang zu aktivieren.'
          : 'Dieser Link wirkt unvollständig. Fordere bei einem Admin eine neue Einladung an.'
      }
      backHref="/login"
      backLabel="Zur Login-Seite"
    >
      <AcceptInviteForm token={token} fallbackTenantName={tenant?.slug ?? 'deinem Team'} />
    </AuthShell>
  )
}
