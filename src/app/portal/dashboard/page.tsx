import { PortalAuthenticatedPage } from '@/components/portal-authenticated-page'
import { PortalDashboardWorkspace } from '@/components/portal-dashboard-workspace'

export default function PortalDashboardRoute() {
  return (
    <PortalAuthenticatedPage>
      <PortalDashboardWorkspace />
    </PortalAuthenticatedPage>
  )
}
