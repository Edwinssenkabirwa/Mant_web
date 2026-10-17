import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, XCircle } from 'lucide-react'
import { confirmNewsletter, unsubscribeNewsletter } from '../../api/newsletter.js'
import { describeError } from '../../api/client.js'
import NewsletterSignup from '../../components/common/NewsletterSignup.jsx'
import { Breadcrumb } from '../../components/ui/Blocks.jsx'
import { Loading } from '../../components/ui/Feedback.jsx'

const COPY = {
  confirm: {
    label: 'Newsletter confirmation',
    pending: 'Confirming your subscription…',
    run: confirmNewsletter,
    heading: 'Your subscription is confirmed',
  },
  unsubscribe: {
    label: 'Unsubscribe',
    pending: 'Updating your subscription…',
    run: unsubscribeNewsletter,
    heading: 'You have been removed from the newsletter',
  },
}

/**
 * Landing page for the links inside newsletter emails. The token is posted straight back
 * to Django, which is the only thing that can decide whether the address is subscribed.
 * Confirmation tokens are single use, so the outcome is cached per token: a StrictMode
 * double effect or a browser refresh must not spend the link twice.
 */
const outcomes = new Map()

export default function NewsletterLink({ kind }) {
  const copy = COPY[kind] || COPY.confirm
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [state, setState] = useState(() =>
    outcomes.get(token) ||
    (token
      ? { phase: 'loading' }
      : { phase: 'error', message: 'This link is missing its token. Open it from the email we sent you.' })
  )
  const requested = useRef(null)

  useEffect(() => {
    if (!token) return undefined
    const cached = outcomes.get(token)
    if (cached) {
      setState(cached)
      return undefined
    }
    if (requested.current === token) return undefined
    requested.current = token
    copy.run(token)
      .then((data) => {
        const result = { phase: 'done', message: data.detail }
        outcomes.set(token, result)
        setState(result)
      })
      .catch((error) => {
        const result = { phase: 'error', message: describeError(error, 'This link could not be processed.') }
        outcomes.set(token, result)
        setState(result)
      })
    return undefined
  }, [token, copy])

  if (state.phase === 'loading') return <Loading label={copy.pending} />

  return (
    <div className="container section-tight stack">
      <Breadcrumb
        items={[{ label: 'Home', to: '/' }, { label: 'Blog', to: '/blog' }, { label: copy.label }]}
      />
      <div className="card">
        <div className="card-body stack">
          <p className="eyebrow" style={{ marginBottom: 0 }}>
            {copy.label}
          </p>
          <h1 style={{ marginTop: 0 }}>
            {state.phase === 'done' ? (
              <span className="row" style={{ gap: 10 }}>
                <CheckCircle2 size={22} aria-hidden="true" />
                {copy.heading}
              </span>
            ) : (
              <span className="row" style={{ gap: 10 }}>
                <XCircle size={22} aria-hidden="true" />
                That link did not work
              </span>
            )}
          </h1>
          <p className="lead" style={{ margin: 0 }}>
            {state.message}
          </p>
        </div>
      </div>

      {state.phase === 'error' && kind === 'confirm' ? (
        <NewsletterSignup
          variant="card"
          source="expired-link"
          title="Request a new confirmation link"
          blurb="Confirmation links expire and can only be used once. Subscribe again with the same address and we will send a fresh link."
        />
      ) : null}
    </div>
  )
}
