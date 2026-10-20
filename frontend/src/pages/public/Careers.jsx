import { Link } from 'react-router-dom'
import { HandCoins, Handshake, ShieldCheck, TrendingUp, Users } from 'lucide-react'
import { listServices } from '../../api/services.js'
import { collect } from '../../api/paginate.js'
import EnquiryForm from '../../components/properties/EnquiryForm.jsx'
import { ArcBand, Callout, Panel } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { useApi } from '../../hooks/useApi.js'

/**
 * The backend has no JobVacancy model, no applicant record and no CV upload
 * endpoint, so this page cannot list openings or take applications. It is built
 * around the one channel that does exist — POST /api/enquiries/ — and labels it
 * honestly. See BACKEND_FOLLOWUPS.md for the endpoints needed to turn this into
 * a real careers page.
 */
// Carries the service slug, not just its name: the published names are editable in the
// dashboard, but the slugs the service pages are served from are pinned in the seeder.
const AREAS = [
  {
    icon: Users,
    slug: 'property-management',
    title: 'Rent collection & property management',
    body: 'Portfolio visits, tenant onboarding, maintenance follow-up and landlord reporting across Kampala, Wakiso, Mukono, Masaka and the major cities of Uganda.',
  },
  {
    icon: TrendingUp,
    slug: 'real-estate-management',
    title: 'Real estate',
    body: 'Listings, viewing records, offer negotiation and the paperwork between the first offer and handover.',
  },
  {
    icon: Handshake,
    slug: 'lobbying-and-advocacy',
    title: 'Contracting & lobbying',
    body: 'Representation with authorities, utilities and the land office, and the files those offices expect.',
  },
  {
    icon: ShieldCheck,
    slug: 'land-documentation',
    title: 'Land & property documentation',
    body: 'Searches, filings and follow-ups on sale agreements, succession files and land records.',
  },
  {
    icon: HandCoins,
    slug: 'debt-recovery',
    title: 'Debt recovery',
    body: 'Documented demand, negotiation and escalation. We recover what is owed without harassment or over-promising.',
  },
]

export default function Careers() {
  // The published service supplies the current name, so a rename in the dashboard is reflected here.
  const services = useApi(() => collect(listServices, {}, 2), [])
  const serviceFor = (slug) => (services.data ?? []).find((service) => service.slug === slug)

  return (
    <>
      <ArcBand
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Careers' }]}
        eyebrow="Work with us"
        title="Careers at Mant Bridges LTD"
        lead="We are a professional, committed and organised team dealing in rent collection and property management, real estate, land and property documentation, contracting and lobbying, and debt recovery, located in Kampala. We offer employment when need arises and we advertise here when there is a vacancy."
      />

      <div className="container section-tight stack">
        <div className="split">
          <div className="stack">
            <Callout>
              <strong>No advertised vacancies right now.</strong> This site does not publish or track applications —
              there is no job board on the backend yet. If you want to work with us, send an enquiry below and the
              desk will keep your details for the next opening.
            </Callout>

            <section className="stack stack-sm">
              <h2>The kind of roles we open</h2>
              <div className="grid grid-2">
                {AREAS.map((area) => (
                  <div className="feature" key={area.title}>
                    <div className="icon-tile">
                      <area.icon size={18} />
                    </div>
                    <div>
                      <h4>
                        {serviceFor(area.slug) ? (
                          <Link to={`/services/${area.slug}`}>{serviceFor(area.slug).name}</Link>
                        ) : (
                          area.title
                        )}
                      </h4>
                      <p>{area.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="stack stack-sm">
              <h2>How to apply</h2>
              <ul className="bullets">
                <li>Contact the company through the company phone numbers and platforms.</li>
                <li>Send an inquiry via email or by filling in the form on the left of this page.</li>
                <li>Lastly, the company gets back to you.</li>
              </ul>
            </section>

            <section className="stack stack-sm">
              <h2>How hiring works here</h2>
              <ol className="steps">
                <li>Send an enquiry with your background and the area you want to work in.</li>
                <li>The desk reviews it against live workload and contacts you if there is a fit.</li>
                <li>A practical session on our books and systems, then a conversation about terms.</li>
                <li>Contract and start date agreed in writing before any work begins.</li>
              </ol>
            </section>

            <Callout tone="navy">
              We never ask for a payment, a bank PIN or an M-Pesa authorisation from a candidate — or from a tenant.
              If anyone claiming to be from Mant Bridges asks, <Link to="/contact">report it to us</Link>.
            </Callout>
          </div>

          <aside className="sticky-side stack">
            <Panel title="Register your interest">
              <EnquiryForm
                title="Tell us about yourself"
                defaultSubject="Careers"
                note="This message goes to the same enquiry inbox as property questions. It is not an application — there is no CV upload or applicant tracking on this site yet."
              />
            </Panel>

            <Panel title="Elsewhere on the site">
              <div className="stack stack-sm">
                <Button to="/about" variant="outline" block size="sm">
                  Who we are
                </Button>
                <Button to="/services" variant="outline" block size="sm">
                  What we do
                </Button>
                <Button to="/contact" variant="link" block size="sm">
                  General contact
                </Button>
              </div>
            </Panel>
          </aside>
        </div>
      </div>
    </>
  )
}
