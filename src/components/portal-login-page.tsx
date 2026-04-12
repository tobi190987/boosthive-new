'use client'

import { useEffect, useState } from 'react'
import { PortalLoginForm } from '@/components/portal-login-form'

interface PortalBranding {
  agencyName: string
  logoUrl: string | null
  primaryColor: string
}

const DEFAULT_BRANDING: PortalBranding = {
  agencyName: 'Kundenportal',
  logoUrl: null,
  primaryColor: '#3b82f6',
}

export function PortalLoginPage() {
  const [branding, setBranding] = useState<PortalBranding>(DEFAULT_BRANDING)

  useEffect(() => {
    fetch('/api/portal/branding')
      .then((r) => r.ok ? r.json() as Promise<{ branding: PortalBranding }> : null)
      .then((data) => {
        if (data?.branding) setBranding(data.branding)
      })
      .catch(() => undefined)
  }, [])

  return <PortalLoginForm branding={branding} />
}
