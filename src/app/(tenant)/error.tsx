"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Home, RefreshCw } from "lucide-react"

function getErrorMessage(error: Error): { title: string; description: string } {
  const msg = error.message?.toLowerCase() ?? ''

  if (msg.includes('unauthorized') || msg.includes('nicht autorisiert') || msg.includes('forbidden')) {
    return {
      title: 'Zugriff verweigert',
      description: 'Du hast keine Berechtigung für diese Seite. Melde dich erneut an oder kontaktiere deinen Admin.',
    }
  }
  if (msg.includes('not found') || msg.includes('nicht gefunden')) {
    return {
      title: 'Nicht gefunden',
      description: 'Der angeforderte Inhalt konnte nicht gefunden werden. Er wurde möglicherweise gelöscht oder verschoben.',
    }
  }
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('connection')) {
    return {
      title: 'Verbindungsproblem',
      description: 'Es konnte keine Verbindung zum Server hergestellt werden. Überprüfe deine Internetverbindung.',
    }
  }
  return {
    title: 'Etwas ist schiefgelaufen',
    description: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut oder kontaktiere den Support.',
  }
}

export default function TenantError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    console.error(error)
  }, [error])

  const { title, description } = getErrorMessage(error)

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground max-w-md">{description}</p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/60 font-mono">
            Fehler-ID: {error.digest}
          </p>
        )}
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => router.push('/dashboard')}>
          <Home className="mr-2 h-4 w-4" />
          Dashboard
        </Button>
        <Button onClick={reset}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Erneut versuchen
        </Button>
      </div>
    </div>
  )
}
