import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { companyProfile, lookups } from '../api/site.js'
import { describeError } from '../api/client.js'

const LookupContext = createContext(null)

const EMPTY = {
  property_types: [],
  listing_types: [],
  property_statuses: [],
  amenities: [],
  cities: [],
  payment_methods: [],
  payment_statuses: [],
  invoice_statuses: [],
  lease_statuses: [],
  late_fee_types: [],
  roles: [],
  blog_categories: [],
  currency: 'UGX',
  currency_symbol: 'UGX',
}

export function LookupProvider({ children }) {
  const [options, setOptions] = useState(EMPTY)
  const [company, setCompany] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([lookups(), companyProfile()]).then(([lookupsResult, companyResult]) => {
      if (cancelled) return
      if (lookupsResult.status === 'fulfilled') setOptions({ ...EMPTY, ...lookupsResult.value })
      else setError(describeError(lookupsResult.reason))
      if (companyResult.status === 'fulfilled') setCompany(companyResult.value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo(() => {
    const labelFor = (list, value_) =>
      list.find((item) => item.value === value_)?.label ?? value_ ?? ''
    return {
      options,
      company,
      error,
      setCompany,
      reload: () => Promise.allSettled([lookups(), companyProfile()]).then(([l, c]) => {
        if (l.status === 'fulfilled') setOptions({ ...EMPTY, ...l.value })
        if (c.status === 'fulfilled') setCompany(c.value)
      }),
      currency: options.currency || company?.currency || 'UGX',
      propertyTypeLabel: (value_) => labelFor(options.property_types, value_),
      listingTypeLabel: (value_) => labelFor(options.listing_types, value_),
      paymentMethodLabel: (value_) => labelFor(options.payment_methods, value_),
      leaseStatusLabel: (value_) => labelFor(options.lease_statuses, value_),
      invoiceStatusLabel: (value_) => labelFor(options.invoice_statuses, value_),
    }
  }, [options, company, error])

  return <LookupContext.Provider value={value}>{children}</LookupContext.Provider>
}

export function useLookups() {
  const context = useContext(LookupContext)
  if (!context) throw new Error('useLookups must be used inside LookupProvider')
  return context
}
