'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Download, FileText, Loader2, ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LegalImprintContent } from '@/components/legal-imprint-content'
import { SUBPROCESSOR_LAST_AUDIT_LABEL, type SubprocessorEntry } from '@/lib/legal'

interface AuditItem {
  id: string
  actor_user_id: string | null
  actor_display_name: string
  action_type: 'data_export' | 'data_delete'
  resource_type: string
  resource_id: string | null
  context: Record<string, unknown>
  created_at: string
}

interface LegalPrivacyWorkspaceProps {
  subprocessorEntries: SubprocessorEntry[]
}

async function downloadFromEndpoint(url: string, fileName: string) {
  const res = await fetch(url)
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error((payload as { error?: string }).error ?? 'Download fehlgeschlagen.')
  }

  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = fileName
  a.click()
  URL.revokeObjectURL(objectUrl)
}

export function LegalPrivacyWorkspace({ subprocessorEntries }: LegalPrivacyWorkspaceProps) {
  const [auditItems, setAuditItems] = useState<AuditItem[]>([])
  const [auditLoading, setAuditLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloadingAv, setDownloadingAv] = useState(false)
  const [downloadingExport, setDownloadingExport] = useState(false)
  const [deletingData, setDeletingData] = useState(false)

  async function loadAuditLog() {
    setAuditLoading(true)
    try {
      const res = await fetch('/api/tenant/legal/audit-logs')
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((payload as { error?: string }).error ?? 'Audit-Log konnte nicht geladen werden.')
      setAuditItems((payload.items ?? []) as AuditItem[])
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Audit-Log konnte nicht geladen werden.')
    } finally {
      setAuditLoading(false)
    }
  }

  useEffect(() => {
    void loadAuditLog()
  }, [])

  async function handleDownloadAvContract() {
    setDownloadingAv(true)
    setError(null)
    try {
      const datePart = new Date().toISOString().slice(0, 10)
      await downloadFromEndpoint('/api/tenant/legal/av-contract', `av-vertrag_${datePart}.pdf`)
      await loadAuditLog()
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'AV-Vertrag konnte nicht erstellt werden.')
    } finally {
      setDownloadingAv(false)
    }
  }

  async function handleDataExport() {
    setDownloadingExport(true)
    setError(null)
    try {
      const datePart = new Date().toISOString().slice(0, 10)
      await downloadFromEndpoint('/api/tenant/legal/data-export', `datenexport_${datePart}.json`)
      await loadAuditLog()
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Datenexport fehlgeschlagen.')
    } finally {
      setDownloadingExport(false)
    }
  }

  async function handleDeleteAllData() {
    const confirmed = window.confirm(
      'Möchtest du wirklich ALLE gespeicherten Aktivitäten und Projekte dieses Tenants löschen?\n\nDas betrifft: SEO-Analysen, AI-Performance, AI-Visibility, Keyword-Projekte, Kunden, Content-Briefs, Anzeigen, Freigaben und Benachrichtigungen.\n\nDiese Aktion kann nicht rückgängig gemacht werden.'
    )
    if (!confirmed) return

    setDeletingData(true)
    setError(null)
    try {
      const res = await fetch('/api/tenant/legal/delete-all-data', { method: 'DELETE' })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((payload as { error?: string }).error ?? 'Löschen fehlgeschlagen.')
      await loadAuditLog()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Löschen fehlgeschlagen.')
    } finally {
      setDeletingData(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border border-slate-100 bg-white shadow-soft dark:border-border dark:bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl text-slate-900 dark:text-slate-100">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            Rechtliches & Datenschutz
          </CardTitle>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            DSGVO-Basisfunktionen für AV-Vertrag, Datenauszug und nachweisbare Lösch-/Exportaktionen.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="dark"
              className="gap-2"
              onClick={() => void handleDownloadAvContract()}
              disabled={downloadingAv}
            >
              {downloadingAv ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              AV-Vertrag als PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => void handleDataExport()}
              disabled={downloadingExport}
            >
              {downloadingExport ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Datenauszug exportieren
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2 border-rose-200 text-rose-700 hover:bg-rose-50"
              onClick={() => void handleDeleteAllData()}
              disabled={deletingData}
            >
              {deletingData ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Alle Aktivitäten & Projekte löschen
            </Button>
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-slate-100 bg-white shadow-soft dark:border-border dark:bg-card">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900 dark:text-slate-100">Audit-Log</CardTitle>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Nachweis aller protokollierten Export- und Löschaktionen im Tenant.
          </p>
        </CardHeader>
        <CardContent>
          {auditLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Audit-Log wird geladen...
            </div>
          ) : auditItems.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Noch keine Audit-Einträge vorhanden.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-border">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-secondary">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Zeitpunkt</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Aktion</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Ressource</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">User</th>
                  </tr>
                </thead>
                <tbody>
                  {auditItems.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100 dark:border-border">
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                        {new Date(item.created_at).toLocaleString('de-DE')}
                      </td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                        {item.action_type === 'data_export' ? 'Export' : 'Löschung'}
                      </td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                        {item.resource_type}
                        {item.resource_id ? ` (${item.resource_id})` : ''}
                      </td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                        {item.actor_display_name}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-slate-100 bg-white shadow-soft dark:border-border dark:bg-card">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <CardTitle className="flex items-center gap-2 text-xl text-slate-900 dark:text-slate-100">
                <ShieldCheck className="h-5 w-5 text-blue-600" />
                Liste der Unterauftragsverarbeiter (Sub-Processors)
              </CardTitle>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Rechtlich gepflegte Übersicht der eingesetzten Dienstleister für Dokumentation,
                Datenschutzabstimmung und Agentur-Compliance.
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
                {subprocessorEntries.map((entry) => (
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
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-slate-100 bg-white shadow-soft dark:border-border dark:bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl text-slate-900 dark:text-slate-100">
            <FileText className="h-5 w-5 text-blue-600" />
            Impressum
          </CardTitle>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Interne Referenz für rechtliche Pflichtangaben, damit Admins die Informationen direkt
            aus der Verwaltung heraus nutzen können.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <LegalImprintContent />
          <div className="border-t border-slate-100 pt-4 text-sm dark:border-border">
            <Link
              href="/impressum"
              className="font-medium text-blue-600 underline decoration-blue-300 underline-offset-4"
            >
              Öffentliche Version öffnen
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
