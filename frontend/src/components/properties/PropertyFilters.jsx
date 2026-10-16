import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Check, Field, Input, SelectOptions } from '../ui/Form.jsx'
import { Button } from '../ui/Button.jsx'

const COUNT_CHOICES = [
  { value: '1', label: '1+' },
  { value: '2', label: '2+' },
  { value: '3', label: '3+' },
  { value: '4', label: '4+' },
  { value: '5', label: '5+' },
]

/**
 * Public search filters. `onApply` always receives the complete filter object so
 * the page can hand it straight to useList().setFilters(), which resets to page 1.
 */
export default function PropertyFilters({ filters, options, onApply, onReset, active = false }) {
  const [draft, setDraft] = useState(() => ({
    city: filters.city || '',
    district: filters.district || '',
    min_price: filters.min_price ?? '',
    max_price: filters.max_price ?? '',
  }))

  const set = (partial) => onApply({ ...filters, ...partial })

  const amenities = String(filters.amenities || '')
    .split(',')
    .filter(Boolean)

  const toggleAmenity = (name) => {
    const next = amenities.includes(name) ? amenities.filter((item) => item !== name) : [...amenities, name]
    set({ amenities: next.length ? next.join(',') : undefined })
  }

  const draftField = (key, props) => (
    <Input
      name={key}
      value={draft[key]}
      onChange={(value) => setDraft((current) => ({ ...current, [key]: value }))}
      {...props}
    />
  )

  return (
    <div className="stack" style={{ gap: 0 }}>
      <div className="filter-group">
        <p className="filter-title">Looking to</p>
        <div className="chips">
          {[
            { value: undefined, label: 'Any' },
            { value: 'RENT', label: 'Rent' },
            { value: 'SALE', label: 'Buy' },
          ].map((choice) => (
            <button
              type="button"
              key={choice.label}
              className={`chip chip-button${(filters.listing_type || undefined) === choice.value ? ' chip-active' : ''}`}
              onClick={() => set({ listing_type: choice.value })}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <p className="filter-title">Property type</p>
        <Field name="property_type">
          <Input
            as="select"
            name="property_type"
            value={filters.property_type || ''}
            onChange={(value) => set({ property_type: value || undefined })}
          >
            <SelectOptions
              items={options?.property_types || []}
              placeholder="Any property type"
            />
          </Input>
        </Field>
      </div>

      <div className="filter-group">
        <p className="filter-title">Location and price</p>
        <div className="stack stack-sm">
          <Field name="city">
            {draftField('city', { placeholder: 'City, e.g. Kampala' })}
          </Field>
          <Field name="district">
            {draftField('district', { placeholder: 'District, e.g. Ntinda' })}
          </Field>
          <div className="row" style={{ gap: 10 }}>
            <Field name="min_price">
              {draftField('min_price', { kind: 'number', min: '0', placeholder: 'Min price' })}
            </Field>
            <Field name="max_price">
              {draftField('max_price', { kind: 'number', min: '0', placeholder: 'Max price' })}
            </Field>
          </div>
          <Button variant="outline" size="sm" block onClick={() => set(draft)}>
            Apply location and price
          </Button>
        </div>
      </div>

      <div className="filter-group">
        <p className="filter-title">Size and furnishing</p>
        <div className="row" style={{ gap: 10 }}>
          <Field name="bedrooms_min" label="Bedrooms">
            <Input
              as="select"
              name="bedrooms_min"
              value={filters.bedrooms_min || ''}
              onChange={(value) => set({ bedrooms_min: value || undefined })}
            >
              <SelectOptions items={COUNT_CHOICES} placeholder="Any" />
            </Input>
          </Field>
          <Field name="bathrooms_min" label="Bathrooms">
            <Input
              as="select"
              name="bathrooms_min"
              value={filters.bathrooms_min || ''}
              onChange={(value) => set({ bathrooms_min: value || undefined })}
            >
              <SelectOptions items={COUNT_CHOICES} placeholder="Any" />
            </Input>
          </Field>
        </div>
        <Field name="furnishing" label="Furnishing">
          <Input
            as="select"
            name="furnishing"
            value={filters.furnishing || ''}
            onChange={(value) => set({ furnishing: value || undefined })}
          >
            <option value="">Any</option>
            <option value="FURNISHED">Furnished</option>
            <option value="SEMI">Semi furnished</option>
            <option value="UNFURNISHED">Unfurnished</option>
          </Input>
        </Field>
      </div>

      {(options?.amenities?.length ?? 0) > 0 ? (
        <div className="filter-group">
          <p className="filter-title">Amenities</p>
          <div className="chips">
            {options.amenities.map((name) => (
              <button
                type="button"
                key={name}
                className={`chip chip-button${amenities.includes(name) ? ' chip-active' : ''}`}
                onClick={() => toggleAmenity(name)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="filter-group">
        <p className="filter-title">Availability</p>
        <div className="stack stack-sm">
          <Check
            label="Featured listings only"
            name="featured"
            checked={filters.featured === true}
            onChange={(checked) => set({ featured: checked ? true : undefined })}
          />
          <Field name="status" label="Listing status">
            <Input
              as="select"
              name="status"
              value={filters.status || ''}
              onChange={(value) => set({ status: value || undefined })}
            >
              <SelectOptions items={options?.property_statuses || []} placeholder="Any status" />
            </Input>
          </Field>
        </div>
      </div>

      {active ? (
        <div style={{ paddingTop: 16 }}>
          <Button variant="ghost" size="sm" block onClick={onReset}>
            <RotateCcw size={15} /> Clear all filters
          </Button>
        </div>
      ) : null}
    </div>
  )
}
