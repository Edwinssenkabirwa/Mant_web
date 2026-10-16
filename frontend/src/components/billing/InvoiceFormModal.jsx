import { useEffect, useMemo, useState } from 'react'
import { createInvoice, updateInvoice } from '../../api/billing.js'
import { leaseOptions } from '../../api/leases.js'
import { useApi } from '../../hooks/useApi.js'
import { useAction } from '../../hooks/useAction.js'
import { Button } from '../ui/Button.jsx'
import { Field, FormAlert, Input, SelectOptions } from '../ui/Form.jsx'
import { Modal } from '../ui/Modal.jsx'
import { firstOfMonth, todayInputValue } from '../../utils/format.js'

const BLANK = {
  lease: '',
  period_start: firstOfMonth(),
  period_end: '',
  issue_date: todayInputValue(),
  due_date: '',
  rent_amount: '',
  service_charge: '0',
  utility_charge: '0',
  other_charge: '0',
  other_charge_label: 'Other charge',
  discount: '0',
  tax_percent: '0',
  late_fee: '0',
  status: 'UNPAID',
  notes: '',
}

const STATUSES = [
  { value: 'DRAFT', label: 'Draft (not yet issued)' },
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'PARTIAL', label: 'Partially paid' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

/**
 * Creates or amends an invoice. The charge lines are typed here, but subtotal,
 * tax, total and balance are always recomputed by the API and read back from the
 * response — the form never estimates money itself.
 */
export default function InvoiceFormModal({ open, onClose, onDone, invoice }) {
  const isEdit = Boolean(invoice)
  const [form, setForm] = useState(BLANK)
  const leases = useApi(() => leaseOptions({ active: true }), [], { skip: !open || isEdit })

  useEffect(() => {
    if (!open) return
    if (invoice) {
      setForm({
        ...BLANK,
        ...Object.fromEntries(Object.keys(BLANK).map((key) => [key, invoice[key] ?? BLANK[key]])),
      })
      return
    }
    setForm({ ...BLANK, lease: invoice?.lease ?? '' })
  }, [open, invoice])

  const chosen = useMemo(
    () => (leases.data ?? []).find((lease) => String(lease.id) === String(form.lease)),
    [leases.data, form.lease]
  )

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))

  const pickLease = (value) => {
    const lease = (leases.data ?? []).find((row) => String(row.id) === String(value))
    setForm((current) => ({
      ...current,
      lease: value,
      rent_amount: lease ? String(Number(lease.monthly_rent) || '') : current.rent_amount,
    }))
  }

  const save = useAction(
    async () => {
      const payload = { ...form }
      ;['rent_amount', 'service_charge', 'utility_charge', 'other_charge', 'discount', 'tax_percent', 'late_fee'].forEach(
        (key) => {
          payload[key] = payload[key] === '' ? 0 : Number(payload[key])
        }
      )
      payload.lease = Number(payload.lease)
      if (!payload.other_charge_label) payload.other_charge_label = 'Other charge'
      if (!payload.issue_date) delete payload.issue_date
      if (!payload.due_date) delete payload.due_date
      return isEdit ? updateInvoice(invoice.id, payload) : createInvoice(payload)
    },
    { onDone: (record) => onDone?.(record) }
  )

  return (
    <Modal
      open={open}
      title={isEdit ? `Edit ${invoice?.number ?? 'invoice'}` : 'Raise an invoice'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.pending}>
            Cancel
          </Button>
          <Button onClick={save.execute} pending={save.pending} disabled={!form.lease || !form.period_start}>
            {isEdit ? 'Save invoice' : 'Create invoice'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormAlert error={save.error} />

        {isEdit ? (
          <p className="muted small">
            Invoice {invoice?.number} · {invoice?.tenant_name} · {invoice?.property_title}. Money already received
            cannot be edited here — it lives on the payment record.
          </p>
        ) : (
          <Field name="lease" label="Tenancy" required error={save.errors.lease?.[0]}>
            <Input as="select" name="lease" value={form.lease} onChange={pickLease} disabled={leases.loading}>
              <option value="">Choose an active tenancy</option>
              <SelectOptions items={(leases.data ?? []).map((lease) => ({ value: lease.id, label: lease.label }))} />
            </Input>
            {chosen ? (
              <span className="hint">
                {chosen.tenant_name} · {chosen.property_title} · rent {chosen.monthly_rent} {chosen.currency}
              </span>
            ) : (
              <span className="hint">Property, tenant and landlord are copied from the tenancy by the API.</span>
            )}
          </Field>
        )}

        <div className="form-grid">
          <Field name="period_start" label="Period from" required error={save.errors.period_start?.[0]}>
            <Input kind="date" name="period_start" value={form.period_start} onChange={set('period_start')} />
          </Field>
          <Field name="period_end" label="Period to" required error={save.errors.period_end?.[0]}>
            <Input kind="date" name="period_end" value={form.period_end} onChange={set('period_end')} />
          </Field>
          <Field name="issue_date" label="Issue date">
            <Input kind="date" name="issue_date" value={form.issue_date} onChange={set('issue_date')} />
          </Field>
          <Field name="due_date" label="Due date" error={save.errors.due_date?.[0]} hint="Blank uses the period end.">
            <Input kind="date" name="due_date" value={form.due_date} onChange={set('due_date')} />
          </Field>
          <Field name="rent_amount" label="Rent charge" required error={save.errors.rent_amount?.[0]}>
            <Input kind="number" name="rent_amount" value={form.rent_amount} onChange={set('rent_amount')} min="0" step="1000" />
          </Field>
          <Field name="service_charge" label="Service charge">
            <Input kind="number" name="service_charge" value={form.service_charge} onChange={set('service_charge')} min="0" step="1000" />
          </Field>
          <Field name="utility_charge" label="Utilities">
            <Input kind="number" name="utility_charge" value={form.utility_charge} onChange={set('utility_charge')} min="0" step="1000" />
          </Field>
          <Field name="other_charge" label="Other charge">
            <Input kind="number" name="other_charge" value={form.other_charge} onChange={set('other_charge')} min="0" step="1000" />
          </Field>
          <Field name="other_charge_label" label="Label for the other charge">
            <Input name="other_charge_label" value={form.other_charge_label} onChange={set('other_charge_label')} maxLength={120} />
          </Field>
          <Field name="discount" label="Discount">
            <Input kind="number" name="discount" value={form.discount} onChange={set('discount')} min="0" step="1000" />
          </Field>
          <Field name="tax_percent" label="Tax percent" error={save.errors.tax_percent?.[0]}>
            <Input kind="number" name="tax_percent" value={form.tax_percent} onChange={set('tax_percent')} min="0" max="100" step="0.5" />
          </Field>
          <Field name="late_fee" label="Late fee already applied">
            <Input kind="number" name="late_fee" value={form.late_fee} onChange={set('late_fee')} min="0" step="1000" />
          </Field>
          <Field name="status" label="Status">
            <Input as="select" name="status" value={form.status} onChange={set('status')}>
              <SelectOptions items={isEdit ? STATUSES : STATUSES.filter((row) => row.value !== 'PARTIAL')} />
            </Input>
          </Field>
          <Field name="notes" label="Note shown to the tenant" span2>
            <Input as="textarea" name="notes" rows={3} value={form.notes} onChange={set('notes')} />
          </Field>
        </div>

        <p className="hint">
          With {form.tax_percent || 0}% tax and the lines above, the API returns the subtotal, tax and total. Leave
          them and press “{isEdit ? 'Save invoice' : 'Create invoice'}” to see the computed figures on the invoice page.
        </p>
      </div>
    </Modal>
  )
}
