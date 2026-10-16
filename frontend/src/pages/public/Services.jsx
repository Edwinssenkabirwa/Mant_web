import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CalendarClock,
  FileText,
  HandCoins,
  KeyRound,
  Search,
  ShieldCheck,
  Wrench,
} from 'lucide-react'
import { useLookups } from '../../context/LookupContext.jsx'
import { Callout } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'

const SERVICES = [
  {
    id: 'rent-collection',
    icon: HandCoins,
    eyebrow: 'Service 01',
    title: 'Rent collection and property management',
    lead: 'We run the money side of a tenancy so the relationship stays civil and the books stay straight.',
    includes: [
      'Tenancy setup with the agreed rent, service charge, deposit and billing frequency recorded on the lease',
      'Invoices raised on schedule, with tax, discounts and late-fee rules applied the same way every time',
      'Cash, bank transfer and mobile money payments logged, reconciled and receipted',
      'A running statement per tenancy — what was charged, what was received, what is outstanding',
      'Reminders on overdue invoices and a documented trail of what was sent and when',
      'Occupancy, arrears and collection reporting for landlords on their own dashboard',
    ],
    note: 'We do not take rent payments online. Payments reach us by the methods in your agreement, are logged as pending, and only become confirmed once the desk reconciles them.',
  },
  {
    id: 'debt-recovery',
    icon: ShieldCheck,
    eyebrow: 'Service 02',
    title: 'Debt recovery',
    lead: 'Structured follow-up on arrears, using the documentation the tenancy already generated.',
    includes: [
      'Arrears review against the ledger: invoices, payments, receipts and prior reminders',
      'Written demand and reminder correspondence with dated records',
      'Negotiation of payment arrangements in writing, on terms the landlord approves',
      'Escalation guidance and a brief prepared for the channel your agreement provides for',
      'Reporting on what has been recovered, what remains and how long it has been outstanding',
    ],
    note: 'No outcome can be guaranteed. Recovery depends on the debtor, the documentation and the process your agreement and Ugandan law allow — we will not promise a result we cannot control.',
  },
  {
    id: 'contracting-lobbying',
    icon: Wrench,
    eyebrow: 'Service 03',
    title: 'Contracting and lobbying',
    lead: 'Coordination of works on a property, and representation of a property owner’s interests with the authorities and service providers that affect it.',
    includes: [
      'Scope definition, contractor brief and scheduling for maintenance and refurbishment works',
      'Site coordination and progress records against the agreed scope',
      'Liaison with local authorities, utilities and service providers on property matters',
      'Preparation of representations and follow-up correspondence on behalf of the instruction',
      'Cost and status reporting back to the owner',
    ],
    note: 'We take instructions as an agent and coordinator. Licensed trades and professional services are engaged for the work that requires them, and we do not claim credentials we do not hold.',
  },
]

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
        {SERVICES.map((service, index) => (
          <section className="card" id={service.id} key={service.id} style={{ scrollMarginTop: 90 }}>
            <div className="card-body stack">
              <div className="row-between" style={{ alignItems: 'flex-start' }}>
                <div className="stack stack-sm">
                  <p className="eyebrow">{service.eyebrow}</p>
                  <h2 style={{ margin: 0 }}>{service.title}</h2>
                </div>
                <span className={`icon-tile${index === 1 ? ' icon-tile-accent' : ''}`}>
                  <service.icon size={22} />
                </span>
              </div>
              <p className="lead" style={{ margin: 0 }}>
                {service.lead}
              </p>
              <div className="grid grid-2">
                <div>
                  <h3>What it covers</h3>
                  <ul className="auth-points" style={{ color: 'var(--ink-soft)' }}>
                    {service.includes.map((item) => (
                      <li key={item}>
                        <ArrowRight size={16} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="stack">
                  <h3>Honest limits</h3>
                  <Callout>{service.note}</Callout>
                  <div className="row">
                    <Button to="/contact" variant="accent" size="sm">
                      Discuss this service
                    </Button>
                    <Link to="/properties" className="btn btn-outline btn-sm">
                      View our listings
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </section>
        ))}

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
