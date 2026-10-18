import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Phone, Trash2 } from 'lucide-react'
import { deleteEnquiry, enquiryStats, listEnquiries, patchEnquiry } from '../../api/site.js'
import { hasActiveFilters, useList } from '../../hooks/useList.js'
import { useApi } from '../../hooks/useApi.js'
import { useAction } from '../../hooks/useAction.js'
import { useToast } from '../../context/ToastContext.jsx'
import { StatusBadge } from '../../components/ui/Badge.jsx'
import { Avatar, Callout, PageHeader, Panel, Stat } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Field, Input, SearchBar, SelectOptions } from '../../components/ui/Form.jsx'
import { ConfirmDialog, Modal } from '../../components/ui/Modal.jsx'
import { Pagination } from '../../components/ui/Pagination.jsx'
import { Td, Table } from '../../components/ui/Table.jsx'
import PropertyLink from '../../components/properties/PropertyLink.jsx'
import { dateTimeLabel } from '../../utils/format.js'

const STATUSES = [
  { value: 'NEW', label: 'New' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'ARCHIVED', label: 'Archived' },
]

const ORDERING = [
  { value: '-created_at', label: 'Newest first' },
  { value: 'created_at', label: 'Oldest first' },
]

/**
 * Admin-only inbox. The API sets `handled_by` to whoever saves an update, so
 * triage is stated in terms of status and an internal note.
 */
export default function Enquiries() {
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [status, setStatus] = useState('')
  const [note, setNote] = useState('')
  const [deleting, setDeleting] = useState(null)

  const list = useList(listEnquiries, { ordering: ORDERING[0].value })
  const stats = useApi(() => enquiryStats(), [])
  const active = hasActiveFilters(list.filters, ['ordering'])

  useEffect(() => setSearch(list.filters.search || ''), [list.filters.search])

  const save = useAction(
    async () => {
      const updated = await patchEnquiry(selected.id, { status, admin_note: note })
      list.reload()
      stats.reload()
      setSelected(null)
      return updated
    },
    {
      onDone: (updated) => {
        if (!updated) return undefined
        toast.success(`Marked ${updated.status_display}.`)
        return undefined
      },
    }
  )

  const remove = useAction(
    async () => {
      await deleteEnquiry(deleting.id)
      list.reload()
      stats.reload()
      return deleting
    },
    {
      onDone: (row) => {
        if (!row) return undefined
        toast.success(`Deleted the enquiry from ${row.name}.`)
        setDeleting(null)
        return undefined
      },
    }
  )

  const open = (row) => {
    setSelected(row)
    setStatus(row.status)
    setNote(row.admin_note || '')
  }

  const tabStatus = list.filters.status || ''

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Inbox"
        title="Enquiries"
        lead="Every message from the contact page, a property enquiry form or the careers page. Status and notes are internal — the sender only ever sees the reply you send by email or phone."
        actions={
          <Button variant="outline" onClick={list.reload} pending={list.loading}>
            Refresh
          </Button>
        }
      />

      {stats.data ? (
        <div className="grid grid-4">
          <Stat
            label="New"
            value={(stats.data.NEW ?? 0).toLocaleString()}
            foot={`${stats.data.total ?? 0} in the inbox`}
            tone="warn"
          />
          <Stat label="In progress" value={(stats.data.IN_PROGRESS ?? 0).toLocaleString()} />
          <Stat label="Resolved" value={(stats.data.RESOLVED ?? 0).toLocaleString()} tone="ok" />
          <Stat label="Archived" value={(stats.data.ARCHIVED ?? 0).toLocaleString()} />
        </div>
      ) : null}

      <Callout tone="navy">
        Replying is not part of this platform yet: there is no email sender, so use the mail and phone links below and
        record what happened in the note. Only the enquiry inbox and the in-app messages reach the Mant Bridges team.
      </Callout>

      {save.error || remove.error ? <Callout>{save.error || remove.error}</Callout> : null}

      <Panel title="All enquiries">
        <div className="tabs" role="tablist" style={{ marginBottom: 14 }}>
          {[{ value: '', label: 'All', count: stats.data?.total }, ...STATUSES.map((item) => ({
            value: item.value,
            label: item.label,
            count: stats.data?.[item.value],
          }))].map((tab) => (
            <button
              key={tab.value || 'all'}
              type="button"
              className={`tab${tabStatus === tab.value ? ' active' : ''}`}
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
            placeholder="Name, email, phone or message…"
            onSubmit={() => list.patchFilters({ q: undefined, search })}
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
          head={['From', 'Subject', 'Listing', 'Received', 'Handled by', 'Status', '']}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          empty={
            <div className="empty">
              <h3>Inbox zero</h3>
              <p className="muted">No enquiry matches this filter.</p>
            </div>
          }
          renderRow={(row) => (
            <tr key={row.id}>
              <Td>
                <div className="row" style={{ gap: 10 }}>
                  <Avatar user={{ full_name: row.name }} />
                  <div className="truncate">
                    <button type="button" className="btn-link semi" onClick={() => open(row)}>
                      {row.name}
                    </button>
                    <span className="tiny muted" style={{ display: 'block' }}>
                      {row.email}
                      {row.phone ? ` · ${row.phone}` : ''}
                    </span>
                  </div>
                </div>
              </Td>
              <Td>
                <button type="button" className="btn-link" onClick={() => open(row)}>
                  {row.subject || 'No subject'}
                </button>
                {row.admin_note ? (
                  <span className="tiny muted" style={{ display: 'block' }}>
                    Note: {row.admin_note}
                  </span>
                ) : null}
              </Td>
              <Td className="tiny">
                <PropertyLink
                  slug={row.property_slug}
                  title={row.property_title}
                  fallback={<span className="muted">General</span>}
                />
              </Td>
              <Td className="tiny">{dateTimeLabel(row.created_at)}</Td>
              <Td className="tiny">{row.handled_by_name || 'Unassigned'}</Td>
              <Td>
                <StatusBadge value={row.status} label={row.status_display} />
              </Td>
              <Td num>
                <div className="table-actions">
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => open(row)}>
                    Update
                  </button>
                  <a
                    className="btn btn-outline btn-sm btn-icon"
                    href={`mailto:${row.email}?subject=${encodeURIComponent(`Re: ${row.subject || 'Your enquiry'}`)}`}
                    title="Reply by email"
                  >
                    <Mail size={13} />
                  </a>
                  {row.phone ? (
                    <a className="btn btn-outline btn-sm btn-icon" href={`tel:${row.phone}`} title="Call">
                      <Phone size={13} />
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-outline btn-sm btn-icon"
                    title="Delete"
                    onClick={() => setDeleting(row)}
                  >
                    <Trash2 size={13} />
                  </button>
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
          noun="enquiry"
        />
      </Panel>

      <Modal
        open={Boolean(selected)}
        title={selected ? `Update ${selected.subject || 'enquiry'}` : 'Update enquiry'}
        onClose={() => setSelected(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setSelected(null)} disabled={save.pending}>
              Close
            </Button>
            <Button pending={save.pending} onClick={() => save.execute()}>
              {save.pending ? 'Saving…' : 'Save update'}
            </Button>
          </>
        }
      >
        {selected ? (
          <div className="stack">
            <div>
              <h4 style={{ margin: '0 0 6px' }}>{selected.name}</h4>
              <p className="muted small" style={{ margin: 0 }}>
                Received {dateTimeLabel(selected.created_at)}
                {selected.property_title ? ` · about ${selected.property_title}` : ''}
              </p>
              <div className="row" style={{ gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
                <a className="btn btn-outline btn-sm" href={`mailto:${selected.email}`}>
                  <Mail size={13} /> {selected.email}
                </a>
                {selected.phone ? (
                  <a className="btn btn-outline btn-sm" href={`tel:${selected.phone}`}>
                    <Phone size={13} /> {selected.phone}
                  </a>
                ) : null}
              </div>
            </div>
            <div className="panel">
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{selected.message}</p>
            </div>
            <div className="row" style={{ gap: 12 }}>
              <Field name="status" label="Status" required>
                <Input as="select" name="status" value={status} onChange={setStatus}>
                  <SelectOptions items={STATUSES} />
                </Input>
              </Field>
              <Field
                name="handled"
                label="Assigned to"
                hint="The API stamps whoever saves this update; it cannot be set from here."
              >
                <Input name="handled" value={selected.handled_by_name || 'Unassigned'} readOnly />
              </Field>
            </div>
            <Field name="admin_note" label="Internal note" hint="Only visible to the Mant Bridges team.">
              <Input as="textarea" name="admin_note" rows={4} value={note} onChange={setNote} />
            </Field>
            {selected.property_slug ? (
              <p className="hint">
                <Link to={`/properties/${selected.property_slug}`} target="_blank" rel="noreferrer">
                  Open the listing this enquiry is about
                </Link>
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this enquiry?"
        danger
        confirmLabel="Delete enquiry"
        pending={remove.pending}
        message={deleting ? `${deleting.name} — “${deleting.subject || 'no subject'}”.` : ''}
        detail={
          <span>
            The record is removed from the database. There is no restore, and any note attached to it goes with it.
          </span>
        }
        onConfirm={() => remove.execute()}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}
