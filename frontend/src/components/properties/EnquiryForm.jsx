import { useEffect, useState } from 'react'
import { CheckCircle2, Send } from 'lucide-react'
import { submitEnquiry } from '../../api/site.js'
import { useAction } from '../../hooks/useAction.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { Button } from '../ui/Button.jsx'
import { Field, FormAlert, Input } from '../ui/Form.jsx'

export default function EnquiryForm({ property = null, defaultSubject = '', title = 'Enquire about this property', note }) {
  const { user } = useAuth()
  const [form, setForm] = useState(() => ({
    name: user?.full_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    subject: defaultSubject,
    message: '',
  }))
  const [sent, setSent] = useState(false)
  const { execute, pending, error, errors, done } = useAction((payload) => submitEnquiry(payload))

  useEffect(() => {
    if (!user) return
    setForm((current) =>
      current.name || current.email
        ? current
        : { ...current, name: user.full_name || '', email: user.email || '', phone: current.phone || user.phone || '' }
    )
  }, [user])

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))

  const onSubmit = async (event) => {
    event.preventDefault()
    const result = await execute({
      ...form,
      subject: form.subject || defaultSubject,
      property: property?.id ?? null,
    })
    if (result) setSent(true)
  }

  if (sent || done) {
    return (
      <div className="stack" style={{ gap: 10 }}>
        <div className="alert alert-success">
          <CheckCircle2 size={17} />
          <span>
            Thanks — your enquiry is with our team. We respond by email or phone; a viewing is only confirmed once an
            agent replies.
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSent(false)
            setForm((current) => ({ ...current, message: '' }))
          }}
        >
          Send another enquiry
        </Button>
      </div>
    )
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      {title ? <h3 style={{ marginTop: 0 }}>{title}</h3> : null}
      {note ? <p className="muted" style={{ marginTop: 0 }}>{note}</p> : null}
      <FormAlert error={error} />
      <Field name="name" label="Your name" required error={errors.name?.[0]}>
        <Input name="name" value={form.name} onChange={set('name')} required autoComplete="name" />
      </Field>
      <div className="row" style={{ gap: 12 }}>
        <Field name="email" label="Email" required error={errors.email?.[0]}>
          <Input kind="email" name="email" value={form.email} onChange={set('email')} required autoComplete="email" />
        </Field>
        <Field name="phone" label="Phone" hint="Optional" error={errors.phone?.[0]}>
          <Input kind="tel" name="phone" value={form.phone} onChange={set('phone')} autoComplete="tel" />
        </Field>
      </div>
      <Field name="subject" label="Subject" hint="Optional" error={errors.subject?.[0]}>
        <Input name="subject" value={form.subject} onChange={set('subject')} placeholder={defaultSubject} />
      </Field>
      <Field name="message" label="Message" required error={errors.message?.[0]}>
        <Input
          as="textarea"
          name="message"
          rows={5}
          value={form.message}
          onChange={set('message')}
          required
          placeholder="Tell us what you need — preferred dates, budget, or questions about the listing."
        />
      </Field>
      <Button type="submit" block pending={pending} disabled={pending}>
        <Send size={16} /> {pending ? 'Sending…' : 'Send enquiry'}
      </Button>
      <p className="hint">
        This form records an enquiry with Mant Bridges LTD. It does not reserve a property or confirm a viewing.
      </p>
    </form>
  )
}
