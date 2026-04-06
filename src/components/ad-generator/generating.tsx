'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { AD_PLATFORMS_MAP, type PlatformId } from '@/lib/ad-limits'

// ─── Constants ───────────────────────────────────────────────────────────────

export const GENERATING_PHASES = [
  'Briefing wird analysiert...',
  'KI erstellt Ad-Texte...',
  'Zeichenlimits werden geprüft...',
  'Fast fertig...',
]
export const GENERATING_PHASE_DELAYS = [2500, 14000, 8000]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function platformLabel(id: PlatformId): string {
  return AD_PLATFORMS_MAP[id]?.label ?? id
}

// ─── Generating View ─────────────────────────────────────────────────────────

export function GeneratingView({ platforms }: { platforms: PlatformId[] }) {
  const [phaseIndex, setPhaseIndex] = useState(0)

  useEffect(() => {
    let current = 0
    const timers: ReturnType<typeof setTimeout>[] = []
    function advance() {
      current++
      if (current < GENERATING_PHASES.length) {
        setPhaseIndex(current)
        if (current < GENERATING_PHASE_DELAYS.length) {
          timers.push(setTimeout(advance, GENERATING_PHASE_DELAYS[current]))
        }
      }
    }
    timers.push(setTimeout(advance, GENERATING_PHASE_DELAYS[0]))
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <Card className="rounded-[2rem] border border-slate-100 dark:border-[#252d3a] bg-white dark:bg-[#151c28] shadow-soft">
      <CardContent className="flex flex-col items-center gap-6 p-8 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/30">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Ad-Texte werden generiert...
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 transition-all">
            {GENERATING_PHASES[phaseIndex]}
          </p>
          <div className="mt-4 flex justify-center gap-1.5">
            {GENERATING_PHASES.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1.5 w-6 rounded-full transition-colors duration-500',
                  i <= phaseIndex
                    ? 'bg-blue-500 dark:bg-blue-400'
                    : 'bg-slate-100 dark:bg-slate-800'
                )}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {platforms.map((pid) => (
            <Badge
              key={pid}
              variant="secondary"
              className="flex items-center gap-1.5 rounded-full px-3 py-1"
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              {platformLabel(pid)}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
