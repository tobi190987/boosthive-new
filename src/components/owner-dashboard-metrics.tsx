'use client'

import { BarChart3, Building2, Users, Waypoints } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface OwnerDashboardMetricsProps {
  totalTenants: number
  activeTenants: number
  inactiveTenants: number
  totalUsers: number
}

interface MetricCard {
  label: string
  value: string
  hint: string
  icon: typeof Building2
  accent: string
}

export function OwnerDashboardMetrics({
  totalTenants,
  activeTenants,
  inactiveTenants,
  totalUsers,
}: OwnerDashboardMetricsProps) {
  const metrics: MetricCard[] = [
    {
      label: 'Gesamt-Tenants',
      value: String(totalTenants),
      hint: 'Alle aktuell registrierten Agenturen im System.',
      icon: Building2,
      accent: 'text-[#0d9488] bg-[#f0fdfb]',
    },
    {
      label: 'Aktive Tenants',
      value: String(activeTenants),
      hint: 'Workspaces, die derzeit neue Logins akzeptieren.',
      icon: Waypoints,
      accent: 'text-[#166534] bg-[#eff8f2]',
    },
    {
      label: 'Inaktive Tenants',
      value: String(inactiveTenants),
      hint: 'Deaktivierte Tenants mit blockierten neuen Logins.',
      icon: BarChart3,
      accent: 'text-[#9f4f2d] bg-[#fff4ee]',
    },
    {
      label: 'Gesamt-User',
      value: String(totalUsers),
      hint: 'Aktive Tenant-Members über alle Workspaces hinweg.',
      icon: Users,
      accent: 'text-slate-700 bg-slate-100',
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <Card
          key={metric.label}
          className="rounded-[28px] border border-[#e7ddd1] bg-white shadow-[0_20px_60px_rgba(89,71,42,0.08)]"
        >
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                Platform Signal
              </p>
              <CardTitle className="mt-2 text-base font-semibold text-slate-900">
                {metric.label}
              </CardTitle>
            </div>
            <div className={`rounded-2xl p-3 ${metric.accent}`}>
              <metric.icon className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tracking-tight text-slate-950">{metric.value}</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">{metric.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
