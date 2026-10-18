import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Download, FileText, Plus, RefreshCw, Wallet } from 'lucide-react'
import {
  INVOICE_ORDERING,
  downloadInvoicePdf,
  generateInvoices,
  invoiceSummary,
  listInvoices,
} from '../../api/billing.js'
import { useList, hasActiveFilters } from '../../hooks/useList.js'
import { useApi } from '../../hooks/useApi.js'
import { useAction } from '../../hooks/useAction.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useLookups } from '../../context/LookupContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import PaymentModal from '../../components/billing/PaymentModal.jsx'
import InvoiceFormModal from '../../components/billing/InvoiceFormModal.jsx'
import { InvoiceBadge } from '../../components/ui/Badge.jsx'
import { Callout, PageHeader, Panel, Stat, Tabs } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Input, SearchBar, SelectOptions } from '../../components/ui/Form.jsx'
import { ConfirmDialog } from '../../components/ui/Modal.jsx'
import { Pagination } from '../../components/ui/Pagination.jsx'
import { Td, Table } from '../../components/ui/Table.jsx'
import PropertyLink from '../../components/properties/PropertyLink.jsx'
import { dateLabel, money } from '../../utils/format.js'

const FILTER_KEYS = ['q', 'status', 'outstanding', 'overdue', 'lease', 'tenant', 'property', 'year', 'ordering']

export default function Invoices({ portal = false }) {
  const location = useLocation()
  const { user } = useAuth()
  const { options, company } = useLookups()
  const toast = useToast()
  const base = portal ? '/portal/invoices' : '/manage/invoices'

  const [search, setSearch] = useState('')
  const [payOpen, setPayOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)

  const initial = useMemo(() => filtersFromSearch(location.search), [location.search])
  const list = useList(listInvoices, initial)
  const summary = useApi(() => invoiceSummary(), [])
  const active = hasActiveFilters(list.filters, ['ordering'])
  const currency = company?.currency || 'UGX'

  useEffect(() => setSearch(list.filters.q || ''), [list.filters.q])

  const generate = useAction(
    async () => {
      const result = await generateInvoices()
      list.reload()
      summary.reload()
      return result
    },
    {
      onDone: (result) => {
        toast.success(result.detail)
        setGenerateOpen(false)
      },
    }
  )

  const download = useAction(async (invoice) => downloadInvoicePdf(invoice), {
    onDone: () => toast.success('Invoice PDF downloaded.'),
  })

  const tabValue = list.filters.overdue === 'true'
    ? 'overdue'
    : list.filters.outstanding === 'true'
      ? 'outstanding'
      : list.filters.status || 'all'

  const setTab = (value) => {
    if (value === 'all') list.setFilters({ ...list.filters, status: undefined, outstanding: undefined, overdue: undefined })
    else if (value === 'outstanding') list.setFilters({ ...list.filters, outstanding: 'true', overdue: undefined, status: undefined })
    else if (value === 'overdue') list.setFilters({ ...list.filters, overdue: 'true', outstanding: undefined, status: undefined })
    else list.setFilters({ ...list.filters, status: value, outstanding: undefined, overdue: undefined })
  }

  const tabs = [
    { value: 'all', label: 'All' },
    { value: 'outstanding', label: 'Outstanding', count: summary.data?.outstanding_count },
    { value: 'overdue', label: 'Overdue', count: summary.data?.overdue_count },
    { value: 'PAID', label: 'Paid' },
    { value: 'DRAFT', label: 'Draft' },
  ]

  return (
    <div className="stack">
      <PageHeader
        eyebrow={portal ? 'My account' : 'Rent book'}
        title={portal ? 'My invoices' : 'Invoices'}
        lead={
          portal
            ? 'Every charge raised on your tenancy. Balances and due dates are calculated by Mant Bridges — what you see is what the books show.'
            : 'Charges raised against tenancies. Totals, tax, balances and overdue status are all computed by the server.'
        }
        actions={
          portal ? (
            <Button onClick={() => setPayOpen(true)}>
              <Wallet size={15} /> Report a payment
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setGenerateOpen(true)}>
                <RefreshCw size={15} /> Run invoicing
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus size={15} /> New invoice
              </Button>
            </>
          )
        }
      />

      {summary.data ? (
        <div className="grid grid-4">
          <Stat
            label="Charged"
            value={money(summary.data.total, currency)}
            foot={`${(summary.data.count ?? 0).toLocaleString()} invoices`}
          />
          <Stat label="Collected" value={money(summary.data.collected, currency)} tone="ok" />
          <Stat
            label="Outstanding"
            value={money(summary.data.outstanding_total, currency)}
            foot={`${summary.data.outstanding_count ?? 0} open invoices`}
            tone="warn"
          />
          <Stat
            label="Past due date"
            value={(summary.data.overdue_count ?? 0).toLocaleString()}
            foot={`${summary.data.due_this_month ?? 0} due this month`}
          />
        </div>
      ) : null}

      {generate.error || download.error ? <Callout>{generate.error || download.error}</Callout> : null}

      <Panel title={portal ? 'Your invoices' : 'All invoices'}>
        <Tabs tabs={tabs} active={tabValue} onChange={setTab} />

        <div className="row" style={{ gap: 10, flexWrap: 'wrap', margin: '14px 0' }}>
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Number, tenant or property…"
            onSubmit={() => list.patchFilters({ q: search })}
            buttonLabel="Search"
          />
          <Input
            as="select"
            name="ordering"
            value={list.filters.ordering || INVOICE_ORDERING[0].value}
            onChange={(value) => list.patchFilters({ ordering: value }, { keepPage: true })}
            style={{ minWidth: 200 }}
          >
            <SelectOptions items={INVOICE_ORDERING} />
          </Input>
          {list.filters.lease || list.filters.tenant || list.filters.property ? (
            <button
              type="button"
              className="chip chip-button"
              onClick={() => list.patchFilters({ lease: undefined, tenant: undefined, property: undefined })}
            >
              Scoped filter active — clear
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
              ? ['Invoice', 'Property', 'Period', 'Due', { label: 'Total', num: true }, { label: 'Balance', num: true }, 'Status', '']
              : ['Invoice', 'Tenant', 'Property', 'Period', 'Due', { label: 'Total', num: true }, { label: 'Paid', num: true }, { label: 'Balance', num: true }, 'Status', '']
          }
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          empty={
            <div className="empty">
              <h3>{portal ? 'No invoices yet' : 'Nothing matches this view'}</h3>
              <p className="muted">
                {portal
                  ? 'Invoices appear here once your tenancy is active and a billing period has started.'
                  : 'Try another tab, or clear the filters.'}
              </p>
            </div>
          }
          renderRow={(invoice) => (
            <tr key={invoice.id}>
              <Td>
                <Link to={`${base}/${invoice.id}`} className="bold">
                  {invoice.number}
                </Link>
                <span className="tiny muted" style={{ display: 'block' }}>
                  {invoice.lease_number}
                </span>
              </Td>
              {portal ? null : (
                <Td>
                  {invoice.tenant_name}
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {invoice.landlord_name}
                  </span>
                </Td>
              )}
              <Td className="truncate">
                {portal ? (
                  invoice.property_title
                ) : (
                  <PropertyLink slug={invoice.property_slug} title={invoice.property_title} />
                )}
              </Td>
              <Td className="tiny">{invoice.period_label}</Td>
              <Td className="tiny">
                {dateLabel(invoice.due_date)}
                {invoice.is_overdue ? (
                  <span className="tiny" style={{ display: 'block', color: 'var(--red-600)' }}>
                    {invoice.days_overdue} days late
                  </span>
                ) : null}
              </Td>
              <Td num>{invoice.total_display}</Td>
              {portal ? null : <Td num>{invoice.amount_paid_display}</Td>}
              <Td num className="bold">
                {invoice.balance_display}
              </Td>
              <Td>
                <InvoiceBadge invoice={invoice} />
              </Td>
              <Td num>
                <div className="table-actions">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm btn-icon"
                    title="Download PDF"
                    onClick={() => download.execute(invoice)}
                    disabled={download.pending}
                  >
                    <Download size={14} />
                  </button>
                  {Number(invoice.balance) > 0 ? (
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setPayOpen(true)}>
                      <FileText size={13} /> {portal ? 'Pay' : 'Record'}
                    </button>
                  ) : null}
                </div>
              </Td>
            </tr>
          )}
        />

        <Pagination page={list.page} pageCount={list.pageCount} total={list.count} onChange={list.setPage} noun="invoice" />

        {portal ? (
          <Callout tone="navy">
            Pay by bank transfer, mobile money or in cash, then report the payment here with its reference. Online
            collection is not switched on — nothing is charged from this screen, and a reported payment stays pending
            until the desk confirms it and issues a receipt.
          </Callout>
        ) : (
          <p className="muted small">
            Signed in as {user?.full_name}. The list is limited to {user?.role === 'ADMIN' ? 'all tenancies' : 'your own tenancies'} by the API.
          </p>
        )}
      </Panel>

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        onDone={() => {
          setPayOpen(false)
          list.reload()
          summary.reload()
        }}
      />

      {!portal ? (
        <InvoiceFormModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onDone={() => {
            setCreateOpen(false)
            list.reload()
            summary.reload()
          }}
        />
      ) : null}

      <ConfirmDialog
        open={generateOpen}
        title="Bring the rent book up to date?"
        message="Every active tenancy in your scope is checked and any unbilled period up to today is invoiced."
        detail={
          <span>
            Periods that already have an invoice are skipped, so this is safe to run on the first working day of each
            month.
          </span>
        }
        confirmLabel="Generate invoices"
        pending={generate.pending}
        onConfirm={() => generate.execute()}
        onClose={() => setGenerateOpen(false)}
      />
    </div>
  )
}

function filtersFromSearch(searchString) {
  const params = new URLSearchParams(searchString)
  const out = { ordering: INVOICE_ORDERING[0].value }
  FILTER_KEYS.forEach((key) => {
    const value = params.get(key)
    if (value) out[key] = value
  })
  return out
}
