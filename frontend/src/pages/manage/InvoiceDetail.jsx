import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, BellRing, Download, Pencil, PlusCircle, Wallet } from 'lucide-react'
import {
  applyLateFee,
  downloadInvoicePdf,
  invoiceById,
  listPayments,
  remindInvoice,
} from '../../api/billing.js'
import { useApi } from '../../hooks/useApi.js'
import { useAction } from '../../hooks/useAction.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useLookups } from '../../context/LookupContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import InvoiceTotals from '../../components/billing/InvoiceTotals.jsx'
import PaymentModal from '../../components/billing/PaymentModal.jsx'
import InvoiceFormModal from '../../components/billing/InvoiceFormModal.jsx'
import { InvoiceBadge, StatusBadge } from '../../components/ui/Badge.jsx'
import { Breadcrumb, Callout, KeyValue, PageHeader, Panel } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { ConfirmDialog } from '../../components/ui/Modal.jsx'
import { ErrorState, Loading } from '../../components/ui/Feedback.jsx'
import { Td, Table } from '../../components/ui/Table.jsx'
import { dateLabel, dateTimeLabel, money } from '../../utils/format.js'

export default function InvoiceDetail({ portal = false }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { company } = useLookups()
  const toast = useToast()

  const [payOpen, setPayOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [remindOpen, setRemindOpen] = useState(false)
  const [lateOpen, setLateOpen] = useState(false)

  const request = useApi(() => invoiceById(id), [id])
  const payments = useApi(() => listPayments({ invoice: id }), [id])

  const pdf = useAction(async () => downloadInvoicePdf(request.data), {
    onDone: () => toast.success('PDF downloaded.'),
  })

  const remind = useAction(
    async () => {
      const result = await remindInvoice(id)
      request.reload()
      return result
    },
    {
      onDone: (result) => {
        toast.success(result.detail)
        setRemindOpen(false)
      },
    }
  )

  const lateFee = useAction(
    async () => {
      const updated = await applyLateFee(id)
      request.setData(updated)
      return updated
    },
    {
      onDone: () => {
        toast.success('Late fee added to the invoice.')
        setLateOpen(false)
      },
    }
  )

  if (request.loading && !request.data) return <Loading label="Opening the invoice…" />
  if (request.error) {
    return (
      <ErrorState
        error={request.error}
        onRetry={request.reload}
        title="This invoice could not be read"
      />
    )
  }

  const invoice = request.data
  if (!invoice) return null

  const currency = invoice.currency || company?.currency || 'UGX'
  const rows = payments.data?.results ?? payments.data ?? []
  const received = Number(invoice.amount_paid)
  const outstanding = Number(invoice.balance)

  return (
    <div className="stack">
      <Breadcrumb
        items={[
          { label: portal ? 'Portal' : 'Dashboard', to: portal ? '/portal' : '/manage' },
          { label: 'Invoices', to: portal ? '/portal/invoices' : '/manage/invoices' },
          { label: invoice.number },
        ]}
      />

      <PageHeader
        eyebrow={`Issued ${dateLabel(invoice.issue_date || invoice.created_at)}`}
        title={invoice.number}
        lead={`${invoice.tenant_name} · ${invoice.property_title} · ${invoice.period_label}`}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(portal ? '/portal/invoices' : '/manage/invoices')}>
              <ArrowLeft size={15} /> Back
            </Button>
            <Button onClick={pdf.execute} pending={pdf.pending}>
              <Download size={15} /> PDF
            </Button>
            {portal ? null : (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil size={15} /> Edit charges
              </Button>
            )}
            {outstanding > 0 ? (
              <Button onClick={() => setPayOpen(true)}>
                <Wallet size={15} /> {portal ? 'Report a payment' : 'Record payment'}
              </Button>
            ) : null}
          </>
        }
      />

      {pdf.error || remind.error || lateFee.error ? <Callout>{pdf.error || remind.error || lateFee.error}</Callout> : null}

      <div className="split">
        <div className="stack">
          <Panel
            title="What is charged"
            action={<InvoiceBadge invoice={invoice} />}
            footer={
              <div className="row-between">
                <span className="muted small">
                  {received > 0 && outstanding > 0
                    ? `Part paid — ${invoice.amount_paid_display} received so far.`
                    : outstanding > 0
                      ? `${invoice.balance_display} still owing.`
                      : 'Settled in full.'}
                </span>
                <span className="muted small">Due {dateLabel(invoice.due_date)}</span>
              </div>
            }
          >
            <InvoiceTotals invoice={invoice} />
          </Panel>

          <Panel
            title="Payments against this invoice"
            action={
              <span className="muted small">
                {invoice.reminder_count ?? 0} reminder{(invoice.reminder_count ?? 0) === 1 ? '' : 's'} sent
              </span>
            }
          >
            <Table
              head={['Reference', { label: 'Amount', num: true }, 'Method', 'Paid on', 'Status', 'Receipt']}
              rows={Array.isArray(rows) ? rows : []}
              loading={payments.loading}
              error={payments.error}
              onRetry={payments.reload}
              empty={<p className="muted small">Nothing has been recorded against this invoice yet.</p>}
              renderRow={(payment) => (
                <tr key={payment.id}>
                  <Td>
                    <span className="bold">{payment.number}</span>
                    {payment.reference ? (
                      <span className="tiny muted" style={{ display: 'block' }}>
                        ref {payment.reference}
                      </span>
                    ) : null}
                  </Td>
                  <Td num>{payment.amount_display ?? money(payment.amount, payment.currency || currency)}</Td>
                  <Td>{payment.method_display}</Td>
                  <Td className="tiny">{dateLabel(payment.paid_on)}</Td>
                  <Td>
                    <StatusBadge value={payment.status} label={payment.status_display} />
                    {payment.rejection_reason ? (
                      <span className="tiny" style={{ display: 'block', color: 'var(--red-600)' }}>
                        {payment.rejection_reason}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="tiny">
                    {payment.receipt_number ? (
                      portal ? null : <Link to="/manage/receipts">{payment.receipt_number}</Link>
                    ) : (
                      '—'
                    )}
                  </Td>
                </tr>
              )}
            />
            <p className="hint">
              A payment only moves the balance once the desk confirms it. Pending rows are listed for transparency and
              are not counted as received.
            </p>
          </Panel>

          {invoice.notes ? (
            <Panel title="Note to the tenant">
              <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{invoice.notes}</p>
            </Panel>
          ) : null}
        </div>

        <aside className="sticky-side stack">
          <Panel title="Record">
            <KeyValue
              items={[
                { label: 'Invoice number', value: invoice.number },
                { label: 'Tenancy', value: invoice.lease_number },
                {
                  label: 'Property',
                  value: invoice.property_slug ? (
                    <Link to={portal ? '/portal/leases' : `/properties/${invoice.property_slug}`}>
                      {invoice.property_title}
                    </Link>
                  ) : (
                    invoice.property_title
                  ),
                },
                { label: 'Tenant', value: invoice.tenant_name },
                { label: 'Billed by', value: invoice.landlord_name },
                { label: 'Period', value: invoice.period_label },
                { label: 'Issued', value: dateLabel(invoice.issue_date) },
                { label: 'Due', value: dateLabel(invoice.due_date) },
                invoice.is_overdue ? { label: 'Days overdue', value: invoice.days_overdue } : null,
                { label: 'Currency', value: invoice.currency },
                { label: 'Last updated', value: dateTimeLabel(invoice.updated_at) },
              ].filter(Boolean)}
            />
          </Panel>

          {!portal && outstanding > 0 ? (
            <Panel title="Desk actions">
              <div className="stack stack-sm">
                <Button block variant="outline" onClick={() => setRemindOpen(true)}>
                  <BellRing size={15} /> Send a rent reminder
                </Button>
                <Button block variant="outline" onClick={() => setLateOpen(true)} disabled={!invoice.is_overdue}>
                  <PlusCircle size={15} /> Apply the late fee
                </Button>
                {!invoice.is_overdue ? (
                  <p className="hint">A late fee can only be added once the due date has passed.</p>
                ) : null}
                <p className="hint">
                  The reminder is delivered as a message in the tenant&apos;s inbox — the platform does not send email
                  yet.
                </p>
              </div>
            </Panel>
          ) : null}

          {portal ? (
            <Panel title="How to pay">
              <div className="stack stack-sm">
                <p className="muted small" style={{ margin: 0, whiteSpace: 'pre-line' }}>
                  {company?.payment_instructions ||
                    'Contact the desk for payment instructions. Rent is collected by bank transfer, mobile money or in cash.'}
                </p>
                {company?.bank_name ? (
                  <KeyValue
                    items={[
                      { label: 'Bank', value: company.bank_name },
                      { label: 'Account name', value: company.bank_account_name },
                      { label: 'Account number', value: company.bank_account_number },
                      { label: 'Branch', value: company.bank_branch },
                      { label: 'Mobile money', value: company.mobile_money_number },
                    ]}
                  />
                ) : null}
                <Callout>
                  Quote <strong>{invoice.number}</strong> as your payment reference, then report the payment with its
                  transaction reference so the desk can match it and issue your receipt.
                </Callout>
              </div>
            </Panel>
          ) : (
            <Panel title="Collection trail">
              <KeyValue
                items={[
                  { label: 'Reminders sent', value: invoice.reminder_count ?? 0 },
                  { label: 'Last reminder', value: invoice.last_reminder_at ? dateTimeLabel(invoice.last_reminder_at) : 'none' },
                  { label: 'Payments recorded', value: (Array.isArray(rows) ? rows.length : 0).toLocaleString() },
                  { label: 'User', value: `${user?.full_name} (${user?.role})` },
                ]}
              />
            </Panel>
          )}
        </aside>
      </div>

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        defaultInvoiceId={invoice.id}
        onDone={() => {
          setPayOpen(false)
          request.reload()
          payments.reload()
        }}
      />

      {!portal ? (
        <InvoiceFormModal
          open={editOpen}
          invoice={invoice}
          onClose={() => setEditOpen(false)}
          onDone={(updated) => {
            setEditOpen(false)
            if (updated) request.setData(updated)
            payments.reload()
          }}
        />
      ) : null}

      <ConfirmDialog
        open={remindOpen}
        title="Send a reminder?"
        message={`Mant Bridges will post a rent reminder about ${invoice.number} into ${invoice.tenant_name}'s inbox.`}
        detail={<span>It raises no charge and does not change the balance — it is a written nudge only.</span>}
        confirmLabel="Send reminder"
        pending={remind.pending}
        onConfirm={() => remind.execute()}
        onClose={() => setRemindOpen(false)}
      />

      <ConfirmDialog
        open={lateOpen}
        title="Apply the late fee?"
        message={`The company late-fee rule adds a charge to ${invoice.number} and increases the balance.`}
        detail={
          <span>
            {`Balance before: ${invoice.balance_display}. The amount comes from the company settings (${
              company?.late_fee_type === 'PERCENT'
                ? `${company?.late_fee_percent}% of rent`
                : company?.late_fee_type === 'FLAT'
                  ? `${money(company?.late_fee_flat, currency)} flat`
                  : 'no late fee configured'
            }).`}
          </span>
        }
        confirmLabel="Add late fee"
        danger
        pending={lateFee.pending}
        onConfirm={() => lateFee.execute()}
        onClose={() => setLateOpen(false)}
      />
    </div>
  )
}
