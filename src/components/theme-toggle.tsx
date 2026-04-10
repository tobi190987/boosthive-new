'use client'

import { useId } from 'react'
import { useTheme } from 'next-themes'
import { Monitor, Moon, Sun } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const options = [
  { value: 'light', icon: Sun, label: 'Hell' },
  { value: 'system', icon: Monitor, label: 'System' },
  { value: 'dark', icon: Moon, label: 'Dunkel' },
] as const

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const triggerId = useId()
  const contentId = useId()

  const active = options.find((o) => o.value === theme) ?? options[1]
  const ActiveIcon = active.icon

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              id={triggerId}
              type="button"
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300',
                className
              )}
              aria-label="Theme wechseln"
            >
              <ActiveIcon className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Theme wechseln</TooltipContent>
      </Tooltip>
      <DropdownMenuContent id={contentId} aria-labelledby={triggerId} align="end" side="top" className="w-36">
        {options.map(({ value, icon: Icon, label }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className={cn(
              'flex items-center gap-2.5 cursor-pointer',
              theme === value && 'font-medium text-blue-600 dark:text-blue-400'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
