'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { PortalShell } from '@/components/portal-shell'

interface PortalBranding {
  agencyName: string
  logoUrl: string | null
  primaryColor: string
}

interface PortalVisibility {
  show_ga4: boolean
  show_ads: boolean
  show_seo: boolean
  show_reports: boolean
}

interface PortalSession {
  customerName: string
  branding: PortalBranding
  visibility: PortalVisibility
}

interface PortalAuthenticatedPageProps {
  children: ReactNode
}

export function PortalAuthenticatedPage({ children }: PortalAuthenticatedPageProps) {
  const router = useRouter()
  const [session, setSession] = useState<PortalSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/portal/session')
      .then(async (res) => {
        if (res.status === 401) {
          router.replace('/portal/login')
          return
        }
        if (!res.ok) throw new Error()
        return res.json() as Promise<PortalSession>
      })
      .then((data) => {
        if (data) setSession(data)
      })
      .catch(() => {
        router.replace('/portal/login')
      })
      .finally(() => setLoading(false))
  }, [router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!session) return null

  return (
    <PortalShell
      branding={session.branding}
      visibility={session.visibility}
      customerName={session.customerName}
    >
      {children}
    </PortalShell>
  )
}
