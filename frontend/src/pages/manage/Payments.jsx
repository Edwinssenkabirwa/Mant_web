import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Inbox, Wallet, X } from 'lucide-react'
import {
  PAYMENT_ORDERING,
  confirmPayment,
  listPayments,
  paymentSummary,
  rejectPayment,
} from '../../api/billing.js'
import { hasActiveFilters, useList } from '../../hooks/useList.js'
import { useApi } from '../../hooks/useApi.js'
import { useAction } from '../../hooks/useAction.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useLookups } from '../../context/LookupContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import PaymentModal from '../../components/billing/PaymentModal.jsx'
import { StatusBadge } from '../../components/ui/Badge.jsx'
import { Callout, PageHeader, Panel, Stat, Tabs } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Field, Input, SearchBar, SelectOptions } from '../../components/ui/Form.jsx'
import { Modal } from '../../components/ui/Modal.jsx'
import { Pagination } from '../../components/ui/Pagination.jsx'
import { Td, Table } from '../../components/ui/Table.jsx'
import { dateLabel, money } from '../../utils/format.js'

/**
 * Rent money in. New entries stay PENDING until a landlord or administrator
 * confirms them — confirming is what issues the receipt and moves the invoice.
 */
export default function Payments({ portal = false }) {
  const { user } = useAuth()
  const { options, company } = useLookups()
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [recordOpen, setRecordOpen] = useState(false)
  const [rejecting, setRejecting] = useState(null)
  const [reason, setReason] = useState('')

  const list = useList(listPayments, { ordering: PAYMENT_ORDERING[0].value })
  const summary = useApi(() => paymentSummary(), [])
  const active = hasActiveFilters(list.filters, ['ordering'])
  const currency = company?.currency || 'UGX'

  useEffect(() => setSearch(list.filters.q || ''), [list.filters.q])

  const decide = useAction(
    async (payment, confirming) =>
      confirming
        ? { confirming: true, record: await confirmPayment(payment.id) }
        : { confirming: false, record: await rejectPayment(payment.id, reason || undefined) },
    {
      onDone: (result) => {
        if (!result) return undefined
        list.reload()
        summary.reload()
        if (result.confirming) {
          toast.success(
            result.record?.receipt
              ? `Confirmed. Receipt ${result.record.receipt.number} issued.`
              : 'Payment confirmed.'
          )
          return undefined
        }
        toast.success('Payment rejected. The tenant can report it again.')
        setRejecting(null)
        setReason('')
        return undefined
      },
    }
  )

  const tabValue = list.filters.status || (portal ? 'all' : 'PENDING')
  const setTab = (value) =>
    list.setFilters({ ...list.filters, status: value === 'all' ? undefined : value })

  const tabs = portal
    ? [
        { value: 'all', label: 'All' },
        { value: 'PENDING', label: 'Awaiting confirmation', count: summary.data?.pending_count },
        { value: 'CONFIRMED', label: 'Confirmed' },
        { value: 'REJECTED', label: 'Rejected' },
      ]
    : [
        { value: 'PENDING', label: 'To review', count: summary.data?.pending_count },
        { value: 'CONFIRMED', label: 'Confirmed' },
        { value: 'REJECTED', label: 'Rejected', count: summary.data?.rejected_count },
        { value: 'all', label: 'All' },
      ]

  return (
    <div className="stack">
      <PageHeader
        eyebrow={portal ? 'My account' : 'Rent book'}
        title={portal ? 'My payments' : 'Payments'}
        lead={
          portal
            ? 'Every payment you have reported on your tenancy. An entry counts as settled only once the Mant Bridges desk confirms it.'
            : 'Money reported against invoices. Nothing here takes payment online — this is the confirmation queue for transfers, mobile money and cash.'
        }
        actions={
          <Button onClick={() => setRecordOpen(true)}>
            <Wallet size={15} /> {portal ? 'Report a payment' : 'Record a payment'}
          </Button>
        }
      />

      {summary.data ? (
        <div className="grid grid-4">
          <Stat
            label="Confirmed"
            value={money(summary.data.confirmed_total, currency)}
            foot={`${summary.data.confirmed_count ?? 0} payments`}
            tone="ok"
          />
          <Stat
            label="Awaiting review"
            value={money(summary.data.pending_total, currency)}
            foot={`${summary.data.pending_count ?? 0} pending`}
            tone="warn"
          />
          <Stat label="This month" value={money(summary.data.this_month, currency)} />
          <Stat
            label="Rejected"
            value={(summary.data.rejected_count ?? 0).toLocaleString()}
            foot={`${summary.data.count ?? 0} entries in scope`}
          />
        </div>
      ) : null}

      {decide.error ? <Callout>{decide.error}</Callout> : null}

      <Panel title={portal ? 'Your payment history' : 'Payment queue'}>
        <Tabs tabs={tabs} active={tabValue} onChange={setTab} />

        <div className="row" style={{ gap: 10, flexWrap: 'wrap', margin: '14px 0' }}>
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Reference, payer or invoice…"
            onSubmit={() => list.patchFilters({ q: search })}
            buttonLabel="Search"
          />
          <Input
            as="select"
            name="method"
            value={list.filters.method || ''}
            onChange={(value) => list.patchFilters({ method: value || undefined }, { keepPage: true })}
            style={{ minWidth: 160 }}
          >
            <SelectOptions items={options?.payment_methods || []} placeholder="Any method" />
          </Input>
          <Input
            kind="date"
            name="date_from"
            value={list.filters.date_from || ''}
            onChange={(value) => list.patchFilters({ date_from: value || undefined }, { keepPage: true })}
            style={{ minWidth: 150 }}
            title="Paid from"
          />
          <Input
            kind="date"
            name="date_to"
            value={list.filters.date_to || ''}
            onChange={(value) => list.patchFilters({ date_to: value || undefined }, { keepPage: true })}
            style={{ minWidth: 150 }}
            title="Paid up to"
          />
          <Input
            as="select"
            name="ordering"
            value={list.filters.ordering || PAYMENT_ORDERING[0].value}
            onChange={(value) => list.patchFilters({ ordering: value }, { keepPage: true })}
            style={{ minWidth: 190 }}
          >
            <SelectOptions items={PAYMENT_ORDERING} />
          </Input>
          {active ? (
            <button type="button" className="chip chip-button" onClick={list.reset}>
              Clear all
            </button>
          ) : null}
        </div>

        <Table
          head={
            portal
              ? ['Payment', 'Invoice', { label: 'Amount', num: true }, 'Method', 'Paid', 'Status', '']
              : ['Payment', 'Who paid', 'Invoice', 'Property', { label: 'Amount', num: true }, 'Method', 'Paid', 'Status', '']
          }
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          empty={
            <div className="empty">
              <Inbox size={26} />
              <h3>{portal ? 'No payments reported yet' : 'Nothing in this queue'}</h3>
              <p className="muted">
                {portal
                  ? 'When you report a payment against an invoice it appears here, pending confirmation.'
                  : 'Payments reported by tenants or entered by the desk appear here for review.'}
              </p>
            </div>
          }
          renderRow={(payment) => (
            <tr key={payment.id}>
              <Td>
                <span className="bold">{payment.number}</span>
                {payment.payer_name ? (
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {payment.payer_name}
                  </span>
                ) : null}
                {payment.reference ? (
                  <span className="tiny muted" style={{ display: 'block' }}>
                    Ref {payment.reference}
                  </span>
                ) : null}
              </Td>
              {portal ? null : (
                <Td className="truncate">{payment.tenant_name}</Td>
              )}
              <Td>
                {payment.invoice ? (
                  <Link
                    to={`${portal ? '/portal/invoices' : '/manage/invoices'}/${payment.invoice}`}
                    className="semi"
                  >
                    {payment.invoice_detail?.number || payment.invoice}
                  </Link>
                ) : (
                  <span className="muted">No invoice linked</span>
                )}
              </Td>
              {portal ? null : <Td className="truncate">{payment.property_title}</Td>}
              <Td num className="bold">
                {payment.amount_display}
              </Td>
              <Td className="tiny">{payment.method_display}</Td>
              <Td className="tiny">{dateLabel(payment.paid_on)}</Td>
              <Td>
                <StatusBadge value={payment.status} label={payment.status_display} />
                {payment.status === 'REJECTED' && payment.rejection_reason ? (
                  <span className="tiny" style={{ display: 'block', color: 'var(--red-600)' }}>
                    {payment.rejection_reason}
                  </span>
                ) : null}
                {payment.receipt_number ? (
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {payment.receipt_number}
                  </span>
                ) : null}
              </Td>
              <Td num>
                {!portal && payment.status === 'PENDING' ? (
                  <div className="table-actions">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => decide.execute(payment, true)}
                      disabled={decide.pending}
                    >
                      <Check size={13} /> Confirm
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        setRejecting(payment)
                        setReason('')
                      }}
                      disabled={decide.pending}
                    >
                      <X size={13} /> Reject
                    </button>
                  </div>
                ) : null}
              </Td>
            </tr>
          )}
        />

        <Pagination
          page={list.page}
          pageCount={list.pageCount}
          total={list.count}
          onChange={list.setPage}
          noun="payment"
        />

        {portal ? (
          <Callout tone="navy">
            Pay by bank transfer, mobile money or in cash using the instructions on the company page, then report the
            payment with its reference. Reported entries stay pending until the desk confirms them; only a confirmed
            payment produces a receipt and reduces an invoice balance.
          </Callout>
        ) : (
          <p className="muted small">
            Signed in as {user?.full_name}. Confirming applies the money to the invoice and issues a receipt; rejecting
            leaves the invoice untouched and tells the tenant why.
          </p>
        )}
      </Panel>

      <PaymentModal
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        onDone={() => {
          setRecordOpen(false)
          list.reload()
          summary.reload()
        }}
      />

      <Modal
        open={Boolean(rejecting)}
        title={rejecting ? `Reject ${rejecting.number}` : 'Reject payment'}
        onClose={() => setRejecting(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setRejecting(null)} disabled={decide.pending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              pending={decide.pending}
              onClick={() => decide.execute(rejecting, false)}
            >
              {decide.pending ? 'Working…' : 'Reject payment'}
            </Button>
          </>
        }
      >
        {rejecting ? (
          <div className="stack">
            <p className="soft">
              {rejecting.amount_display} reported by {rejecting.tenant_name || 'the tenant'} against{' '}
              {rejecting.invoice_detail?.number || 'an invoice'}. Rejecting does not change the invoice balance — it
              marks this report as unverified.
            </p>
            <Field
              name="reason"
              label="Reason"
              hint="Shown to the tenant on the payment, e.g. no matching transfer on the bank statement."
            >
              <Input as="textarea" name="reason" rows={3} value={reason} onChange={setReason} />
            </Field>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
