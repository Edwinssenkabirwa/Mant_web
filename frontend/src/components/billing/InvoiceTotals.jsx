import { amount } from '../../utils/format.js'
import { InvoiceBadge } from '../ui/Badge.jsx'
import { KvRows } from '../ui/Blocks.jsx'

/** Renders only server-computed money; nothing is re-derived in JavaScript. */
export default function InvoiceTotals({ invoice, currency }) {
  const shared = currency || invoice.currency
  const rows = [
    { label: 'Rent', value: amount(invoice, 'rent_amount', shared) },
    { label: 'Service charge', value: amount(invoice, 'service_charge', shared) },
  ]
  if (Number(invoice.utility_charge)) rows.push({ label: 'Utilities', value: amount(invoice, 'utility_charge', shared) })
  if (Number(invoice.other_charge)) {
    rows.push({
      label: invoice.other_charge_label || 'Other charge',
      value: amount(invoice, 'other_charge', shared),
    })
  }
  if (Number(invoice.discount)) rows.push({ label: 'Discount', value: `− ${amount(invoice, 'discount', shared)}` })
  rows.push({ label: 'Subtotal', value: amount(invoice, 'subtotal', shared) })
  if (Number(invoice.tax_amount)) {
    rows.push({ label: `Tax (${invoice.tax_percent}%)`, value: amount(invoice, 'tax_amount', shared) })
  }
  if (Number(invoice.late_fee)) rows.push({ label: 'Late fee', value: amount(invoice, 'late_fee', shared) })

  return (
    <KvRows
      rows={rows}
      total={{ label: `Total ${invoice.effective_status_display || ''}`.trim(), value: amount(invoice, 'total', shared) }}
      foot={
        <div className="stack stack-sm" style={{ marginTop: 12 }}>
          <div className="kv-row">
            <span className="muted">Paid to date</span>
            <strong>{amount(invoice, 'amount_paid', shared)}</strong>
          </div>
          <div className="total-row">
            <span>Outstanding balance</span>
            <span>{amount(invoice, 'balance', shared)}</span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <InvoiceBadge invoice={invoice} />
            {invoice.is_overdue ? <span className="hint">Due {invoice.days_overdue} days ago</span> : null}
          </div>
        </div>
      }
    />
  )
}
