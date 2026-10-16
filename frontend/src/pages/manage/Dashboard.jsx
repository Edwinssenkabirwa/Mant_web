import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CircleDollarSign,
  Inbox,
  KeyRound,
  MessageSquare,
  Wallet,
} from 'lucide-react'
import {
  analytics,
  confirmPayment,
  invoiceSummary,
  listInvoices,
  listPayments,
  paymentSummary,
} from '../../api/billing.js'
import { leaseStats } from '../../api/leases.js'
import { manageStats } from '../../api/properties.js'
import { enquiryStats, listEnquiries } from '../../api/site.js'
import { userStats } from '../../api/users.js'
import { useApi } from '../../hooks/useApi.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useLookups } from '../../context/LookupContext.jsx'
import { AgingList, Donut, MonthlyBars, ProgressBar } from '../../components/ui/Charts.jsx'
import { InvoiceBadge, StatusBadge } from '../../components/ui/Badge.jsx'
import { Callout, KeyValue, PageHeader, Panel, Stat, StatGrid } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { ErrorState, Loading } from '../../components/ui/Feedback.jsx'
import { Td, Table } from '../../components/ui/Table.jsx'
import { dateTimeLabel, money, percent } from '../../utils/format.js'
import { useAction } from '../../hooks/useAction.js'
import { useToast } from '../../context/ToastContext.jsx'

export default function Dashboard() {
  const { user } = useAuth()
  const { company } = useLookups()
  const isAdmin = user?.role === 'ADMIN'

  const analyticsReq = useApi(() => analytics({ months: 6 }), [])
  const invoiceReq = useApi(() => invoiceSummary(), [])
  const paymentReq = useApi(() => paymentSummary(), [])
  const leaseReq = useApi(() => leaseStats(), [])
  const propertyReq = useApi(() => manageStats(), [])
  const userReq = useApi(() => userStats(), [], { skip: !isAdmin })
  const enquiryReq = useApi(() => enquiryStats(), [], { skip: !isAdmin })
  const overdueReq = useApi(() => listInvoices({ outstanding: true, overdue: true, ordering: '-due_date' }), [])
  const pendingReq = useApi(() => listPayments({ status: 'PENDING', ordering: '-paid_on' }), [])
  const newEnquiryReq = useApi(() => listEnquiries({ status: 'NEW', ordering: '-created_at' }), [], {
    skip: !isAdmin,
  })

  const toast = useToast()
  const confirm = useAction((id) => confirmPayment(id), {
    onDone: () => {
      toast.success('Payment confirmed and a receipt issued.')
      pendingReq.reload()
      paymentReq.reload()
    },
  })

  if (analyticsReq.loading && !analyticsReq.data) return <Loading label="Building your dashboard…" />
  if (analyticsReq.error) {
    return (
      <ErrorState
        error={analyticsReq.error}
        onRetry={analyticsReq.reload}
        title="The rent book could not be loaded"
      />
    )
  }

  const data = analyticsReq.data ?? {}
  const totals = data.totals ?? {}
  const currency = data.currency || company?.currency || 'UGX'
  const portfolio = data.portfolio ?? {}
  const statusCounts = data.status_counts ?? {}

  const invoices = overdueReq.data?.results ?? []
  const payments = pendingReq.data?.results ?? []

  return (
    <div className="stack">
      <PageHeader
        eyebrow={isAdmin ? 'Administration' : 'Landlord desk'}
        title={`Good day, ${user?.first_name || user?.full_name || 'there'}`}
        lead={
          isAdmin
            ? 'Portfolio, rent book and inbox for the whole of Mant Bridges LTD. Every figure below is read straight from the API.'
            : 'Your own listings, tenancies and rent book. Numbers are scoped by the server to property you own.'
        }
        actions={
          <>
            <Button to="/manage/invoices" variant="outline">
              <Wallet size={15} /> Rent book
            </Button>
            <Button to="/manage/reports">
              <ArrowRight size={15} /> Reports
            </Button>
          </>
        }
      />

      <StatGrid>
        <Stat
          label="Invoiced"
          value={money(totals.invoiced, currency)}
          foot={`${(totals.invoices ?? 0).toLocaleString()} invoices`}
          icon={CircleDollarSign}
        />
        <Stat
          label="Collected"
          value={money(totals.collected, currency)}
          foot={
            <ProgressBar
              value={totals.collection_rate ?? 0}
              tone={(totals.collection_rate ?? 0) >= 85 ? '' : 'accent'}
              label={`${percent(totals.collection_rate)} collection rate`}
            />
          }
        />
        <Stat
          label="Outstanding"
          value={money(totals.outstanding, currency)}
          foot={money(totals.overdue, currency) + ' past due date'}
          tone="warn"
          icon={AlertTriangle}
        />
        <Stat
          label="Pending payments"
          value={(totals.pending_payments ?? 0).toLocaleString()}
          foot="Awaiting confirmation"
          icon={Wallet}
        />
      </StatGrid>

      <div className="grid grid-2">
        <Panel
          title="Collection trend"
          action={<span className="muted small">last 6 months</span>}
        >
          <MonthlyBars series={data.monthly} currency={currency} />
        </Panel>

        <Panel title="Invoices by status">
          <Donut
            value={(totals.invoices ?? 0).toLocaleString()}
            label="invoices"
            segments={[
              { label: 'Paid', value: statusCounts.paid ?? 0 },
              { label: 'Overdue', value: statusCounts.overdue ?? 0 },
              { label: 'Partial', value: statusCounts.partial ?? 0 },
              { label: 'Unpaid', value: statusCounts.unpaid ?? 0 },
            ]}
          />
        </Panel>
      </div>

      <div className="grid grid-2">
        <Panel title="Arrears aging">
          <AgingList buckets={data.aging} currency={currency} />
        </Panel>

        <Panel
          title="Portfolio"
          action={
            <Button to={isAdmin ? '/manage/users' : '/manage/properties'} variant="link" size="sm">
              {isAdmin ? 'People' : 'Listings'}
            </Button>
          }
        >
          <KeyValue
            items={[
              { label: 'Properties', value: (portfolio.properties ?? 0).toLocaleString() },
              { label: 'Published', value: (portfolio.published ?? 0).toLocaleString() },
              { label: 'Available', value: (portfolio.available ?? 0).toLocaleString() },
              { label: 'Occupied', value: (portfolio.occupied ?? 0).toLocaleString() },
              ...(isAdmin
                ? [
                    { label: 'Landlords', value: (portfolio.landlords ?? 0).toLocaleString() },
                    { label: 'Tenants', value: (portfolio.tenants ?? 0).toLocaleString() },
                    { label: 'Receipts issued', value: (portfolio.receipts ?? 0).toLocaleString() },
                  ]
                : []),
              { label: 'Active tenancies', value: (leaseReq.data?.active ?? 0).toLocaleString() },
              {
                label: 'Expiring within 60 days',
                value: (leaseReq.data?.expiring_soon ?? 0).toLocaleString(),
              },
              ...(isAdmin
                ? [
                    { label: 'New enquiries', value: (enquiryReq.data?.new ?? 0).toLocaleString() },
                    { label: 'Accounts', value: (userReq.data?.total ?? 0).toLocaleString() },
                  ]
                : []),
              {
                label: 'Your listings',
                value: (propertyReq.data?.total ?? 0).toLocaleString(),
              },
            ]}
          />
        </Panel>
      </div>

      <Panel
        title="Overdue invoices"
        action={
          <Button to="/manage/invoices?outstanding=true" variant="link" size="sm">
            All outstanding
          </Button>
        }
      >
        <Table
          head={[
            'Invoice',
            'Tenant',
            'Property',
            'Period',
            { label: 'Balance', num: true },
            'Status',
          ]}
          rows={invoices}
          loading={overdueReq.loading}
          error={overdueReq.error}
          onRetry={overdueReq.reload}
          empty={
            <Callout tone="navy">
              <Building2 size={16} /> Nothing is past its due date right now.
            </Callout>
          }
          renderRow={(invoice) => (
            <tr key={invoice.id}>
              <Td>
                <Link to={`/manage/invoices/${invoice.id}`} className="bold">
                  {invoice.number}
                </Link>
              </Td>
              <Td>{invoice.tenant_name}</Td>
              <Td className="truncate">{invoice.property_title}</Td>
              <Td>{invoice.period_label}</Td>
              <Td num>{invoice.balance_display ?? money(invoice.balance, currency)}</Td>
              <Td>
                <InvoiceBadge invoice={invoice} />
              </Td>
            </tr>
          )}
        />
      </Panel>

      <div className="grid grid-2">
        <Panel
          title="Payments waiting for confirmation"
          action={<span className="muted small">{(paymentReq.data?.pending_count ?? 0).toLocaleString()} pending</span>}
        >
          <Table
            head={[{ label: 'Amount', num: true }, 'Invoice', 'Method', 'Recorded', 'Action']}
            rows={payments}
            loading={pendingReq.loading}
            error={pendingReq.error}
            onRetry={pendingReq.reload}
            empty={<p className="muted small">No payment has been recorded since the last reconciliation.</p>}
            renderRow={(payment) => (
              <tr key={payment.id}>
                <Td num className="bold">
                  {payment.amount_display ?? money(payment.amount, payment.currency || currency)}
                </Td>
                <Td>
                  {payment.invoice ? (
                    <Link to={`/manage/invoices/${payment.invoice}`}>{payment.invoice_detail?.number}</Link>
                  ) : (
                    <span className="muted">Unattached</span>
                  )}
                </Td>
                <Td>{payment.method_display}</Td>
                <Td className="tiny">{dateTimeLabel(payment.created_at)}</Td>
                <Td>
                  <div className="table-actions">
                    <Button size="sm" onClick={() => confirm.execute(payment.id)} pending={confirm.pending}>
                      Confirm
                    </Button>
                    <Button to="/manage/payments" variant="outline" size="sm">
                      Review
                    </Button>
                  </div>
                </Td>
              </tr>
            )}
          />
          {confirm.error ? <p className="field-error">{confirm.error}</p> : null}
        </Panel>

        <Panel
          title={
            isAdmin ? (
              <span className="row" style={{ gap: 8 }}>
                <Inbox size={15} /> New enquiries
              </span>
            ) : (
              <span className="row" style={{ gap: 8 }}>
                <MessageSquare size={15} /> Your inbox
              </span>
            )
          }
          action={
            isAdmin ? (
              <Button to="/manage/enquiries" variant="link" size="sm">
                Open the inbox
              </Button>
            ) : (
              <Button to="/manage/messages" variant="link" size="sm">
                Open messages
              </Button>
            )
          }
        >
          {isAdmin ? (
            <Table
              head={['From', 'Subject', 'Property', 'Received', 'Status']}
              rows={newEnquiryReq.data?.results ?? []}
              loading={newEnquiryReq.loading}
              error={newEnquiryReq.error}
              onRetry={newEnquiryReq.reload}
              empty={<p className="muted small">Nothing new in the enquiry inbox.</p>}
              renderRow={(enquiry) => (
                <tr key={enquiry.id}>
                  <Td>
                    <span className="bold">{enquiry.name}</span>
                    <span className="tiny muted" style={{ display: 'block' }}>
                      {enquiry.email}
                    </span>
                  </Td>
                  <Td className="truncate">{enquiry.subject || '—'}</Td>
                  <Td className="truncate">{enquiry.property_title || 'General'}</Td>
                  <Td className="tiny">{dateTimeLabel(enquiry.created_at)}</Td>
                  <Td>
                    <StatusBadge value={enquiry.status} label={enquiry.status_display} />
                  </Td>
                </tr>
              )}
            />
          ) : (
            <div className="stack stack-sm">
              <p className="muted">
                Landlords can only open threads with the Mant Bridges team. Tenants and property owners reply to the
                desk, and the desk can reach you.
              </p>
              <KeyValue
                items={[
                  { label: 'Tenancies', value: (leaseReq.data?.total ?? 0).toLocaleString() },
                  {
                    label: 'Draft tenancies',
                    value: (leaseReq.data?.by_status?.DRAFT ?? 0).toLocaleString(),
                  },
                ]}
              />
              <Button to="/manage/messages" variant="outline">
                <KeyRound size={15} /> Go to messages
              </Button>
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
