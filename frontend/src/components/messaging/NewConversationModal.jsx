import { useEffect, useState } from 'react'
import { createConversation, recipients } from '../../api/messaging.js'
import { describeError, fieldErrors } from '../../api/client.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useApi } from '../../hooks/useApi.js'
import { Button } from '../ui/Button.jsx'
import { Field, FormAlert, Input, SelectOptions } from '../ui/Form.jsx'
import { Modal } from '../ui/Modal.jsx'

const CATEGORIES = [
  { value: 'GENERAL', label: 'General enquiry' },
  { value: 'RENT', label: 'Rent and payments' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'VIEWING', label: 'Viewing request' },
  { value: 'DOCUMENTS', label: 'Documents' },
  { value: 'COMPLAINT', label: 'Complaint' },
]

export default function NewConversationModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ recipient: '', subject: '', category: 'GENERAL', body: '' })
  const [error, setError] = useState(null)
  const [errors, setErrors] = useState({})
  const [pending, setPending] = useState(false)
  const people = useApi(() => recipients(), [], { skip: !open })

  useEffect(() => {
    if (open) {
      setForm({ recipient: '', subject: '', category: 'GENERAL', body: '' })
      setError(null)
      setErrors({})
    }
  }, [open])

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async () => {
    setPending(true)
    setError(null)
    setErrors({})
    try {
      const conversation = await createConversation({
        recipient: Number(form.recipient),
        subject: form.subject,
        category: form.category,
        body: form.body,
      })
      onCreated?.(conversation)
    } catch (caught) {
      setError(describeError(caught))
      setErrors(fieldErrors(caught))
    } finally {
      setPending(false)
    }
  }

  const { user } = useAuth()
  const messagesTheDesk = user?.role !== 'ADMIN'

  return (
    <Modal
      open={open}
      title="Start a conversation"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} pending={pending} disabled={pending || !form.recipient || !form.subject || !form.body}>
            {pending ? 'Creating…' : 'Create thread'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormAlert error={error} />
        <Field name="recipient" label="Recipient" required error={errors.recipient?.[0]}>
          <Input
            as="select"
            name="recipient"
            value={form.recipient}
            onChange={set('recipient')}
            disabled={people.loading}
          >
            {people.loading ? <option value="">Loading contacts…</option> : null}
            {(people.data || []).map((person) => (
              <option key={person.id} value={person.id}>
                {person.full_name} · {person.role}
              </option>
            ))}
          </Input>
          {people.error ? <span className="field-error">{people.error}</span> : null}
          {messagesTheDesk ? <span className="hint">You are messaging the Mant Bridges team.</span> : null}
        </Field>
        <Field name="subject" label="Subject" required error={errors.subject?.[0]}>
          <Input name="subject" value={form.subject} onChange={set('subject')} placeholder="Short, clear subject" />
        </Field>
        <Field name="category" label="Category">
          <Input as="select" name="category" value={form.category} onChange={set('category')}>
            <SelectOptions items={CATEGORIES} />
          </Input>
        </Field>
        <Field
          name="body"
          label="First message"
          required
          hint="Attachments can be added once the thread exists."
          error={errors.body?.[0]}
        >
          <Input as="textarea" name="body" rows={5} value={form.body} onChange={set('body')} />
        </Field>
      </div>
    </Modal>
  )
}
