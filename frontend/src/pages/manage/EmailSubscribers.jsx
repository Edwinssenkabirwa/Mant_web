import { useState } from 'react'
import { Mail } from 'lucide-react'
import {
  listSubscribers,
  patchSubscriber,
  reactivateSubscriber,
  subscriberStats,
  suppressSubscriber,
} from '../../api/email.js'
import { useApi } from '../../hooks/useApi.js'
import { useAction } from '../../hooks/useAction.js'
import { hasActiveFilters, useList } from '../../hooks/useList.js'
import { useToast } from '../../context/ToastContext.jsx'
import { StatusBadge } from '../../components/ui/Badge.jsx'
import { Callout, PageHeader, Panel, Stat } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Field, Input, SearchBar, SelectOptions } from '../../components/ui/Form.jsx'
import { ConfirmDialog, Modal } from '../../components/ui/Modal.jsx'
import { Pagination } from '../../components/ui/Pagination.jsx'
import { Td, Table } from '../../components/ui/Table.jsx'
import { dateTimeLabel } from '../../utils/format.js'

const STATUSES = [
  { value: 'SUBSCRIBED', label: 'Confirmed' },
  { value: 'PENDING_CONFIRMATION', label: 'Pending' },
  { value: 'UNSUBSCRIBED', label: 'Unsubscribed' },
  { value: 'SUPPRESSED', label: 'Suppressed' },
  { value: 'BOUNCED', label: 'Bounced' },
]

const ORDERING = [
  { value: '-created_at', label: 'Newest first' },
  { value: 'created_at', label: 'Oldest first' },
  { value: 'email', label: 'Address A–Z' },
]

const SOURCES = {
  homepage: 'the homepage sign-up box',
  'blog-article': 'a blog article',
  website: 'the website',
}

/**
 * Admin-only mailing list. Addresses get here by confirming their own opt-in, so the list is
 * read and annotated here — signing somebody up on their behalf is not an option the API offers.
 */
export default function EmailSubscribers() {
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [suppressing, setSuppressing] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const [noteDraft, setNoteDraft] = useState({ row: null, value: '' })

  const list = useList(listSubscribers, { ordering: ORDERING[0].value })
  const stats = useApi(() => subscriberStats(), [])
  const active = hasActiveFilters(list.filters, ['ordering'])

  const suppress = useAction(
    async () => {
      await suppressSubscriber(suppressing.id)
      list.reload()
      stats.reload()
      return suppressing
    },
    {
      onDone: (row) => {
        if (!row) return undefined
        toast.success(`${row.email} is suppressed. Campaigns will skip it.`)
        setSuppressing(null)
        return undefined
      },
    }
  )

  const reactivate = useAction(
    async () => {
      const updated = await reactivateSubscriber(confirming.id)
      list.reload()
      stats.reload()
      return updated
    },
    {
      onDone: (updated) => {
        if (!updated) return undefined
        toast.success('Confirmation email sent. The address stays pending until it is clicked.')
        setConfirming(null)
        return undefined
      },
    }
  )

  const saveNote = useAction(
    async () => {
      await patchSubscriber(noteDraft.row.id, { notes: noteDraft.value })
      list.reload()
      return noteDraft.row
    },
    {
      onDone: () => {
        toast.success('Note saved.')
        setNoteDraft({ row: null, value: '' })
      },
    }
  )

  const statusFilter = list.filters.status || ''
  const totals = stats.data?.by_status || {}

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Email"
        title="Newsletter list"
        lead="Every address here confirmed its own sign-up. Nothing is mailed to this list until a campaign is queued and the sending command runs."
        actions={
          <Button variant="outline" onClick={list.reload} pending={list.loading}>
            Refresh
          </Button>
        }
      />

      {stats.data ? (
        <div className="grid grid-4">
          <Stat
            label="Confirmed"
            value={(totals.SUBSCRIBED ?? 0).toLocaleString()}
            foot={`${stats.data.total ?? 0} addresses on file`}
            tone="ok"
          />
          <Stat label="Pending confirmation" value={(totals.PENDING_CONFIRMATION ?? 0).toLocaleString()} tone="warn" />
          <Stat label="Unsubscribed" value={(totals.UNSUBSCRIBED ?? 0).toLocaleString()} />
          <Stat
            label="Suppressed or bounced"
            value={((totals.SUPPRESSED ?? 0) + (totals.BOUNCED ?? 0)).toLocaleString()}
            tone="accent"
          />
        </div>
      ) : null}

      <Callout tone="navy">
        Suppressed and bounced addresses are kept on purpose: they stop a campaign even when the same
        person appears in another audience. Reactivating one sends a fresh confirmation link and still
        requires the owner to click it.
      </Callout>

      {suppress.error || reactivate.error || saveNote.error ? (
        <Callout>{suppress.error || reactivate.error || saveNote.error}</Callout>
      ) : null}

      <Panel title="Subscribers">
        <div className="tabs" role="tablist" style={{ marginBottom: 14 }}>
          {[
            { value: '', label: 'All', count: stats.data?.total },
            ...STATUSES.map((item) => ({
              value: item.value,
              label: item.label,
              count: totals[item.value] ?? 0,
            })),
          ].map((tab) => (
            <button
              key={tab.value || 'all'}
              type="button"
              className={`tab${statusFilter === tab.value ? ' active' : ''}`}
              onClick={() => list.patchFilters({ status: tab.value || undefined })}
            >
              {tab.label}
              {tab.count != null ? (
                <span className="count-pill" style={{ marginLeft: 8 }}>
                  {tab.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Address, first name or note…"
            onSubmit={() => list.patchFilters({ search })}
            buttonLabel="Search"
          />
          <Input
            as="select"
            name="ordering"
            value={list.filters.ordering || ORDERING[0].value}
            onChange={(value) => list.patchFilters({ ordering: value }, { keepPage: true })}
            style={{ minWidth: 170 }}
          >
            <SelectOptions items={ORDERING} />
          </Input>
          {active ? (
            <button type="button" className="chip chip-button" onClick={list.reset}>
              Clear all
            </button>
          ) : null}
        </div>

        <Table
          head={['Address', 'Status', 'Consent', 'Note', '']}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          empty={
            <div className="empty">
              <h3>No addresses yet</h3>
              <p className="muted">
                The homepage and every blog article carry the sign-up box, so this list fills itself
                when visitors confirm.
              </p>
            </div>
          }
          renderRow={(row) => (
            <tr key={row.id}>
              <Td>
                <span className="semi">{row.email}</span>
                {row.first_name ? (
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {row.first_name}
                  </span>
                ) : null}
              </Td>
              <Td>
                <StatusBadge value={row.status} label={row.status_display} />
                <span className="tiny muted" style={{ display: 'block' }}>
                  {row.receives_mail ? 'May be mailed' : 'Never mailed'}
                </span>
              </Td>
              <Td className="tiny">
                {row.consent_given_at ? `Given ${dateTimeLabel(row.consent_given_at)}` : 'No consent record'}
                <span className="tiny muted" style={{ display: 'block' }}>
                  via {SOURCES[row.source] || row.source}
                </span>
                {row.confirmed_at ? <span className="tiny">Confirmed {dateTimeLabel(row.confirmed_at)}</span> : null}
                {row.unsubscribed_at ? (
                  <span className="tiny" style={{ display: 'block' }}>
                    Left {dateTimeLabel(row.unsubscribed_at)}
                  </span>
                ) : null}
              </Td>
              <Td className="tiny">
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => setNoteDraft({ row, value: row.notes || '' })}
                >
                  {row.notes || 'Add a note'}
                </button>
              </Td>
              <Td num>
                <div className="table-actions">
                  {row.status === 'SUBSCRIBED' ? (
                    <Button variant="outline" size="sm" onClick={() => setSuppressing(row)}>
                      Suppress
                    </Button>
                  ) : null}
                  {row.status === 'PENDING_CONFIRMATION' ? (
                    <Button variant="outline" size="sm" onClick={() => setConfirming(row)}>
                      Resend link
                    </Button>
                  ) : null}
                  {['UNSUBSCRIBED', 'SUPPRESSED', 'BOUNCED'].includes(row.status) ? (
                    <Button variant="outline" size="sm" onClick={() => setConfirming(row)}>
                      <Mail size={13} /> Re-confirm
                    </Button>
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
          noun="address"
        />
      </Panel>

      <ConfirmDialog
        open={Boolean(suppressing)}
        title="Suppress this address?"
        danger
        confirmLabel="Suppress"
        pending={suppress.pending}
        message={suppressing ? `${suppressing.email}` : ''}
        detail={
          <span>
            Campaigns will skip it even if it appears in another audience. The row stays on file so
            the opt-out is not lost; reactivating it later requires the owner to confirm again.
          </span>
        }
        onConfirm={() => suppress.execute()}
        onClose={() => setSuppressing(null)}
      />

      <Modal
        open={Boolean(noteDraft.row)}
        title={noteDraft.row ? `Note for ${noteDraft.row.email}` : 'Note'}
        onClose={() => noteDraft.row && !saveNote.pending && setNoteDraft({ row: null, value: '' })}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setNoteDraft({ row: null, value: '' })}
              disabled={saveNote.pending}
            >
              Cancel
            </Button>
            <Button pending={saveNote.pending} onClick={() => saveNote.execute()}>
              Save note
            </Button>
          </>
        }
      >
        <Field
          name="notes"
          label="Internal note"
          hint="Only the Mant Bridges team sees this. It records where the consent came from."
        >
          <Input as="textarea" name="notes" rows={4} value={noteDraft.value} onChange={(value) => setNoteDraft((current) => ({ ...current, value }))} />
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirming)}
        title="Send a fresh confirmation link?"
        confirmLabel="Send confirmation"
        pending={reactivate.pending}
        message={confirming ? `${confirming.email}` : ''}
        detail={
          <span>
            Nothing is mailed until the link is clicked, so this cannot put an address back on the
            list on its own.
          </span>
        }
        onConfirm={() => reactivate.execute()}
        onClose={() => setConfirming(null)}
      />
    </div>
  )
}
