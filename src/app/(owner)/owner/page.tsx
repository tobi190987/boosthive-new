import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Building2 } from "lucide-react"

export default function OwnerDashboardPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Willkommen im Owner-Bereich von BoostHive.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Agenturen
            </CardTitle>
            <Building2 className="h-4 w-4 text-teal-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-gray-900">&mdash;</p>
            <p className="mt-1 text-xs text-gray-500">
              Tenant-Verwaltung unter &quot;Agenturen&quot;
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
