import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Breadcrumb, Callout } from '../ui/Blocks.jsx'
import { Button } from '../ui/Button.jsx'
import ServiceBadge from './ServiceBadge.jsx'
import { mediaUrl } from '../../utils/media.js'

/**
 * Service body copy is plain text an administrator writes in the dashboard, so it carries its own
 * light structure: a line starting "## " is a subheading, consecutive lines starting "- " are a
 * bullet list, and anything else is a paragraph.
 */
function parseBlocks(paragraphs = []) {
  const blocks = []
  const flushProse = (buffer) => {
    if (buffer.length) blocks.push({ kind: 'p', text: buffer.join(' ') })
    buffer.length = 0
  }
  paragraphs.forEach((para) => {
    const prose = []
    let list = null
    const flushList = () => {
      if (list) blocks.push({ kind: 'ul', items: list })
      list = null
    }
    para.split('\n').forEach((raw) => {
      const line = raw.trim()
      if (!line) return
      if (line.startsWith('- ')) {
        flushProse(prose)
        list = list || []
        list.push(line.slice(2))
        return
      }
      if (line.startsWith('## ')) {
        flushList()
        flushProse(prose)
        blocks.push({ kind: 'h', text: line.slice(3) })
        return
      }
      // A plain line straight after a bullet continues it — written copy wraps long points.
      if (list && !prose.length) {
        list[list.length - 1] += ` ${line}`
        return
      }
      flushList()
      prose.push(line)
    })
    flushProse(prose)
    flushList()
  })
  return blocks
}

/**
 * The service page body, shared by the public detail route and the admin
 * preview so an unpublished draft is shown exactly as it will read live.
 */
export default function ServiceView({ record, others = [], preview = false }) {
  const blocks = parseBlocks(record.paragraphs)

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
            {blocks.map((block, index) => {
              if (block.kind === 'h') {
                return (
                  <h3 key={`h-${index}`} style={{ marginTop: '0.5em' }}>
                    {block.text}
                  </h3>
                )
              }
              if (block.kind === 'ul') {
                return (
                  <ul className="auth-points auth-points-light" key={`ul-${index}`} style={{ margin: 0 }}>
                    {block.items.map((item) => (
                      <li key={item}>
                        <ArrowRight size={16} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )
              }
              return (
                <p key={`p-${index}`} style={{ margin: 0 }}>
                  {block.text}
                </p>
              )
            })}
            {record.highlights?.length ? (
              <>
                <h3>What it covers</h3>
                <ul className="auth-points auth-points-light">
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
                  <ul className="auth-points auth-points-light">
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
