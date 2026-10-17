import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Sparkles, Star, Trash2, Upload } from 'lucide-react'
import {
  addPropertyImage,
  createProperty,
  deletePropertyImage,
  manageById,
  updateProperty,
  updatePropertyImage,
} from '../../api/properties.js'
import { landlordOptions } from '../../api/users.js'
import { useApi } from '../../hooks/useApi.js'
import { useAction } from '../../hooks/useAction.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useLookups } from '../../context/LookupContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { Breadcrumb, Callout, PageHeader, Panel } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Check, Field, FormAlert, Input, SelectOptions } from '../../components/ui/Form.jsx'
import { Loading, ErrorState } from '../../components/ui/Feedback.jsx'
import { mediaUrl } from '../../utils/media.js'

const BLANK = {
  owner: '',
  title: '',
  summary: '',
  description: '',
  property_type: '',
  listing_type: 'RENT',
  status: 'AVAILABLE',
  furnishing: 'UNFURNISHED',
  price: '',
  currency: 'UGX',
  price_period: 'MONTHLY',
  negotiable: false,
  service_charge: '0',
  security_deposit: '0',
  bedrooms: 0,
  bathrooms: 0,
  parking_spaces: 0,
  area: '',
  area_unit: 'sqm',
  year_built: '',
  amenities: [],
  address: '',
  city: '',
  district: '',
  region: '',
  country: 'Uganda',
  latitude: '',
  longitude: '',
  is_published: true,
  is_featured: false,
}

/** Fields the API will not accept as empty strings. */
const NUMERIC = ['price', 'service_charge', 'security_deposit', 'bedrooms', 'bathrooms', 'parking_spaces', 'area']
const NULLABLE = ['year_built', 'latitude', 'longitude']

const PRICE_PERIODS = [
  { value: 'MONTHLY', label: 'Per month' },
  { value: 'QUARTERLY', label: 'Per quarter' },
  { value: 'YEARLY', label: 'Per year' },
  { value: 'ONE_OFF', label: 'One-off (sale price)' },
]

const AREA_UNITS = [
  { value: 'sqm', label: 'Square metres' },
  { value: 'sqft', label: 'Square feet' },
  { value: 'plots', label: 'Plots' },
  { value: 'acres', label: 'Acres' },
]

export default function PropertyForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { options, company } = useLookups()
  const toast = useToast()
  const isAdmin = user?.role === 'ADMIN'
  const isEdit = Boolean(id)

  const [form, setForm] = useState(() => ({ ...BLANK, currency: company?.currency || 'UGX' }))
  const [file, setFile] = useState(null)
  const [caption, setCaption] = useState('')
  const [illustrative, setIllustrative] = useState(false)
  const fileInput = useRef(null)

  const existing = useApi(() => manageById(id), [id], { skip: !id })
  const owners = useApi(() => landlordOptions(), [], { skip: !isAdmin })

  useEffect(() => {
    if (!existing.data) return
    setForm((current) => ({
      ...current,
      ...fromProperty(existing.data),
    }))
  }, [existing.data])

  useEffect(() => {
    if (isEdit || form.currency === (company?.currency || 'UGX')) return
    setForm((current) => ({ ...current, currency: company?.currency || 'UGX' }))
  }, [company, isEdit, form.currency])

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))

  const save = useAction(
    async () => {
      const payload = toPayload(form)
      if (isEdit) return updateProperty(id, payload)
      const created = await createProperty(payload)
      return created
    },
    {
      onDone: (record) => {
        toast.success(isEdit ? 'Listing saved.' : 'Listing created.')
        if (!isEdit && record?.id) navigate(`/manage/properties/${record.id}/edit`, { replace: true })
      },
    }
  )

  const uploadImage = useAction(
    async () => {
      const data = new FormData()
      data.append('image', file)
      if (caption) data.append('caption', caption)
      if (illustrative) data.append('is_illustrative', 'true')
      return addPropertyImage(id, data)
    },
    {
      onDone: () => {
        toast.success('Photo added.')
        setFile(null)
        setCaption('')
        setIllustrative(false)
        if (fileInput.current) fileInput.current.value = ''
        existing.reload()
      },
    }
  )

  const makePrimary = useAction(
    async (image) => {
      await updatePropertyImage(image.id, { is_primary: true, order: image.order })
      return existing.reload()
    },
    { onDone: () => toast.success('Cover photo changed.') }
  )

  const toggleIllustrative = useAction(
    async (image) => {
      await updatePropertyImage(image.id, { is_illustrative: !image.is_illustrative })
      return existing.reload()
    },
    { onDone: () => toast.success('Photo label updated.') }
  )

  const dropImage = useAction(    async (image) => {
      await deletePropertyImage(image.id)
      return existing.reload()
    },
    { onDone: () => toast.success('Photo removed.') }
  )

  const loading = isEdit && existing.loading && !existing.data

  const fields = useMemo(
    () => ({
      types: options.property_types ?? [],
      listingTypes: options.listing_types ?? [],
      statuses: options.property_statuses ?? [],
      amenities: options.amenities ?? [],
      cities: options.cities ?? [],
    }),
    [options]
  )

  if (loading) return <Loading label="Opening the listing…" />
  if (isEdit && existing.error) {
    return <ErrorState error={existing.error} onRetry={existing.reload} title="This listing could not be loaded" />
  }

  const images = existing.data?.images ?? []
  const imageError = uploadImage.error || makePrimary.error || dropImage.error
  const error = save.error || imageError

  return (
    <div className="stack">
      <Breadcrumb
        items={[
          { label: 'Dashboard', to: '/manage' },
          { label: 'Listings', to: '/manage/properties' },
          { label: isEdit ? 'Edit listing' : 'New listing' },
        ]}
      />

      <PageHeader
        eyebrow={isEdit ? `Reference ${existing.data?.reference || '—'}` : 'Portfolio'}
        title={isEdit ? existing.data?.title || 'Edit listing' : 'Add a listing'}
        lead={
          isEdit
            ? 'Changes save straight to the property record. The public page reflects them the moment the listing is published.'
            : 'Fill in what you know. Only the starred basics are required — you can add photos once the listing exists.'
        }
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('/manage/properties')}>
              <ArrowLeft size={15} /> Back
            </Button>
            <Button onClick={save.execute} pending={save.pending}>
              <Save size={15} /> {isEdit ? 'Save changes' : 'Create listing'}
            </Button>
          </>
        }
      />

      <FormAlert error={error} />

      <div className="split">
        <div className="stack">
          <Panel title="The listing">
            <div className="form-grid">
              <Field name="title" label="Title" required span2 error={save.errors.title?.[0]}>
                <Input name="title" value={form.title} onChange={set('title')} placeholder="3-bedroom apartment, Bukoto" />
              </Field>
              <Field name="summary" label="Short summary" span2 hint="One line used on cards and search results.">
                <Input name="summary" value={form.summary} onChange={set('summary')} maxLength={250} />
              </Field>
              <Field
                name="description"
                label="Full description"
                required
                span2
                error={save.errors.description?.[0]}
                hint="Plain text. Leave a blank line between paragraphs."
              >
                <Input as="textarea" name="description" rows={7} value={form.description} onChange={set('description')} />
              </Field>
              <Field name="property_type" label="Property type" required error={save.errors.property_type?.[0]}>
                <Input as="select" name="property_type" value={form.property_type} onChange={set('property_type')}>
                  <option value="">Choose a type</option>
                  <SelectOptions items={fields.types} />
                </Input>
              </Field>
              <Field name="listing_type" label="Rent or sale" required>
                <Input as="select" name="listing_type" value={form.listing_type} onChange={set('listing_type')}>
                  <SelectOptions items={fields.listingTypes} />
                </Input>
              </Field>
              <Field name="furnishing" label="Furnishing">
                <Input as="select" name="furnishing" value={form.furnishing} onChange={set('furnishing')}>
                  <SelectOptions
                    items={[
                      { value: 'FURNISHED', label: 'Furnished' },
                      { value: 'SEMI', label: 'Semi furnished' },
                      { value: 'UNFURNISHED', label: 'Unfurnished' },
                    ]}
                  />
                </Input>
              </Field>
              <Field name="status" label="Availability" hint="Only available listings reach the public catalogue.">
                <Input as="select" name="status" value={form.status} onChange={set('status')}>
                  <SelectOptions items={fields.statuses} />
                </Input>
              </Field>
            </div>
          </Panel>

          <Panel title="Price and terms">
            <div className="form-grid">
              <Field name="price" label="Price" required error={save.errors.price?.[0]}>
                <Input kind="number" name="price" value={form.price} onChange={set('price')} min="0" step="1000" />
              </Field>
              <Field name="price_period" label="Charged">
                <Input as="select" name="price_period" value={form.price_period} onChange={set('price_period')}>
                  <SelectOptions items={PRICE_PERIODS} />
                </Input>
              </Field>
              <Field name="currency" label="Currency">
                <Input name="currency" value={form.currency} onChange={set('currency')} maxLength={10} />
              </Field>
              <Field name="service_charge" label="Service charge">
                <Input kind="number" name="service_charge" value={form.service_charge} onChange={set('service_charge')} min="0" step="1000" />
              </Field>
              <Field
                name="security_deposit"
                label="Deposit"
                error={save.errors.security_deposit?.[0]}
                hint="Refundable deposit expected at signing."
              >
                <Input kind="number" name="security_deposit" value={form.security_deposit} onChange={set('security_deposit')} min="0" step="1000" />
              </Field>
              <div>
                <Check
                  name="negotiable"
                  label="Price is negotiable"
                  checked={form.negotiable}
                  onChange={set('negotiable')}
                />
                <Check
                  name="is_published"
                  label="Publish to the catalogue"
                  checked={form.is_published}
                  onChange={set('is_published')}
                />
                <Check
                  name="is_featured"
                  label="Feature on the homepage"
                  checked={form.is_featured}
                  onChange={set('is_featured')}
                />
              </div>
            </div>
          </Panel>

          <Panel title="Where it is">
            <div className="form-grid">
              <Field name="address" label="Street / area" required span2 error={save.errors.address?.[0]}>
                <Input name="address" value={form.address} onChange={set('address')} />
              </Field>
              <Field name="city" label="City" required error={save.errors.city?.[0]}>
                <Input name="city" value={form.city} onChange={set('city')} list="city-options" placeholder="Kampala" />
                <datalist id="city-options">
                  {fields.cities.map((city) => (
                    <option key={city} value={city} />
                  ))}
                </datalist>
              </Field>
              <Field name="district" label="District">
                <Input name="district" value={form.district} onChange={set('district')} />
              </Field>
              <Field name="region" label="Region">
                <Input name="region" value={form.region} onChange={set('region')} />
              </Field>
              <Field name="country" label="Country">
                <Input name="country" value={form.country} onChange={set('country')} />
              </Field>
              <Field name="latitude" label="Latitude" hint="Optional — used for map links only.">
                <Input name="latitude" value={form.latitude} onChange={set('latitude')} placeholder="-0.3079" />
              </Field>
              <Field name="longitude" label="Longitude">
                <Input name="longitude" value={form.longitude} onChange={set('longitude')} placeholder="32.5800" />
              </Field>
            </div>
          </Panel>

          <Panel title="Size and layout">
            <div className="form-grid">
              <Field name="bedrooms" label="Bedrooms">
                <Input kind="number" name="bedrooms" value={form.bedrooms} onChange={set('bedrooms')} min="0" />
              </Field>
              <Field name="bathrooms" label="Bathrooms">
                <Input kind="number" name="bathrooms" value={form.bathrooms} onChange={set('bathrooms')} min="0" />
              </Field>
              <Field name="parking_spaces" label="Parking spaces">
                <Input kind="number" name="parking_spaces" value={form.parking_spaces} onChange={set('parking_spaces')} min="0" />
              </Field>
              <Field name="area" label="Floor area">
                <Input kind="number" name="area" value={form.area} onChange={set('area')} min="0" step="0.5" />
              </Field>
              <Field name="area_unit" label="Measured in">
                <Input as="select" name="area_unit" value={form.area_unit} onChange={set('area_unit')}>
                  <SelectOptions items={AREA_UNITS} />
                </Input>
              </Field>
              <Field name="year_built" label="Year built">
                <Input kind="number" name="year_built" value={form.year_built} onChange={set('year_built')} min="1900" max="2100" />
              </Field>
            </div>

            <Field label="Amenities" name="amenities" hint="Tick everything the property actually offers.">
              <div className="chip-grid">
                {fields.amenities.map((amenity) => {
                  const on = form.amenities.includes(amenity)
                  return (
                    <button
                      type="button"
                      key={amenity}
                      className={`chip${on ? ' chip-active' : ''}`}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          amenities: on
                            ? current.amenities.filter((item) => item !== amenity)
                            : [...current.amenities, amenity],
                        }))
                      }
                    >
                      {amenity}
                    </button>
                  )
                })}
              </div>
            </Field>
          </Panel>

          {isAdmin ? (
            <Panel title="Ownership">
              <div className="form-grid">
                <Field
                  name="owner"
                  label="Landlord account"
                  error={save.errors.owner?.[0]}
                  hint="The listing is billed and marketed under this account."
                  span2
                >
                  <Input as="select" name="owner" value={form.owner} onChange={set('owner')}>
                    <option value="">Own it as Mant Bridges (myself)</option>
                    {(owners.data ?? []).map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.full_name} · {person.email}
                      </option>
                    ))}
                  </Input>
                </Field>
              </div>
            </Panel>
          ) : null}
        </div>

        <aside className="sticky-side stack">
          {isEdit ? (
            <Panel
              title="Photos"
              action={<span className="muted small">{images.length} uploaded</span>}
            >
              <div className="stack stack-sm">
                <FormAlert error={imageError} />
                {images.length ? (
                  <div className="chip-grid">
                    {images.map((image) => (
                      <div key={image.id} className="image-cell">
                        <img src={mediaUrl(image.image_url)} alt={image.alt_text || form.title} />
                        <div className="row" style={{ gap: 4, justifyContent: 'space-between' }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            title="Make cover photo"
                            onClick={() => makePrimary.execute(image)}
                            disabled={makePrimary.pending || image.is_primary}
                            style={image.is_primary ? { color: 'var(--red-600)' } : undefined}
                          >
                            <Star size={13} fill={image.is_primary ? 'currentColor' : 'none'} />
                            {image.is_primary ? 'Cover' : 'Set cover'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            title="Mark this photo as an illustrative render rather than a photograph"
                            onClick={() => toggleIllustrative.execute(image)}
                            disabled={toggleIllustrative.pending}
                            style={image.is_illustrative ? { color: 'var(--warn)' } : undefined}
                          >
                            <Sparkles size={13} />
                            {image.is_illustrative ? 'Illustrative' : 'Mark render'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm btn-icon"
                            title="Delete photo"
                            onClick={() => dropImage.execute(image)}
                            disabled={dropImage.pending}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted small">
                    No photos yet. A listing without a cover image shows a placeholder on the public pages.
                  </p>
                )}

                <Field name="image" label="Add a photo">
                  <input
                    id="image"
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    className="input"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                </Field>
                <Field name="caption" label="Caption" hint="Optional label shown under the photo.">
                  <Input name="caption" value={caption} onChange={setCaption} />
                </Field>
                <Check
                  name="illustrative"
                  label="This is a render or stock image, not a photograph of this property"
                  hint="Visitors then see it labelled as illustrative."
                  checked={illustrative}
                  onChange={setIllustrative}
                />
                <Button block onClick={uploadImage.execute} pending={uploadImage.pending} disabled={!file}>
                  <Upload size={15} /> Upload photo
                </Button>
                {!file ? <p className="hint">Choose an image file first.</p> : null}
              </div>
            </Panel>
          ) : (
            <Callout tone="navy">
              Save the listing first — photo upload needs a property record to attach to.
            </Callout>
          )}

          <Panel title="Before you publish">
            <ul className="stack stack-sm" style={{ listStyle: 'none', paddingLeft: 0 }}>
              <li className="muted small">
                The price, deposit and availability decide what a tenant sees. Never list a property you have not
                inspected.
              </li>
              <li className="muted small">
                Once a tenancy is signed, the listing is normally moved to <strong>Occupied</strong> so it stops
                appearing publicly.
              </li>
              {existing.data?.slug ? (
                <li>
                  <Link to={`/properties/${existing.data.slug}`} className="small" target="_blank" rel="noreferrer">
                    Open the public page for this listing
                  </Link>
                </li>
              ) : null}
              {existing.data ? (
                <li className="tiny muted">
                  {existing.data.views ?? 0} views since {new Date(existing.data.created_at).toLocaleDateString()}
                </li>
              ) : null}
            </ul>
          </Panel>

          <Callout>
            Buyers and tenants reach this listing through the enquiry form on its public page. Enquiries land in the{' '}
            <Link to="/manage/enquiries">inbox</Link>{' '}
            {company?.email ? (
              <>
                {' '}
                and are answered from <strong>{company.email}</strong>.
              </>
            ) : null}
          </Callout>
        </aside>
      </div>
    </div>
  )
}

function fromProperty(property) {
  const next = { ...BLANK }
  Object.keys(next).forEach((key) => {
    if (property[key] === undefined || property[key] === null) return
    next[key] = property[key]
  })
  next.owner = property.owner ?? ''
  next.year_built = property.year_built ?? ''
  next.latitude = property.latitude ?? ''
  next.longitude = property.longitude ?? ''
  next.area = property.area ?? ''
  next.amenities = Array.isArray(property.amenities) ? property.amenities : []
  return next
}

function toPayload(form) {
  const payload = { ...form }
  NUMERIC.forEach((key) => {
    payload[key] = payload[key] === '' || payload[key] === null ? 0 : Number(payload[key])
  })
  NULLABLE.forEach((key) => {
    payload[key] = payload[key] === '' || payload[key] === null ? null : payload[key]
  })
  payload.amenities = form.amenities
  payload.owner = form.owner ? Number(form.owner) : undefined
  payload.latitude = form.latitude || null
  payload.longitude = form.longitude || null
  payload.year_built = form.year_built || null
  return payload
}
