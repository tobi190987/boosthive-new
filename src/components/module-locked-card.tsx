import { Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface ModuleLockedCardProps {
  moduleName: string
  isAdmin: boolean
}

export function ModuleLockedCard({ moduleName, isAdmin }: ModuleLockedCardProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center p-8">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Lock className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-foreground">{moduleName} ist nicht freigeschaltet</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          {isAdmin
            ? "Dieses Modul ist noch nicht aktiviert. Gehe zur Abrechnung um es freizuschalten."
            : "Dieses Modul ist nicht in deinem Plan enthalten. Kontaktiere deinen Administrator."}
        </p>
      </div>
      {isAdmin && (
        <Button asChild variant="dark">
          <Link href="/billing">Modul freischalten</Link>
        </Button>
      )}
    </div>
  )
}
