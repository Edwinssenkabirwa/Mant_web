import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import { INVOICE_ORDERING, invoiceSummary, listInvoices } from '../../api/billing.js'
import { useApi } from '../../hooks/useApi.js'
import { useList } from '../../hooks/useList.js'
import { useLookups } from '../../context/LookupContext.jsx'
import { Callout, PageHeader, Panel, Stat } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Input, SelectOptions } from '../../components/ui/Form.jsx'
import ReminderDialog from '../../components/billing/ReminderDialog.jsx'
import { Pagination } from '../../components/ui/Pagination.jsx'
import { Td, Table } from '../../components/ui/Table.jsx'
import PropertyLink from '../../components/properties/PropertyLink.jsx'
import { dateLabel, money } from '../../utils/format.js'

/**
 * Working down the rent book. The list is the server's own overdue filter, oldest due date first,
 * so the desk chases the longest-standing debt before the newest one. Whether a chat can be opened
 * is read from the number already on the tenant's account — this screen never repairs or invents
 * a number, and it never claims a reminder reached anybody.
 */
export default function RentReminders() {
  const [target, setTarget] = useState(null)
  const { company } = useLookups()

  const list = useList(listInvoices, { overdue: 'true', ordering: INVOICE_ORDERING[1].value })
  const summary = useApi(() => invoiceSummary({ overdue: 'true' }), [])

  const currency = company?.currency || 'UGX'
  const undialable = list.rows.filter((invoice) => !invoice.whatsapp_number).length

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Rent book"
        title="Arrears reminders"
        lead="Every invoice past its due date with money still owing, oldest first. Confirming writes the reminder into the tenant's inbox and hands your browser a WhatsApp chat to send."
      />

      {summary.data ? (
        <div className="grid grid-4">
          <Stat
            label="In arrears"
            value={(summary.data.overdue_count ?? 0).toLocaleString()}
            foot="invoices past the due date"
          />
          <Stat label="Still owing" value={money(summary.data.outstanding_total, currency)} tone="warn" />
          <Stat label="Billed on them" value={money(summary.data.total, currency)} />
          <Stat label="Recovered" value={money(summary.data.collected, currency)} tone="ok" />
        </div>
      ) : null}

      <Panel title="The arrears">
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', margin: '0 0 14px' }}>
          <Input
            as="select"
            name="ordering"
            value={list.filters.ordering || INVOICE_ORDERING[1].value}
            onChange={(value) => list.patchFilters({ ordering: value }, { keepPage: true })}
            style={{ minWidth: 220 }}
          >
            <SelectOptions items={INVOICE_ORDERING} />
          </Input>
          <span className="tiny muted">
            {(list.count ?? 0).toLocaleString()} overdue invoice{(list.count ?? 0) === 1 ? '' : 's'} in the book.
            {undialable > 0 ? ` ${undialable} on this page have no dialable number.` : ''}
          </span>
        </div>

        <Table
          head={['Tenant', 'Property', 'Due', { label: 'Owing', num: true }, 'Chased before', 'WhatsApp', '']}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          empty={
            <div className="empty">
              <h3>Nothing is overdue</h3>
              <p className="muted">
                Every invoice in the rent book is either paid or has not yet passed its due date.
              </p>
            </div>
          }
          renderRow={(invoice) => (
            <tr key={invoice.id}>
              <Td>
                <Link to={`/manage/invoices/${invoice.id}`} className="bold">
                  {invoice.tenant_name}
                </Link>
                <span className="tiny muted" style={{ display: 'block' }}>
                  {invoice.tenant_detail?.phone || 'no phone on file'}
                </span>
              </Td>
              <Td className="truncate">
                <PropertyLink slug={invoice.property_slug} title={invoice.property_title} />
                <span className="tiny muted" style={{ display: 'block' }}>
                  {invoice.number} · {invoice.period_label}
                </span>
              </Td>
              <Td className="tiny">
                {dateLabel(invoice.due_date)}
                <span className="tiny" style={{ display: 'block', color: 'var(--red-600)' }}>
                  {invoice.days_overdue} days late
                </span>
              </Td>
              <Td num className="bold">
                {invoice.balance_display}
              </Td>
              <Td className="tiny">
                {invoice.reminder_count ?? 0} time{(invoice.reminder_count ?? 0) === 1 ? '' : 's'}
                {invoice.last_reminder_at ? (
                  <span className="tiny muted" style={{ display: 'block' }}>
                    last {dateLabel(invoice.last_reminder_at)}
                  </span>
                ) : (
                  <span className="tiny muted" style={{ display: 'block' }}>
                    never chased
                  </span>
                )}
              </Td>
              <Td>
                {invoice.whatsapp_number ? (
                  <span className="badge badge-ok">+{invoice.whatsapp_number}</span>
                ) : (
                  <span className="badge badge-bad">No usable number</span>
                )}
              </Td>
              <Td num>
                <Button size="sm" variant="outline" onClick={() => setTarget(invoice)}>
                  <MessageCircle size={14} /> Remind
                </Button>
              </Td>
            </tr>
          )}
        />

        <Pagination
          page={list.page}
          pageCount={list.pageCount}
          total={list.count}
          onChange={list.setPage}
          noun="overdue invoice"
        />

        <Callout tone="navy">
          Nothing here sends a message by itself. Confirming a reminder posts the words into the tenant&apos;s inbox
          thread on this platform and opens a WhatsApp chat you still have to send — WhatsApp returns no delivery
          report to the platform, so the log records an opened chat and stops there.
        </Callout>
      </Panel>

      <ReminderDialog
        invoice={target}
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        onSent={() => {
          list.reload()
          summary.reload()
        }}
      />
    </div>
  )
}
