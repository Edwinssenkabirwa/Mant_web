import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Inbox,
  MessageSquare,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { featuredProperties, listProperties, propertyCities, propertyStats } from '../../api/properties.js'
import { listServices } from '../../api/services.js'
import { collect } from '../../api/paginate.js'
import { latestPosts } from '../../api/blog.js'
import { useLookups } from '../../context/LookupContext.jsx'
import { pluralize } from '../../utils/format.js'
import PropertyGrid from '../../components/properties/PropertyGrid.jsx'
import PostCard from '../../components/blog/PostCard.jsx'
import ServiceBadge from '../../components/services/ServiceBadge.jsx'
import NewsletterSignup from '../../components/common/NewsletterSignup.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Field, Input, SelectOptions } from '../../components/ui/Form.jsx'
import { Callout } from '../../components/ui/Blocks.jsx'
import { EmptyState, Loading } from '../../components/ui/Feedback.jsx'
import { useApi } from '../../hooks/useApi.js'
import { mediaUrl } from '../../utils/media.js'

export default function Home() {
  const { options } = useLookups()
  const navigate = useNavigate()
  const [search, setSearch] = useState({ listing_type: '', property_type: '', city: '' })
  const [heroImage, setHeroImage] = useState('loading')
  const featured = useApi(() => featuredProperties(), [])
  const stats = useApi(() => propertyStats(), [])
  const cityFacets = useApi(() => propertyCities(), [])
  const posts = useApi(() => latestPosts(), [])
  const services = useApi(() => collect(listServices, {}, 3), [])
  const popular = useApi(() => listProperties({ listing_type: 'SALE', ordering: '-created_at' }), [])

  const runSearch = (event) => {
    event.preventDefault()
    const params = new URLSearchParams()
    Object.entries(search).forEach(([key, value]) => value && params.append(key, value))
    navigate(`/properties?${params.toString()}`)
  }

  return (
    <>
      <section className="hero hero-photo">
        {/* Decorative artwork. If it never loads the navy gradient underneath still reads. */}
        <img
          className={`hero-bg${heroImage === 'loaded' ? ' is-loaded' : ''}`}
          src="/images/hero-kampala-residential.jpg"
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          onLoad={() => setHeroImage('loaded')}
          onError={() => setHeroImage('failed')}
        />
        <div className="hero-scrim" aria-hidden="true" />
        <div className="container">
          <div className="hero-grid">
            <div className="stack hero-rise">
              <p className="eyebrow" style={{ color: '#ffb3bd' }}>
                Kampala · Uganda
              </p>
              <h1>Bridging gaps. Building value.</h1>
              <p>
                We connect people to possibilities by managing properties with excellence, creating value that lasts.
              </p>
              <p>
                Mant Bridges LTD lists property for rent and sale across Uganda and runs the administration behind it —
                leases, invoices, payment reconciliation and receipts on one set of books.
              </p>
              <div className="hero-mission">Your property. Our priority. Your success. Our mission.</div>
              <div className="row" style={{ gap: 12 }}>
                <Button to="/properties" variant="accent" size="lg">
                  Explore properties <ArrowRight size={17} />
                </Button>
                <Button to="/services" variant="light" size="lg">
                  Our services
                </Button>
              </div>
              {stats.data ? (
                <div className="hero-stats">
                  <div>
                    <div className="hero-stat-value">{stats.data.available}</div>
                    <div className="hero-stat-label">Listings available</div>
                  </div>
                  <div>
                    <div className="hero-stat-value">{stats.data.for_rent}</div>
                    <div className="hero-stat-label">For rent</div>
                  </div>
                  <div>
                    <div className="hero-stat-value">{stats.data.for_sale}</div>
                    <div className="hero-stat-label">For sale</div>
                  </div>
                  <div>
                    <div className="hero-stat-value">{stats.data.cities}</div>
                    <div className="hero-stat-label">Locations covered</div>
                  </div>
                </div>
              ) : null}
            </div>

            <form className="search-panel stack hero-rise-late" onSubmit={runSearch}>
              <h3>Find a property</h3>
              <Field name="listing_type" label="I want to">
                <Input
                  as="select"
                  name="listing_type"
                  value={search.listing_type}
                  onChange={(value) => setSearch((current) => ({ ...current, listing_type: value }))}
                >
                  <SelectOptions items={options.listing_types} placeholder="Rent or buy" />
                </Input>
              </Field>
              <Field name="property_type" label="Property type">
                <Input
                  as="select"
                  name="property_type"
                  value={search.property_type}
                  onChange={(value) => setSearch((current) => ({ ...current, property_type: value }))}
                >
                  <SelectOptions items={options.property_types} placeholder="Any type" />
                </Input>
              </Field>
              <Field name="city" label="Location">
                <Input
                  name="city"
                  value={search.city}
                  onChange={(value) => setSearch((current) => ({ ...current, city: value }))}
                  placeholder="City or area"
                  list="home-cities"
                />
                {/* Cities with a live listing, so a suggestion never returns an empty search. */}
                <datalist id="home-cities">
                  {(cityFacets.data || []).map((row) => (
                    <option key={row.city} value={row.city} />
                  ))}
                </datalist>
              </Field>
              <Button type="submit" block size="lg">
                <Search size={17} /> Search property
              </Button>
              <p className="hint" style={{ margin: 0 }}>
                Availability shown here comes from live listings published by our landlords and team.
              </p>
              <p className="hero-note" style={{ margin: 0 }}>
                The neighbourhood picture above is an illustrative render, not a photograph of a listed property.
              </p>
            </form>
          </div>
        </div>
        <span className="arc-swoosh" aria-hidden="true" />
      </section>

      <section className="section" style={{ background: 'var(--surface)' }}>
        <div className="container stack">
          <div className="section-head">
            <div>
              <p className="eyebrow">Our services</p>
              <h2>Comprehensive. Professional. Results Driven.</h2>
              <p>Written mandates, dated records and reporting on a calendar — for the property you already own.</p>
            </div>
            <Button to="/services" variant="outline">
              Service details <ArrowRight size={16} />
            </Button>
          </div>
          {services.loading ? (
            <Loading label="Loading our services…" />
          ) : services.error ? (
            <Callout>Services could not be loaded: {services.error}</Callout>
          ) : (services.data ?? []).length === 0 ? (
            <EmptyState icon={Inbox} title="No services are published right now">
              Our service pages are maintained by the administration team.{' '}
              <Link to="/contact">Tell us what you need</Link> and we will reply directly.
            </EmptyState>
          ) : (
            <div className="grid grid-4">
              {services.data.slice(0, 4).map((service) => (
                <article className="card" key={service.id}>
                  {service.image_url ? (
                    <img
                      className="service-card-image"
                      src={mediaUrl(service.image_url)}
                      alt={service.image_alt || service.name}
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.src = mediaUrl('')
                      }}
                    />
                  ) : null}
                  <div className="card-body stack">
                    <div className="row" style={{ gap: 11, alignItems: 'center' }}>
                      <ServiceBadge icon={service.icon} />
                      <h3 style={{ marginBottom: 0 }}>{service.name}</h3>
                    </div>
                    <p className="muted" style={{ margin: 0 }}>
                      {service.summary_text}
                    </p>
                    <Link
                      to={`/services/${service.slug}`}
                      className="row"
                      style={{ gap: 6, fontWeight: 700, fontSize: '.88rem' }}
                    >
                      How it works <ArrowRight size={15} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="container stack">
          <div className="section-head">
            <div>
              <p className="eyebrow">Featured listings</p>
              <h2>Hand-picked by our property team</h2>
              <p>Every listing below is published on the Mant Bridges books, with the landlord and status on record.</p>
            </div>
            <Button to="/properties" variant="outline">
              All properties <ArrowRight size={16} />
            </Button>
          </div>
          <PropertyGrid
            properties={featured.data || []}
            loading={featured.loading}
            error={featured.error}
            onRetry={featured.reload}
            featured
            emptyTitle="No featured listings right now"
            emptyNote="New listings appear here once our team marks them as featured."
          />
        </div>
      </section>

      {stats.data?.by_type?.some((row) => row.count > 0) ? (
        <section className="section">
          <div className="container stack">
            <div className="section-head">
              <div>
                <p className="eyebrow">Browse by category</p>
                <h2>Property types on the books</h2>
              </div>
            </div>
            <div className="chip-grid">
              {stats.data.by_type
                .filter((row) => row.count > 0)
                .map((row) => (
                  <Link key={row.value} to={`/properties?property_type=${row.value}`} className="card">
                    <div className="card-body row-between" style={{ padding: 14 }}>
                      <span className="row" style={{ gap: 9 }}>
                        <Building2 size={17} />
                        <strong>{row.label}</strong>
                      </span>
                      <span className="badge badge-outline">{pluralize(row.count, 'listing')}</span>
                    </div>
                  </Link>
                ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="section arc-band" style={{ background: 'var(--navy-800)', color: '#fff' }}>
        <div className="container">
          <div className="grid grid-2" style={{ alignItems: 'center', gap: 32 }}>
            <div className="stack">
              <p className="eyebrow" style={{ color: '#ffb3bd' }}>
                For landlords
              </p>
              <h2 style={{ color: '#fff' }}>Put your property on a system that answers for it</h2>
              <p style={{ color: 'var(--navy-100)', margin: 0 }}>
                Publish a listing, sign the tenancy, invoice on schedule and see exactly what has been paid. You get a
                landlord dashboard with the same figures our administrators see for your portfolio.
              </p>
              <ul className="auth-points" style={{ color: '#fff' }}>
                <li>
                  <BadgeCheck size={17} /> Invoices raised from the lease terms, with late-fee rules you can see.
                </li>
                <li>
                  <ShieldCheck size={17} /> Payments stay pending until reconciled — no silent “paid” marks.
                </li>
                <li>
                  <MessageSquare size={17} /> One thread per tenancy for maintenance, viewing and document requests.
                </li>
              </ul>
              <div className="row">
                <Button to="/register" variant="accent">
                  Create a landlord account
                </Button>
                <Button to="/contact" variant="light">
                  Ask about management
                </Button>
              </div>
            </div>
            <div className="photo-band photo-band-tall">
              <img src="/images/landlord.jpg" alt="Residential buildings in a Kampala neighbourhood" />
            </div>
          </div>
        </div>
        <span className="arc-swoosh" aria-hidden="true" />
      </section>

      <section className="section">
        <div className="container stack">
          <div className="section-head">
            <div>
              <p className="eyebrow">From the blog</p>
              <h2>Guides on rent, tenancies and maintenance</h2>
            </div>
            <Button to="/blog" variant="outline">
              Read all posts <ArrowRight size={16} />
            </Button>
          </div>
          <div className="auto-grid">
            {(posts.data || []).slice(0, 3).map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
          {posts.error ? <Callout>Blog posts could not be loaded: {posts.error}</Callout> : null}
        </div>
      </section>

      <NewsletterSignup variant="band" source="homepage" />

      <section className="section" style={{ background: 'var(--surface)' }}>
        <div className="container stack">
          <div className="section-head">
            <div>
              <p className="eyebrow">Recently listed</p>
              <h2>Properties for sale</h2>
            </div>
            <Button to="/properties?listing_type=SALE" variant="outline">
              See all for sale <ArrowRight size={16} />
            </Button>
          </div>
          <PropertyGrid
            properties={(popular.data?.results || popular.data || []).slice(0, 4)}
            loading={popular.loading}
            error={popular.error}
            onRetry={popular.reload}
            emptyTitle="No sale listings published yet"
            emptyNote="Properties appear here as soon as they are published for sale."
          />
        </div>
      </section>
    </>
  )
}
