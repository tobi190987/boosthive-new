"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

export default function OwnerError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-foreground">Etwas ist schiefgelaufen</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut oder kontaktiere den Support.
        </p>
      </div>
      <Button onClick={reset} variant="outline">
        Erneut versuchen
      </Button>
    </div>
  )
}
