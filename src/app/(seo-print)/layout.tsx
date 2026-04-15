import type { ReactNode } from 'react'

// Minimal layout for the print view — no sidebar, no header, no shell.
// Note: html/body are provided by the root layout (app/layout.tsx).
export default function SeoPrintLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
