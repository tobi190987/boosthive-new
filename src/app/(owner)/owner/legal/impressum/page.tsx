import Link from 'next/link'
import { FileText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LegalImprintContent } from '@/components/legal-imprint-content'
import { imprintContent } from '@/lib/legal'

export default function OwnerImpressumPage() {
  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border border-slate-100 bg-white shadow-soft dark:border-border dark:bg-card">
        <CardHeader className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-600">
            {imprintContent.eyebrow}
          </p>
          <CardTitle className="flex items-center gap-2 text-2xl text-slate-950 dark:text-slate-50">
            <FileText className="h-5 w-5 text-blue-600" />
            {imprintContent.title}
          </CardTitle>
          <p className="max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">
            {imprintContent.description}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <LegalImprintContent />

          <div className="flex flex-wrap gap-4 border-t border-slate-100 pt-6 text-sm dark:border-border">
            <Link
              href="/impressum"
              className="font-medium text-blue-600 underline decoration-blue-300 underline-offset-4"
            >
              Oeffentliche Version oeffnen
            </Link>
            <Link
              href="/owner/legal"
              className="font-medium text-slate-600 underline decoration-slate-300 underline-offset-4 dark:text-slate-300"
            >
              Zum Legal-Bereich
            </Link>
            <Link
              href="/owner/legal/sub-processors"
              className="font-medium text-slate-600 underline decoration-slate-300 underline-offset-4 dark:text-slate-300"
            >
              Zur Sub-Processor-Uebersicht
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
