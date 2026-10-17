import { useEffect, useState } from 'react'
import { ImagePlus, Save } from 'lucide-react'
import { companyProfile, patchCompany } from '../../api/site.js'
import { useApi } from '../../hooks/useApi.js'
import { useAction } from '../../hooks/useAction.js'
import { useLookups } from '../../context/LookupContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { Callout, PageHeader, Panel } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Field, FormAlert, Input, SelectOptions } from '../../components/ui/Form.jsx'
import { Loading } from '../../components/ui/Feedback.jsx'
import { companyLogo } from '../../utils/media.js'

/** Everything the API treats as a plain string or number on the company record. */
const FIELDS = [
  'name', 'legal_name', 'tagline', 'about', 'email', 'phone', 'alt_phone', 'phone_3', 'address', 'city',
  'country', 'website', 'facebook', 'twitter', 'instagram', 'linkedin', 'currency',
  'currency_symbol', 'invoice_prefix', 'receipt_prefix', 'lease_prefix', 'payment_prefix',
  'grace_period_days', 'late_fee_type', 'late_fee_flat', 'late_fee_percent', 'bank_name',
  'bank_account_name', 'bank_account_number', 'bank_branch', 'mobile_money_number',
  'payment_instructions',
]

/**
 * Company profile — branding, document numbering and the default late-fee rule
 * inherited by leases. Only administrators may write; everyone may read.
 */
export default function CompanySettings() {
  const { options, reload: reloadLookups, setCompany } = useLookups()
  const toast = useToast()

  const record = useApi(() => companyProfile(), [])
  const [form, setForm] = useState(null)
  const [logo, setLogo] = useState(null)

  useEffect(() => {
    if (!record.data) return
    setForm(Object.fromEntries(FIELDS.map((key) => [key, record.data[key] ?? ''])))
  }, [record.data])

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))

  const save = useAction(
    async () => {
      const updated = await patchCompany(
        {
          ...form,
          grace_period_days: Number(form.grace_period_days) || 0,
          late_fee_flat: Number(form.late_fee_flat) || 0,
          late_fee_percent: Number(form.late_fee_percent) || 0,
        },
        logo || undefined
      )
      setCompany(updated)
      await reloadLookups()
      return updated
    },
    {
      onDone: (updated) => {
        if (!updated) return undefined
        toast.success('Company profile saved. The public site picks up the new details immediately.')
        setLogo(null)
        record.setData(updated)
        return undefined
      },
    }
  )

  const errors = save.errors
  const company = record.data

  if (record.loading && !form) return <Loading label="Loading the company profile…" />
  if (!form) return record.error ? <Callout>{record.error}</Callout> : null

  const lateFee = form.late_fee_type

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Settings"
        title="Company profile"
        lead="Branding, contacts, document numbering and the default late-fee rule. These values feed the public site, every invoice and receipt, and the tenant payment instructions."
        actions={
          <Button pending={save.pending} onClick={() => save.execute()} disabled={save.pending}>
            <Save size={15} /> {save.pending ? 'Saving…' : 'Save changes'}
          </Button>
        }
      />

      <FormAlert error={save.error} />

      <Callout>
        This profile is readable without signing in, because the public pages show the same contacts and payment
        instructions. Bank and mobile money numbers typed here are visible to anyone who opens the API — keep only the
        details tenants genuinely need. Prefixes and late-fee settings are also public; the backend follow-up list
        proposes splitting them behind an admin-only endpoint.
      </Callout>

      {errors.detail ? <Callout>{errors.detail[0]}</Callout> : null}

      <div className="grid grid-2">
        <Panel title="Identity">
          <div className="stack">
            <Field name="name" label="Trading name" required error={errors.name?.[0]}>
              <Input name="name" value={form.name} onChange={set('name')} error={errors.name} />
            </Field>
            <Field name="legal_name" label="Legal name" hint="Used on invoices and receipts where the full registered name is required.">
              <Input name="legal_name" value={form.legal_name} onChange={set('legal_name')} />
            </Field>
            <Field
              name="tagline"
              label="Wordmark"
              hint="Printed under the logo in the header and footer. Page headings carry their own copy, so this is not used as a sentence."
            >
              <Input name="tagline" value={form.tagline} onChange={set('tagline')} />
            </Field>
            <Field name="about" label="About" hint="Shown on the public About page.">
              <Input as="textarea" name="about" rows={6} value={form.about} onChange={set('about')} />
            </Field>
          </div>
        </Panel>

        <Panel title="Contact and links">
          <div className="stack">
            <div className="form-grid">
              <Field name="email" label="Email" required error={errors.email?.[0]}>
                <Input kind="email" name="email" value={form.email} onChange={set('email')} error={errors.email} />
              </Field>
              <Field name="phone" label="Phone">
                <Input name="phone" value={form.phone} onChange={set('phone')} />
              </Field>
              <Field name="alt_phone" label="Second line">
                <Input name="alt_phone" value={form.alt_phone} onChange={set('alt_phone')} />
              </Field>
              <Field name="phone_3" label="Third line" hint="Leave blank if the company does not publish a third number.">
                <Input name="phone_3" value={form.phone_3} onChange={set('phone_3')} />
              </Field>
              <Field name="website" label="Website" hint="Full URL including https://">
                <Input name="website" value={form.website} onChange={set('website')} error={errors.website} />
              </Field>
            </div>
            <Field name="address" label="Street address">
              <Input name="address" value={form.address} onChange={set('address')} />
            </Field>
            <div className="form-grid">
              <Field name="city" label="City">
                <Input name="city" value={form.city} onChange={set('city')} />
              </Field>
              <Field name="country" label="Country">
                <Input name="country" value={form.country} onChange={set('country')} />
              </Field>
            </div>
            <div className="form-grid">
              <Field name="facebook" label="Facebook">
                <Input name="facebook" value={form.facebook} onChange={set('facebook')} error={errors.facebook} />
              </Field>
              <Field name="twitter" label="X / Twitter">
                <Input name="twitter" value={form.twitter} onChange={set('twitter')} error={errors.twitter} />
              </Field>
              <Field name="instagram" label="Instagram">
                <Input name="instagram" value={form.instagram} onChange={set('instagram')} error={errors.instagram} />
              </Field>
              <Field name="linkedin" label="LinkedIn">
                <Input name="linkedin" value={form.linkedin} onChange={set('linkedin')} error={errors.linkedin} />
              </Field>
            </div>
          </div>
        </Panel>

        <Panel title="Logo">
          <div className="row" style={{ gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <LogoPreview logo={logo} company={company} />
            <div className="grow stack stack-sm" style={{ minWidth: 220 }}>
              <input
                id="logo-input"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => setLogo(event.target.files?.[0] || null)}
              />
              <label className="chip chip-button" htmlFor="logo-input">
                <ImagePlus size={14} /> {logo ? logo.name : 'Choose a logo'}
              </label>
              {logo ? (
                <button type="button" className="btn-link" onClick={() => setLogo(null)}>
                  Do not change the logo
                </button>
              ) : null}
              <p className="hint" style={{ margin: 0 }}>
                Saving with a file selected replaces the current logo. The header, footer, invoices and receipts all
                read this image.
              </p>
            </div>
          </div>
        </Panel>

        <Panel title="Money and documents">
          <div className="stack">
            <div className="form-grid">
              <Field name="currency" label="Currency code" hint="Three letters, e.g. UGX." error={errors.currency?.[0]}>
                <Input name="currency" value={form.currency} onChange={set('currency')} error={errors.currency} />
              </Field>
              <Field name="currency_symbol" label="Currency symbol" hint="Printed in front of every amount.">
                <Input name="currency_symbol" value={form.currency_symbol} onChange={set('currency_symbol')} />
              </Field>
            </div>
            <p className="hint" style={{ margin: 0 }}>
              Numbering prefixes appear on generated documents. Existing invoices, receipts, leases and payments keep
              the numbers they were issued with — changing a prefix only affects documents created from now on.
            </p>
            <div className="form-grid">
              <Field name="invoice_prefix" label="Invoice prefix">
                <Input name="invoice_prefix" value={form.invoice_prefix} onChange={set('invoice_prefix')} />
              </Field>
              <Field name="receipt_prefix" label="Receipt prefix">
                <Input name="receipt_prefix" value={form.receipt_prefix} onChange={set('receipt_prefix')} />
              </Field>
              <Field name="lease_prefix" label="Lease prefix">
                <Input name="lease_prefix" value={form.lease_prefix} onChange={set('lease_prefix')} />
              </Field>
              <Field name="payment_prefix" label="Payment prefix">
                <Input name="payment_prefix" value={form.payment_prefix} onChange={set('payment_prefix')} />
              </Field>
            </div>
          </div>
        </Panel>

        <Panel title="Default late-fee rule">
          <div className="stack">
            <p className="muted small" style={{ margin: 0 }}>
              Applied to any tenancy whose lease is set to “inherit”. A lease can override it with its own type, flat
              amount or percentage.
            </p>
            <div className="form-grid">
              <Field name="late_fee_type" label="Rule" error={errors.late_fee_type?.[0]}>
                <Input as="select" name="late_fee_type" value={form.late_fee_type} onChange={set('late_fee_type')}>
                  <SelectOptions items={options.late_fee_types || []} />
                </Input>
              </Field>
              <Field
                name="grace_period_days"
                label="Grace period (days)"
                hint="Whole days after the due date before rent counts as late. Leases allow 1–28."
                error={errors.grace_period_days?.[0]}
              >
                <Input
                  kind="number"
                  name="grace_period_days"
                  min="0"
                  max="28"
                  value={form.grace_period_days}
                  onChange={set('grace_period_days')}
                />
              </Field>
            </div>
            {lateFee === 'FLAT' ? (
              <Field name="late_fee_flat" label="Flat charge" hint="Added once to the invoice in the account currency.">
                <Input kind="number" name="late_fee_flat" min="0" step="0.01" value={form.late_fee_flat} onChange={set('late_fee_flat')} />
              </Field>
            ) : null}
            {lateFee === 'PERCENT' ? (
              <Field name="late_fee_percent" label="Percentage of rent" hint="Applied to the rent line of the invoice.">
                <Input
                  kind="number"
                  name="late_fee_percent"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.late_fee_percent}
                  onChange={set('late_fee_percent')}
                />
              </Field>
            ) : null}
            {lateFee === 'NONE' ? (
              <p className="hint" style={{ margin: 0 }}>
                No charge is added automatically. Overdue invoices are still flagged past due so the desk can chase
                them.
              </p>
            ) : null}
            <p className="hint" style={{ margin: 0 }}>
              Nothing runs on a schedule: a late fee is applied when the desk presses “Apply the late fee” on an overdue
              invoice, and reminders are sent as in-app messages, not email.
            </p>
          </div>
        </Panel>

        <Panel title="Payment instructions">
          <div className="stack">
            <p className="muted small" style={{ margin: 0 }}>
              Shown to tenants on their portal, on invoice reminders and on the contact page. This is instruction text
              only — there is no online payment gateway, and saving a reference here cannot mark anything as paid.
            </p>
            <div className="form-grid">
              <Field name="bank_name" label="Bank">
                <Input name="bank_name" value={form.bank_name} onChange={set('bank_name')} />
              </Field>
              <Field name="bank_account_name" label="Account name">
                <Input name="bank_account_name" value={form.bank_account_name} onChange={set('bank_account_name')} />
              </Field>
              <Field name="bank_account_number" label="Account number">
                <Input name="bank_account_number" value={form.bank_account_number} onChange={set('bank_account_number')} />
              </Field>
              <Field name="bank_branch" label="Branch">
                <Input name="bank_branch" value={form.bank_branch} onChange={set('bank_branch')} />
              </Field>
              <Field name="mobile_money_number" label="Mobile money line">
                <Input
                  name="mobile_money_number"
                  value={form.mobile_money_number}
                  onChange={set('mobile_money_number')}
                />
              </Field>
            </div>
            <Field
              name="payment_instructions"
              label="Instructions"
              hint="Tell tenants to quote the invoice number as their reference."
              error={errors.payment_instructions?.[0]}
              span2
            >
              <Input
                as="textarea"
                name="payment_instructions"
                rows={5}
                value={form.payment_instructions}
                onChange={set('payment_instructions')}
              />
            </Field>
          </div>
        </Panel>
      </div>

      <div className="row-end">
        <Button pending={save.pending} onClick={() => save.execute()} disabled={save.pending}>
          <Save size={15} /> {save.pending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  )
}

function LogoPreview({ logo, company }) {
  const [objectUrl, setObjectUrl] = useState('')

  useEffect(() => {
    if (!logo) {
      setObjectUrl('')
      return undefined
    }
    const url = URL.createObjectURL(logo)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [logo])

  return (
    <div
      style={{
        width: 140,
        height: 88,
        borderRadius: 12,
        border: '1px solid var(--line)',
        background: 'var(--navy-50)',
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
      }}
    >
      {objectUrl ? (
        <img src={objectUrl} alt="Selected logo preview" style={{ maxWidth: '90%', maxHeight: '80%', objectFit: 'contain' }} />
      ) : companyLogo(company) ? (
        <img src={companyLogo(company)} alt="Current logo" style={{ maxWidth: '90%', maxHeight: '80%', objectFit: 'contain' }} />
      ) : (
        <span className="tiny muted">No logo</span>
      )}
    </div>
  )
}
