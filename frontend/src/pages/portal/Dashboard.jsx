import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, CircleDollarSign, MessageSquare, Receipt, Wallet } from 'lucide-react'
import { analytics, invoiceSummary, listInvoices } from '../../api/billing.js'
import { listLeases } from '../../api/leases.js'
import { useApi } from '../../hooks/useApi.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useLookups } from '../../context/LookupContext.jsx'
import PaymentModal from '../../components/billing/PaymentModal.jsx'
import { InvoiceBadge } from '../../components/ui/Badge.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Callout, KeyValue, PageHeader, Panel, Stat } from '../../components/ui/Blocks.jsx'
import { MonthlyBars, ProgressBar } from '../../components/ui/Charts.jsx'
import { EmptyState, Loading } from '../../components/ui/Feedback.jsx'
import { Td, Table } from '../../components/ui/Table.jsx'
import { amount, dateLabel, money, pluralize } from '../../utils/format.js'

/**
 * Tenant home. Every number comes from the role-scoped analytics endpoint, so a
 * tenant only ever sees their own charges and receipts.
 */
export default function Dashboard() {
  const { user } = useAuth()
  const { company } = useLookups()
  const [payOpen, setPayOpen] = useState(false)

  const overview = useApi(() => analytics({ months: 6 }), [])
  const summary = useApi(() => invoiceSummary(), [])
  const leases = useApi(() => listLeases({ ordering: 'end_date' }), [])
  const open = useApi(() => listInvoices({ outstanding: true, ordering: 'due_date' }), [])

  const data = overview.data
  const currency = data?.currency || company?.currency || 'UGX'
  const account = data?.my_account
  const totals = data?.totals

  if (overview.loading && !data) return <Loading label="Loading your account…" />
  if (overview.error) return <Callout>{overview.error}</Callout>

  const nextDue = account?.next_due

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Tenant portal"
        title={`Good day, ${user?.first_name || user?.full_name || 'there'}`}
        lead="Your rent account as the Mant Bridges desk sees it: charges, payments awaiting confirmation, and the receipts that prove what has been settled."
        actions={
          <Button onClick={() => setPayOpen(true)}>
            <Wallet size={15} /> Report a payment
          </Button>
        }
      />

      {account && !account.active_lease ? (
        <Callout tone="navy">
          You do not have an active tenancy on this account yet. Once a lease is signed and activated, invoices for
          each billing period appear here automatically.
        </Callout>
      ) : null}

      <div className="grid grid-4">
        <Stat
          label="Outstanding"
          value={money(totals?.outstanding, currency)}
          foot={`${pluralize(summary.data?.outstanding_count ?? 0, 'invoice')} open`}
          tone="warn"
        />
        <Stat
          label="Next payment due"
          value={nextDue ? dateLabel(nextDue.due_date) : 'Nothing scheduled'}
          foot={nextDue ? money(nextDue.balance, currency) : 'No unpaid invoice'}
        />
        <Stat
          label="Paid to date"
          value={money(totals?.collected, currency)}
          foot={`${pluralize(totals?.invoices ?? 0, 'invoice')} charged`}
          tone="ok"
        />
        <Stat
          label="Receipts"
          value={(account?.receipts ?? 0).toLocaleString()}
          foot={`${pluralize(totals?.pending_payments ?? 0, 'payment')} awaiting confirmation`}
        />
      </div>

      <div className="split">
        <div className="stack">
          {nextDue ? (
            <Panel
              title="Your next payment"
              action={
                <Link to="/portal/invoices" className="btn btn-outline btn-sm">
                  All invoices
                </Link>
              }
            >
              <div className="stack">
                <div className="row-between" style={{ alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                  <div>
                    <p className="eyebrow">Balance due</p>
                    <h2 style={{ margin: '2px 0 4px' }}>{money(nextDue.balance, currency)}</h2>
                    <p className="muted small" style={{ margin: 0 }}>
                      Invoice {nextDue.number} · {nextDue.property}
                    </p>
                  </div>
                  <div className="stack stack-sm" style={{ textAlign: 'right' }}>
                    <span className="tiny muted">Due date</span>
                    <strong>
                      <CalendarClock size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                      {dateLabel(nextDue.due_date)}
                    </strong>
                  </div>
                </div>
                <Button block onClick={() => setPayOpen(true)}>
                  <Wallet size={15} /> Report a payment against this invoice
                </Button>
                <Callout tone="navy">
                  Pay by bank transfer, mobile money or in cash using the details opposite, then report the payment with
                  its reference. Nothing is charged online, and the entry stays pending until the desk confirms it and
                  issues a receipt.
                </Callout>
              </div>
            </Panel>
          ) : (
            <Panel title="Your next payment">
              <EmptyState icon={CircleDollarSign} title="Nothing outstanding">
                Every invoice on your account is settled. A receipt for each confirmed payment is in My receipts.
              </EmptyState>
            </Panel>
          )}

          <Panel
            title="Billing history"
            action={<span className="tiny muted">Last 6 months</span>}
          >
            {data?.monthly?.length ? (
              <MonthlyBars series={data.monthly} currency={currency} />
            ) : (
              <p className="muted small">No billing activity on this account yet.</p>
            )}
            {totals?.collection_rate != null ? (
              <div style={{ marginTop: 16 }}>
                <ProgressBar
                  value={Number(totals.collection_rate)}
                  max={100}
                  label={`You have paid ${Number(totals.collection_rate).toFixed(1)}% of everything invoiced on this account.`}
                />
              </div>
            ) : null}
          </Panel>

          <Panel
            title="Unpaid invoices"
            action={
              <Link to="/portal/invoices" className="btn btn-outline btn-sm">
                Open the rent book
              </Link>
            }
          >
            <Table
              head={['Invoice', 'Period', 'Due', { label: 'Balance', num: true }, 'Status']}
              rows={(open.data?.results ?? []).slice(0, 6)}
              loading={open.loading}
              error={open.error}
              onRetry={open.reload}
              empty={
                <div className="empty">
                  <h3>Nothing outstanding</h3>
                  <p className="muted">Invoices appear here as soon as a billing period is charged.</p>
                </div>
              }
              renderRow={(invoice) => (
                <tr key={invoice.id}>
                  <Td>
                    <Link to={`/portal/invoices/${invoice.id}`} className="bold">
                      {invoice.number}
                    </Link>
                    <span className="tiny muted" style={{ display: 'block' }}>
                      {invoice.property_title}
                    </span>
                  </Td>
                  <Td className="tiny">{invoice.period_label}</Td>
                  <Td className="tiny">{dateLabel(invoice.due_date)}</Td>
                  <Td num className="bold">
                    {invoice.balance_display ?? amount(invoice, 'balance', invoice.currency)}
                  </Td>
                  <Td>
                    <InvoiceBadge invoice={invoice} />
                  </Td>
                </tr>
              )}
            />
          </Panel>
        </div>

        <aside className="sticky-side stack">
          <Panel title="How to pay" action={<Link to="/contact" className="btn btn-outline btn-sm">Contact desk</Link>}>
            {company ? (
              <div className="stack stack-sm">
                {company.payment_instructions ? (
                  <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                    {company.payment_instructions}
                  </p>
                ) : null}
                <KeyValue
                  items={[
                    company.bank_name ? { label: 'Bank', value: company.bank_name } : null,
                    company.bank_account_name ? { label: 'Account name', value: company.bank_account_name } : null,
                    company.bank_account_number ? { label: 'Account number', value: company.bank_account_number } : null,
                    company.bank_branch ? { label: 'Branch', value: company.bank_branch } : null,
                    company.mobile_money_number ? { label: 'Mobile money', value: company.mobile_money_number } : null,
                    company.phone ? { label: 'Phone', value: company.phone } : null,
                    company.email ? { label: 'Email', value: company.email } : null,
                  ].filter(Boolean)}
                />
                <p className="hint" style={{ margin: 0 }}>
                  Quote the invoice number as your payment reference so the desk can match the transfer to your account.
                </p>
              </div>
            ) : (
              <p className="muted small">Payment details could not be loaded. Ask the property desk.</p>
            )}
          </Panel>

          <Panel title="Your tenancy" action={<Link to="/portal/leases" className="btn btn-outline btn-sm">Details</Link>}>
            <div className="stack stack-sm">
              {(leases.data?.results ?? []).length ? (
                (leases.data?.results ?? []).slice(0, 3).map((lease) => (
                  <div key={lease.id} className="row-between" style={{ gap: 10, alignItems: 'flex-start' }}>
                    <div className="truncate">
                      <strong className="small">{lease.property_title}</strong>
                      <span className="tiny muted" style={{ display: 'block' }}>
                        {lease.number} · {dateLabel(lease.start_date)} → {dateLabel(lease.end_date)}
                      </span>
                    </div>
                    <span className="small bold nowrap">
                      {lease.monthly_rent_display ?? money(lease.monthly_rent, lease.currency)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="muted small">No tenancy is recorded on this account yet.</p>
              )}
              {account?.days_to_expiry_lease != null ? (
                <p className="hint" style={{ margin: 0 }}>
                  Your active tenancy ends in {account.days_to_expiry_lease}{' '}
                  {pluralize(account.days_to_expiry_lease, 'day')}. Speak to the desk before then about renewing.
                </p>
              ) : null}
            </div>
          </Panel>

          <Panel title="Support">
            <div className="stack stack-sm">
              <Link to="/portal/messages" className="btn btn-outline">
                <MessageSquare size={15} /> Message the desk
              </Link>
              <Link to="/portal/receipts" className="btn btn-outline">
                <Receipt size={15} /> Download a receipt
              </Link>
              <Link to="/portal/statement" className="btn btn-outline">
                <CircleDollarSign size={15} /> Full account statement
              </Link>
            </div>
            <p className="hint" style={{ margin: '10px 0 0' }}>
              Repairs, keys and viewing requests are handled through messages — there is no separate maintenance ticket
              system yet, so describe what you need in the thread.
            </p>
          </Panel>
        </aside>
      </div>

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        onDone={() => {
          setPayOpen(false)
          overview.reload()
          summary.reload()
          open.reload()
        }}
      />
    </div>
  )
}
