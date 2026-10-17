import { Link } from 'react-router-dom'
import { Handshake, ShieldCheck, TrendingUp, Users } from 'lucide-react'
import EnquiryForm from '../../components/properties/EnquiryForm.jsx'
import { Breadcrumb, Callout, PageHeader, Panel } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'

/**
 * The backend has no JobVacancy model, no applicant record and no CV upload
 * endpoint, so this page cannot list openings or take applications. It is built
 * around the one channel that does exist — POST /api/enquiries/ — and labels it
 * honestly. See BACKEND_FOLLOWUPS.md for the endpoints needed to turn this into
 * a real careers page.
 */
const AREAS = [
  {
    icon: Users,
    title: 'Property management',
    body: 'Portfolio visits, tenant onboarding, maintenance follow-up and landlord reporting across Kampala and Wakiso.',
  },
  {
    icon: TrendingUp,
    title: 'Real estate management',
    body: 'Listings, viewing records, offer negotiation and the paperwork between the first offer and handover.',
  },
  {
    icon: ShieldCheck,
    title: 'Debt recovery',
    body: 'Documented demand, negotiation and escalation. We recover what is owed without harassment or over-promising.',
  },
  {
    icon: Handshake,
    title: 'Lobbying & advocacy',
    body: 'Representation with authorities, utilities and the land office, and the files those offices expect.',
  },
]

export default function Careers() {
  return (
    <div className="container section-tight stack">
      <Breadcrumb items={[{ label: 'Home', to: '/' }, { label: 'Careers' }]} />

      <PageHeader
        eyebrow="Work with us"
        title="Careers at Mant Bridges LTD"
        lead="We are a small team in Kampala running property management, real estate management, lobbying and advocacy, and debt recovery. We hire when the work needs another pair of hands, and we say so plainly rather than keeping a permanent advert running."
      />

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
                    <h4>{area.title}</h4>
                    <p>{area.body}</p>
                  </div>
                </div>
              ))}
            </div>
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

          <section className="stack stack-sm">
            <h2>What we expect</h2>
            <ul className="bullets">
              <li>Honesty about figures. Rent records, balances and receipts have to be right.</li>
              <li>Written follow-through — every commitment to a client gets a thread or a document.</li>
              <li>Respect for tenants and landlords alike, including when money is late.</li>
              <li>Comfort with Ugandan practice: mobile money reconciliation, bank slips, KRA/URA-grade paperwork.</li>
            </ul>
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
  )
}
