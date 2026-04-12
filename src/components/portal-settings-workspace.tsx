'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { ExternalLink, Globe, Loader2, Paintbrush, Save } from 'lucide-react'

interface PortalSettings {
  portal_logo_url: string | null
  primary_color: string
  agency_name: string
  custom_domain: string | null
}

const DEFAULT_SETTINGS: PortalSettings = {
  portal_logo_url: null,
  primary_color: '#3b82f6',
  agency_name: '',
  custom_domain: null,
}

export function PortalSettingsWorkspace() {
  const [settings, setSettings] = useState<PortalSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/tenant/portal/settings')
      if (!res.ok) throw new Error()
      const data = await res.json() as { settings: PortalSettings }
      setSettings({ ...DEFAULT_SETTINGS, ...data.settings })
    } catch {
      // Keep defaults on first load (settings may not exist yet)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/tenant/portal/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? 'Fehler beim Speichern.')
      }
      toast.success('Portal-Einstellungen gespeichert.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler beim Speichern.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Branding */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Paintbrush className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-base">Branding</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="agency-name">Agenturname im Portal</Label>
            <Input
              id="agency-name"
              placeholder="Meine Agentur GmbH"
              value={settings.agency_name}
              onChange={(e) => setSettings({ ...settings, agency_name: e.target.value })}
            />
            <p className="text-xs text-slate-500">Wird in der Portal-Kopfzeile und in E-Mails angezeigt.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="logo-url">Logo-URL</Label>
            <Input
              id="logo-url"
              type="url"
              placeholder="https://meine-agentur.de/logo.png"
              value={settings.portal_logo_url ?? ''}
              onChange={(e) => setSettings({ ...settings, portal_logo_url: e.target.value || null })}
            />
            <p className="text-xs text-slate-500">Empfohlen: SVG oder PNG mit transparentem Hintergrund, mind. 200px Breite.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="primary-color">Primärfarbe</Label>
            <div className="flex items-center gap-3">
              <input
                id="primary-color"
                type="color"
                value={settings.primary_color}
                onChange={(e) => setSettings({ ...settings, primary_color: e.target.value })}
                className="h-10 w-14 cursor-pointer rounded-lg border border-slate-200 bg-white p-1 dark:border-border dark:bg-card"
                aria-label="Primärfarbe auswählen"
              />
              <Input
                value={settings.primary_color}
                onChange={(e) => setSettings({ ...settings, primary_color: e.target.value })}
                placeholder="#3b82f6"
                className="w-32 font-mono text-sm"
                maxLength={7}
              />
              <div
                className="h-10 w-10 rounded-lg border border-slate-200 dark:border-border"
                style={{ backgroundColor: settings.primary_color }}
                aria-hidden="true"
              />
            </div>
            <p className="text-xs text-slate-500">Wird für Buttons und Akzentfarben im Portal verwendet.</p>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Vorschau Portal-Header</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div
            className="flex items-center gap-3 px-5 py-4"
            style={{ backgroundColor: settings.primary_color }}
          >
            {settings.portal_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.portal_logo_url}
                alt={settings.agency_name || 'Logo'}
                className="h-8 max-w-[140px] object-contain"
              />
            ) : (
              <span className="text-lg font-bold text-white">
                {settings.agency_name || 'Agentur-Name'}
              </span>
            )}
            <Badge variant="secondary" className="ml-auto bg-white/20 text-white border-white/30">
              Kundenportal
            </Badge>
          </div>
          <div className="border-t px-5 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            So sieht die Kopfzeile für deine Kunden aus.
          </div>
        </CardContent>
      </Card>

      {/* Custom Domain */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-base">Custom Domain (optional)</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="custom-domain">Custom Domain</Label>
            <Input
              id="custom-domain"
              type="url"
              placeholder="portal.meine-agentur.de"
              value={settings.custom_domain ?? ''}
              onChange={(e) => setSettings({ ...settings, custom_domain: e.target.value || null })}
            />
            <p className="text-xs text-slate-500">
              Lasse dieses Feld leer, um die Standard-URL zu verwenden:{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs dark:bg-slate-800">
                [deine-subdomain].boost-hive.de/portal
              </code>
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <ExternalLink className="h-4 w-4 shrink-0" />
            <span>Custom Domains erfordern eine separate DNS-Konfiguration. Kontaktiere den Support für die Einrichtung.</span>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex justify-end">
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Einstellungen speichern
        </Button>
      </div>
    </div>
  )
}
