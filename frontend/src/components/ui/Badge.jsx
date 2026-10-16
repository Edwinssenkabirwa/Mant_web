import { badgeClass, humanStatus, invoiceStatus, invoiceStatusLabel } from '../../utils/status.js'

export function StatusBadge({ value, label, className = '' }) {
  return <span className={`${badgeClass(value)}${className ? ` ${className}` : ''}`}>{label ?? humanStatus(value)}</span>
}

/** Uses `effective_status` so an unpaid invoice past its due date reads OVERDUE. */
export function InvoiceBadge({ invoice }) {
  const statusValue = invoiceStatus(invoice)
  return (
    <span className={badgeClass(statusValue)}>
      {invoiceStatusLabel(invoice)}
      {invoice?.is_overdue && invoice?.days_overdue ? ` · ${invoice.days_overdue}d` : ''}
    </span>
  )
}

export function RoleBadge({ role }) {
  const tone = role === 'ADMIN' ? 'navy' : role === 'LANDLORD' ? 'red' : 'info'
  return <span className={`badge badge-${tone}`}>{humanStatus(role)}</span>
}

export function Pill({ children, className = '' }) {
  return <span className={`pill${className ? ` ${className}` : ''}`}>{children}</span>
}
