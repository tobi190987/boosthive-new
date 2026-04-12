import type { ReactNode } from 'react'

// Minimal portal layout — auth and branding are handled per-page (client-side)
// to support both unauthenticated (login) and authenticated portal pages
export default function PortalLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
