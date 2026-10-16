import { Link } from 'react-router-dom'
import { ArrowRight, Building2, Compass, FileText, HandCoins, ShieldCheck } from 'lucide-react'
import { propertyCities, propertyStats } from '../../api/properties.js'
import { useApi } from '../../hooks/useApi.js'
import { useLookups } from '../../context/LookupContext.jsx'
import { Breadcrumb, Callout, Stat } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Skeleton } from '../../components/ui/Feedback.jsx'

const VALUES = [
  {
    icon: ShieldCheck,
    title: 'Verified before advertised',
    body: 'A listing goes public with an owner, a status and a price on record. Anything we cannot document, we do not publish.',
  },
  {
    icon: FileText,
    title: 'Paperwork that answers for itself',
    body: 'Leases, invoices, payment records and receipts are stored against the tenancy, so a query can be answered from the ledger rather than memory.',
  },
  {
    icon: HandCoins,
    title: 'Money treated seriously',
    body: 'Payments are logged as received and reconciled, never marked paid on trust. A receipt exists for every confirmed payment.',
  },
  {
    icon: Compass,
    title: 'One team accountable',
    body: 'The same administration desk handles the enquiry, the tenancy and the arrears, so instructions are not passed sideways.',
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
          <p className="eyebrow">About Mant Bridges LTD</p>
          <h1>{company?.tagline || 'Connecting people to property they can trust.'}</h1>
          <p className="lead" style={{ maxWidth: '78ch' }}>
            {company?.legal_name || company?.name || 'Mant Bridges LTD'} works in Kampala and the surrounding
            districts on three fronts: property for rent and sale, the administration of tenancies, and the recovery
            and coordination work that follows.
          </p>
        </div>
      </section>

      <section className="section-tight">
        <div className="container">
          <div className="photo-band photo-band-tall">
            <img src="/images/kampala.jpg" alt="Residential neighbourhoods in Kampala, Uganda" />
            <div className="photo-overlay">
              <h2 style={{ maxWidth: '26ch' }}>A real estate practice built around records</h2>
              <p style={{ maxWidth: '62ch' }}>
                Listings, leases, invoices and receipts live in one system, and this website reads from it. The numbers
                on this page are the current state of those books.
              </p>
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
                      <Stat label="Available listings" value={stats.data.available} />
                      <Stat label="For rent" value={stats.data.for_rent} />
                      <Stat label="For sale" value={stats.data.for_sale} />
                      <Stat label="Locations" value={stats.data.cities} />
                    </>
                  ) : null}
                </div>
              </div>

              {cities.data?.length ? (
                <div className="card">
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

      <section className="section" style={{ background: 'var(--surface)' }}>
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
            We do not publish awards, client counts or testimonials we cannot evidence. If a figure is on this site, it
            came from the property and rent records behind it.
          </Callout>
        </div>
      </section>
    </div>
  )
}
