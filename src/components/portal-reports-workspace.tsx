'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Download, FileText, Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface PortalReport {
  id: string
  title: string
  description: string | null
  created_at: string
  file_size_kb: number | null
  download_url: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function formatSize(kb: number | null): string {
  if (kb === null) return ''
  if (kb < 1024) return `${kb} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

export function PortalReportsWorkspace() {
  const router = useRouter()
  const [reports, setReports] = useState<PortalReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/reports')
      if (res.status === 401) {
        router.replace('/portal/login')
        return
      }
      if (!res.ok) throw new Error('Reports konnten nicht geladen werden.')
      const json = await res.json() as { reports: PortalReport[] }
      setReports(json.reports ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler.')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  async function handleDownload(report: PortalReport) {
    setDownloading(report.id)
    try {
      const res = await fetch(report.download_url)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${report.title}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // Fallback: open in new tab
      window.open(report.download_url, '_blank')
    } finally {
      setDownloading(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
      </div>
    )
  }

  if (error) {
    return (
      <Alert className="rounded-xl border-red-200 bg-red-50 text-red-700">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Reports</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Von deiner Agentur freigegebene Berichte zum Herunterladen.
        </p>
      </div>

      {reports.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center dark:border-slate-700 dark:bg-slate-900">
          <FileText className="h-10 w-10 text-slate-300 dark:text-slate-600" />
          <div>
            <p className="font-medium text-slate-600 dark:text-slate-400">Keine Reports verfügbar</p>
            <p className="mt-0.5 text-sm text-slate-400 dark:text-slate-600">
              Deine Agentur hat noch keine Reports freigegeben.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <Card key={report.id} className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-start justify-between gap-4 pt-4 pb-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950">
                    <FileText className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{report.title}</p>
                    {report.description && (
                      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{report.description}</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-400">{formatDate(report.created_at)}</span>
                      {report.file_size_kb !== null && (
                        <>
                          <span className="text-xs text-slate-300 dark:text-slate-600">·</span>
                          <Badge variant="secondary" className="text-xs font-normal">
                            PDF · {formatSize(report.file_size_kb)}
                          </Badge>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={downloading === report.id}
                  onClick={() => void handleDownload(report)}
                >
                  {downloading === report.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span className="ml-1.5 hidden sm:block">Herunterladen</span>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
