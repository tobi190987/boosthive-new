'use client'

import { useState } from 'react'
import { LogOut, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function TenantLogoutButton() {
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
      className="rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      onClick={handleLogout}
      disabled={isSubmitting}
    >
      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
      Abmelden
    </Button>
  )
}
