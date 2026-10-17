import { useState } from 'react'
import { CheckCircle2, Mail } from 'lucide-react'
import { subscribeNewsletter } from '../../api/newsletter.js'
import { useAction } from '../../hooks/useAction.js'
import { Button } from '../ui/Button.jsx'
import { Check, Field, FormAlert, Input } from '../ui/Form.jsx'

const HEADLINE = 'Stay Connected with Mant Bridges LTD'
const BLURB =
  'Property opportunities, real estate insights, land documentation guidance, company news and new blog articles, straight to your inbox. We email a confirmation link first, so nothing is sent until you click it.'

/**
 * Public sign-up form. Only the address, an optional name and the consent flag are sent;
 * the backend records consent time and source, and the confirmation email must be clicked.
 */
export default function NewsletterSignup({ variant = 'band', source = 'website', title = HEADLINE, blurb = BLURB }) {
  const [form, setForm] = useState({ email: '', first_name: '', consent: false })
  const [localError, setLocalError] = useState(null)
  const [notice, setNotice] = useState(null)
  const { execute, pending, error, errors } = useAction((payload) => subscribeNewsletter(payload))

  const set = (key) => (value) => {
    setForm((current) => ({ ...current, [key]: value }))
    setLocalError(null)
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    if (!form.consent) {
      setLocalError('Please tick the box to confirm you agree to receive the newsletter.')
      return
    }
    setLocalError(null)
    const result = await execute({ email: form.email, first_name: form.first_name, consent: true, source })
    if (result) setNotice(result.detail)
  }

  const shell = variant === 'band' ? 'newsletter-band' : 'newsletter-inline'
  const inner =
    variant === 'band'
      ? 'container newsletter-inner'
      : 'card newsletter-card stack stack-sm'

  if (notice) {
    return (
      <section className={shell}>
        <div className={inner}>
          <div className="alert alert-success">
            <CheckCircle2 size={17} />
            <span>{notice}</span>
          </div>
          <p className="hint" style={{ margin: 0 }}>
            Look for a confirmation message from Mant Bridges LTD in your inbox — and in your spam folder if it has not
            appeared. Nothing is sent until you click the link inside it.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setNotice(null)
              setForm({ email: '', first_name: '', consent: false })
            }}
          >
            Use another address
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className={shell}>
      <div className={inner}>
        {variant === 'band' ? (
          <div className="newsletter-copy stack stack-sm">
            <p className="eyebrow" style={{ color: '#ffb3bd', marginBottom: 0 }}>
              Newsletter
            </p>
            <h2 style={{ margin: 0 }}>{title}</h2>
            <p className="lead" style={{ margin: 0, color: 'var(--navy-100)' }}>
              {blurb}
            </p>
          </div>
        ) : (
          <div className="stack stack-sm">
            <p className="eyebrow" style={{ marginBottom: 0 }}>
              <Mail size={13} aria-hidden="true" /> Newsletter
            </p>
            <h3 style={{ margin: 0 }}>{title}</h3>
            <p className="muted" style={{ margin: 0 }}>
              {blurb}
            </p>
          </div>
        )}

        <form className="newsletter-form stack stack-sm" onSubmit={onSubmit} noValidate>
          <FormAlert error={localError || error} />
          <div className="row newsletter-fields">
            <Field name="email" label="Email address" required error={errors.email?.[0]}>
              <Input
                kind="email"
                name="email"
                value={form.email}
                onChange={set('email')}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </Field>
            <Field name="first_name" label="First name" hint="Optional" error={errors.first_name?.[0]}>
              <Input name="first_name" value={form.first_name} onChange={set('first_name')} autoComplete="given-name" />
            </Field>
          </div>
          <div>
            <Check
              name="consent"
              checked={form.consent}
              onChange={set('consent')}
              label="I agree to receive email newsletters from Mant Bridges LTD."
              hint="You can unsubscribe from any email and you do not need an account to subscribe."
            />
            {errors.consent?.[0] ? (
              <span className="field-error" role="alert">
                {errors.consent[0]}
              </span>
            ) : null}
          </div>
          <Button type="submit" pending={pending} disabled={pending} variant={variant === 'band' ? 'accent' : undefined}>
            <Mail size={16} /> {pending ? 'Subscribing…' : 'Subscribe to Our Newsletter'}
          </Button>
        </form>
      </div>
    </section>
  )
}
