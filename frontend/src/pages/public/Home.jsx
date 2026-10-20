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
import { locationGroups } from '../../utils/locations.js'
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
  const { options, company } = useLookups()
  const navigate = useNavigate()
  const [search, setSearch] = useState({ listing_type: '', property_type: '', city: '' })
  const [heroImage, setHeroImage] = useState('loading')
  const featured = useApi(() => featuredProperties(), [])
  const stats = useApi(() => propertyStats(), [])
  const cityFacets = useApi(() => propertyCities(), [])
  const posts = useApi(() => latestPosts(), [])
  const services = useApi(() => collect(listServices, {}, 3), [])
  const popular = useApi(() => listProperties({ listing_type: 'SALE', ordering: '-created_at' }), [])

  const heroLogo = company?.logo_url ? mediaUrl(company.logo_url, { fallback: '' }) : ''

  // The wording here is ours; the destinations come from the published services, so a rename or
  // withdrawal falls back to the services index instead of dead-ending on a slug that no longer exists.
  const toService = (name) => {
    const match = (services.data ?? []).find((row) => row.name.toLowerCase() === name.toLowerCase())
    return match ? `/services/${match.slug}` : '/services'
  }
  const HERO_NAMES = [
    'Rent collection & property management',
    'Real estate',
    'Contracting & lobbying',
    'Land & property documentation',
    'Debt recovery',
  ]
  // Once the services have loaded the published rows win, so the hero follows an
  // administrator's names and order instead of contradicting them.
  const heroLinks = services.data?.length
    ? services.data.map((service) => ({ label: service.name, to: `/services/${service.slug}` }))
    : HERO_NAMES.map((name) => ({ label: name, to: toService(name) }))

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
              <div className="hero-brand">
                <h1 className="hero-logo">
                  {heroLogo ? (
                    <img
                      src={heroLogo}
                      alt={`${company?.name || 'Mant Bridges LTD'} — Bridging gaps. Building value.`}
                      fetchPriority="high"
                    />
                  ) : (
                    'Bridging gaps'
                  )}
                </h1>
                <div className="hero-tagline">
                  <strong>Bridging Gaps</strong>
                  <p>We build bridges of trust, create lasting value and close every gap between you and your goals.</p>
                  <p>We are your trusted partner in managing properties, unlocking opportunities and delivering results.</p>
                </div>
              </div>
              <div className="hero-focus">
                {heroLinks.map((item) => (
                  <Link key={item.label} to={item.to} className="hero-focus-link">
                    {item.label}
                  </Link>
                ))}
              </div>
              {/*<p>
                Mant Bridges LTD lists property for rent and sale across Uganda and runs the administration behind it.
              </p>*/}
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
                  <Link to="/properties">
                    <div className="hero-stat-value">{stats.data.available}</div>
                    <div className="hero-stat-label">Property Available</div>
                  </Link>
                  <Link to="/properties?listing_type=RENT">
                    <div className="hero-stat-value">{stats.data.for_rent}</div>
                    <div className="hero-stat-label">For rent</div>
                  </Link>
                  <Link to="/properties?listing_type=SALE">
                    <div className="hero-stat-value">{stats.data.for_sale}</div>
                    <div className="hero-stat-label">For sale</div>
                  </Link>
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
                  as="select"
                  name="city"
                  value={search.city}
                  onChange={(value) => setSearch((current) => ({ ...current, city: value }))}
                >
                  <option value="">Anywhere in Uganda</option>
                  {locationGroups(cityFacets.data || []).map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.cities.map((city) => (
                        <option key={city} value={city}>
                          {city}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Input>
              </Field>
              <Button type="submit" block size="lg" variant="accent">
                <Search size={17} /> Search property
              </Button>
              <p className="hint" style={{ margin: 0 }}>
                Availability shown here comes from live listings verified by our landlords and verified by our team.
              </p>
              <p className="hero-note" style={{ margin: 0 }}>
                The neighbourhood picture above is an illustrative render, not a photograph of a listed property.
              </p>
            </form>
          </div>
        </div>
        <span className="arc-swoosh" aria-hidden="true" />
      </section>

      <section className="section section-wash">
        <div className="container stack">
          <div className="section-head">
            <div>
              {/*<p className="eyebrow">Our services</p>*/}
              <h2>Our Services</h2>
              {/*<p>Written mandates, dated records and reporting on a calendar — </p>*/}
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
            <div className="service-grid">
              {services.data.map((service) => (
                <article className="card service-card" key={service.id}>
                  <div className="card-body">
                    <div className="row" style={{ gap: 11, alignItems: 'center' }}>
                      <ServiceBadge icon={service.icon} />
                      <h3>
                        <Link className="stretched-link" to={`/services/${service.slug}`}>
                          {service.name}
                        </Link>
                      </h3>
                    </div>
                    <span className="flyer-dash" aria-hidden="true" />
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
                  {service.image_url ? (
                    <Link className="service-card-photo" to={`/services/${service.slug}`}>
                      <img
                        src={mediaUrl(service.image_url)}
                        alt={service.image_alt || service.name}
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.src = mediaUrl('')
                        }}
                      />
                    </Link>
                  ) : null}
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
        <section className="section section-wash">
          <div className="container stack">
            <div className="section-head">
              <div>
                <p className="eyebrow">Browse by category</p>
                <h2>Available properties</h2>
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
              <h2 style={{ color: '#fff' }}>Put your property in hands that answer for it</h2>
              <p style={{ color: 'var(--navy-100)', margin: 0 }}>
                Rent that reaches you on the date it was agreed, faults closed while they are still small and one office
                accountable for the whole thing — so you can plan around your income instead of chasing it.
              </p>
              <ul className="auth-points" style={{ color: '#fff' }}>
                <li>
                  <BadgeCheck size={17} /> Money in your account at the agreed time, early enough to plan the next investment.
                </li>
                <li>
                  <ShieldCheck size={17} /> Verified ownership and paperwork before anything is advertised or handed over.
                </li>
                <li>
                  <MessageSquare size={17} /> One team answers for the tenancy, the queries and the follow-up.
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
              <h2>From the blog</h2>
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

      <section className="section section-wash">
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
