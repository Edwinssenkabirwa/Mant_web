import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, MessageSquare, Save } from 'lucide-react'
import { createLease, leaseById, updateLease } from '../../api/leases.js'
import { manageList } from '../../api/properties.js'
import { landlordOptions, tenantOptions } from '../../api/users.js'
import { collect } from '../../api/paginate.js'
import { useApi } from '../../hooks/useApi.js'
import { useAction } from '../../hooks/useAction.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useLookups } from '../../context/LookupContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { Breadcrumb, Callout, PageHeader, Panel } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Field, FormAlert, Input, SelectOptions } from '../../components/ui/Form.jsx'
import { ErrorState, Loading } from '../../components/ui/Feedback.jsx'
import { dateInputValue, money, todayInputValue } from '../../utils/format.js'

const BLANK = {
  property: '',
  tenant: '',
  landlord: '',
  start_date: todayInputValue(),
  end_date: '',
  monthly_rent: '',
  service_charge: '0',
  security_deposit: '0',
  currency: 'UGX',
  billing_frequency: 'MONTHLY',
  due_day_of_month: 5,
  grace_period_days: 5,
  late_fee_type: 'INHERIT',
  late_fee_flat: '0',
  late_fee_percent: '0',
  status: 'DRAFT',
  terms: '',
  notes: '',
}

const FREQUENCIES = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
]

const LATE_FEES = [
  { value: 'INHERIT', label: 'Company default' },
  { value: 'NONE', label: 'No late fee' },
  { value: 'FLAT', label: 'Flat amount' },
  { value: 'PERCENT', label: 'Percentage of rent' },
]

const NUMERIC = ['monthly_rent', 'service_charge', 'security_deposit', 'late_fee_flat', 'late_fee_percent']

export default function LeaseForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { options, company } = useLookups()
  const toast = useToast()
  const isAdmin = user?.role === 'ADMIN'
  const isEdit = Boolean(id)

  const [form, setForm] = useState(() => ({
    ...BLANK,
    currency: company?.currency || 'UGX',
    grace_period_days: company?.grace_period_days ?? 5,
  }))

  const existing = useApi(() => leaseById(id), [id], { skip: !id })
  const properties = useApi(() => collect(manageList, { ordering: 'title' }), [])
  const tenants = useApi(() => tenantOptions(), [], { skip: !isAdmin })
  const landlords = useApi(() => landlordOptions(), [], { skip: !isAdmin })

  useEffect(() => {
    if (!existing.data) return
    setForm((current) => ({
      ...current,
      ...Object.fromEntries(Object.keys(BLANK).map((key) => [key, existing.data[key] ?? BLANK[key]])),
      start_date: dateInputValue(existing.data.start_date) || BLANK.start_date,
      end_date: dateInputValue(existing.data.end_date) || '',
    }))
  }, [existing.data])

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))

  const save = useAction(
    async () => {
      const payload = { ...form }
      NUMERIC.forEach((key) => {
        payload[key] = payload[key] === '' || payload[key] === null ? 0 : Number(payload[key])
      })
      payload.due_day_of_month = Number(payload.due_day_of_month) || 1
      payload.grace_period_days = Number(payload.grace_period_days) || 0
      payload.property = Number(payload.property)
      payload.tenant = Number(payload.tenant)
      if (!payload.landlord) delete payload.landlord
      else payload.landlord = Number(payload.landlord)
      if (isEdit) return updateLease(id, payload)
      return createLease(payload)
    },
    {
      onDone: (lease) => {
        toast.success(
          lease.status === 'ACTIVE'
            ? 'Tenancy saved as active — invoices were raised for every elapsed period.'
            : 'Tenancy saved.'
        )
        navigate('/manage/leases', { replace: true })
      },
    }
  )

  const statusOptions = useMemo(() => options.lease_statuses ?? [], [options.lease_statuses])
  const loading = isEdit && existing.loading && !existing.data
  if (loading) return <Loading label="Opening the tenancy…" />
  if (isEdit && existing.error) {
    return <ErrorState error={existing.error} onRetry={existing.reload} title="This tenancy could not be loaded" />
  }

  /** A landlord has no endpoint that lists tenant accounts, so they cannot start a new tenancy. */
  const blockedForLandlord = !isAdmin && !isEdit

  return (
    <div className="stack">
      <Breadcrumb
        items={[
          { label: 'Dashboard', to: '/manage' },
          { label: 'Tenancies', to: '/manage/leases' },
          { label: isEdit ? existing.data?.number || 'Edit' : 'New tenancy' },
        ]}
      />

      <PageHeader
        eyebrow={isEdit ? `Tenancy ${existing.data?.number ?? ''}` : 'Tenancies'}
        title={isEdit ? existing.data?.tenant_name || 'Edit tenancy' : 'Register a tenancy'}
        lead="Dates, rent and the billing rhythm decide what the tenant is charged. The lease number is produced by the server — never typed here."
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('/manage/leases')}>
              <ArrowLeft size={15} /> Back
            </Button>
            <Button onClick={save.execute} pending={save.pending} disabled={blockedForLandlord}>
              <Save size={15} /> {isEdit ? 'Save tenancy' : 'Create tenancy'}
            </Button>
          </>
        }
      />

      <FormAlert error={save.error} />

      {blockedForLandlord ? (
        <Callout>
          <span className="row" style={{ gap: 10 }}>
            <MessageSquare size={17} />
            <span>
              Tenant accounts are registered by the Mant Bridges desk, and the API only lets administrators read the
              account list — so a new tenancy has to be started by an administrator. Existing tenancies can be amended
              here. To open a fresh one, <Button to="/manage/messages" variant="link" size="sm">message the desk</Button>{' '}
              with the property, tenant name and agreed rent.
            </span>
          </span>
        </Callout>
      ) : null}

      <div className="split">
        <div className="stack">
          <Panel title="Who and what">
            <div className="form-grid">
              <Field
                name="property"
                label="Property"
                required
                error={save.errors.property?.[0]}
                hint={isAdmin ? 'Administrators may attach a listing owned by any landlord.' : 'Only your own listings appear.'}
              >
                <Input
                  as="select"
                  name="property"
                  value={form.property}
                  onChange={set('property')}
                  disabled={isEdit || !isAdmin}
                >
                  <option value="">Choose a property</option>
                  {(properties.data ?? []).map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.title} — {property.city} ({property.reference || property.slug})
                    </option>
                  ))}
                </Input>
                {isEdit ? <span className="hint">The property is fixed once a tenancy exists.</span> : null}
              </Field>

              <Field name="tenant" label="Tenant" required error={save.errors.tenant?.[0]}>
                {isAdmin ? (
                  <Input as="select" name="tenant" value={form.tenant} onChange={set('tenant')} disabled={isEdit}>
                    <option value="">Choose a tenant account</option>
                    {(tenants.data ?? []).map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.full_name} · {person.email}
                      </option>
                    ))}
                  </Input>
                ) : (
                  <Input name="tenant_display" value={existing.data?.tenant_name ?? ''} disabled readOnly />
                )}
                {isEdit ? <span className="hint">Change the tenancy record instead of re-assigning a tenant.</span> : null}
              </Field>

              {isAdmin ? (
                <Field name="landlord" label="Landlord" hint="Left empty, the property owner is used.">
                  <Input as="select" name="landlord" value={form.landlord} onChange={set('landlord')}>
                    <option value="">Property owner</option>
                    {(landlords.data ?? []).map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.full_name} · {person.email}
                      </option>
                    ))}
                  </Input>
                </Field>
              ) : null}
            </div>
          </Panel>

          <Panel title="Dates and money">
            <div className="form-grid">
              <Field name="start_date" label="Start date" required error={save.errors.start_date?.[0]}>
                <Input kind="date" name="start_date" value={form.start_date} onChange={set('start_date')} />
              </Field>
              <Field name="end_date" label="End date" required error={save.errors.end_date?.[0]}>
                <Input kind="date" name="end_date" value={form.end_date} onChange={set('end_date')} />
              </Field>
              <Field name="monthly_rent" label="Monthly rent" required error={save.errors.monthly_rent?.[0]}>
                <Input kind="number" name="monthly_rent" value={form.monthly_rent} onChange={set('monthly_rent')} min="0" step="1000" />
              </Field>
              <Field name="service_charge" label="Service charge per period">
                <Input kind="number" name="service_charge" value={form.service_charge} onChange={set('service_charge')} min="0" step="1000" />
              </Field>
              <Field name="security_deposit" label="Security deposit">
                <Input kind="number" name="security_deposit" value={form.security_deposit} onChange={set('security_deposit')} min="0" step="1000" />
              </Field>
              <Field name="currency" label="Currency">
                <Input name="currency" value={form.currency} onChange={set('currency')} maxLength={10} />
              </Field>
            </div>
          </Panel>

          <Panel title="Billing rhythm">
            <div className="form-grid">
              <Field name="billing_frequency" label="Invoice every">
                <Input as="select" name="billing_frequency" value={form.billing_frequency} onChange={set('billing_frequency')}>
                  <SelectOptions items={FREQUENCIES} />
                </Input>
              </Field>
              <Field name="due_day_of_month" label="Due day of month" hint="1 to 28.">
                <Input kind="number" name="due_day_of_month" value={form.due_day_of_month} onChange={set('due_day_of_month')} min="1" max="28" />
              </Field>
              <Field name="grace_period_days" label="Grace period (days)">
                <Input kind="number" name="grace_period_days" value={form.grace_period_days} onChange={set('grace_period_days')} min="0" max="60" />
              </Field>
              <Field name="late_fee_type" label="Late fee policy">
                <Input as="select" name="late_fee_type" value={form.late_fee_type} onChange={set('late_fee_type')}>
                  <SelectOptions items={LATE_FEES} />
                </Input>
              </Field>
              {form.late_fee_type === 'FLAT' ? (
                <Field name="late_fee_flat" label="Late fee amount">
                  <Input kind="number" name="late_fee_flat" value={form.late_fee_flat} onChange={set('late_fee_flat')} min="0" step="1000" />
                </Field>
              ) : null}
              {form.late_fee_type === 'PERCENT' ? (
                <Field name="late_fee_percent" label="Late fee percent">
                  <Input kind="number" name="late_fee_percent" value={form.late_fee_percent} onChange={set('late_fee_percent')} min="0" max="100" step="0.5" />
                </Field>
              ) : null}
              <Field name="status" label="Status" required>
                <Input as="select" name="status" value={form.status} onChange={set('status')}>
                  <SelectOptions items={statusOptions} />
                </Input>
              </Field>
            </div>
          </Panel>

          <Panel title="Agreement text">
            <div className="form-grid">
              <Field name="terms" label="Special terms" span2 hint="Shown on the invoice notes field when the tenancy is invoiced.">
                <Input as="textarea" name="terms" rows={4} value={form.terms} onChange={set('terms')} />
              </Field>
              <Field name="notes" label="Internal notes" span2 hint="Only the desk sees these.">
                <Input as="textarea" name="notes" rows={3} value={form.notes} onChange={set('notes')} />
              </Field>
            </div>
          </Panel>
        </div>

        <aside className="sticky-side stack">
          <Panel title="What saving does">
            <ul className="stack stack-sm" style={{ listStyle: 'none', paddingLeft: 0 }}>
              <li className="muted small">
                <strong>Active</strong> raises an invoice for every elapsed billing period straight away.
              </li>
              <li className="muted small">
                An active tenancy also switches its property from <em>Available</em> to <em>Occupied</em>, which takes
                the listing off the public catalogue. Ending or terminating the lease switches it back.
              </li>
              <li className="muted small">Draft tenancies invoice nothing until you activate them.</li>
              {isEdit && existing.data ? (
                <li className="tiny muted">
                  Currently {existing.data.total_invoiced ? '' : 'no'}{' '}
                  {existing.data.status_display} ·{' '}
                  {existing.data.days_remaining != null ? `${existing.data.days_remaining} days left` : 'ended'}
                </li>
              ) : null}
            </ul>
          </Panel>

          {isEdit && existing.data ? (
            <Panel title="Money so far">
              <ul className="stack stack-sm" style={{ listStyle: 'none', paddingLeft: 0 }}>
                <li className="row-between">
                  <span className="muted small">Invoiced</span>
                  <strong>{money(existing.data.total_invoiced, existing.data.currency)}</strong>
                </li>
                <li className="row-between">
                  <span className="muted small">Collected</span>
                  <strong>{money(existing.data.total_collected, existing.data.currency)}</strong>
                </li>
                <li className="row-between">
                  <span className="muted small">Outstanding</span>
                  <strong style={{ color: 'var(--red-600)' }}>
                    {money(existing.data.outstanding_balance, existing.data.currency)}
                  </strong>
                </li>
              </ul>
              <p className="hint">
                Use the tenancies screen to open the full statement or top up missing invoices.
              </p>
            </Panel>
          ) : null}

          <Callout tone="navy">
            Nothing here takes money. Payments are recorded against an invoice, confirmed by the desk, and only then
            does a receipt number exist.
          </Callout>
        </aside>
      </div>
    </div>
  )
}
