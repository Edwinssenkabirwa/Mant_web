import { useEffect, useState } from 'react'
import { Camera, Save } from 'lucide-react'
import { updateProfileWithFile } from '../../api/auth.js'
import { describeError, fieldErrors } from '../../api/client.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import Brand from '../../components/layout/Brand.jsx'
import { Avatar, Panel } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Field, FormAlert, Input } from '../../components/ui/Form.jsx'
import { RoleBadge } from '../../components/ui/Badge.jsx'

const FIELDS = [
  'first_name',
  'last_name',
  'phone',
  'address',
  'city',
  'country',
  'national_id',
  'organisation',
  'tin_number',
]

export default function ProfilePage({ breadcrumb }) {
  const { user, saveProfile, refreshUser } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState(() =>
    FIELDS.reduce((acc, key) => ({ ...acc, [key]: user?.[key] ?? '' }), {})
  )
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [error, setError] = useState(null)
  const [errors, setErrors] = useState({})
  const [pending, setPending] = useState(false)

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))

  useEffect(() => {
    if (!file) {
      setPreview('')
      return undefined
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const submit = async (event) => {
    event.preventDefault()
    setPending(true)
    setError(null)
    setErrors({})
    try {
      if (file) {
        await updateProfileWithFile(form, file)
        await refreshUser()
      } else {
        await saveProfile(form)
      }
      setFile(null)
      toast.success('Your details have been saved.')
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
        <Panel title="Your details">
          <FormAlert error={error} />
          <div className="stack">
            <div className="row">
              {preview ? (
                <span className="avatar avatar-lg">
                  <img src={preview} alt="" />
                </span>
              ) : (
                <Avatar user={user} size="lg" />
              )}
              <div className="stack stack-sm">
                <span className="row" style={{ gap: 8 }}>
                  <strong>{user?.full_name}</strong>
                  <RoleBadge role={user?.role} />
                </span>
                <span className="hint">{user?.email}</span>
                <label className="chip chip-button" style={{ alignSelf: 'flex-start' }}>
                  <Camera size={14} />
                  {file ? file.name : 'Choose a photo'}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => setFile(event.target.files?.[0] || null)}
                  />
                </label>
              </div>
            </div>

            <form className="form-grid" onSubmit={submit}>
              <Field name="first_name" label="First name" required error={errors.first_name?.[0]}>
                <Input name="first_name" value={form.first_name} onChange={set('first_name')} required />
              </Field>
              <Field name="last_name" label="Last name" required error={errors.last_name?.[0]}>
                <Input name="last_name" value={form.last_name} onChange={set('last_name')} required />
              </Field>
              <Field name="phone" label="Phone" error={errors.phone?.[0]}>
                <Input kind="tel" name="phone" value={form.phone} onChange={set('phone')} />
              </Field>
              <Field name="city" label="City" error={errors.city?.[0]}>
                <Input name="city" value={form.city} onChange={set('city')} />
              </Field>
              <Field name="address" label="Address" span2 error={errors.address?.[0]}>
                <Input name="address" value={form.address} onChange={set('address')} />
              </Field>
              <Field name="country" label="Country" error={errors.country?.[0]}>
                <Input name="country" value={form.country} onChange={set('country')} />
              </Field>
              <Field name="organisation" label="Organisation" error={errors.organisation?.[0]}>
                <Input name="organisation" value={form.organisation} onChange={set('organisation')} />
              </Field>
              <Field
                name="national_id"
                label="National ID"
                hint="Used for tenancy documents. Stored on your account only."
                error={errors.national_id?.[0]}
              >
                <Input name="national_id" value={form.national_id} onChange={set('national_id')} />
              </Field>
              <Field name="tin_number" label="TIN" error={errors.tin_number?.[0]}>
                <Input name="tin_number" value={form.tin_number} onChange={set('tin_number')} />
              </Field>
              <div className="span-2">
                <Button type="submit" pending={pending} disabled={pending}>
                  <Save size={16} /> {pending ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </form>
            <p className="hint">
              Email and role cannot be changed here. Ask the Mant Bridges team if either needs updating.
            </p>
          </div>
        </Panel>

        <div className="sticky-side stack">
          <Panel title="Account">
            <div className="stack stack-sm">
              <Brand compact />
              <p className="hint" style={{ margin: 0 }}>
                Signed in as {user?.email}. Password changes live on the Change password page.
              </p>
              <Button to={user?.role === 'TENANT' ? '/portal/password' : '/manage/password'} variant="outline" size="sm">
                Change password
              </Button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
