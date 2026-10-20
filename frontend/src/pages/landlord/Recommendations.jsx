import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Plus, Send, Trash2 } from 'lucide-react'
import {
  deleteRecommendation,
  listMyRecommendations,
  sendRecommendation,
} from '../../api/properties.js'
import { useList } from '../../hooks/useList.js'
import { useAction } from '../../hooks/useAction.js'
import { useLookups } from '../../context/LookupContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { Callout, PageHeader, Panel } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { StatusBadge } from '../../components/ui/Badge.jsx'
import { ConfirmDialog } from '../../components/ui/Modal.jsx'
import { EmptyState } from '../../components/ui/Feedback.jsx'
import { Actions, Table, Td } from '../../components/ui/Table.jsx'
import { dateLabel, money, pluralize } from '../../utils/format.js'

/**
 * An owner's own list of the properties he has put in front of the desk. He can add as
 * many as he likes; only the office decides what becomes a listing.
 */
export default function Recommendations() {
  const { options } = useLookups()
  const toast = useToast()
  const [removeTarget, setRemoveTarget] = useState(null)

  const list = useList(listMyRecommendations, { ordering: '-created_at' })

  const send = useAction(
    async (row) => {
      await sendRecommendation(row.id)
      return list.reload()
    },
    { onDone: () => toast.success('Sent to the office. The desk will take it from here.') }
  )

  const remove = useAction(
    async () => {
      await deleteRecommendation(removeTarget.id)
      return list.reload()
    },
    {
      onDone: () => {
        toast.success('Draft discarded.')
        setRemoveTarget(null)
      },
    }
  )

  const kinds = useMemo(() => labelMap(options.listing_kinds), [options.listing_kinds])
  const error = send.error || remove.error

  // The account opens with one empty form in it. Point at that instead of asking him
  // to start a second one.
  const untouched = list.rows.find((row) => row.status === 'DRAFT' && !row.title)

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Landlord portal"
        title="Recommended properties"
        lead="You do not publish listings yourself. Send the office a property with the details, the desk does its own checks and due diligence, and once the contracts are signed the property is verified and published as yours. Add as many properties as you want."
        actions={
          untouched ? null : (
            <Button to="/landlord/recommendations/new">
              <Plus size={15} /> Recommend a property
            </Button>
          )
        }
      />

      {error ? <Callout>{error}</Callout> : null}

      {untouched ? (
        <Callout>
          <div className="row" style={{ gap: 12, justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span>
              Your first recommendation form is waiting for you. It stays on your account until you
              send it — the office only sees what you have sent.
            </span>
            <Button to={`/landlord/recommendations/${untouched.id}/edit`} variant="outline">
              Fill it in <ArrowRight size={15} />
            </Button>
          </div>
        </Callout>
      ) : null}

      <Panel
        title="What you have sent"
        action={<span className="muted small">{pluralize(list.count, 'record', 'records')}</span>}
      >
        <Table
          caption="Properties you have recommended to Mant Bridges"
          head={['Property', 'Offered', 'Where', { label: 'Expected', num: true }, 'With the desk', '']}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          empty={
            <EmptyState
              icon={Plus}
              title="Nothing recommended yet"
              action={
                <Button to="/landlord/recommendations/new">
                  <Plus size={15} /> Recommend a property
                </Button>
              }
            >
              Tell the office about a property you own or act for. The more you write down, the
              less the desk has to come back to you for.
            </EmptyState>
          }
        renderRow={(row) => (
            <tr key={row.id}>
              <Td>
                {row.title ? (
                  <Link to={`/landlord/recommendations/${row.id}/edit`} className="bold">
                    {row.title}
                  </Link>
                ) : (
                  <Link to={`/landlord/recommendations/${row.id}/edit`} className="muted">
                    Empty form
                  </Link>
                )}
                {row.missing?.length ? (
                  <span className="hint" style={{ display: 'block' }}>
                    Still needed: {row.missing.join(', ')}
                  </span>
                ) : null}
              </Td>
              <Td>{kinds[row.listing_kind] || '—'}</Td>
              <Td>{row.city || '—'}</Td>
              <Td num>
                {row.price_expectation
                  ? money(row.price_expectation, row.currency || 'UGX')
                  : '—'}
              </Td>
              <Td>
                <StatusBadge value={row.status} label={row.status_display} />
                {row.submitted_at ? (
                  <span className="hint" style={{ display: 'block' }}>
                    sent {dateLabel(row.submitted_at)}
                  </span>
                ) : null}
                {row.admin_note ? (
                  <span className="hint" style={{ display: 'block' }}>
                    Desk: {row.admin_note}
                  </span>
                ) : null}
              </Td>
              <Td>
                <Actions>
                  {row.listing_slug ? (
                    <Link to={`/properties/${row.listing_slug}`} className="small">
                      Open listing
                    </Link>
                  ) : null}
                  {row.status === 'DRAFT' ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => send.execute(row)}
                        pending={send.pending}
                      >
                        <Send size={14} /> Send to the desk
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRemoveTarget(row)}
                        title="Discard this empty form"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </>
                  ) : (
                    <Link to={`/landlord/recommendations/${row.id}/edit`} className="btn btn-ghost btn-sm">
                      Open
                    </Link>
                  )}
                </Actions>
              </Td>
            </tr>
        )}
        />
      </Panel>

      <Callout tone="navy">
        A recommendation is an owner's word about his property, not a valuation. What the desk
        publishes after its own checks is marked <strong>verified by the landlord and verified by
        our team</strong> — and nothing reaches the public catalogue before that.
      </Callout>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Discard this form?"
        message="Nothing has been sent to the office, so discarding it only removes your own blank form."
        detail={removeTarget?.listing_kind ? `Offered ${kinds[removeTarget.listing_kind]} in ${removeTarget.city}.` : ''}
        confirmLabel="Discard"
        danger
        pending={remove.pending}
        onClose={() => setRemoveTarget(null)}
        onConfirm={remove.execute}
      />
    </div>
  )
}

function labelMap(items) {
  return (items || []).reduce((acc, item) => {
    acc[item.value] = item.label
    return acc
  }, {})
}
