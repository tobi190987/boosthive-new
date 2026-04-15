import type { ReactNode } from 'react'
import '@/app/globals.css'

// Minimal layout for the print view — no sidebar, no header, no shell.
export default function SeoPrintLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <head>
        <meta charSet="utf-8" />
        <style>{`
          @page { size: A4; margin: 14mm 12mm; }
          *, *::before, *::after { box-sizing: border-box; }
          html, body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        `}</style>
      </head>
      <body className="bg-white">{children}</body>
    </html>
  )
}
