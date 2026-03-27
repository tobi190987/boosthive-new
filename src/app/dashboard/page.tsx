import Link from 'next/link'
import { requireTenantContext } from '@/lib/tenant'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function TenantDashboardPage() {
  const tenant = await requireTenantContext()

  return (
    <main className="min-h-screen bg-[#f0f4f8] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#1dbfaa]">
            Tenant Dashboard
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Willkommen bei {tenant.slug}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-500">
            Du befindest dich im geschützten Bereich deines Tenants.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-slate-900">Session aktiv</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm text-slate-500">
              <p>Du bewegst dich im geschützten Bereich deines Tenants.</p>
              <p className="font-medium text-slate-900">Tenant-Slug: {tenant.slug}</p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-slate-900">Nächste Schritte</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-500">
              <p>Von hier aus können die tenant-spezifischen Produktmodule angeschlossen werden.</p>
              <Link
                href="/forgot-password"
                className="inline-flex font-medium text-[#0d9488] underline-offset-4 hover:underline"
              >
                Passwort-Reset erneut testen
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
