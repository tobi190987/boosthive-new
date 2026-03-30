'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export interface Customer {
  id: string
  name: string
  domain: string | null
  status: 'active' | 'paused'
}

interface ActiveCustomerContextValue {
  /** The currently selected customer, or null if none is selected */
  activeCustomer: Customer | null
  /** All customers for this tenant */
  customers: Customer[]
  /** Whether the customer list is loading */
  loading: boolean
  /** Set the active customer (persists to localStorage) */
  setActiveCustomer: (customer: Customer | null) => void
  /** Refetch the customer list from the API */
  refetchCustomers: () => Promise<void>
}

const ActiveCustomerContext = createContext<ActiveCustomerContextValue | null>(null)

function getStorageKey(tenantSlug: string) {
  return `boosthive_active_customer_${tenantSlug}`
}

interface ActiveCustomerProviderProps {
  tenantSlug: string
  children: ReactNode
}

export function ActiveCustomerProvider({ tenantSlug, children }: ActiveCustomerProviderProps) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [activeCustomer, setActiveCustomerState] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchCustomers = useCallback(async () => {
    try {
      const res = await fetch('/api/tenant/customers')
      if (!res.ok) return []
      const data = await res.json()
      return (data.customers ?? []) as Customer[]
    } catch {
      return []
    }
  }, [])

  const refetchCustomers = useCallback(async () => {
    const list = await fetchCustomers()
    setCustomers(list)

    // If active customer was deleted, reset
    if (activeCustomer && !list.find((c) => c.id === activeCustomer.id)) {
      setActiveCustomerState(null)
      localStorage.removeItem(getStorageKey(tenantSlug))
    }
  }, [fetchCustomers, activeCustomer, tenantSlug])

  const setActiveCustomer = useCallback(
    (customer: Customer | null) => {
      setActiveCustomerState(customer)
      if (customer) {
        localStorage.setItem(getStorageKey(tenantSlug), customer.id)
      } else {
        localStorage.removeItem(getStorageKey(tenantSlug))
      }
    },
    [tenantSlug]
  )

  // Initial load: fetch customers + restore from localStorage
  useEffect(() => {
    let cancelled = false

    async function init() {
      const list = await fetchCustomers()
      if (cancelled) return

      setCustomers(list)

      const savedId = localStorage.getItem(getStorageKey(tenantSlug))
      if (savedId) {
        const match = list.find((c) => c.id === savedId)
        if (match) {
          setActiveCustomerState(match)
        } else {
          // Saved customer no longer exists
          localStorage.removeItem(getStorageKey(tenantSlug))
        }
      }

      setLoading(false)
    }

    init()

    return () => {
      cancelled = true
    }
  }, [fetchCustomers, tenantSlug])

  const value = useMemo<ActiveCustomerContextValue>(
    () => ({
      activeCustomer,
      customers,
      loading,
      setActiveCustomer,
      refetchCustomers,
    }),
    [activeCustomer, customers, loading, setActiveCustomer, refetchCustomers]
  )

  return (
    <ActiveCustomerContext.Provider value={value}>
      {children}
    </ActiveCustomerContext.Provider>
  )
}

export function useActiveCustomer(): ActiveCustomerContextValue {
  const ctx = useContext(ActiveCustomerContext)
  if (!ctx) {
    throw new Error('useActiveCustomer must be used within an ActiveCustomerProvider')
  }
  return ctx
}
