import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoginForm } from '@/components/login-form'
import { getTenantContext } from '@/lib/tenant'

interface LoginPageProps {
  searchParams: Promise<{ returnTo?: string }>
}

/**
 * Tenant-Login-Page: /login
 *
 * Wird auf Subdomain-Kontext angezeigt (z.B. agentur-x.boost-hive.de/login).
 * Nach erfolgreichem Login wird auf returnTo oder /dashboard weitergeleitet.
 */
export default async function TenantLoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const tenant = await getTenantContext()
  const returnTo = params.returnTo || '/dashboard'

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFB] px-4">
      <Card className="w-full max-w-md rounded-xl shadow-sm">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">
            Anmelden
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm
            action="/api/auth/login"
            returnTo={returnTo}
            title={tenant ? `Anmeldung bei ${tenant.slug}` : undefined}
          />
        </CardContent>
      </Card>
    </div>
  )
}
