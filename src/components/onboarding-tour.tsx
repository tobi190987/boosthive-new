'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

const STEPS = [
  {
    element: '[data-tour="sidebar-nav"]',
    popover: {
      title: 'Sidebar',
      description: 'Hier navigierst du durch den gesamten Workspace. Bereiche lassen sich auf- und zuklappen, damit du schnell zwischen Modulen und Verwaltungsseiten wechseln kannst.',
      side: 'right' as const,
    },
  },
  {
    element: '[data-tour="nav-dashboard"]',
    popover: {
      title: 'Dashboard',
      description: 'Das Dashboard ist dein täglicher Startpunkt. Hier siehst du Kennzahlen, offene Themen und den aktuellen Zustand eures Workspaces.',
      side: 'right' as const,
    },
  },
  {
    element: '[data-tour="nav-analysis-group"]',
    popover: {
      title: 'Analyse & SEO',
      description: 'In diesem Bereich findest du SEO Analyse, Keywordranking, AI Performance und AI Visibility. Diese Module helfen euch bei Audits, Monitoring und datenbasierten Empfehlungen.',
      side: 'right' as const,
    },
  },
  {
    element: '[data-tour="nav-content-group"]',
    popover: {
      title: 'Content & Kampagnen',
      description: 'Hier liegen Content Briefs, Ad Generator, Ads Bibliothek und der Content Workflow. Damit bildet ihr Strategie, Erstellung, Ablage und Freigaben in einem Flow ab.',
      side: 'right' as const,
    },
  },
  {
    element: '[data-tour="nav-admin-group"]',
    popover: {
      title: 'Verwaltung',
      description: 'Admins steuern hier Kunden, Team, Rechtliches und Abrechnung. Members sehen diesen Bereich nur, wenn ihre Rolle entsprechende Punkte freigibt.',
      side: 'right' as const,
    },
  },
  {
    element: '[data-tour="customer-selector"]',
    popover: {
      title: 'Kunden-Selektor',
      description: 'Wähle hier den aktiven Kunden aus. Viele Bereiche filtern ihre Daten direkt auf diesen Kontext, damit Analysen und Inhalte sauber zugeordnet bleiben.',
      side: 'bottom' as const,
    },
  },
  {
    element: '[data-tour="command-palette"]',
    popover: {
      title: 'Schnellsuche',
      description: 'Mit ⌘K beziehungsweise Strg+K springst du direkt zu Seiten, Inhalten und Funktionen. Gerade in größeren Workspaces spart dir das viele Klicks.',
      side: 'top' as const,
    },
  },
  {
    element: '[data-tour="notification-bell"]',
    popover: {
      title: 'Benachrichtigungen',
      description: 'Hier siehst du Freigaben, Rückmeldungen und wichtige Team-Aktivitäten. So gehen keine Review- oder Abstimmungsaufgaben verloren.',
      side: 'left' as const,
    },
  },
  {
    element: '[data-tour="help-link"]',
    popover: {
      title: 'Hilfe & Dokumentation',
      description: 'Wenn du später etwas nachschlagen möchtest, findest du hier die Dokumentation. Von dort aus kannst du die Tour auch jederzeit erneut starten.',
      side: 'right' as const,
    },
  },
]

interface OnboardingTourProps {
  tenantId: string
  userId: string
  enabled?: boolean
}

function getTourKey(tenantId: string, userId: string) {
  return `boosthive_onboarding_tour_done:${tenantId}:${userId}`
}

function getTourPendingKey(tenantId: string, userId: string) {
  return `boosthive_onboarding_tour_pending:${tenantId}:${userId}`
}

function launchTour(storageKey: string) {
  const driverObj = driver({
    showProgress: true,
    steps: STEPS.filter((step) => {
      if (!step.element) return true
      return document.querySelector(step.element) !== null
    }),
    onDestroyed: () => {
      localStorage.setItem(storageKey, 'true')
    },
    nextBtnText: 'Weiter',
    prevBtnText: 'Zurück',
    doneBtnText: 'Fertig',
    progressText: '{{current}} von {{total}}',
  })
  driverObj.drive()
}

export function OnboardingTour({ tenantId, userId, enabled = true }: OnboardingTourProps) {
  const ran = useRef(false)
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    if (!enabled || pathname === '/onboarding') return

    const storageKey = getTourKey(tenantId, userId)
    const pendingKey = getTourPendingKey(tenantId, userId)
    const forceRun = searchParams.get('tour') === '1'
    const done = localStorage.getItem(storageKey)
    const pending = localStorage.getItem(pendingKey) === 'true'
    if ((done || !pending) && !forceRun) return

    const timer = setTimeout(() => {
      launchTour(storageKey)
      localStorage.removeItem(pendingKey)
    }, 600)

    return () => clearTimeout(timer)
  }, [enabled, pathname, searchParams, tenantId, userId])

  useEffect(() => {
    if (!enabled || pathname === '/onboarding') return

    const storageKey = getTourKey(tenantId, userId)
    const handleStart = () => {
      ran.current = true
      localStorage.removeItem(storageKey)
      setTimeout(() => launchTour(storageKey), 50)
    }

    window.addEventListener('boosthive:onboarding-tour:start', handleStart)
    return () => window.removeEventListener('boosthive:onboarding-tour:start', handleStart)
  }, [enabled, pathname, tenantId, userId])

  return null
}

export function restartOnboardingTour() {
  window.dispatchEvent(new Event('boosthive:onboarding-tour:start'))
}

interface OnboardingTourTriggerProps {
  tenantId: string
  userId: string
}

export function OnboardingTourTrigger({ tenantId, userId }: OnboardingTourTriggerProps) {
  useEffect(() => {
    const pendingKey = getTourPendingKey(tenantId, userId)
    localStorage.setItem(pendingKey, 'true')
  }, [tenantId, userId])

  return null
}
