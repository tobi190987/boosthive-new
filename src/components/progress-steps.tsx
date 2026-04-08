'use client'

import { Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ProgressStep {
  id: string
  label: string
  status: 'pending' | 'active' | 'done' | 'error'
}

interface ProgressStepsProps {
  steps: ProgressStep[]
  className?: string
}

export function ProgressSteps({ steps, className }: ProgressStepsProps) {
  return (
    <ol className={cn('flex flex-col gap-2', className)}>
      {steps.map((step, index) => (
        <li key={step.id} className="flex items-center gap-3">
          {/* Step indicator */}
          <div
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors',
              step.status === 'done' && 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400',
              step.status === 'active' && 'bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400',
              step.status === 'error' && 'bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400',
              step.status === 'pending' && 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
            )}
          >
            {step.status === 'done' ? (
              <Check className="h-3.5 w-3.5" />
            ) : step.status === 'active' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <span>{index + 1}</span>
            )}
          </div>
          {/* Label */}
          <span
            className={cn(
              'text-sm transition-colors',
              step.status === 'done' && 'text-slate-500 dark:text-slate-400 line-through decoration-slate-300',
              step.status === 'active' && 'font-semibold text-slate-900 dark:text-slate-100',
              step.status === 'error' && 'text-red-600 dark:text-red-400',
              step.status === 'pending' && 'text-slate-400 dark:text-slate-500'
            )}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** Hook to build steps array easily */
export function buildSteps(
  labels: string[],
  currentIndex: number,
  hasError?: boolean
): ProgressStep[] {
  return labels.map((label, i) => ({
    id: String(i),
    label,
    status:
      hasError && i === currentIndex
        ? 'error'
        : i < currentIndex
          ? 'done'
          : i === currentIndex
            ? 'active'
            : 'pending',
  }))
}
