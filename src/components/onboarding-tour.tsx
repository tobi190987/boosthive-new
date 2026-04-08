'use client'

import { useEffect, useRef } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

const TOUR_KEY = 'boosthive_onboarding_tour_done'

const STEPS = [
  {
    element: '[data-tour="sidebar-nav"]',
    popover: {
      title: 'Navigation',
      description: 'Alle Tools und Module erreichst du über die Seitenleiste. Klicke auf eine Sektion, um sie auf- oder zuzuklappen.',
      side: 'right' as const,
    },
  },
  {
    element: '[data-tour="customer-selector"]',
    popover: {
      title: 'Kunden-Selektor',
      description: 'Wähle hier deinen aktiven Kunden aus. Alle Tools zeigen dann die Daten für diesen Kunden.',
      side: 'bottom' as const,
    },
  },
  {
    element: '[data-tour="command-palette"]',
    popover: {
      title: 'Schnellsuche',
      description: 'Mit ⌘K öffnest du die Suche — navigiere zu jeder Seite oder finde Inhalte blitzschnell.',
      side: 'top' as const,
    },
  },
  {
    element: '[data-tour="notification-bell"]',
    popover: {
      title: 'Benachrichtigungen',
      description: 'Hier siehst du aktuelle Freigabe-Anfragen und Aktivitäten deines Teams.',
      side: 'left' as const,
    },
  },
]

interface OnboardingTourProps {
  /** If true, force-run the tour even if already done (e.g. from Help page) */
  forceRun?: boolean
}

export function OnboardingTour({ forceRun = false }: OnboardingTourProps) {
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const done = localStorage.getItem(TOUR_KEY)
    if (done && !forceRun) return

    // Small delay to let the layout render
    const timer = setTimeout(() => {
      const driverObj = driver({
        showProgress: true,
        steps: STEPS.filter((step) => {
          if (!step.element) return true
          return document.querySelector(step.element) !== null
        }),
        onDestroyed: () => {
          localStorage.setItem(TOUR_KEY, 'true')
        },
        nextBtnText: 'Weiter',
        prevBtnText: 'Zurück',
        doneBtnText: 'Fertig',
        progressText: '{{current}} von {{total}}',
      })
      driverObj.drive()
    }, 600)

    return () => clearTimeout(timer)
  }, [forceRun])

  return null
}

/** Clears the tour-done flag so it runs again on next page load */
export function resetOnboardingTour() {
  localStorage.removeItem(TOUR_KEY)
}
