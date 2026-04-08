'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'

NProgress.configure({ showSpinner: false, speed: 300, minimum: 0.1 })

export function RouterProgressBar() {
  const pathname = usePathname()

  useEffect(() => {
    NProgress.done()
  }, [pathname])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = (e.target as HTMLElement).closest('a')
      if (!target) return
      const href = target.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('http') || target.target === '_blank') return
      NProgress.start()
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  return null
}
