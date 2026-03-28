import { AuthShell } from '@/components/auth-shell'
import { AcceptInviteForm } from '@/components/accept-invite-form'
import { getTenantContext } from '@/lib/tenant'
import { createAdminClient } from '@/lib/supabase-admin'

interface AcceptInvitePageProps {
  searchParams: Promise<{ token?: string }>
}

export default async function AcceptInvitePage({ searchParams }: AcceptInvitePageProps) {
  const params = await searchParams
  const tenant = await getTenantContext()
  const token = typeof params.token === 'string' && params.token.trim().length > 0 ? params.token : undefined
  const hasToken = Boolean(token)
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

  return (
    <AuthShell
      eyebrow="Einladung"
      title={hasToken ? 'Willkommen im Team' : 'Einladung prüfen'}
      tenantLogoUrl={tenantLogoUrl}
      description={
        hasToken
          ? 'Lege dein Passwort fest, um deinen Zugang zu aktivieren.'
          : 'Dieser Link wirkt unvollständig. Fordere bei einem Admin eine neue Einladung an.'
      }
      asideTitle="Onboarding für neue Teammitglieder."
      asideDescription="Die Einladungsseite bleibt öffentlich erreichbar, zeigt Tenant-Kontext und führt eingeladene Personen ohne Login-Vorbedingung in den Workspace."
      backHref="/login"
      backLabel="Zur Login-Seite"
    >
      <AcceptInviteForm token={token} fallbackTenantName={tenant?.slug ?? 'deinem Team'} />
    </AuthShell>
  )
}
