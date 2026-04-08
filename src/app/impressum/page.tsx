import Link from 'next/link'
import { LegalImprintContent } from '@/components/legal-imprint-content'
import { imprintContent } from '@/lib/legal'

export default function ImpressumPage() {
  return (
    <main className="min-h-screen bg-[#f8fafc] px-4 py-10 dark:bg-[#0b1120] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-2xl border border-slate-100 dark:border-border bg-slate-50 dark:bg-card p-8 shadow-soft sm:p-10">
          <div className="space-y-8">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-600">
                {imprintContent.eyebrow}
              </p>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                {imprintContent.title}
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                {imprintContent.description}
              </p>
            </div>

            <LegalImprintContent />

            <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 dark:border-border pt-6 text-sm text-slate-600 dark:text-slate-300">
              <Link
                href="/access"
                className="font-medium text-blue-600 underline decoration-blue-300 underline-offset-4"
              >
                Zurück zur Access-Seite
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
