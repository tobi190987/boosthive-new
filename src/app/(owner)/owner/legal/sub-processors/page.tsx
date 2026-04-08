import Link from 'next/link'
import { Bot, FileText, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getSubprocessorEntries, SUBPROCESSOR_LAST_AUDIT_LABEL } from '@/lib/legal'

export default function OwnerSubProcessorsPage() {
  const entries = getSubprocessorEntries()

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border border-slate-100 bg-white shadow-soft dark:border-border dark:bg-card">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-600">
                Sub-Processor Transparency
              </p>
              <CardTitle className="flex items-center gap-2 text-2xl text-slate-950 dark:text-slate-50">
                <ShieldCheck className="h-5 w-5 text-blue-600" />
                Liste der Unterauftragsverarbeiter (Sub-Processors)
              </CardTitle>
              <p className="max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                Übersicht der eingesetzten Dienstleister für Dokumentation, Datenschutzabstimmung
                und Agentur-Compliance.
              </p>
            </div>
            <Badge className="rounded-full bg-blue-50 px-3 py-1 text-blue-700 hover:bg-blue-50 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-950/50">
              Letzte rechtliche Prüfung: {SUBPROCESSOR_LAST_AUDIT_LABEL}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-border">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-slate-50 dark:bg-secondary">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">
                    Dienstleister
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">
                    Zweck der Verarbeitung
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">
                    Standort (Server)
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">
                    Garantie / Rechtsgrundlage
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.slug} className="border-t border-slate-100 align-top dark:border-border">
                    <td className="px-4 py-4 text-slate-900 dark:text-slate-100">
                      <div className="space-y-1">
                        <p className="font-medium">{entry.name}</p>
                        <a
                          href={entry.website}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-600 underline decoration-blue-300 underline-offset-4"
                        >
                          Website
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-700 dark:text-slate-300">{entry.purpose}</td>
                    <td className="px-4 py-4 text-slate-700 dark:text-slate-300">{entry.serverLocation}</td>
                    <td className="px-4 py-4 text-slate-700 dark:text-slate-300">{entry.guarantee}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-4 border-t border-slate-100 pt-6 text-sm dark:border-border">
            <Link
              href="/owner/legal/impressum"
              className="inline-flex items-center gap-2 font-medium text-slate-700 underline decoration-slate-300 underline-offset-4 dark:text-slate-200"
            >
              <FileText className="h-4 w-4" />
              Zum internen Impressum
            </Link>
            <Link
              href="/owner/legal"
              className="inline-flex items-center gap-2 font-medium text-blue-600 underline decoration-blue-300 underline-offset-4"
            >
              <Bot className="h-4 w-4" />
              Zum Legal-Bereich
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
