import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { SlidersHorizontal, X } from 'lucide-react'
import { PROPERTY_ORDERING, listProperties } from '../../api/properties.js'
import { useDebouncedValue } from '../../hooks/useDebounce.js'
import { hasActiveFilters, useList } from '../../hooks/useList.js'
import { useLookups } from '../../context/LookupContext.jsx'
import PropertyGrid from '../../components/properties/PropertyGrid.jsx'
import PropertyFilters from '../../components/properties/PropertyFilters.jsx'
import { Breadcrumb, Callout } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Input, SearchBar, SelectOptions } from '../../components/ui/Form.jsx'
import { Pagination } from '../../components/ui/Pagination.jsx'

const IGNORED = ['ordering', 'page']

export default function Properties() {
  const { options } = useLookups()
  const location = useLocation()
  const initial = useMemo(() => filtersFromSearch(location.search), [location.search])
  const [search, setSearch] = useState(initial.q || '')
  const [showFilters, setShowFilters] = useState(false)
  const debounced = useDebouncedValue(search, 350)

  const list = useList(listProperties, initial)
  const active = hasActiveFilters(list.filters, IGNORED)

  useEffect(() => {
    if (debounced) list.patchFilters({ q: debounced })
    else if (list.filters.q) list.setFilters({ ...list.filters, q: undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const apply = (next) => {
    list.setFilters(next)
  }

  const reset = () => {
    setSearch('')
    list.reset()
  }

  return (
    <div className="container section-tight stack">
      <Breadcrumb items={[{ label: 'Home', to: '/' }, { label: 'Properties' }]} />
      <header className="section-head" style={{ marginBottom: 6 }}>
        <div>
          <p className="eyebrow">Find your next home or investment</p>
          <h1> Property catalogue</h1>
          <p>
            Listings come straight from the Mant Bridges books. Availability, price and landlord are recorded on each
            property.
          </p>
        </div>
        <div className="row">
          <Button variant="outline" className="mobile-only" onClick={() => setShowFilters((value) => !value)}>
            <SlidersHorizontal size={16} /> Filters
          </Button>
        </div>
      </header>

      <div className="split">
        <div className="stack">
          <div className="row-between">
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search by title, area, reference…"
              onSubmit={() => list.patchFilters({ q: search })}
              buttonLabel="Search"
            />
            <div className="row" style={{ gap: 8 }}>
              <label className="hint nowrap" htmlFor="ordering">
                Sort
              </label>
              <Input
                as="select"
                name="ordering"
                value={list.filters.ordering || PROPERTY_ORDERING[0].value}
                onChange={(value) => list.patchFilters({ ordering: value })}
                style={{ minWidth: 200 }}
              >
                <SelectOptions items={PROPERTY_ORDERING} />
              </Input>
            </div>
          </div>

          <div className="row" style={{ gap: 8 }}>
            <span className="muted small">
              {list.loading ? 'Searching…' : `${list.count.toLocaleString()} listing${list.count === 1 ? '' : 's'} found`}
            </span>
            {active ? (
              <button type="button" className="chip chip-button" onClick={reset}>
                <X size={13} /> Clear filters
              </button>
            ) : null}
          </div>

          <PropertyGrid
            properties={list.rows}
            loading={list.loading}
            error={list.error}
            onRetry={list.reload}
            onResetFilters={reset}
            emptyTitle="No properties match these filters"
          />

          <Pagination
            page={list.page}
            pageCount={list.pageCount}
            total={list.count}
            onChange={list.setPage}
            noun="listing"
          />

          <Callout>
            Interested in something not listed? We source property for clients across Kampala, Wakiso, Mukono, Masaka
            and all major cities of Uganda — <Link to="/contact">tell us what you need</Link>.
          </Callout>
        </div>

        <aside className={`sticky-side filters-aside${showFilters ? ' open' : ''}`}>
          <div className="card">
            <div className="card-head">
              <h3>Filters</h3>
              {active ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
                  Reset
                </button>
              ) : null}
            </div>
            <div className="card-body">
              <PropertyFilters
                filters={list.filters}
                options={options}
                onApply={apply}
                onReset={reset}
                active={active}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

const FILTER_KEYS = [
  'q',
  'listing_type',
  'property_type',
  'status',
  'furnishing',
  'city',
  'district',
  'min_price',
  'max_price',
  'bedrooms_min',
  'bathrooms_min',
  'amenities',
  'featured',
  'ordering',
]

function filtersFromSearch(searchString) {
  const params = new URLSearchParams(searchString)
  const out = {}
  FILTER_KEYS.forEach((key) => {
    if (!params.has(key)) return
    const value = params.get(key)
    if (key === 'featured') out[key] = value === 'true'
    else out[key] = value
  })
  if (!out.ordering) out.ordering = '-created_at'
  return out
}
