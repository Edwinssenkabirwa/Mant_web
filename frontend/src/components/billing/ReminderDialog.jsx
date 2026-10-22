import { useEffect, useState } from 'react'
import { Copy, MessageCircle } from 'lucide-react'
import { markReminderOpened, whatsappReminder } from '../../api/billing.js'
import { useAction } from '../../hooks/useAction.js'
import { useToast } from '../../context/ToastContext.jsx'
import { Callout } from '../ui/Blocks.jsx'
import { Button } from '../ui/Button.jsx'
import { Modal } from '../ui/Modal.jsx'
import { dateLabel } from '../../utils/format.js'

/**
 * One reminder, two records. Confirming writes the words into the tenant's own inbox thread and
 * asks the server for a click-to-chat address; the desk then presses send inside WhatsApp.
 *
 * The dialog never says the tenant was reached. WhatsApp reports nothing back to this platform,
 * so the most that can be recorded is that a chat was opened here, and the copy of the message
 * in the inbox is what actually proves the reminder exists.
 */
export default function ReminderDialog({ invoice, open, onClose, onSent }) {
  const toast = useToast()
  const [plan, setPlan] = useState(null)
  const [opened, setOpened] = useState(false)

  useEffect(() => {
    if (!open) {
      setPlan(null)
      setOpened(false)
    }
  }, [open])

  const prepare = useAction(async () => whatsappReminder(invoice.id), {
    onDone: (result) => {
      if (!result) return undefined
      setPlan(result)
      onSent?.(result)
      return undefined
    },
  })

  const click = useAction(async () => markReminderOpened(plan.reminder_id), {
    onDone: () => setOpened(true),
  })

  async function copyWords() {
    if (!plan?.body) return
    try {
      await navigator.clipboard.writeText(plan.body)
      toast.success('The reminder is on your clipboard.')
    } catch {
      toast.error('This browser would not let the text be copied. Select it and copy by hand.')
    }
  }

  if (!invoice) return null
  const outstanding = Number(invoice.balance) > 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={plan ? 'Open the chat' : 'Remind on WhatsApp'}
      footer={
        plan ? (
          <>
            <button type="button" className="btn btn-outline" onClick={copyWords}>
              <Copy size={14} /> Copy the words
            </button>
            {plan.link ? (
              <Button href={plan.link} onClick={() => !opened && click.execute()} pending={click.pending}>
                <MessageCircle size={15} /> {opened ? 'Chat opened' : 'Open WhatsApp'}
              </Button>
            ) : (
              <Button onClick={onClose}>Close</Button>
            )}
          </>
        ) : (
          <>
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={prepare.pending}>
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => prepare.execute()}
              disabled={!outstanding}
            >
              {prepare.pending ? 'Working…' : 'Write it and open WhatsApp'}
            </button>
          </>
        )
      }
    >
      {plan ? (
        <div className="stack stack-sm">
          <p className="soft" style={{ margin: 0 }}>
            This is what {invoice.tenant_name} will be sent about {invoice.number}. Press{' '}
            <strong>Open WhatsApp</strong>, check the chat, then press send there yourself.
          </p>
          {plan.link ? null : (
            <Callout>
              No chat could be opened: {plan.detail} The words below are already in their inbox,
              so nothing is lost — correct the number and try again.
            </Callout>
          )}
          <p
            className="small"
            style={{ margin: 0, whiteSpace: 'pre-line', border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}
          >
            {plan.body}
          </p>
          <p className="hint">
            {plan.link
              ? 'Opening WhatsApp writes nothing on its own. The record here says a chat was opened, never that a message arrived.'
              : 'The reminder is in the tenant’s inbox. Only a phone number this platform can dial will produce a chat link.'}
          </p>
          {click.error ? <Callout>{click.error}</Callout> : null}
        </div>
      ) : (
        <div className="stack stack-sm">
          <p className="soft" style={{ margin: 0 }}>
            Mant Bridges raises a rent reminder about <strong>{invoice.number}</strong> for{' '}
            {invoice.tenant_name} — {invoice.property_title}, outstanding{' '}
            <strong>{invoice.balance_display}</strong>, due {dateLabel(invoice.due_date)}.
          </p>
          {invoice.is_overdue ? (
            <p className="tiny" style={{ margin: 0, color: 'var(--red-600)' }}>
              {invoice.days_overdue} days past the due date.
            </p>
          ) : null}
          <Callout tone="navy">
            Two things happen when you confirm: the same words are posted into{' '}
            {invoice.tenant_name}’s inbox thread, and this browser is given a WhatsApp chat addressed to{' '}
            {invoice.whatsapp_number ? `+${invoice.whatsapp_number}` : 'the number on their account'}
            {invoice.whatsapp_number ? '' : ', which does not look dialable'}. Nothing is sent from the
            platform, and no number is invented — a WhatsApp message only leaves when you press send.
          </Callout>
          {outstanding ? null : (
            <p className="hint">Nothing is outstanding on this invoice, so there is nothing to remind about.</p>
          )}
          {prepare.error ? <Callout>{prepare.error}</Callout> : null}
        </div>
      )}
    </Modal>
  )
}
