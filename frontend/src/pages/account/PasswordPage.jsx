import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { changePassword } from '../../api/auth.js'
import { describeError, fieldErrors } from '../../api/client.js'
import { useToast } from '../../context/ToastContext.jsx'
import { Panel } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Field, FormAlert, Input } from '../../components/ui/Form.jsx'

export default function PasswordPage({ breadcrumb }) {
  const toast = useToast()
  const [form, setForm] = useState({ old_password: '', new_password: '', new_password_confirm: '' })
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
      await changePassword(form)
      setForm({ old_password: '', new_password: '', new_password_confirm: '' })
      toast.success('Password updated.')
    } catch (caught) {
      setError(describeError(caught))
      setErrors(fieldErrors(caught))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="stack">
      {breadcrumb}
      <div className="split">
        <Panel title="Change password">
          <form className="stack" onSubmit={submit}>
            <FormAlert error={error} />
            <Field name="old_password" label="Current password" required error={errors.old_password?.[0]}>
              <Input
                kind="password"
                name="old_password"
                value={form.old_password}
                onChange={set('old_password')}
                autoComplete="current-password"
                required
              />
            </Field>
            <Field name="new_password" label="New password" required hint="At least 8 characters, not entirely numeric" error={errors.new_password?.[0]}>
              <Input
                kind="password"
                name="new_password"
                value={form.new_password}
                onChange={set('new_password')}
                autoComplete="new-password"
                required
              />
            </Field>
            <Field name="new_password_confirm" label="Confirm new password" required error={errors.new_password_confirm?.[0]}>
              <Input
                kind="password"
                name="new_password_confirm"
                value={form.new_password_confirm}
                onChange={set('new_password_confirm')}
                autoComplete="new-password"
                required
              />
            </Field>
            <div>
              <Button type="submit" pending={pending} disabled={pending}>
                <KeyRound size={16} /> {pending ? 'Updating…' : 'Update password'}
              </Button>
            </div>
          </form>
        </Panel>
        <div className="sticky-side">
          <Panel title="Session security">
            <p className="hint" style={{ margin: 0 }}>
              This platform signs you in with JSON Web Tokens held in your browser. Signing out clears them from this
              device, but the server does not keep a token blocklist, so an issued token remains valid until it
              expires. Password changes do not revoke existing tokens either. Avoid using a shared or public computer,
              and treat this as a known limitation of the current backend.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  )
}
