import { useEffect, useMemo, useState } from 'react'
import { listInvoices, recordPayment } from '../../api/billing.js'
import { describeError, fieldErrors } from '../../api/client.js'
import { collect } from '../../api/paginate.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useLookups } from '../../context/LookupContext.jsx'
import { amount, todayInputValue } from '../../utils/format.js'
import { Button } from '../ui/Button.jsx'
import { Field, FormAlert, Input, SelectOptions } from '../ui/Form.jsx'
import { Loading } from '../ui/Feedback.jsx'
import { Modal } from '../ui/Modal.jsx'

/**
 * Recording a payment never marks money as received: the backend stores new
 * payments as PENDING until an administrator or landlord confirms them.
 */
export default function PaymentModal({ open, onClose, onDone, defaultInvoiceId }) {
  const { user } = useAuth()
  const { options, currency } = useLookups()
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [form, setForm] = useState(() => blank(defaultInvoiceId))
  const [error, setError] = useState(null)
  const [errors, setErrors] = useState({})
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    setErrors({})
    setError(null)
    collect(listInvoices, { outstanding: true }, 15)
      .then((rows) => {
        if (cancelled) return
        setInvoices(rows)
        const preselected = defaultInvoiceId
          ? rows.find((invoice) => String(invoice.id) === String(defaultInvoiceId))
          : null
        setForm({
          ...blank(defaultInvoiceId),
          amount: preselected ? String(preselected.balance) : '',
          payer_name: user?.full_name || '',
        })
      })
      .catch((caught) => {
        if (cancelled) return
        setInvoices([])
        setLoadError(describeError(caught))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, defaultInvoiceId, user])

  const selected = useMemo(
    () => invoices.find((invoice) => String(invoice.id) === String(form.invoice)),
    [invoices, form.invoice]
  )

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async () => {
    setPending(true)
    setError(null)
    setErrors({})
    try {
      const payment = await recordPayment({
        invoice: Number(form.invoice),
        // The API requires a tenant on staff entries; it always matches the invoice.
        ...(selected ? { tenant: selected.tenant } : {}),
        amount: Number(form.amount),
        method: form.method,
        paid_on: form.paid_on,
        reference: form.reference || undefined,
        payer_name: form.payer_name || undefined,
        notes: form.notes || undefined,
      })
      onDone?.(payment)
    } catch (caught) {
      setError(describeError(caught))
      setErrors(fieldErrors(caught))
    } finally {
      setPending(false)
    }
  }

  const canSubmit = Boolean(form.invoice && Number(form.amount) > 0 && form.method && form.paid_on)

  return (
    <Modal
      open={open}
      title="Record a payment"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} pending={pending} disabled={pending || !canSubmit}>
            {pending ? 'Saving…' : 'Record payment'}
          </Button>
        </>
      }
    >
      {loading ? <Loading label="Loading open invoices…" /> : null}
      {loadError ? <div className="alert alert-error">{loadError}</div> : null}
      {!loading && !loadError ? (
        <div className="stack">
          <FormAlert error={error} />
          <div className="callout callout-navy">
            This form records money that was paid by bank transfer, mobile money or in cash. Nothing is charged
            online, and the entry stays <strong>pending</strong> until the Mant Bridges team confirms it and issues a
            receipt.
          </div>
          <Field name="invoice" label={user?.role === 'TENANT' ? 'Invoice you are paying' : 'Invoice'} required error={errors.invoice?.[0]}>
            <Input as="select" name="invoice" value={form.invoice} onChange={set('invoice')}>
              <option value="">
                {invoices.length ? 'Choose an outstanding invoice' : 'No outstanding invoices on your account'}
              </option>
              {invoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.number}
                  {invoice.property_title ? ` · ${invoice.property_title}` : ''} · balance{' '}
                  {amount(invoice, 'balance', invoice.currency)}
                </option>
              ))}
            </Input>
          </Field>
          {selected ? (
            <p className="hint">
              Invoice total {amount(selected, 'total', selected.currency)} ·{' '}
              {amount(selected, 'amount_paid', selected.currency)} already paid · outstanding{' '}
              {amount(selected, 'balance', selected.currency)}
            </p>
          ) : null}
          <div className="row" style={{ gap: 12 }}>
            <Field name="amount" label="Amount" required error={errors.amount?.[0]}>
              <Input kind="number" name="amount" min="0" step="0.01" value={form.amount} onChange={set('amount')} />
            </Field>
            <Field name="paid_on" label="Date paid" required error={errors.paid_on?.[0]}>
              <Input kind="date" name="paid_on" value={form.paid_on} onChange={set('paid_on')} />
            </Field>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <Field name="method" label="Method" required error={errors.method?.[0]}>
              <Input as="select" name="method" value={form.method} onChange={set('method')}>
                <SelectOptions items={options?.payment_methods || []} placeholder="Choose a method" />
              </Input>
            </Field>
            <Field name="reference" label="Reference" hint="Slip, transaction or transfer ID">
              <Input name="reference" value={form.reference} onChange={set('reference')} />
            </Field>
          </div>
          <Field name="payer_name" label="Paid by" hint="Person who handed in the money">
            <Input name="payer_name" value={form.payer_name} onChange={set('payer_name')} />
          </Field>
          <Field name="notes" label="Notes">
            <Input as="textarea" name="notes" rows={3} value={form.notes} onChange={set('notes')} />
          </Field>
          <p className="hint">Currency on this account: {currency}</p>
        </div>
      ) : null}
    </Modal>
  )
}

function blank(invoiceId) {
  return {
    invoice: invoiceId ? String(invoiceId) : '',
    amount: '',
    method: '',
    paid_on: todayInputValue(),
    reference: '',
    payer_name: '',
    notes: '',
  }
}
