import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Building2, Home, ShieldCheck, UserPlus } from 'lucide-react'
import { describeError, fieldErrors } from '../../api/client.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { homePathFor } from '../../utils/nav.js'
import Brand from '../../components/layout/Brand.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Field, FormAlert, Input } from '../../components/ui/Form.jsx'

const ROLES = [
  {
    value: 'TENANT',
    title: 'I am renting',
    note: 'Track invoices, record payments and message the property team.',
    icon: Home,
  },
  {
    value: 'LANDLORD',
    title: 'I own property',
    note: 'Publish listings, manage tenancies and monitor collections.',
    icon: Building2,
  },
]

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    city: '',
    organisation: '',
    role: 'TENANT',
    password: '',
    password_confirm: '',
  })
  const [error, setError] = useState(null)
  const [errors, setErrors] = useState({})
  const [pending, setPending] = useState(false)

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event) => {
    event.preventDefault()
    setPending(true)
    setError(null)
    setErrors({})
    try {
      const payload = { ...form }
      if (!payload.phone) delete payload.phone
      if (!payload.city) delete payload.city
      if (!payload.organisation) delete payload.organisation
      const user = await register(payload)
      navigate(homePathFor(user), { replace: true })
    } catch (caught) {
      setError(describeError(caught, 'We could not create your account.'))
      setErrors(fieldErrors(caught))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="auth-wrap">
      <aside className="auth-art">
        <Brand />
        <div className="stack">
          <h2>An account for every side of the tenancy</h2>
          <p>
            Mant Bridges runs listings, tenancies, invoicing and rent reconciliation on one set of books. Your account
            sees the part of those books that belongs to you.
          </p>
          <ul className="auth-points">
            <li>
              <ShieldCheck size={17} /> Administrators are created by staff — public sign-up gives you a landlord or
              tenant account.
            </li>
            <li>
              <Home size={17} /> Tenants see their own leases, invoices, payments and receipts.
            </li>
            <li>
              <Building2 size={17} /> Landlords manage their own listings and tenancies, and can record payments
              handed to them.
            </li>
          </ul>
        </div>
        <p className="tiny">
          Already registered?{' '}
          <Link to="/login" style={{ color: '#fff', textDecoration: 'underline' }}>
            Sign in
          </Link>
        </p>
      </aside>

      <section className="auth-form">
        <div className="auth-card stack">
          <div>
            <p className="eyebrow">Create account</p>
            <h1>Register</h1>
          </div>
          <FormAlert error={error} />
          <form className="stack" onSubmit={submit}>
            <div>
              <p className="label">Account type</p>
              <div className="role-picker">
                {ROLES.map((role) => (
                  <button
                    type="button"
                    key={role.value}
                    className={`role-option${form.role === role.value ? ' active' : ''}`}
                    onClick={() => set('role')(role.value)}
                    aria-pressed={form.role === role.value}
                  >
                    <span className="row" style={{ gap: 7, marginBottom: 4 }}>
                      <role.icon size={16} />
                      <strong>{role.title}</strong>
                    </span>
                    <span>{role.note}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="row" style={{ gap: 12 }}>
              <Field name="first_name" label="First name" required error={errors.first_name?.[0]}>
                <Input name="first_name" value={form.first_name} onChange={set('first_name')} autoComplete="given-name" required />
              </Field>
              <Field name="last_name" label="Last name" required error={errors.last_name?.[0]}>
                <Input name="last_name" value={form.last_name} onChange={set('last_name')} autoComplete="family-name" required />
              </Field>
            </div>

            <Field name="email" label="Email" required error={errors.email?.[0]}>
              <Input kind="email" name="email" value={form.email} onChange={set('email')} autoComplete="email" required />
            </Field>

            <div className="row" style={{ gap: 12 }}>
              <Field name="phone" label="Phone" hint="Optional" error={errors.phone?.[0]}>
                <Input kind="tel" name="phone" value={form.phone} onChange={set('phone')} autoComplete="tel" />
              </Field>
              <Field name="city" label="City" hint="Optional" error={errors.city?.[0]}>
                <Input name="city" value={form.city} onChange={set('city')} placeholder="Kampala" />
              </Field>
            </div>

            {form.role === 'LANDLORD' ? (
              <Field
                name="organisation"
                label="Company or organisation"
                hint="Optional — used on invoices and agreements"
                error={errors.organisation?.[0]}
              >
                <Input name="organisation" value={form.organisation} onChange={set('organisation')} />
              </Field>
            ) : null}

            <div className="row" style={{ gap: 12 }}>
              <Field name="password" label="Password" required hint="At least 8 characters" error={errors.password?.[0]}>
                <Input
                  kind="password"
                  name="password"
                  value={form.password}
                  onChange={set('password')}
                  autoComplete="new-password"
                  required
                />
              </Field>
              <Field name="password_confirm" label="Confirm password" required error={errors.password_confirm?.[0]}>
                <Input
                  kind="password"
                  name="password_confirm"
                  value={form.password_confirm}
                  onChange={set('password_confirm')}
                  autoComplete="new-password"
                  required
                />
              </Field>
            </div>

            <Button type="submit" block pending={pending} disabled={pending}>
              <UserPlus size={16} /> {pending ? 'Creating account…' : 'Create account'}
            </Button>
            <p className="hint">
              Your account is active immediately. Identity verification (email confirmation or ID checks) is not
              implemented on this platform yet — see the project notes.
            </p>
          </form>
        </div>
      </section>
    </div>
  )
}
