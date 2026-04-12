import { PortalAuthenticatedPage } from '@/components/portal-authenticated-page'
import { PortalReportsWorkspace } from '@/components/portal-reports-workspace'

export default function PortalReportsRoute() {
  return (
    <PortalAuthenticatedPage>
      <PortalReportsWorkspace />
    </PortalAuthenticatedPage>
  )
}
