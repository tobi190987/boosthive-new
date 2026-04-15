'use client'

import { useEffect } from 'react'

export function PrintTrigger() {
  useEffect(() => {
    const id = window.setTimeout(() => window.print(), 600)
    return () => window.clearTimeout(id)
  }, [])
  return null
}
