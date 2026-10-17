import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CalendarClock,
  FileText,
  Inbox,
  KeyRound,
  Search,
} from 'lucide-react'
import { listServices } from '../../api/services.js'
import { collect } from '../../api/paginate.js'
import { useApi } from '../../hooks/useApi.js'
import { useLookups } from '../../context/LookupContext.jsx'
import { Callout } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { EmptyState, ErrorState, Loading } from '../../components/ui/Feedback.jsx'
import { mediaUrl } from '../../utils/media.js'

const PROCESS = [
  {
    icon: Search,
    title: 'Brief and inspection',
    body: 'We agree what the property needs and record the current position — occupancy, paperwork and money.',
  },
  {
    icon: FileText,
    title: 'Written mandate',
    body: 'Scope, fees and reporting are set out before work starts, so nobody is guessing about responsibilities.',
  },
  {
    icon: CalendarClock,
    title: 'Administration on schedule',
    body: 'Invoices, reminders, statements and reports are produced on the calendar the mandate sets.',
  },
  {
    icon: KeyRound,
    title: 'Handover and reporting',
    body: 'You get the ledger, the documents and the current position at the point you ask for it.',
  },
]

export default function Services() {
  const { company } = useLookups()
  const services = useApi(() => collect(listServices, {}, 5), [])

  return (
    <div>
      <section className="section-tight" style={{ background: 'var(--navy-800)', color: '#fff', padding: '44px 0' }}>
        <div className="container stack">
          <p className="eyebrow" style={{ color: '#ffb3bd' }}>
            Services
          </p>
          <h1 style={{ color: '#fff', maxWidth: '24ch' }}>
            Property administration, rent recovery and site coordination
          </h1>
          <p style={{ color: 'var(--navy-100)', maxWidth: '70ch', margin: 0 }}>
            {company?.tagline || 'Mant Bridges LTD runs the paperwork and the money behind a property.'}
          </p>
        </div>
      </section>

      <div className="container stack stack-lg">
        {services.loading ? (
          <Loading label="Loading our services…" />
        ) : services.error ? (
          <ErrorState error={services.error} onRetry={services.reload} title="Services could not be loaded" />
        ) : (services.data ?? []).length === 0 ? (
          <EmptyState icon={Inbox} title="No services are published right now">
            Our service pages are maintained by the administration team. Check back shortly, or{' '}
            <Link to="/contact">tell us what you need</Link> and we will reply directly.
          </EmptyState>
        ) : (
          services.data.map((service) => (
            <section className="card service-banner" id={service.slug} key={service.id} style={{ scrollMarginTop: 90 }}>
              {service.image_url ? (
                <>
                  <img
                    className="service-banner-bg"
                    src={mediaUrl(service.image_url)}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none'
                    }}
                  />
                  <span className="service-banner-scrim" aria-hidden="true" />
                </>
              ) : null}
              <div className="card-body stack">
                <div className="stack stack-sm">
                  <p className="eyebrow" style={{ color: '#ffb3bd', marginBottom: 0 }}>
                    {service.category_display || 'Service'}
                  </p>
                  <h2 style={{ margin: 0, color: '#fff' }}>{service.name}</h2>
                </div>
                <p className="lead" style={{ margin: 0, color: 'var(--navy-100)' }}>
                  {service.summary_text}
                </p>
                {service.highlights?.length ? (
                  <ul className="auth-points" style={{ color: 'var(--navy-100)' }}>
                    {service.highlights.slice(0, 4).map((item) => (
                      <li key={item}>
                        <ArrowRight size={16} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {service.limitations ? <Callout>{service.limitations}</Callout> : null}
                <div className="row">
                  <Button to={`/services/${service.slug}`} variant="accent" size="sm">
                    Full service detail <ArrowRight size={15} />
                  </Button>
                  <Link to="/contact" className="btn btn-outline btn-sm">
                    Discuss this service
                  </Link>
                  <Link to="/properties" className="btn btn-ghost btn-sm">
                    View our listings
                  </Link>
                </div>
              </div>
            </section>
          ))
        )}

        <section className="stack">
          <div className="section-head">
            <div>
              <p className="eyebrow">How we work</p>
              <h2>Four steps, documented</h2>
              <p>The same sequence applies whether we are invoicing a tenancy or coordinating works on a building.</p>
            </div>
          </div>
          <div className="timeline">
            {PROCESS.map((step, index) => (
              <div className={`timeline-item${index === 0 ? ' accent' : ''}`} key={step.title}>
                <div className="card">
                  <div className="card-body stack stack-sm">
                    <span className="row" style={{ gap: 9 }}>
                      <span className="icon-tile">
                        <step.icon size={17} />
                      </span>
                      <strong>{step.title}</strong>
                    </span>
                    <p className="muted" style={{ margin: 0 }}>
                      {step.body}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="photo-band photo-band-short">
          <img src="/images/contracting.jpg" alt="Property works and site coordination in Uganda" />
          <div className="photo-overlay">
            <h3>Instructing us, or getting your property managed</h3>
            <p style={{ maxWidth: '60ch' }}>
              Tell us the property, the problem and what you have already tried. We will come back with scope, fees and
              a reporting calendar before anything starts.
            </p>
            <div className="row" style={{ marginTop: 12 }}>
              <Button to="/contact" variant="accent">
                Send an enquiry <ArrowRight size={16} />
              </Button>
              <Button to="/register" variant="light">
                Create an account
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
