import Link from 'next/link'
import { FileText, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const entries = [
  {
    href: '/owner/legal/sub-processors',
    title: 'Sub-Processor Transparency',
    description:
      'Automatische Uebersicht der in BoostHive genutzten externen APIs und Dienste fuer Agentur- und Datenschutzdokumentation.',
    icon: ShieldCheck,
  },
  {
    href: '/owner/legal/impressum',
    title: 'Impressum',
    description:
      'Interne Owner-Version der rechtlichen Pflichtangaben mit derselben Quelle wie die oeffentliche Impressumsseite.',
    icon: FileText,
  },
]

export default function OwnerLegalIndexPage() {
  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border border-slate-100 bg-white shadow-soft dark:border-border dark:bg-card">
        <CardHeader className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-600">
            Legal
          </p>
          <CardTitle className="text-2xl text-slate-950 dark:text-slate-50">
            Interner Compliance-Bereich
          </CardTitle>
          <p className="max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">
            Dieser Bereich ist nur fuer Plattform-Owner sichtbar und bewusst nicht prominent in
            der Navigation verlinkt.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {entries.map((entry) => (
            <Link
              key={entry.href}
              href={entry.href}
              className="rounded-2xl border border-slate-200 p-5 transition hover:border-slate-300 hover:bg-slate-50 dark:border-border dark:hover:bg-secondary"
            >
              <entry.icon className="h-5 w-5 text-blue-600" />
              <h2 className="mt-4 text-lg font-semibold text-slate-950 dark:text-slate-50">
                {entry.title}
              </h2>
              <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">
                {entry.description}
              </p>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
