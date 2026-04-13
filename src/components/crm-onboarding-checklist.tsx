'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, CheckCircle2 } from 'lucide-react'

export interface OnboardingItem {
  id: string
  label: string
  checked: boolean
  custom?: boolean
}

const DEFAULT_ITEMS: OnboardingItem[] = [
  { id: 'contract', label: 'Vertrag unterzeichnet', checked: false },
  { id: 'credentials', label: 'Zugangsdaten erhalten (Ads, Analytics, GSC)', checked: false },
  { id: 'briefing', label: 'Briefing-Call durchgeführt', checked: false },
  { id: 'goals', label: 'Ziele & KPIs definiert', checked: false },
  { id: 'reporting', label: 'Reporting-Zyklus vereinbart', checked: false },
  { id: 'first-analysis', label: 'Erste Analyse durchgeführt', checked: false },
]

interface CrmOnboardingChecklistProps {
  customerId: string
  initialItems?: OnboardingItem[] | null
  isAdmin: boolean
}

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `custom-${Math.random().toString(36).slice(2, 11)}`
}

export function CrmOnboardingChecklist({
  customerId,
  initialItems,
  isAdmin,
}: CrmOnboardingChecklistProps) {
  const [items, setItems] = useState<OnboardingItem[]>(
    initialItems && initialItems.length > 0 ? initialItems : []
  )
  const [newItemLabel, setNewItemLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [initialised, setInitialised] = useState(false)

  useEffect(() => {
    setItems(initialItems && initialItems.length > 0 ? initialItems : [])
    setInitialised(true)
  }, [initialItems])

  const progress = useMemo(() => {
    if (items.length === 0) return 0
    const done = items.filter((i) => i.checked).length
    return Math.round((done / items.length) * 100)
  }, [items])

  const persist = useCallback(
    async (nextItems: OnboardingItem[]) => {
      setSaving(true)
      try {
        const res = await fetch(`/api/tenant/customers/${customerId}/onboarding`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checklist: nextItems }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Fehler beim Speichern')
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten.')
      } finally {
        setSaving(false)
      }
    },
    [customerId]
  )

  const updateItems = useCallback(
    (updater: (prev: OnboardingItem[]) => OnboardingItem[]) => {
      setItems((prev) => {
        const next = updater(prev)
        void persist(next)
        return next
      })
    },
    [persist]
  )

  const toggleItem = useCallback(
    (id: string) => {
      updateItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i))
      )
    },
    [updateItems]
  )

  const removeItem = useCallback(
    (id: string) => {
      updateItems((prev) => prev.filter((i) => i.id !== id))
    },
    [updateItems]
  )

  const addItem = useCallback(() => {
    const label = newItemLabel.trim()
    if (!label) return
    updateItems((prev) => [
      ...prev,
      { id: genId(), label, checked: false, custom: true },
    ])
    setNewItemLabel('')
  }, [newItemLabel, updateItems])

  const loadDefaults = useCallback(() => {
    updateItems(() => DEFAULT_ITEMS.map((i) => ({ ...i, id: i.id })))
  }, [updateItems])

  const isComplete = items.length > 0 && items.every((i) => i.checked)

  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Onboarding-Fortschritt
              </h3>
              {isComplete && (
                <Badge
                  variant="outline"
                  className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
                >
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Abgeschlossen
                </Badge>
              )}
            </div>
            <span className="text-sm text-slate-500 dark:text-slate-400">{progress}%</span>
          </div>
          <Progress value={progress} />
        </div>

        {initialised && items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center dark:border-border dark:bg-card">
            <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Noch keine Checkliste
            </h4>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
              Lade die Standard-Checkliste oder lege eigene Punkte an, um das Onboarding dieses
              Kunden zu strukturieren.
            </p>
            {isAdmin && (
              <div className="mt-4 flex items-center justify-center">
                <Button onClick={loadDefaults} disabled={saving}>
                  Standard-Checkliste laden
                </Button>
              </div>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-border dark:bg-card"
              >
                <Checkbox
                  id={`onb-${item.id}`}
                  checked={item.checked}
                  onCheckedChange={() => toggleItem(item.id)}
                  disabled={!isAdmin || saving}
                />
                <label
                  htmlFor={`onb-${item.id}`}
                  className={`flex-1 text-sm ${item.checked ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'}`}
                >
                  {item.label}
                </label>
                {item.custom && isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeItem(item.id)}
                    disabled={saving}
                    aria-label="Punkt entfernen"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {isAdmin && items.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={newItemLabel}
              onChange={(e) => setNewItemLabel(e.target.value)}
              placeholder="Eigenen Punkt hinzufügen..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addItem()
                }
              }}
              disabled={saving}
            />
            <Button onClick={addItem} disabled={saving || !newItemLabel.trim()}>
              <Plus className="w-4 h-4 mr-2" />
              Hinzufügen
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
