'use client'

import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface FilterChip {
  id: string
  label: string
}

interface FilterChipsProps {
  chips: FilterChip[]
  activeIds: string[]
  onToggle: (id: string) => void
  /** Show clear-all button when any filter is active */
  showClear?: boolean
  onClear?: () => void
  className?: string
}

export function FilterChips({
  chips,
  activeIds,
  onToggle,
  showClear = true,
  onClear,
  className,
}: FilterChipsProps) {
  const hasActive = activeIds.length > 0

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {chips.map((chip) => {
        const isActive = activeIds.includes(chip.id)
        return (
          <button
            key={chip.id}
            type="button"
            onClick={() => onToggle(chip.id)}
            className={cn(
              'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              isActive
                ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-border dark:bg-card dark:text-slate-400 dark:hover:bg-secondary'
            )}
          >
            {chip.label}
          </button>
        )
      })}
      {showClear && hasActive && onClear && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-7 gap-1.5 rounded-full px-2.5 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <X className="h-3 w-3" />
          Zurücksetzen
        </Button>
      )}
    </div>
  )
}
