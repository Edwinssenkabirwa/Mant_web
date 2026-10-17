import { useState } from 'react'
import { Send } from 'lucide-react'
import {
  campaignPreview,
  campaignRecipients,
  campaignStats,
  cancelCampaign,
  createCampaign,
  deleteCampaign,
  estimateAudience,
  listCampaigns,
  queueCampaign,
  sendCampaignTest,
  updateCampaign,
} from '../../api/email.js'
import { useApi } from '../../hooks/useApi.js'
import { useAction } from '../../hooks/useAction.js'
import { hasActiveFilters, useList } from '../../hooks/useList.js'
import { useToast } from '../../context/ToastContext.jsx'
import { StatusBadge } from '../../components/ui/Badge.jsx'
import { Callout, PageHeader, Panel, Stat } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Check, Field, Input, SelectOptions } from '../../components/ui/Form.jsx'
import { ConfirmDialog, Modal } from '../../components/ui/Modal.jsx'
import { Pagination } from '../../components/ui/Pagination.jsx'
import { Td, Table } from '../../components/ui/Table.jsx'
import { dateTimeLabel } from '../../utils/format.js'

const AUDIENCES = [
  {
    value: 'NEWSLETTER_SUBSCRIBERS',
    label: 'Confirmed newsletter subscribers',
    hint: 'Addresses that clicked the confirmation link and have not opted out.',
  },
  {
    value: 'OPTED_IN_USERS',
    label: 'Registered users who opted in',
    hint: 'Accounts with marketing consent ticked on their profile. Having an account is not consent.',
  },
  {
    value: 'LANDLORDS',
    label: 'Landlords who opted in',
    hint: 'Landlord accounts with marketing consent.',
  },
  {
    value: 'TENANTS',
    label: 'Tenants who opted in',
    hint: 'Tenant accounts with marketing consent.',
  },
]

const LABELS = Object.fromEntries(AUDIENCES.map((item) => [item.value, item.label]))

const STATUSES = [
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'QUEUED', label: 'Queued' },
  { value: 'SENDING', label: 'Sending' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

const RECIPIENT_STATUSES = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Waiting' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'SKIPPED', label: 'Skipped' },
]

const EMPTY_FORM = { name: '', subject: '', body: '', audiences: [] }

export default function EmailCampaigns() {
  const toast = useToast()

  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [previewHtml, setPreviewHtml] = useState('')
  const [testAddress, setTestAddress] = useState('')
  const [queueing, setQueueing] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [report, setReport] = useState(null)
  const [reportPage, setReportPage] = useState(1)
  const [reportStatus, setReportStatus] = useState('')

  const list = useList(listCampaigns, { ordering: '-created_at' })
  const stats = useApi(() => campaignStats(), [])
  const estimate = useApi(
    () => estimateAudience(form.audiences),
    [form.audiences.join('|')],
    { skip: form.audiences.length === 0 }
  )
  const reportRows = useApi(
    () => campaignRecipients(report.id, { page: reportPage, status: reportStatus || undefined }),
    [report?.id, reportPage, reportStatus],
    { skip: !report }
  )

  const openNew = () => {
    setForm(EMPTY_FORM)
    setPreviewHtml('')
    setTestAddress('')
    setEditing({ campaign: null })
  }

  const openEdit = (row) => {
    setForm({ name: row.name, subject: row.subject, body: row.body, audiences: row.audiences || [] })
    setPreviewHtml('')
    setTestAddress('')
    setEditing({ campaign: row })
  }

  const toggleAudience = (value, on) => {
    setForm((current) => ({
      ...current,
      audiences: on
        ? [...current.audiences, value]
        : current.audiences.filter((item) => item !== value),
    }))
  }

  const save = useAction(
    async () => {
      const payload = {
        name: form.name,
        subject: form.subject,
        body: form.body,
        audiences: form.audiences,
      }
      const saved = editing.campaign
        ? await updateCampaign(editing.campaign.id, payload)
        : await createCampaign(payload)
      list.reload()
      stats.reload()
      return saved
    },
    {
      onDone: (saved) => {
        if (!saved) return undefined
        setEditing({ campaign: saved })
        toast.success('Draft saved.')
        return undefined
      },
    }
  )

  const showPreview = useAction(async () => {
    const result = await campaignPreview(editing.campaign.id)
    setPreviewHtml(result.html)
    return result
  })

  const test = useAction(async () => sendCampaignTest(editing.campaign.id, testAddress), {
    onDone: (result) => {
      if (!result) return undefined
      toast.success(result.detail)
      return undefined
    },
  })

  const queue = useAction(
    async () => {
      const queued = await queueCampaign(queueing.id)
      list.reload()
      stats.reload()
      setEditing(null)
      return queued
    },
    {
      onDone: (queued) => {
        if (!queued) return undefined
        toast.success(`Queued for ${queued.recipient_count} recipient(s). Nothing has been sent yet.`)
        setQueueing(null)
        return undefined
      },
    }
  )

  const cancel = useAction(
    async () => {
      const updated = await cancelCampaign(cancelling.id)
      list.reload()
      stats.reload()
      return updated
    },
    {
      onDone: (updated) => {
        if (!updated) return undefined
        toast.success('Cancelled. Mail already handed to the provider cannot be recalled.')
        setCancelling(null)
        return undefined
      },
    }
  )

  const remove = useAction(
    async () => {
      await deleteCampaign(deleting.id)
      list.reload()
      stats.reload()
      return deleting
    },
    {
      onDone: (row) => {
        if (!row) return undefined
        toast.success(`Deleted the draft “${row.name}”.`)
        setDeleting(null)
        return undefined
      },
    }
  )

  const openReport = (row) => {
    setReport(row)
    setReportPage(1)
    setReportStatus('')
  }

  const statusFilter = list.filters.status || ''
  const byStatus = stats.data?.by_status || {}
  const savedId = editing?.campaign?.id
  const eligible = estimate.data?.eligible

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Email"
        title="Campaigns"
        lead="One message, one audience, sent in batches by the server. Queueing a campaign never sends it from this page."
        actions={
          <Button onClick={openNew}>
            <Send size={14} /> New campaign
          </Button>
        }
      />

      {stats.data ? (
        <div className="grid grid-4">
          <Stat label="Campaigns" value={(stats.data.total ?? 0).toLocaleString()} />
          <Stat
            label="Drafts"
            value={(byStatus.DRAFT ?? 0).toLocaleString()}
            foot="editable and not yet queued"
          />
          <Stat
            label="Queued or sending"
            value={(stats.data.outstanding ?? 0).toLocaleString()}
            tone="warn"
            foot="waiting on the sending command"
          />
          <Stat label="Completed" value={(byStatus.COMPLETED ?? 0).toLocaleString()} tone="ok" />
        </div>
      ) : null}

      {stats.data && !stats.data.sends_real_mail ? (
        <Callout>
          No mail provider is configured on this install — the backend is{" "}
          <code>{stats.data.email_backend}</code> and mail would be sent from{" "}
          <code>{stats.data.from_email}</code>. Drafts, audience counts, previews and test sends all
          work; nothing reaches a real inbox until an SMTP provider is configured and verified.
        </Callout>
      ) : (
        <Callout tone="navy">
          Sending runs in batches through <code>python manage.py send_email_campaign</code>. Schedule
          it (cron or Task Scheduler) and it works through the queue a slice at a time, so a large
          list is never mailed inside one request.
        </Callout>
      )}

      {queue.error || cancel.error || remove.error ? (
        <Callout>{queue.error || cancel.error || remove.error}</Callout>
      ) : null}

      <Panel title="All campaigns">
        <div className="tabs" role="tablist" style={{ marginBottom: 14 }}>
          {[{ value: '', label: 'All', count: stats.data?.total }, ...STATUSES.map((item) => ({
            value: item.value,
            label: item.label,
            count: byStatus[item.value] ?? 0,
          }))].map((tab) => (
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
          <Input
            as="select"
            name="ordering"
            value={list.filters.ordering || '-created_at'}
            onChange={(value) => list.patchFilters({ ordering: value }, { keepPage: true })}
            style={{ minWidth: 190 }}
          >
            <SelectOptions
              items={[
                { value: '-created_at', label: 'Newest first' },
                { value: 'created_at', label: 'Oldest first' },
                { value: 'name', label: 'Name A–Z' },
              ]}
            />
          </Input>
          {hasActiveFilters(list.filters, ['ordering']) ? (
            <button type="button" className="chip chip-button" onClick={list.reset}>
              Clear all
            </button>
          ) : null}
        </div>

        <Table
          head={['Campaign', 'Status', 'Audience', 'Delivery', 'Created', '']}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          empty={
            <div className="empty">
              <h3>No campaigns yet</h3>
              <p className="muted">
                Start a draft when there is something worth telling the list about. Only confirmed
                subscribers and opted-in accounts can be selected.
              </p>
            </div>
          }
          renderRow={(row) => (
            <tr key={row.id}>
              <Td>
                <span className="semi">{row.name}</span>
                <span className="tiny muted" style={{ display: 'block' }} title={row.subject}>
                  {row.subject}
                </span>
              </Td>
              <Td>
                <StatusBadge value={row.status} label={row.status_display} />
              </Td>
              <Td className="tiny">
                {(row.audiences || []).map((key) => LABELS[key] || key).join(' · ') || (
                  <span className="muted">No audience set</span>
                )}
              </Td>
              <Td className="tiny">
                {row.recipient_count
                  ? `${row.recipient_count} recipient${row.recipient_count === 1 ? '' : 's'}`
                  : '—'}
                <span className="tiny muted" style={{ display: 'block' }}>
                  {row.accepted_count} accepted · {row.failed_count} failed · {row.skipped_count} skipped
                </span>
                {row.excluded_count ? (
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {row.excluded_count} suppressed at queue time
                  </span>
                ) : null}
              </Td>
              <Td className="tiny">
                {dateTimeLabel(row.created_at)}
                {row.created_by_name ? (
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {row.created_by_name}
                  </span>
                ) : null}
              </Td>
              <Td num>
                <div className="table-actions">
                  {row.is_editable ? (
                    <Button variant="outline" size="sm" onClick={() => openEdit(row)}>
                      Edit
                    </Button>
                  ) : null}
                  {row.is_editable ? (
                    <Button variant="outline" size="sm" onClick={() => setQueueing(row)}>
                      Queue
                    </Button>
                  ) : null}
                  {['QUEUED', 'SENDING'].includes(row.status) ? (
                    <Button variant="outline" size="sm" onClick={() => setCancelling(row)}>
                      Cancel
                    </Button>
                  ) : null}
                  {row.recipient_count ? (
                    <Button variant="ghost" size="sm" onClick={() => openReport(row)}>
                      Recipients
                    </Button>
                  ) : null}
                  {row.is_editable ? (
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(row)}>
                      Delete
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
          noun="campaign"
        />
      </Panel>

      <Modal
        open={Boolean(editing)}
        size="lg"
        title={editing?.campaign ? `Edit “${editing.campaign.name}”` : 'New campaign'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={save.pending}>
              Close
            </Button>
            <Button pending={save.pending} onClick={() => save.execute()}>
              {save.pending ? 'Saving…' : 'Save draft'}
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="stack">
            <div className="form-grid">
              <Field name="name" label="Internal name" error={save.errors?.name?.[0]} required
                hint="Never emailed; it only identifies the campaign in this list.">
                <Input name="name" value={form.name} onChange={(value) => setForm((c) => ({ ...c, name: value }))}
                  placeholder="October opportunities" />
              </Field>
              <Field name="subject" label="Subject line" error={save.errors?.subject?.[0]} required>
                <Input name="subject" value={form.subject} onChange={(value) => setForm((c) => ({ ...c, subject: value }))}
                  placeholder="What lands in the inbox" />
              </Field>
            </div>

            <Field name="body" label="Message" error={save.errors?.body?.[0]} required
              hint="Plain text. A blank line starts a new paragraph. The branded header, greeting and unsubscribe footer are added by the server.">
              <Input as="textarea" name="body" rows={10} value={form.body}
                onChange={(value) => setForm((c) => ({ ...c, body: value }))} />
            </Field>

            <Field label="Audience" error={save.errors?.audiences?.[0]}
              hint="Every audience is checked against the suppression list before anything is sent.">
              <div className="stack stack-sm">
                {AUDIENCES.map((item) => (
                  <Check
                    key={item.value}
                    name={item.value}
                    label={item.label}
                    hint={item.hint}
                    checked={form.audiences.includes(item.value)}
                    onChange={(on) => toggleAudience(item.value, on)}
                  />
                ))}
              </div>
            </Field>

            <div className="row-between" style={{ flexWrap: 'wrap', gap: 12 }}>
              <p className="small" style={{ margin: 0 }}>
                {estimate.loading
                  ? 'Counting recipients…'
                  : estimate.error
                    ? estimate.error
                    : eligible != null
                      ? `${eligible} recipient${eligible === 1 ? '' : 's'} would be addressed${
                          estimate.data.excluded_suppressed
                            ? ` · ${estimate.data.excluded_suppressed} suppressed`
                            : ''
                        }${estimate.data.duplicates ? ` · ${estimate.data.duplicates} duplicate address(es) merged` : ''}.`
                      : 'Pick at least one audience to see how many people it reaches.'}
              </p>
              {savedId ? (
                <div className="row-end">
                  <Input
                    kind="email"
                    name="test_address"
                    value={testAddress}
                    onChange={setTestAddress}
                    placeholder="you@mantbridges.com"
                    style={{ minWidth: 210 }}
                  />
                  <Button variant="outline" pending={test.pending} disabled={!testAddress}
                    onClick={() => test.execute()}>
                    Send test
                  </Button>
                  <Button variant="outline" pending={showPreview.pending} onClick={() => showPreview.execute()}>
                    Preview
                  </Button>
                </div>
              ) : (
                <p className="hint" style={{ margin: 0 }}>Save the draft to preview or test-send it.</p>
              )}
            </div>

            {test.error || showPreview.error ? <Callout>{test.error || showPreview.error}</Callout> : null}

            {previewHtml ? (
              <iframe
                className="email-preview"
                title={`Preview of the email for “${editing.campaign.name}”`}
                srcDoc={previewHtml}
                sandbox=""
              />
            ) : null}

            {savedId ? (
              <div className="row-end" style={{ flexWrap: 'wrap', gap: 10 }}>
                <p className="hint" style={{ margin: 0, flex: '1 1 260px' }}>
                  {editing.campaign.status === 'DRAFT'
                    ? 'Queueing freezes this audience and hands the campaign to the sending command. It does not send anything from this page.'
                    : `This campaign is ${editing.campaign.status_display.toLowerCase()}.`}
                </p>
                {editing.campaign.is_editable ? (
                  <Button onClick={() => setQueueing(editing.campaign)}>Queue for sending</Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(report)}
        size="lg"
        title={report ? `Recipients — ${report.name}` : 'Recipients'}
        onClose={() => setReport(null)}
      >
        {report ? (
          <div className="stack">
            <div className="tabs" role="tablist">
              {RECIPIENT_STATUSES.map((tab) => (
                <button
                  key={tab.value || 'all'}
                  type="button"
                  className={`tab${reportStatus === tab.value ? ' active' : ''}`}
                  onClick={() => {
                    setReportStatus(tab.value)
                    setReportPage(1)
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <Table
              head={['Address', 'Source', 'Status', 'Attempts', 'Sent']}
              rows={reportRows.data?.results ?? []}
              loading={reportRows.loading}
              error={reportRows.error}
              onRetry={reportRows.reload}
              empty={<div className="empty"><p className="muted">Nothing queued for this status.</p></div>}
              renderRow={(row) => (
                <tr key={row.id}>
                  <Td>
                    <span className="semi">{row.email}</span>
                    {row.error ? (
                      <span className="tiny muted" style={{ display: 'block' }}>{row.error}</span>
                    ) : null}
                  </Td>
                  <Td className="tiny">{row.source_display}</Td>
                  <Td>
                    <StatusBadge value={row.status} label={row.status_display} />
                  </Td>
                  <Td className="tiny">{row.attempts}</Td>
                  <Td className="tiny">{row.sent_at ? dateTimeLabel(row.sent_at) : '—'}</Td>
                </tr>
              )}
            />
            <Pagination
              page={reportPage}
              pageCount={Math.max(1, Math.ceil((reportRows.data?.count ?? 0) / 12))}
              total={reportRows.data?.count ?? 0}
              onChange={setReportPage}
              noun="recipient"
            />
            <Callout tone="navy">
              <strong>Accepted</strong> means the mail server took the message. It is not proof that it
              arrived in an inbox: this platform records no delivery, open or click events, because the
              provider has not confirmed any.
            </Callout>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(queueing)}
        title="Queue this campaign?"
        confirmLabel="Queue for sending"
        pending={queue.pending}
        message={queueing ? `“${queueing.name}” — ${queueing.subject}` : ''}
        detail={
          <span>
            The audience is resolved and frozen now, including the suppression list. Nothing leaves
            the server until <code>send_email_campaign</code> runs; a campaign that is queued can still
            be cancelled before that happens.
          </span>
        }
        onConfirm={() => queue.execute()}
        onClose={() => setQueueing(null)}
      />

      <ConfirmDialog
        open={Boolean(cancelling)}
        title="Cancel this campaign?"
        danger
        confirmLabel="Cancel campaign"
        pending={cancel.pending}
        message={cancelling ? `“${cancelling.name}”` : ''}
        detail={
          <span>
            Anything not yet handed to the mail server stops. Messages already accepted cannot be
            recalled — {cancelling ? `${cancelling.accepted_count} already accepted.` : ''}
          </span>
        }
        onConfirm={() => cancel.execute()}
        onClose={() => setCancelling(null)}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this draft?"
        danger
        confirmLabel="Delete draft"
        pending={remove.pending}
        message={deleting ? `“${deleting.name}”` : ''}
        detail={<span>Only drafts can be deleted. A queued or sent campaign keeps its record.</span>}
        onConfirm={() => remove.execute()}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}
