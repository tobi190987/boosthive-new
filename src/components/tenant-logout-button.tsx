'use client'

import { useState, type ReactNode } from 'react'
import { LogOut, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface TenantLogoutButtonProps {
  className?: string
  label?: string
  icon?: ReactNode
}

export function TenantLogoutButton({
  className,
  label = 'Abmelden',
  icon,
}: TenantLogoutButtonProps = {}) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleLogout() {
    if (isSubmitting) return

    setIsSubmitting(true)

    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
      })
    } finally {
      window.location.assign('/login')
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        'rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
        className
      )}
      onClick={handleLogout}
      disabled={isSubmitting}
    >
      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : icon ?? <LogOut className="h-4 w-4" />}
      {label}
    </Button>
  )
}
