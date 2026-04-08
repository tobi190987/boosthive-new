'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface BulkAction {
  label: string
  onClick: () => void
  variant?: 'default' | 'destructive' | 'outline'
  disabled?: boolean
}

interface BulkActionBarProps {
  selectedCount: number
  actions: BulkAction[]
  onClear: () => void
  className?: string
}

export function BulkActionBar({ selectedCount, actions, onClear, className }: BulkActionBarProps) {
  if (selectedCount === 0) return null

  return (
    <div
      className={cn(
        'fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xl dark:border-border dark:bg-card',
        className
      )}
    >
      <span className="shrink-0 text-sm font-semibold text-slate-700 dark:text-slate-300">
        {selectedCount} ausgewählt
      </span>
      <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-border" />
      <div className="flex items-center gap-2">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant={action.variant ?? 'outline'}
            size="sm"
            className="rounded-full"
            onClick={action.onClick}
            disabled={action.disabled}
          >
            {action.label}
          </Button>
        ))}
      </div>
      <button
        type="button"
        onClick={onClear}
        aria-label="Auswahl aufheben"
        className="ml-1 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
