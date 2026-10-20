import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Scale } from 'lucide-react'
import { leaseStatement, listLeases } from '../../api/leases.js'
import { hasActiveFilters, useList } from '../../hooks/useList.js'
import { useAction } from '../../hooks/useAction.js'
import { StatusBadge } from '../../components/ui/Badge.jsx'
import StatementTable from '../../components/billing/StatementTable.jsx'
import { Callout, KeyValue, PageHeader, Panel } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Input, SelectOptions } from '../../components/ui/Form.jsx'
import { Modal } from '../../components/ui/Modal.jsx'
import { Pagination } from '../../components/ui/Pagination.jsx'
import { EmptyState, Loading } from '../../components/ui/Feedback.jsx'
import { dateLabel, money, pluralize } from '../../utils/format.js'
import { mediaUrl } from '../../utils/media.js'

const ORDERING = [
  { value: '-start_date', label: 'Newest tenancy' },
  { value: 'end_date', label: 'Ending soonest' },
  { value: '-monthly_rent', label: 'Rent: high to low' },
]

/** Read-only view of the tenancies on a tenant account. */
export default function Leases() {
  const [statement, setStatement] = useState(null)

  const list = useList(listLeases, { ordering: ORDERING[0].value })
  const active = hasActiveFilters(list.filters, ['ordering'])

  const load = useAction(async (lease) => {
    const data = await leaseStatement(lease.id)
    setStatement({ lease, data })
  })

  return (
    <div className="stack">
      <PageHeader
        eyebrow="My home"
        title="My leases"
        lead="The tenancy agreements held against your account, with the charges and payments the desk has recorded under each one."
        actions={
          <Input
            as="select"
            name="ordering"
            value={list.filters.ordering || ORDERING[0].value}
            onChange={(value) => list.patchFilters({ ordering: value }, { keepPage: true })}
            style={{ minWidth: 190 }}
          >
            <SelectOptions items={ORDERING} />
          </Input>
        }
      />

      {load.error ? <Callout>{load.error}</Callout> : null}

      {!active && !list.rows.length && !list.loading && !list.error ? (
        <Panel>
          <EmptyState icon={Scale} title="No tenancy on this account" action={<Link to="/properties" className="btn btn-outline">Browse listings</Link>}>
            When a lease is signed and activated you will see the agreement, the rent due and every invoice raised
            under it here.
          </EmptyState>
        </Panel>
      ) : null}

      {list.loading && !list.rows.length ? <Loading label="Loading your tenancies…" /> : null}

      <div className="stack">
        {list.rows.map((lease) => (
          <LeaseCard key={lease.id} lease={lease} onStatement={() => load.execute(lease)} busy={load.pending} />
        ))}
      </div>

      <Pagination
        page={list.page}
        pageCount={list.pageCount}
        total={list.count}
        onChange={list.setPage}
        noun="tenancy"
      />

      <Callout tone="navy">
        Your obligations — notice period, deposit terms and house rules — live in the signed agreement you received at
        the start of the tenancy. Anything unclear, or a change you want to request, goes to the desk through Messages;
        this page shows the record, it cannot amend it.
      </Callout>

      <Modal
        open={Boolean(statement)}
        title={statement ? `Statement — ${statement.lease.number}` : 'Statement'}
        onClose={() => setStatement(null)}
        size="lg"
      >
        {statement ? (
          <StatementTable
            data={statement.data}
            empty={
              <div className="empty">
                <h3>No charges yet</h3>
                <p className="muted">Nothing has been invoiced on this tenancy.</p>
              </div>
            }
          />
        ) : null}
      </Modal>
    </div>
  )
}

function LeaseCard({ lease, onStatement, busy }) {
  const property = lease.property_detail || {}
  const currency = lease.currency || 'UGX'

  return (
    <Panel
      title={property.title || lease.property_title}
      action={<StatusBadge value={lease.status} label={lease.status_display} />}
    >
      <div className="row" style={{ gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {property.cover_image_url ? (
          <img
            src={mediaUrl(property.cover_image_url)}
            alt=""
            style={{ width: 168, height: 112, objectFit: 'cover', borderRadius: 12, border: '1px solid var(--line)' }}
          />
        ) : null}

        <div className="grow stack stack-sm" style={{ minWidth: 240 }}>
          <p className="muted small" style={{ margin: 0 }}>
            {property.reference ? `${property.reference} · ` : ''}
            {[property.address, property.city, property.district].filter(Boolean).join(', ')}
          </p>
          <KeyValue
            items={[
              { label: 'Lease number', value: lease.number },
              {
                label: 'Term',
                value: `${dateLabel(lease.start_date)} → ${dateLabel(lease.end_date)} (${pluralize(lease.term_months ?? 0, 'month')})`,
              },
              { label: 'Rent', value: lease.monthly_rent_display ?? money(lease.monthly_rent, currency) },
              { label: 'Service charge', value: money(lease.service_charge, currency) },
              { label: 'Deposit held', value: money(lease.security_deposit, currency) },
              {
                label: 'Billing',
                value: `${lease.frequency_display || lease.billing_frequency} · due on day ${lease.due_day_of_month}`,
              },
              { label: 'Landlord', value: lease.landlord_name },
              {
                label: 'Days left',
                value: lease.is_current ? pluralize(lease.days_remaining ?? 0, 'day') : 'Not running',
              },
            ]}
          />
        </div>

        <div className="stack stack-sm" style={{ minWidth: 210, textAlign: 'right' }}>
          <div>
            <span className="tiny muted">Charged under this lease</span>
            <strong style={{ display: 'block' }}>{money(lease.total_invoiced, currency)}</strong>
          </div>
          <div>
            <span className="tiny muted">Paid</span>
            <strong style={{ display: 'block', color: 'var(--ok)' }}>
              {money(lease.total_collected, currency)}
            </strong>
          </div>
          <div>
            <span className="tiny muted">Outstanding</span>
            <strong style={{ display: 'block', color: 'var(--red-600)' }}>
              {money(lease.outstanding_balance, currency)}
            </strong>
          </div>
          <Button size="sm" variant="outline" onClick={onStatement} pending={busy} disabled={busy}>
            <Scale size={14} /> Full statement
          </Button>
          <Link to="/portal/invoices" className="btn btn-outline btn-sm">
            My invoices
          </Link>
        </div>
      </div>

      {lease.terms ? (
        <div style={{ marginTop: 14 }}>
          <h4 className="small" style={{ margin: '0 0 4px' }}>
            Agreement notes
          </h4>
          <p className="muted small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
            {lease.terms}
          </p>
        </div>
      ) : null}
    </Panel>
  )
}
