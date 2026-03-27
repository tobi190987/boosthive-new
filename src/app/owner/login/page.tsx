import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { LoginForm } from '@/components/login-form'

interface OwnerLoginPageProps {
  searchParams: Promise<{ returnTo?: string }>
}

/**
 * Owner-Login-Page: /owner/login
 *
 * Nur auf Root-Domain erreichbar (boost-hive.de/owner/login).
 * Diese Page liegt AUSSERHALB des (owner) Route-Groups, damit
 * sie kein Sidebar-Layout bekommt.
 *
 * Nach erfolgreichem Login wird auf returnTo oder /owner weitergeleitet.
 */
export default async function OwnerLoginPage({ searchParams }: OwnerLoginPageProps) {
  const params = await searchParams
  const returnTo = params.returnTo || '/owner'

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFB] px-4">
      <Card className="w-full max-w-md rounded-xl shadow-sm">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">
            BoostHive Admin
          </CardTitle>
          <CardDescription>
            Plattform-Owner Login
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm
            action="/api/auth/owner/login"
            returnTo={returnTo}
          />
        </CardContent>
      </Card>
    </div>
  )
}
