import { useEffect, useState } from 'react'
import { Download, Receipt } from 'lucide-react'
import { downloadReceipt, listReceipts, voidReceipt } from '../../api/billing.js'
import { hasActiveFilters, useList } from '../../hooks/useList.js'
import { useAction } from '../../hooks/useAction.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useLookups } from '../../context/LookupContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { StatusBadge } from '../../components/ui/Badge.jsx'
import { Callout, PageHeader, Panel } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Field, Input, SearchBar, SelectOptions } from '../../components/ui/Form.jsx'
import { Modal } from '../../components/ui/Modal.jsx'
import { Pagination } from '../../components/ui/Pagination.jsx'
import { Td, Table } from '../../components/ui/Table.jsx'
import PropertyLink from '../../components/properties/PropertyLink.jsx'
import { dateLabel } from '../../utils/format.js'

const ORDERING = [
  { value: '-paid_on', label: 'Issued most recently' },
  { value: 'paid_on', label: 'Oldest first' },
  { value: '-amount', label: 'Amount: high to low' },
  { value: 'amount', label: 'Amount: low to high' },
]

/**
 * Receipts are read-only — the API only issues one when a payment is confirmed.
 * Voiding is an administrator action and also rejects the payment behind it.
 */
export default function Receipts({ portal = false }) {
  const { user } = useAuth()
  const { options } = useLookups()
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [voiding, setVoiding] = useState(null)
  const [reason, setReason] = useState('')
  const [showVoid, setShowVoid] = useState(false)

  const list = useList(listReceipts, { ordering: ORDERING[0].value })
  const active = hasActiveFilters(list.filters, ['ordering'])
  const isAdmin = user?.role === 'ADMIN'

  useEffect(() => setSearch(list.filters.q || ''), [list.filters.q])

  const download = useAction(async (receipt) => downloadReceipt(receipt), {
    onDone: () => toast.success('Receipt PDF downloaded.'),
  })

  const voidAction = useAction(
    async () => ({ record: await voidReceipt(voiding.id, reason || undefined) }),
    {
      onDone: (result) => {
        if (!result) return undefined
        toast.success(`Receipt ${result.record.number} voided.`)
        setVoiding(null)
        setReason('')
        list.reload()
        return undefined
      },
    }
  )

  return (
    <div className="stack">
      <PageHeader
        eyebrow={portal ? 'My account' : 'Rent book'}
        title={portal ? 'My receipts' : 'Receipts'}
        lead={
          portal
            ? 'Proof of every payment the desk has confirmed on your account. Download and keep these — they are the record that the money was received.'
            : 'One receipt per confirmed payment. A receipt can only be voided by an administrator, and voiding it also rejects the payment behind it.'
        }
      />

      {download.error || voidAction.error ? <Callout>{download.error || voidAction.error}</Callout> : null}

      <Panel title={portal ? 'Your receipts' : 'All receipts'}>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Receipt, payment or tenant…"
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
            title="Issued from"
          />
          <Input
            kind="date"
            name="date_to"
            value={list.filters.date_to || ''}
            onChange={(value) => list.patchFilters({ date_to: value || undefined }, { keepPage: true })}
            style={{ minWidth: 150 }}
            title="Issued up to"
          />
          <Input
            as="select"
            name="ordering"
            value={list.filters.ordering || ORDERING[0].value}
            onChange={(value) => list.patchFilters({ ordering: value }, { keepPage: true })}
            style={{ minWidth: 190 }}
          >
            <SelectOptions items={ORDERING} />
          </Input>
          {!portal ? (
            <button
              type="button"
              className={`chip chip-button${list.filters.is_void ? ' chip-active' : ''}`}
              onClick={() =>
                list.patchFilters({ is_void: list.filters.is_void ? undefined : 'false' }, { keepPage: true })
              }
            >
              {list.filters.is_void ? 'Valid receipts only' : 'Show voided too'}
            </button>
          ) : null}
          {active ? (
            <button type="button" className="chip chip-button" onClick={list.reset}>
              Clear all
            </button>
          ) : null}
        </div>

        <Table
          head={
            portal
              ? ['Receipt', 'Property', 'Invoice', { label: 'Amount', num: true }, 'Method', 'Paid', 'Status', '']
              : ['Receipt', 'Tenant', 'Property', 'Invoice', { label: 'Amount', num: true }, 'Method', 'Paid', 'Status', '']
          }
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          empty={
            <div className="empty">
              <Receipt size={26} />
              <h3>{portal ? 'No receipts yet' : 'No receipts match this view'}</h3>
              <p className="muted">
                {portal
                  ? 'A receipt is produced as soon as the desk confirms one of your payments.'
                  : 'Receipts are generated automatically when a pending payment is confirmed.'}
              </p>
            </div>
          }
          renderRow={(receipt) => (
            <tr key={receipt.id}>
              <Td>
                <span className="bold">{receipt.number}</span>
                <span className="tiny muted" style={{ display: 'block' }}>
                  {receipt.payment_number}
                </span>
              </Td>
              {portal ? null : <Td className="truncate">{receipt.tenant_name}</Td>}
              <Td className="truncate">
                {portal ? (
                  receipt.property_title || '—'
                ) : (
                  <PropertyLink
                    slug={receipt.property_slug}
                    title={receipt.property_title}
                    fallback="—"
                  />
                )}
              </Td>
              <Td>
                <span className="semi">{receipt.invoice_number || '—'}</span>
                {receipt.lease_number ? (
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {receipt.lease_number}
                  </span>
                ) : null}
              </Td>
              <Td num className="bold">
                {receipt.amount_display}
              </Td>
              <Td className="tiny">{receipt.method_display}</Td>
              <Td className="tiny">{dateLabel(receipt.paid_on)}</Td>
              <Td>
                <StatusBadge value={receipt.is_void ? 'REJECTED' : 'CONFIRMED'} label={receipt.is_void ? 'Void' : 'Valid'} />
                {receipt.is_void && receipt.void_reason ? (
                  <span className="tiny" style={{ display: 'block', color: 'var(--red-600)' }}>
                    {receipt.void_reason}
                  </span>
                ) : null}
              </Td>
              <Td num>
                <div className="table-actions">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => download.execute(receipt)}
                    disabled={download.pending}
                  >
                    <Download size={13} /> PDF
                  </button>
                  {!portal && isAdmin && !receipt.is_void ? (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        setVoiding(receipt)
                        setReason('')
                        setShowVoid(true)
                      }}
                    >
                      Void
                    </button>
                  ) : null}
                </div>
              </Td>
            </tr>
          )}
        />

        <Pagination
          page={list.page}
          pageCount={list.pageCount}
          total={list.count}
          onChange={list.setPage}
          noun="receipt"
        />

        {!portal ? (
          <p className="muted small">
            Signed in as {user?.full_name}. {isAdmin
              ? 'You can void a receipt; the payment behind it is rejected at the same time so the books stay honest.'
              : 'Landlords can download receipts but only an administrator can void one.'}
          </p>
        ) : null}
      </Panel>

      <Modal
        open={showVoid && Boolean(voiding)}
        title={voiding ? `Void ${voiding.number}` : 'Void receipt'}
        onClose={() => setShowVoid(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setShowVoid(false)} disabled={voidAction.pending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              pending={voidAction.pending}
              onClick={() => voidAction.execute()}
            >
              {voidAction.pending ? 'Working…' : 'Void receipt'}
            </Button>
          </>
        }
      >
        {voiding ? (
          <div className="stack">
            <Callout>
              Voiding {voiding.number} ({voiding.amount_display}) also rejects payment{' '}
              {voiding.payment_number}. The invoice balance goes back to what it was before the payment was confirmed,
              and the tenant sees the reason you enter here.
            </Callout>
            <Field name="reason" label="Reason" hint="Required in practice — it is stored on the receipt and the payment.">
              <Input as="textarea" name="reason" rows={3} value={reason} onChange={setReason} />
            </Field>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
