import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Breadcrumb, Callout } from '../ui/Blocks.jsx'
import { Button } from '../ui/Button.jsx'
import ServiceBadge from './ServiceBadge.jsx'
import { mediaUrl } from '../../utils/media.js'

/**
 * The service page body, shared by the public detail route and the admin
 * preview so an unpublished draft is shown exactly as it will read live.
 */
export default function ServiceView({ record, others = [], preview = false }) {
  return (
    <div>
      <section className="section-tight" style={{ background: 'var(--navy-800)', color: '#fff', padding: '40px 0' }}>
        <div className="container stack">
          <Breadcrumb
            items={[
              { label: 'Home', to: '/' },
              { label: 'Services', to: '/services' },
              { label: record.name },
            ]}
          />
          <div className="row" style={{ gap: 13, alignItems: 'center' }}>
            <ServiceBadge icon={record.icon} />
            <h1 style={{ color: '#fff', margin: 0, maxWidth: '22ch' }}>{record.name}</h1>
          </div>
          <p style={{ color: 'var(--navy-100)', maxWidth: '70ch', margin: 0 }}>{record.summary_text}</p>
          {preview && !record.is_published ? (
            <p className="hero-note" style={{ margin: 0 }}>
              Preview of a draft — visitors cannot open this page until it is published.
            </p>
          ) : null}
        </div>
      </section>

      <div className="container section-tight">
        <div className="grid grid-2" style={{ alignItems: 'start', gap: 32 }}>
          <div className="stack">
            {record.image_url ? (
              <img
                className="service-hero-image"
                src={mediaUrl(record.image_url)}
                alt={record.image_alt || record.name}
                onError={(event) => {
                  event.currentTarget.src = mediaUrl('')
                }}
              />
            ) : null}
            {(record.paragraphs ?? []).map((paragraph) => (
              <p key={paragraph.slice(0, 40)} style={{ margin: 0 }}>
                {paragraph}
              </p>
            ))}
            {record.highlights?.length ? (
              <>
                <h3>What it covers</h3>
                <ul className="auth-points" style={{ color: 'var(--ink-soft)' }}>
                  {record.highlights.map((item) => (
                    <li key={item}>
                      <ArrowRight size={16} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>

          <div className="stack">
            {record.limitations ? (
              <>
                <h3>Honest limits</h3>
                <Callout>{record.limitations}</Callout>
              </>
            ) : null}
            <div className="card">
              <div className="card-body stack stack-sm">
                <h3 style={{ margin: 0 }}>Instructing us</h3>
                <p className="muted" style={{ margin: 0 }}>
                  Send the property, the problem and what you have already tried. We reply with scope, fees and a
                  reporting calendar before any work starts.
                </p>
                <Button to="/contact" variant="accent" block>
                  Send an enquiry <ArrowRight size={15} />
                </Button>
                <Button to="/properties" variant="outline" block>
                  View our listings
                </Button>
              </div>
            </div>

            {others.filter((row) => row.slug !== record.slug).length ? (
              <div className="card">
                <div className="card-head">
                  <h3>Other services</h3>
                </div>
                <div className="card-body">
                  <ul className="auth-points" style={{ color: 'var(--ink-soft)' }}>
                    {others
                      .filter((row) => row.slug !== record.slug)
                      .map((row) => (
                        <li key={row.slug}>
                          <ArrowRight size={16} />
                          <Link to={`/services/${row.slug}`}>{row.name}</Link>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
