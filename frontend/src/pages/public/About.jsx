import { Link } from 'react-router-dom'
import { ArrowRight, Building2, Compass, FileText, HandCoins, Handshake, ShieldCheck, Target } from 'lucide-react'
import { propertyCities, propertyStats } from '../../api/properties.js'
import { useApi } from '../../hooks/useApi.js'
import { useLookups } from '../../context/LookupContext.jsx'
import { Breadcrumb, Callout, Stat } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Skeleton } from '../../components/ui/Feedback.jsx'

// The three values from the brochure, stated so that each one covers every service rather than
// rent collection alone — the same sentence has to hold for a title file or a tender.
const BROCHURE_VALUES = [
  {
    icon: ShieldCheck,
    title: 'Professionalism',
    body: 'Consistency, integrity and respect in how we carry every instruction, and timely delivery of what we agreed to do. The same standard whether it is a tenancy, a sale, a title file, a contract or money owed to you.',
  },
  {
    icon: Handshake,
    title: 'Trust',
    body: 'Trust is built the ordinary way: we tell you what will happen, then it happens. Named contacts, agreed dates and predictable follow-up are what make us reliable enough to be handed a property, a purchase or a debt to chase.',
  },
  {
    icon: Target,
    title: 'Result driven',
    body: 'We are committed to our word and oriented to the outcome we were hired for. We work toward the agreed terms until they are met — money received on the agreed day, a buyer introduced, a contract pursued, papers cleared.',
  },
]

const VALUES = [
  {
    icon: FileText,
    title: 'Verified before advertised',
    body: 'Before a listing goes public, a file is opened for a purchase or a recovery is taken on, we establish who it belongs to, what is proven on paper and what is still assumed. What we cannot document, we do not publish or pursue.',
  },
  {
    icon: Compass,
    title: 'Work that answers for itself',
    body: 'Every instruction leaves a file: what you asked for, the steps we took and what came of them. A query is answered from that file rather than from memory, whichever service it belongs to.',
  },
  {
    icon: HandCoins,
    title: 'Money treated seriously',
    body: 'Where money is involved — rent, a purchase price, a recovery or a project payment — it is tracked to the right person and reported on the day it was agreed, never left to someone remembering.',
  },
  {
    icon: ShieldCheck,
    title: 'One team accountable',
    body: 'The same office carries the enquiry, the work and the follow-up, so an instruction is not passed sideways between departments or dropped between services.',
  },
]

export default function About() {
  const { company } = useLookups()
  const stats = useApi(() => propertyStats(), [])
  const cities = useApi(() => propertyCities(), [])

  return (
    <div>
      <section className="section-tight" style={{ padding: '40px 0 8px' }}>
        <div className="container stack">
          <Breadcrumb items={[{ label: 'Home', to: '/' }, { label: 'About' }]} />
          <p className="eyebrow">Managing properties with excellence, creating value that lasts.</p>
          <h1>About Mant Bridges LTD</h1>
          <p className="lead" style={{ maxWidth: '78ch' }}>
            {company?.legal_name || company?.name || 'Mant Bridges LTD'} is located in Kampala and operates in Kampala,
            Wakiso, Mukono, Masaka and all major cities of Uganda on five fronts: Rent collection &amp; property
            management, Real estate, Contracting &amp; lobbying, Land &amp; property documentation and Debt recovery.
          </p>
        </div>
      </section>

      <section className="section-tight">
        <div className="container">
          <div className="photo-band photo-band-tall">
            <img src="/images/kampala.jpg" alt="Residential neighbourhoods in Kampala, Uganda" />
            <div className="photo-overlay">
              <h2 style={{ maxWidth: '26ch' }}>Bridging Gaps</h2>
              <p style={{ maxWidth: '62ch' }}>
                We build bridges of trust, create lasting value and close every gap between you and your goals.
              </p>
              <p>We are your trusted partner in managing properties, unlocking opportunities and delivering results.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="split">
            <div className="stack">
              <h2>Who we are</h2>
              {(company?.about || '')
                .split(/\n{2,}/)
                .filter((para) => para.trim())
                .map((para, index) => (
                  <p key={index} className="soft" style={{ margin: 0, lineHeight: 1.75 }}>
                    {para}
                  </p>
                ))}
              {!company?.about ? (
                <Callout>
                  The company profile has not been filled in yet. An administrator can add it under Company profile in
                  the dashboard.
                </Callout>
              ) : null}

              <div className="row" style={{ marginTop: 8 }}>
                <Button to="/services" variant="outline">
                  Our services <ArrowRight size={16} />
                </Button>
                <Button to="/properties" variant="accent">
                  Browse property
                </Button>
              </div>
            </div>

            <aside className="sticky-side stack">
              <div className="card">
                <div className="card-head">
                  <h3>On the books right now</h3>
                </div>
                <div className="card-body grid grid-2" style={{ gap: 14 }}>
                  {stats.loading ? (
                    <>
                      <Skeleton height={78} />
                      <Skeleton height={78} />
                      <Skeleton height={78} />
                      <Skeleton height={78} />
                    </>
                  ) : null}
                  {stats.data ? (
                    <>
                      <Stat label="Available listings" value={stats.data.available} to="/properties" />
                      <Stat label="For rent" value={stats.data.for_rent} to="/properties?listing_type=RENT" />
                      <Stat label="For sale" value={stats.data.for_sale} to="/properties?listing_type=SALE" />
                      <Stat label="Locations" value={stats.data.cities} />
                    </>
                  ) : null}
                </div>
              </div>

              {cities.data?.length ? (
                <div className="card" id="locations" style={{ scrollMarginTop: 90 }}>
                  <div className="card-head">
                    <h3>Where we list</h3>
                  </div>
                  <div className="card-body chips">
                    {cities.data.map((row) => (
                      <Link key={row.city} to={`/properties?city=${encodeURIComponent(row.city)}`} className="chip chip-button">
                        <Building2 size={14} /> {row.city}
                        <span className="badge badge-outline" style={{ marginLeft: 4 }}>
                          {row.count}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </aside>
          </div>
        </div>
      </section>

      <section className="section arc-band" style={{ background: 'var(--navy-800)', color: '#fff' }}>
        <div className="container stack">
          <div className="section-head">
            <div>
              <p className="eyebrow" style={{ color: '#ffb3bd' }}>
                What we stand for
              </p>
              <h2 style={{ color: '#fff' }}>Professionalism · Trust · Result driven</h2>
              <p style={{ color: 'var(--navy-100)' }}>
                Three values, stated the way we can actually be measured against them — across every service, not rent
                collection alone.
              </p>
            </div>
          </div>
          <div className="value-band">
            {BROCHURE_VALUES.map((value) => (
              <div className="value-item" key={value.title}>
                <span className="service-badge">
                  <value.icon size={22} strokeWidth={1.9} />
                </span>
                <h4 style={{ color: '#fff', marginBottom: 4 }}>{value.title}</h4>
                <p style={{ margin: 0, color: 'var(--navy-100)' }}>{value.body}</p>
              </div>
            ))}
          </div>
        </div>
        <span className="arc-swoosh" aria-hidden="true" />
      </section>

      <section className="section section-wash">
        <div className="container stack">
          <div className="section-head">
            <div>
              <p className="eyebrow">How we operate</p>
              <h2>Four commitments we can be held to</h2>
            </div>
          </div>
          <div className="grid grid-2">
            {VALUES.map((value) => (
              <div className="feature" key={value.title}>
                <span className="icon-tile">
                  <value.icon size={19} />
                </span>
                <div>
                  <h4>{value.title}</h4>
                  <p>{value.body}</p>
                </div>
              </div>
            ))}
          </div>
          <Callout>
            We do not publish awards, client counts or testimonials we cannot evidence. If a figure appears on this
            site, it came out of the work behind it, whichever service it belongs to.
          </Callout>
        </div>
      </section>
    </div>
  )
}
