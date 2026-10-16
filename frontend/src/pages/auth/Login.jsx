import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, KeyRound, LogIn, ShieldCheck, Wallet } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { describeError, fieldErrors } from '../../api/client.js'
import { Button } from '../../components/ui/Button.jsx'
import { Field, FormAlert, Input } from '../../components/ui/Form.jsx'
import Brand from '../../components/layout/Brand.jsx'
import { homePathFor } from '../../utils/nav.js'

export default function Login() {
  const { login, user, ready, authenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState(null)
  const [errors, setErrors] = useState({})
  const [pending, setPending] = useState(false)

  const redirectTo = location.state?.from?.pathname || homePathFor(user)

  useEffect(() => {
    if (authenticated) navigate(redirectTo, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated])

  if (!ready) return null
  if (authenticated) return <Navigate to={redirectTo} replace />

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event) => {
    event.preventDefault()
    setPending(true)
    setError(null)
    setErrors({})
    try {
      const signedIn = await login(form)
      navigate(homePathFor(signedIn), { replace: true })
    } catch (caught) {
      setError(describeError(caught, 'We could not sign you in. Check your email and password.'))
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
          <h2>Sign in to manage property, rent and receipts</h2>
          <p>
            Landlords track listings and tenancies. Tenants check invoices, record payments and download receipts.
          </p>
          <ul className="auth-points">
            <li>
              <ShieldCheck size={17} /> Every figure comes from the Mant Bridges books, not a demo dataset.
            </li>
            <li>
              <Wallet size={17} /> Record bank transfers and mobile money payments for confirmation by our team.
            </li>
            <li>
              <KeyRound size={17} /> Messages, invoices and statements stay in one place.
            </li>
          </ul>
        </div>
        <p className="tiny">New here? <Link to="/register" style={{ color: '#fff', textDecoration: 'underline' }}>Create an account</Link></p>
      </aside>

      <section className="auth-form">
        <div className="auth-card stack">
          <div>
            <p className="eyebrow">Member access</p>
            <h1>Sign in</h1>
          </div>
          <FormAlert error={error} />
          <form className="stack" onSubmit={submit}>
            <Field name="email" label="Email address" required error={errors.email?.[0]}>
              <Input kind="email" name="email" value={form.email} onChange={set('email')} autoComplete="email" required />
            </Field>
            <Field name="password" label="Password" required error={errors.password?.[0]}>
              <Input
                kind="password"
                name="password"
                value={form.password}
                onChange={set('password')}
                autoComplete="current-password"
                required
              />
            </Field>
            <Button type="submit" block pending={pending} disabled={pending}>
              <LogIn size={16} /> {pending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <div className="divider" />
          <p className="hint">
            Password reset is not available on this platform yet. <Link to="/contact">Contact the team</Link> and we
            will verify you and set a new password.
          </p>
          <p className="hint">
            By signing in you accept that Mant Bridges staff may view your account details for property and rent
            administration.
          </p>
          <Link to="/" className="row" style={{ gap: 6, fontSize: '.88rem', fontWeight: 700 }}>
            Back to the website <ArrowRight size={15} />
          </Link>
        </div>
      </section>
    </div>
  )
}
