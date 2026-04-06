'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart3,
  Bot,
  CheckSquare,
  Eye,
  FileText,
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

interface SearchResult {
  id: string
  label: string
  href: string
  group: string
}

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'SEO Analyse', href: '/tools/seo-analyse', icon: BarChart3 },
  { label: 'AI Performance', href: '/tools/ai-performance', icon: Bot },
  { label: 'AI Visibility', href: '/tools/ai-visibility', icon: Eye },
  { label: 'Content Briefs', href: '/tools/content-briefs', icon: FileText },
  { label: 'Ad Generator', href: '/tools/ad-generator', icon: Megaphone },
  { label: 'Keyword Rankings', href: '/tools/keywords', icon: Search },
  { label: 'Freigaben', href: '/tools/approvals', icon: CheckSquare },
  { label: 'Kunden', href: '/tools/customers', icon: UserRound },
]

export function GlobalCommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    try {
      const [approvalsRes, briefsRes, customersRes] = await Promise.allSettled([
        fetch(`/api/tenant/approvals?`, { signal: controller.signal }),
        fetch(`/api/tenant/content/briefs`, { signal: controller.signal }),
        fetch(`/api/tenant/customers`, { signal: controller.signal }),
      ])

      if (controller.signal.aborted) return

      const items: SearchResult[] = []

      if (approvalsRes.status === 'fulfilled' && approvalsRes.value.ok) {
        const data = await approvalsRes.value.json()
        const approvals = (data.approvals ?? []) as Array<{ id: string; content_title: string }>
        approvals
          .filter((a) => a.content_title?.toLowerCase().includes(q.toLowerCase()))
          .slice(0, 4)
          .forEach((a) => {
            items.push({
              id: `approval-${a.id}`,
              label: a.content_title,
              href: '/tools/approvals',
              group: 'Freigaben',
            })
          })
      }

      if (briefsRes.status === 'fulfilled' && briefsRes.value.ok) {
        const data = await briefsRes.value.json()
        const briefs = (data.briefs ?? []) as Array<{ id: string; keyword: string }>
        briefs
          .filter((b) => b.keyword?.toLowerCase().includes(q.toLowerCase()))
          .slice(0, 4)
          .forEach((b) => {
            items.push({
              id: `brief-${b.id}`,
              label: b.keyword,
              href: `/tools/content-briefs?briefId=${b.id}`,
              group: 'Content Briefs',
            })
          })
      }

      if (customersRes.status === 'fulfilled' && customersRes.value.ok) {
        const data = await customersRes.value.json()
        const customers = (data.customers ?? []) as Array<{ id: string; name: string }>
        customers
          .filter((c) => c.name?.toLowerCase().includes(q.toLowerCase()))
          .slice(0, 4)
          .forEach((c) => {
            items.push({
              id: `customer-${c.id}`,
              label: c.name,
              href: '/tools/customers',
              group: 'Kunden',
            })
          })
      }

      if (!controller.signal.aborted) {
        setResults(items)
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

  // Group results by group name
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = []
    acc[item.group].push(item)
    return acc
  }, {})

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Suche nach Seiten, Kunden, Inhalten..."
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
                value={item.label}
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
  )
}
