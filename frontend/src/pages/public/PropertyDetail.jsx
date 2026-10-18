import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Bath,
  BedDouble,
  Building2,
  CalendarDays,
  Car,
  Check,
  Handshake,
  MapPin,
  Ruler,
  ShieldCheck,
} from 'lucide-react'
import { listProperties, propertyBySlug } from '../../api/properties.js'
import { isNotFound } from '../../api/client.js'
import { useApi } from '../../hooks/useApi.js'
import { dateLabel, titleCase } from '../../utils/format.js'
import { StatusBadge } from '../../components/ui/Badge.jsx'
import { Breadcrumb, Callout, KeyValue, Panel } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { EmptyState, ErrorState, Loading } from '../../components/ui/Feedback.jsx'
import Gallery from '../../components/properties/Gallery.jsx'
import EnquiryForm from '../../components/properties/EnquiryForm.jsx'
import PropertyCard from '../../components/properties/PropertyCard.jsx'

export default function PropertyDetail() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const request = useApi(() => propertyBySlug(slug), [slug])
  const property = request.data

  useEffect(() => {
    if (request.error && isNotFound(request.error)) navigate('/properties', { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.error])

  const similar = useApi(
    () =>
      listProperties({
        property_type: property.property_type,
        listing_type: property.listing_type,
        ordering: '-created_at',
      }),
    [property?.id],
    { skip: !property?.id }
  )
  const similarRows = (similar.data?.results || similar.data || [])
    .filter((item) => item.id !== property?.id)
    .slice(0, 3)
  const locationParts = [property?.address, property?.district, property?.city, property?.region].filter(Boolean)

  if (request.loading && !property) return <div className="container section"><Loading label="Loading listing…" /></div>
  if (request.error) {
    return (
      <div className="container section">
        <ErrorState error={request.error} onRetry={request.reload} title="This listing could not be loaded" />
        <div className="center" style={{ marginTop: 16 }}>
          <Button to="/properties" variant="outline">
            <ArrowLeft size={16} /> Back to all properties
          </Button>
        </div>
      </div>
    )
  }
  if (!property) {
    return (
      <div className="container section">
        <EmptyState icon={Building2} title="Listing not found">
          It may have been taken down or the address is wrong.
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="container section-tight stack">
      <Breadcrumb
        items={[
          { label: 'Home', to: '/' },
          { label: 'Properties', to: '/properties' },
          { label: property.title },
        ]}
      />

      <header className="stack stack-sm">
        <div className="row" style={{ gap: 8 }}>
          <span className={`badge badge-${property.listing_type === 'SALE' ? 'red' : 'navy'}`}>
            For {property.listing_type === 'SALE' ? 'Sale' : 'Rent'}
          </span>
          <StatusBadge value={property.status} label={property.status_display} />
          {property.is_featured ? <span className="badge badge-outline">Featured</span> : null}
          {property.reference ? <span className="hint mono">{property.reference}</span> : null}
        </div>
        <h1 className="page-title">{property.title}</h1>
        <p className="location-line" style={{ fontSize: '.95rem' }}>
          <MapPin size={15} />
          {locationParts.length ? (
            locationParts.map((part, index) => (
              <span key={`${part}-${index}`}>
                {part === property.city ? (
                  <Link to={`/properties?city=${encodeURIComponent(part)}`}>{part}</Link>
                ) : (
                  part
                )}
                {index < locationParts.length - 1 ? ', ' : null}
              </span>
            ))
          ) : (
            'Location on request'
          )}
        </p>
        <p className="property-price" style={{ fontSize: '1.6rem' }}>
          {property.price_display || 'Price on request'}
          {property.negotiable ? <span className="hint" style={{ marginLeft: 10 }}>Negotiable</span> : null}
        </p>
      </header>

      <dl className="detail-strip">
        <div>
          <dt>
            <BedDouble size={14} /> Bedrooms
          </dt>
          <dd>{property.bedrooms ?? '—'}</dd>
        </div>
        <div>
          <dt>
            <Bath size={14} /> Bathrooms
          </dt>
          <dd>{property.bathrooms ?? '—'}</dd>
        </div>
        <div>
          <dt>
            <Car size={14} /> Parking
          </dt>
          <dd>{property.parking_spaces ?? '—'}</dd>
        </div>
        <div>
          <dt>
            <Ruler size={14} /> Floor area
          </dt>
          <dd>{property.area ? `${Number(property.area).toLocaleString()} ${titleCase(property.area_unit || 'sqm')}` : '—'}</dd>
        </div>
        <div>
          <dt>
            <Building2 size={14} /> Type
          </dt>
          <dd>{property.property_type_display || titleCase(property.property_type)}</dd>
        </div>
        <div>
          <dt>
            <CalendarDays size={14} /> Built
          </dt>
          <dd>{property.year_built || '—'}</dd>
        </div>
      </dl>

      <div className="split">
        <div className="stack stack-lg">
          <Gallery images={property.images || []} title={property.title} />

          {property.summary ? <p className="lead">{property.summary}</p> : null}

          <section className="stack">
            <h2>About this property</h2>
            {property.description ? (
              <div className="article-body">
                {property.description
                  .split(/\n{2,}|\r\n\r\n/)
                  .filter((para) => para.trim())
                  .map((para, index) => (
                    <p key={index}>{para}</p>
                  ))}
              </div>
            ) : (
              <p className="muted">The landlord has not added a written description for this listing yet.</p>
            )}
          </section>

          <section className="stack">
            <h2>Amenities</h2>
            {property.amenities?.length ? (
              <div className="chips">
                {property.amenities.map((amenity) => (
                  <span className="chip" key={amenity}>
                    <Check size={14} /> {amenity}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted">No amenities have been recorded for this listing.</p>
            )}
          </section>

          <Panel title="Listing details">
            <KeyValue
              items={[
                { label: 'Furnishing', value: property.furnishing_display || titleCase(property.furnishing) },
                { label: 'Status', value: property.status_display },
                { label: 'Listed on', value: dateLabel(property.created_at) },
                { label: 'Last updated', value: dateLabel(property.updated_at) },
                { label: 'Views', value: property.views ?? 0 },
                { label: 'Listed by', value: property.owner?.full_name || property.owner_name },
                property.service_charge
                  ? { label: 'Service charge', value: `${Number(property.service_charge).toLocaleString()} ${property.currency}` }
                  : null,
                property.security_deposit
                  ? {
                      label: 'Deposit',
                      value: `${Number(property.security_deposit).toLocaleString()} ${property.currency}`,
                    }
                  : null,
                { label: 'Country', value: property.country },
              ].filter(Boolean)}
            />
          </Panel>

          <Callout>
            <ShieldCheck size={17} />
            <span>
              Enquiries are logged with the Mant Bridges team. A viewing is only confirmed once an agent replies to you
              — submitting this form does not reserve the property.
            </span>
          </Callout>
        </div>

        <aside className="sticky-side stack">
          <Panel title="Enquire about this property">
            <EnquiryForm
              property={property}
              defaultSubject={`Enquiry: ${property.title} (${property.reference || property.slug})`}
              title={null}
              note="Send the message below to our team and reference this listing."
            />
          </Panel>
          <Panel title="Prefer to talk?">
            <div className="stack stack-sm">
              <p className="muted" style={{ margin: 0 }}>
                Send a general message with your requirements and we will search our books for you.
              </p>
              <Button to="/contact" variant="outline" block>
                Contact the office
              </Button>
              <Button to="/services" variant="ghost" block>
                <Handshake size={16} /> What we do for landlords and tenants
              </Button>
              <Button to="/properties" variant="ghost" block>
                <ArrowLeft size={16} /> Back to listings
              </Button>
            </div>
          </Panel>
        </aside>
      </div>

      {similarRows.length ? (
        <section className="stack">
          <div className="section-head">
            <div>
              <h2>Similar listings</h2>
              <p>Same type and purpose, published on the Mant Bridges books.</p>
            </div>
            <Link to={`/properties?property_type=${property.property_type}&listing_type=${property.listing_type}`} className="btn btn-outline">
              See all matches
            </Link>
          </div>
          <div className="auto-grid">
            {similarRows.map((item) => (
              <PropertyCard key={item.id} property={item} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
