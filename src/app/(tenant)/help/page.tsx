import { HelpCenterPage } from '@/components/help-center-page'

export default function TenantHelpPage() {
  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Hilfe & Support</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Anleitungen, FAQ und Dokumentation zu allen BoostHive-Funktionen.
        </p>
      </div>
      <HelpCenterPage />
    </div>
  )
}
