'use client'

import { useState, type ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'

interface InlineConfirmProps {
  /** The trigger element (e.g. a delete icon button) */
  children: ReactNode
  /** Confirmation message shown in the popover */
  message?: string
  /** Label for the confirm button */
  confirmLabel?: string
  /** Called when the user confirms */
  onConfirm: () => void | Promise<void>
  /** Variant for the confirm button */
  variant?: 'destructive' | 'default'
}

export function InlineConfirm({
  children,
  message = 'Bist du sicher?',
  confirmLabel = 'Löschen',
  onConfirm,
  variant = 'destructive',
}: InlineConfirmProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onConfirm()
    } finally {
      setLoading(false)
      setOpen(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-auto max-w-[220px] p-3" align="end">
        <p className="mb-3 text-sm text-slate-700 dark:text-slate-300">{message}</p>
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => setOpen(false)}
          >
            Abbrechen
          </Button>
          <Button
            type="button"
            variant={variant}
            size="sm"
            className="h-7 px-2.5 text-xs"
            disabled={loading}
            onClick={handleConfirm}
          >
            {loading ? '…' : confirmLabel}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
