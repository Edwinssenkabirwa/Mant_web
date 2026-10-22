/** Badge tone for every status the backend can return. */
const TONES = {
  // invoice
  PAID: 'ok',
  UNPAID: 'warn',
  PARTIAL: 'warn',
  OVERDUE: 'bad',
  DRAFT: 'outline',
  CANCELLED: 'outline',
  // payment
  CONFIRMED: 'ok',
  PENDING: 'warn',
  REJECTED: 'bad',
  // lease
  ACTIVE: 'ok',
  EXPIRED: 'outline',
  TERMINATED: 'bad',
  // property
  AVAILABLE: 'ok',
  OCCUPIED: 'navy',
  SOLD: 'outline',
  PENDING_OFFER: 'warn',
  OFF_MARKET: 'outline',
  // property recommendations — what the desk has done with an owner's offer
  SUBMITTED: 'info',
  IN_REVIEW: 'warn',
  VERIFIED: 'ok',
  DECLINED: 'bad',
  // enquiry
  NEW: 'red',
  IN_PROGRESS: 'info',
  RESOLVED: 'ok',
  ARCHIVED: 'outline',
  // blog + conversation
  PUBLISHED: 'ok',
  OPEN: 'info',
  CLOSED: 'outline',
  // newsletter + campaigns
  SUBSCRIBED: 'ok',
  PENDING_CONFIRMATION: 'warn',
  UNSUBSCRIBED: 'outline',
  SUPPRESSED: 'bad',
  BOUNCED: 'bad',
  QUEUED: 'info',
  SENDING: 'warn',
  COMPLETED: 'ok',
  ACCEPTED: 'ok',
  FAILED: 'bad',
  SKIPPED: 'outline',
  // rent reminders — how far the desk's own record goes, never a claim about the tenant
  WRITTEN: 'info',
  LINK_READY: 'warn',
  OPENED: 'ok',
  NO_NUMBER: 'bad',
  // misc
  TRUE: 'ok',
};

export function statusTone(value) {
  if (!value) return 'outline';
  if (value === 'PENDING') return 'warn';
  return TONES[value] ?? 'outline';
}

export function badgeClass(value, extra = '') {
  return `badge badge-${statusTone(value)}${extra ? ` ${extra}` : ''}`;
}

export function boolTone(value) {
  return value ? 'ok' : 'outline';
}

/** Invoice badges must reflect the computed status, not the stored one. */
export function invoiceStatus(invoice) {
  return invoice?.effective_status || invoice?.status || '';
}

export function invoiceStatusLabel(invoice) {
  return (
    invoice?.effective_status_display ||
    invoice?.status_display ||
    humanStatus(invoiceStatus(invoice))
  );
}

export function humanStatus(value = '') {
  return String(value)
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}

/** `--ok-bg`-friendly class for a chart segment. */
export function collectionTone(rate) {
  const n = Number(rate);
  if (!Number.isFinite(n)) return 'outline';
  if (n >= 85) return 'ok';
  if (n >= 60) return 'warn';
  return 'bad';
}
