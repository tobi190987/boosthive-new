'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart3,
  Bot,
  CheckSquare,
  Eye,
  FileText,
  Keyboard,
  LayoutGrid,
  LayoutDashboard,
  Loader2,
  Megaphone,
  Search,
  UserRound,
} from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'

const SHORTCUTS = [
  { category: 'Navigation', keys: ['⌘', 'K'], label: 'Befehlspalette öffnen' },
  { category: 'Navigation', keys: ['?'], label: 'Shortcuts anzeigen' },
  { category: 'Navigation', keys: ['G', 'D'], label: 'Dashboard' },
  { category: 'Navigation', keys: ['G', 'C'], label: 'Kunden' },
  { category: 'Allgemein', keys: ['Esc'], label: 'Dialoge schließen' },
]

interface SearchResult {
  id: string
  label: string
  href: string
  group: string
  keywords?: string[]
}

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'SEO Analyse', href: '/tools/seo-analyse', icon: BarChart3 },
  { label: 'AI Performance', href: '/tools/ai-performance', icon: Bot },
  { label: 'AI Visibility', href: '/tools/ai-visibility', icon: Eye },
  { label: 'Content Briefs', href: '/tools/content-briefs', icon: FileText },
  { label: 'Ad Generator', href: '/tools/ad-generator', icon: Megaphone },
  { label: 'Kanban Board', href: '/tools/kanban', icon: LayoutGrid },
  { label: 'Keyword Rankings', href: '/tools/keywords', icon: Search },
  { label: 'Freigaben', href: '/tools/approvals', icon: CheckSquare },
  { label: 'Kunden', href: '/tools/customers', icon: UserRound },
]

export function GlobalCommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const chordRef = useRef<string | null>(null)
  const chordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
        return
      }
      if (isInput || e.metaKey || e.ctrlKey) return

      if (e.key === '?') {
        e.preventDefault()
        setShortcutsOpen((prev) => !prev)
        return
      }

      // Chord shortcuts: G → D / C
      if (e.key.toUpperCase() === 'G' && !chordRef.current) {
        chordRef.current = 'G'
        if (chordTimerRef.current) clearTimeout(chordTimerRef.current)
        chordTimerRef.current = setTimeout(() => { chordRef.current = null }, 1000)
        return
      }
      if (chordRef.current === 'G') {
        if (chordTimerRef.current) clearTimeout(chordTimerRef.current)
        chordRef.current = null
        if (e.key.toUpperCase() === 'D') {
          e.preventDefault()
          router.push('/dashboard')
        } else if (e.key.toUpperCase() === 'C') {
          e.preventDefault()
          router.push('/tools/customers')
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (chordTimerRef.current) clearTimeout(chordTimerRef.current)
    }
  }, [router])

  const search = useCallback(async (rawQuery: string) => {
    if (rawQuery.length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    try {
      const res = await fetch(`/api/tenant/search?q=${encodeURIComponent(rawQuery)}`, {
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      if (!res.ok) throw new Error('Suche fehlgeschlagen')
      const data = (await res.json()) as { results?: SearchResult[] }

      if (!controller.signal.aborted) {
        setResults(data.results ?? [])
      }
    } catch {
      // aborted or network error
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    const timeout = setTimeout(() => {
      void search(query)
    }, 300)
    return () => clearTimeout(timeout)
  }, [query, search])

  function handleSelect(href: string) {
    setOpen(false)
    setQuery('')
    setResults([])
    router.push(href)
  }

  const grouped = useMemo(
    () =>
      results.reduce<Record<string, SearchResult[]>>((acc, item) => {
        if (!acc[item.group]) acc[item.group] = []
        acc[item.group].push(item)
        return acc
      }, {}),
    [results]
  )

  return (
    <>
    <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-4 w-4" />
            Tastaturkürzel
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {Array.from(new Set(SHORTCUTS.map((s) => s.category))).map((cat) => (
            <div key={cat}>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{cat}</p>
              <ul className="space-y-1.5">
                {SHORTCUTS.filter((s) => s.category === cat).map((s) => (
                  <li key={s.label} className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-300">{s.label}</span>
                    <div className="flex items-center gap-1">
                      {s.keys.map((k) => (
                        <Badge key={k} variant="outline" className="rounded px-1.5 py-0.5 font-mono text-[11px]">
                          {k}
                        </Badge>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Suche nach Seiten, Kunden, Briefs, Ads, Projekten und Analysen..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Suche...
          </div>
        )}

        {!loading && query.length >= 2 && results.length === 0 && (
          <CommandEmpty>Keine Ergebnisse gefunden.</CommandEmpty>
        )}

        {Object.entries(grouped).map(([group, items]) => (
          <CommandGroup key={group} heading={group}>
            {items.map((item) => (
              <CommandItem
                key={item.id}
                value={[item.label, ...(item.keywords ?? [])].join(' ')}
                onSelect={() => handleSelect(item.href)}
                className="cursor-pointer"
              >
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}

        <CommandGroup heading="Navigation">
          {NAV_ITEMS.filter(
            (item) =>
              !query || query.length < 2 || item.label.toLowerCase().includes(query.toLowerCase())
          ).map((item) => (
            <CommandItem
              key={item.href}
              value={item.label}
              onSelect={() => handleSelect(item.href)}
              className="cursor-pointer"
            >
              <item.icon className="mr-2 h-4 w-4 text-slate-400" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
    </>
  )
}
