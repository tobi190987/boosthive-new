import { AuthShell } from '@/components/auth-shell'
import { AcceptInviteForm } from '@/components/accept-invite-form'
import { getTenantContext } from '@/lib/tenant'

interface AcceptInvitePageProps {
  searchParams: Promise<{ token?: string }>
}

export default async function AcceptInvitePage({ searchParams }: AcceptInvitePageProps) {
  const params = await searchParams
  const tenant = await getTenantContext()
  const token = typeof params.token === 'string' && params.token.trim().length > 0 ? params.token : undefined
  const hasToken = Boolean(token)

  return (
    <AuthShell
      eyebrow="Einladung"
      title={hasToken ? 'Willkommen im Team' : 'Einladung pruefen'}
      description={
        hasToken
          ? 'Lege Anzeigename und Passwort fest, um deinen Zugang zu aktivieren.'
          : 'Dieser Link wirkt unvollstaendig. Fordere bei einem Admin eine neue Einladung an.'
      }
      asideTitle="Onboarding fuer neue Teammitglieder."
      asideDescription="Die Einladungsseite bleibt oeffentlich erreichbar, zeigt Tenant-Kontext und fuehrt eingeladene Personen ohne Login-Vorbedingung in den Workspace."
      backHref="/login"
      backLabel="Zur Login-Seite"
    >
      <AcceptInviteForm token={token} fallbackTenantName={tenant?.slug ?? 'deinem Team'} />
    </AuthShell>
  )
}
