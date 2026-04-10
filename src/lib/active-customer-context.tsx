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
  openApprovalsCount?: number
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
const customerCache = new Map<string, Customer[]>()

function getStorageKey(tenantSlug: string) {
  return `boosthive_active_customer_${tenantSlug}`
}

function getCustomerCacheKey(tenantSlug: string) {
  return `boosthive_customers_${tenantSlug}`
}

function readCachedCustomers(tenantSlug: string): Customer[] {
  const inMemory = customerCache.get(tenantSlug)
  if (inMemory) return inMemory

  if (typeof window === 'undefined') return []

  try {
    const raw = sessionStorage.getItem(getCustomerCacheKey(tenantSlug))
    if (!raw) return []

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    const customers = parsed.filter((entry): entry is Customer => {
      if (!entry || typeof entry !== 'object') return false
      const candidate = entry as Partial<Customer>
      return (
        typeof candidate.id === 'string' &&
        typeof candidate.name === 'string' &&
        (candidate.domain === null || typeof candidate.domain === 'string') &&
        (candidate.status === 'active' || candidate.status === 'paused') &&
        (candidate.openApprovalsCount === undefined ||
          typeof candidate.openApprovalsCount === 'number')
      )
    })

    if (customers.length > 0) {
      customerCache.set(tenantSlug, customers)
    }

    return customers
  } catch {
    return []
  }
}

function writeCachedCustomers(tenantSlug: string, customers: Customer[]) {
  customerCache.set(tenantSlug, customers)

  if (typeof window === 'undefined') return

  try {
    sessionStorage.setItem(getCustomerCacheKey(tenantSlug), JSON.stringify(customers))
  } catch {
    // Ignore storage write issues and keep the in-memory cache.
  }
}

interface ActiveCustomerProviderProps {
  tenantSlug: string
  initialCustomers?: Customer[]
  children: ReactNode
}

export function ActiveCustomerProvider({
  tenantSlug,
  initialCustomers = [],
  children,
}: ActiveCustomerProviderProps) {
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers)
  const [activeCustomer, setActiveCustomerState] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(initialCustomers.length === 0)

  const fetchCustomers = useCallback(async () => {
    try {
      const res = await fetch('/api/tenant/customers')
      if (!res.ok) return []
      const data = await res.json()
      const list = (data.customers ?? []) as Customer[]
      writeCachedCustomers(tenantSlug, list)
      return list
    } catch {
      return []
    }
  }, [tenantSlug])

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
    if (initialCustomers.length > 0) {
      writeCachedCustomers(tenantSlug, initialCustomers)
    }
  }, [initialCustomers, tenantSlug])

  useEffect(() => {
    let cancelled = false

    async function init() {
      const cachedCustomers = readCachedCustomers(tenantSlug)
      const savedId = localStorage.getItem(getStorageKey(tenantSlug))

      const restoreActiveCustomer = (list: Customer[]) => {
        if (!savedId) return false
        const match = list.find((customer) => customer.id === savedId)
        if (match) {
          setActiveCustomerState(match)
          return true
        }
        return false
      }

      if (initialCustomers.length > 0) {
        restoreActiveCustomer(initialCustomers)
        setLoading(false)
        return
      }

      if (cachedCustomers.length > 0) {
        setCustomers(cachedCustomers)
        restoreActiveCustomer(cachedCustomers)
        setLoading(false)
        return
      }

      const list = await fetchCustomers()
      if (cancelled) return

      setCustomers(list)

      if (savedId && !restoreActiveCustomer(list)) {
        // Saved customer no longer exists
        localStorage.removeItem(getStorageKey(tenantSlug))
      }

      setLoading(false)
    }

    init()

    return () => {
      cancelled = true
    }
  }, [fetchCustomers, initialCustomers, tenantSlug])

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
