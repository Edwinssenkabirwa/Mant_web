import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Save, Send } from 'lucide-react'
import {
  createRecommendation,
  myRecommendation,
  sendRecommendation,
  updateRecommendation,
} from '../../api/properties.js'
import { useApi } from '../../hooks/useApi.js'
import { useAction } from '../../hooks/useAction.js'
import { useLookups } from '../../context/LookupContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { Breadcrumb, Callout, PageHeader, Panel } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { StatusBadge } from '../../components/ui/Badge.jsx'
import { Field, FormAlert, Input, SelectOptions } from '../../components/ui/Form.jsx'
import { ErrorState, Loading } from '../../components/ui/Feedback.jsx'
import { dateTimeLabel } from '../../utils/format.js'

const BLANK = {
  title: '',
  description: '',
  listing_kind: '',
  property_type: '',
  bedrooms: '',
  bathrooms: '',
  parking_spaces: '',
  area: '',
  area_unit: 'sqm',
  price_expectation: '',
  price_period: '',
  currency: 'UGX',
  address: '',
  city: '',
  district: '',
  plot_reference: '',
  ownership: '',
  occupancy: '',
  paperwork: '',
  paperwork_note: '',
  inspection_contact: '',
}

/** The API reads these as numbers or nothing at all, never as an empty box. */
const NUMBERS = ['bedrooms', 'bathrooms', 'parking_spaces', 'area', 'price_expectation']

const AREA_UNITS = [
  { value: 'sqm', label: 'Square metres' },
  { value: 'sqft', label: 'Square feet' },
  { value: 'plots', label: 'Plots' },
  { value: 'acres', label: 'Acres' },
]

/**
 * The one form an owner fills in to put a property in front of the desk. Saving keeps it
 * private to him; only "send to the desk" puts it in the office's queue.
 */
export default function RecommendationForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { options, currency } = useLookups()
  const toast = useToast()
  const isEdit = Boolean(id)

  const [form, setForm] = useState(() => ({ ...BLANK, currency: currency || 'UGX' }))

  const existing = useApi(() => myRecommendation(id), [id], { skip: !id })

  useEffect(() => {
    if (!existing.data) return
    setForm({ ...BLANK, ...pick(existing.data) })
  }, [existing.data])

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))

  const save = useAction(
    async () => {
      const payload = toPayload(form)
      if (isEdit) return updateRecommendation(id, payload)
      return createRecommendation(payload)
    },
    {
      onDone: (record) => {
        toast.success('Saved. Only you can see this until you send it to the desk.')
        if (!isEdit && record?.id) {
          navigate(`/landlord/recommendations/${record.id}/edit`, { replace: true })
        } else {
          existing.reload()
        }
      },
    }
  )

  const send = useAction(
    async () => {
      // Save what is on screen first, so the desk never receives a stale version of the form.
      await updateRecommendation(id, toPayload(form))
      return sendRecommendation(id)
    },
    {
      onDone: () => {
        toast.success('Sent. The desk will do its own checks and come back to you.')
        navigate('/landlord/recommendations', { replace: true })
      },
    }
  )

  const loading = isEdit && existing.loading && !existing.data
  const record = existing.data
  const locked = record && !record.is_editable

  const fields = useMemo(
    () => ({
      kinds: options.listing_kinds ?? [],
      types: options.property_types ?? [],
      periods: options.price_periods ?? [],
      ownership: options.ownership_kinds ?? [],
      occupancy: options.occupancy_states ?? [],
      paperwork: options.paperwork_states ?? [],
      cities: options.cities ?? [],
    }),
    [options]
  )

  if (loading) return <Loading label="Opening your recommendation…" />
  if (isEdit && existing.error) {
    return (
      <ErrorState
        error={existing.error}
        onRetry={existing.reload}
        title="This recommendation could not be loaded"
      />
    )
  }

  return (
    <div className="stack">
      <Breadcrumb
        items={[
          { label: 'Overview', to: '/landlord' },
          { label: 'Recommendations', to: '/landlord/recommendations' },
          { label: isEdit ? 'Your form' : 'New recommendation' },
        ]}
      />

      <PageHeader
        eyebrow="Recommend a property"
        title={record?.title || (isEdit ? 'Your recommendation' : 'A property for the office to check')}
        lead="Write down everything you know. The desk reads this before it calls you, and a property is only ever published after the office has done its own checks and the contracts are signed."
        actions={
          <>
            <Button variant="outline" to="/landlord/recommendations">
              <ArrowLeft size={15} /> Back
            </Button>
            <Button onClick={save.execute} pending={save.pending} disabled={locked}>
              <Save size={15} /> Save
            </Button>
            {isEdit && record?.status === 'DRAFT' ? (
              <Button onClick={send.execute} pending={send.pending} disabled={locked}>
                <Send size={15} /> Send to the desk
              </Button>
            ) : null}
          </>
        }
      />

      <FormAlert error={save.error || send.error} />

      {locked ? (
        <Callout tone="navy">
          <div className="row" style={{ gap: 10, alignItems: 'center' }}>
            <StatusBadge value={record.status} label={record.status_display} />
            <span>
              The desk has already decided on this one, so the form is closed. Message the office
              if something has changed.
            </span>
            {record.listing_slug ? (
              <Link to={`/properties/${record.listing_slug}`} className="small">
                Open the listing <ArrowRight size={13} />
              </Link>
            ) : null}
          </div>
        </Callout>
      ) : null}

      {record?.admin_note ? (
        <Callout>
          <strong>The desk wrote:</strong> {record.admin_note}
          {record.decided_at ? (
            <span className="hint" style={{ display: 'block' }}>
              {dateTimeLabel(record.decided_at)}
            </span>
          ) : null}
        </Callout>
      ) : null}

      <div className="split">
        <div className="stack">
          <Panel title="The property">
            <div className="form-grid">
              <Field name="title" label="What is it called" required span2 error={save.errors.title?.[0]}>
                <Input
                  name="title"
                  value={form.title}
                  onChange={set('title')}
                  placeholder="Two-bedroom maisonette, Kisenyi"
                  disabled={locked}
                />
              </Field>
              <Field
                name="description"
                label="Describe it"
                required
                span2
                error={save.errors.description?.[0]}
                hint="Condition, what is finished, what is still to do, and anything a buyer or tenant should know."
              >
                <Input
                  as="textarea"
                  name="description"
                  rows={6}
                  value={form.description}
                  onChange={set('description')}
                  disabled={locked}
                />
              </Field>
              <Field name="listing_kind" label="Sold, rented or both" required error={save.errors.listing_kind?.[0]}>
                <Input as="select" name="listing_kind" value={form.listing_kind} onChange={set('listing_kind')} disabled={locked}>
                  <option value="">Choose one</option>
                  <SelectOptions items={fields.kinds} />
                </Input>
              </Field>
              <Field name="property_type" label="Kind of property" required error={save.errors.property_type?.[0]}>
                <Input as="select" name="property_type" value={form.property_type} onChange={set('property_type')} disabled={locked}>
                  <option value="">Choose one</option>
                  <SelectOptions items={fields.types} />
                </Input>
              </Field>
              <Field name="bedrooms" label="Bedrooms">
                <Input kind="number" name="bedrooms" value={form.bedrooms} onChange={set('bedrooms')} min="0" disabled={locked} />
              </Field>
              <Field name="bathrooms" label="Bathrooms">
                <Input kind="number" name="bathrooms" value={form.bathrooms} onChange={set('bathrooms')} min="0" disabled={locked} />
              </Field>
              <Field name="parking_spaces" label="Parking spaces">
                <Input kind="number" name="parking_spaces" value={form.parking_spaces} onChange={set('parking_spaces')} min="0" disabled={locked} />
              </Field>
              <Field name="area" label="Size" hint="Floor area, or the plot size for land.">
                <Input kind="number" name="area" value={form.area} onChange={set('area')} min="0" step="0.5" disabled={locked} />
              </Field>
              <Field name="area_unit" label="Measured in">
                <Input as="select" name="area_unit" value={form.area_unit} onChange={set('area_unit')} disabled={locked}>
                  <SelectOptions items={AREA_UNITS} />
                </Input>
              </Field>
            </div>
          </Panel>

          <Panel title="What you want for it">
            <div className="form-grid">
              <Field
                name="price_expectation"
                label="Your expectation"
                error={save.errors.price_expectation?.[0]}
                hint="What you would take. The desk has not valued the property and will discuss the asking figure with you."
              >
                <Input
                  kind="number"
                  name="price_expectation"
                  value={form.price_expectation}
                  onChange={set('price_expectation')}
                  min="0"
                  step="1000"
                  disabled={locked}
                />
              </Field>
              <Field name="price_period" label="Charged">
                <Input as="select" name="price_period" value={form.price_period} onChange={set('price_period')} disabled={locked}>
                  <option value="">Not sure yet</option>
                  <SelectOptions items={fields.periods} />
                </Input>
              </Field>
              <Field name="currency" label="Currency">
                <Input name="currency" value={form.currency} onChange={set('currency')} maxLength={10} disabled={locked} />
              </Field>
            </div>
          </Panel>

          <Panel title="Where it is">
            <div className="form-grid">
              <Field name="address" label="Street, zone or landmark" required span2 error={save.errors.address?.[0]}>
                <Input name="address" value={form.address} onChange={set('address')} disabled={locked} />
              </Field>
              <Field name="city" label="Town" required error={save.errors.city?.[0]}>
                <Input name="city" value={form.city} onChange={set('city')} list="recommendation-cities" disabled={locked} />
                <datalist id="recommendation-cities">
                  {fields.cities.map((city) => (
                    <option key={city} value={city} />
                  ))}
                </datalist>
              </Field>
              <Field name="district" label="District">
                <Input name="district" value={form.district} onChange={set('district')} disabled={locked} />
              </Field>
              <Field name="plot_reference" label="Plot or title reference" hint="Only if you have it written down somewhere.">
                <Input name="plot_reference" value={form.plot_reference} onChange={set('plot_reference')} disabled={locked} />
              </Field>
            </div>
          </Panel>

          <Panel title="Your side of it">
            <div className="form-grid">
              <Field name="ownership" label="How it relates to you" required error={save.errors.ownership?.[0]}>
                <Input as="select" name="ownership" value={form.ownership} onChange={set('ownership')} disabled={locked}>
                  <option value="">Choose one</option>
                  <SelectOptions items={fields.ownership} />
                </Input>
              </Field>
              <Field name="occupancy" label="Is anyone in it">
                <Input as="select" name="occupancy" value={form.occupancy} onChange={set('occupancy')} disabled={locked}>
                  <option value="">Not sure</option>
                  <SelectOptions items={fields.occupancy} />
                </Input>
              </Field>
              <Field name="paperwork" label="Documents you hold">
                <Input as="select" name="paperwork" value={form.paperwork} onChange={set('paperwork')} disabled={locked}>
                  <option value="">Not sure</option>
                  <SelectOptions items={fields.paperwork} />
                </Input>
              </Field>
              <Field
                name="paperwork_note"
                label="Anything else about the papers"
                span2
                hint="What is available for the desk to inspect, and what is still missing."
              >
                <Input
                  as="textarea"
                  name="paperwork_note"
                  rows={4}
                  value={form.paperwork_note}
                  onChange={set('paperwork_note')}
                  disabled={locked}
                />
              </Field>
              <Field
                name="inspection_contact"
                label="Who to call to view it"
                span2
                hint="A name and a number. The desk arranges the viewing itself."
              >
                <Input name="inspection_contact" value={form.inspection_contact} onChange={set('inspection_contact')} disabled={locked} />
              </Field>
            </div>
          </Panel>
        </div>

        <aside className="sticky-side stack">
          {record ? (
            <Panel title="Where this stands">
              <div className="stack stack-sm">
                <StatusBadge value={record.status} label={record.status_display} />
                {record.submitted_at ? (
                  <p className="small muted">Sent to the desk on {dateTimeLabel(record.submitted_at)}.</p>
                ) : (
                  <p className="small muted">
                    Saved on your account. Nothing reaches the office until you send it.
                  </p>
                )}
              </div>
            </Panel>
          ) : null}

          <Panel title="What happens next">
            <ol className="stack stack-sm" style={{ paddingLeft: '1.1rem' }}>
              <li className="small">You send the details to the desk.</li>
              <li className="small">The office calls you, inspects the property and does its due diligence.</li>
              <li className="small">Once the contracts are signed, the desk verifies it and publishes the listing.</li>
            </ol>
            <p className="hint">
              Until step three the property is not on the public pages, whatever has been written here.
            </p>
          </Panel>

          <Callout tone="navy">
            Keep the wording honest — the listing will be published as <strong>verified by the
            landlord and verified by our team</strong>, and buyers are told which photographs are
            illustrative.
          </Callout>
        </aside>
      </div>
    </div>
  )
}

function pick(record) {
  const out = {}
  Object.keys(BLANK).forEach((key) => {
    const value = record[key]
    out[key] = value === null || value === undefined ? BLANK[key] : value
  })
  return out
}

function toPayload(form) {
  const payload = { ...form }
  NUMBERS.forEach((key) => {
    payload[key] = payload[key] === '' || payload[key] === null ? null : Number(payload[key])
  })
  return payload
}
