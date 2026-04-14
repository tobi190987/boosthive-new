'use client'

import { HelpCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface ModuleHelpTooltipProps {
  tagline: string
  features: string[]
}

export function ModuleHelpTooltip({ tagline, features }: ModuleHelpTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-400 transition-colors"
          aria-label="Modul-Info"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[280px] space-y-2">
        <p className="text-xs font-medium">{tagline}</p>
        <ul className="space-y-0.5">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-1.5 text-xs">
              <span className="mt-0.5 shrink-0">•</span>
              {feature}
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  )
}
