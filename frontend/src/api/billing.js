import { del, download, get, patch, post, put } from './client.js'

/* ---------- Analytics ----------------------------------------------------- */

export function analytics(params) {
  return get('/analytics/', params)
}

export function statements(params) {
  return get('/statements/', params)
}

/** The owner's own view of his book: aggregates only, no tenant records. */
export function landlordOverview(params) {
  return get('/landlord/overview/', params)
}

/* ---------- Invoices ------------------------------------------------------ */

export function listInvoices(params) {
  return get('/invoices/', params)
}

export function invoiceSummary(params) {
  return get('/invoices/summary/', params)
}

export function invoiceById(id) {
  return get(`/invoices/${id}/`)
}

export function createInvoice(payload) {
  return post('/invoices/', payload)
}

export function updateInvoice(id, payload) {
  return put(`/invoices/${id}/`, payload)
}

export function patchInvoice(id, payload) {
  return patch(`/invoices/${id}/`, payload)
}

export function deleteInvoice(id) {
  return del(`/invoices/${id}/`)
}

export function downloadInvoicePdf(invoice) {
  return download(`/invoices/${invoice.id}/pdf/`, `${invoice.number}.pdf`)
}

export function remindInvoice(id) {
  return post(`/invoices/${id}/remind/`, {})
}

/**
 * Writes the reminder into the tenant's inbox and returns the WhatsApp click-to-chat address
 * along with the exact words. `link` is null when the number on file cannot be dialled — the
 * inbox copy still goes out. No response here means the tenant received anything: WhatsApp is
 * opened by the desk and sent by the desk.
 */
export function whatsappReminder(id) {
  return post(`/invoices/${id}/whatsapp-reminder/`, {})
}

/** The desk's trail of reminders, optionally scoped with `{ invoice: id }`. */
export function listReminders(params) {
  return get('/reminders/', params)
}

/** Records that the desk clicked the chat link — the furthest this platform can see. */
export function markReminderOpened(id) {
  return post(`/reminders/${id}/opened/`, {})
}

export function applyLateFee(id) {
  return post(`/invoices/${id}/apply-late-fee/`, {})
}

/** Runs invoicing for every active tenancy in the requester's scope. */
export function generateInvoices() {
  return post('/invoices/generate/', {})
}

/* ---------- Payments ------------------------------------------------------ */

export function listPayments(params) {
  return get('/payments/', params)
}

export function paymentSummary(params) {
  return get('/payments/summary/', params)
}

export function paymentById(id) {
  return get(`/payments/${id}/`)
}

export function recordPayment(payload) {
  return post('/payments/', payload)
}

export function updatePayment(id, payload) {
  return put(`/payments/${id}/`, payload)
}

export function confirmPayment(id) {
  return post(`/payments/${id}/confirm/`, {})
}

/** The backend field is `reason`, not `rejection_reason`. */
export function rejectPayment(id, reason) {
  return post(`/payments/${id}/reject/`, { reason })
}

export function deletePayment(id) {
  return del(`/payments/${id}/`)
}

/* ---------- Receipts ------------------------------------------------------ */

export function listReceipts(params) {
  return get('/receipts/', params)
}

export function receiptById(id) {
  return get(`/receipts/${id}/`)
}

/** Uses the binary endpoint; `pdf_url` on the record has a duplicated prefix. */
export function downloadReceipt(receipt) {
  return download(`/receipts/${receipt.id}/download/`, `${receipt.number}.pdf`)
}

export function voidReceipt(id, reason) {
  return post(`/receipts/${id}/void/`, { reason })
}

export const INVOICE_ORDERING = [
  { value: '-due_date', label: 'Due date: soon first' },
  { value: 'due_date', label: 'Due date: old first' },
  { value: '-created_at', label: 'Issued most recently' },
  { value: '-total', label: 'Amount: high to low' },
  { value: 'total', label: 'Amount: low to high' },
  { value: 'status', label: 'Status' },
]

export const PAYMENT_ORDERING = [
  { value: '-paid_on', label: 'Paid most recently' },
  { value: 'paid_on', label: 'Oldest payment' },
  { value: '-amount', label: 'Amount: high to low' },
  { value: 'amount', label: 'Amount: low to high' },
]
