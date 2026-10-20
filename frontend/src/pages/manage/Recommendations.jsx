import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, ShieldCheck, X } from 'lucide-react'
import {
  declineRecommendation,
  recommendationQueue,
  recommendationQueueStats,
  startDueDiligence,
  verifyRecommendation,
} from '../../api/properties.js'
import { useApi } from '../../hooks/useApi.js'
import { useList } from '../../hooks/useList.js'
import { useAction } from '../../hooks/useAction.js'
import { useLookups } from '../../context/LookupContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { Callout, KeyValue, PageHeader, Panel, Tabs } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { StatusBadge } from '../../components/ui/Badge.jsx'
import { Field, FormAlert, Input, SearchBar, SelectOptions } from '../../components/ui/Form.jsx'
import { EmptyState } from '../../components/ui/Feedback.jsx'
import { Modal } from '../../components/ui/Modal.jsx'
import { Actions, Table, Td } from '../../components/ui/Table.jsx'
import { Pagination } from '../../components/ui/Pagination.jsx'
import { dateLabel, dateTimeLabel, money } from '../../utils/format.js'

const TABS = [
  { value: 'SUBMITTED', label: 'Waiting on the desk' },
  { value: 'IN_REVIEW', label: 'In due diligence' },
  { value: 'VERIFIED', label: 'Verified and listed' },
  { value: 'DECLINED', label: 'Declined' },
  { value: 'DRAFT', label: 'Owner drafts' },
  { value: '', label: 'Everything' },
]

const AREA_UNITS = { sqm: 'sq m', sqft: 'sq ft', plots: 'plots', acres: 'acres' }

/**
 * The verification queue. Nothing an owner recommends reaches the catalogue from this page
 * until somebody in the office has inspected the property and confirmed the contracts.
 */
export default function Recommendations() {
  const { options } = useLookups()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(null)

  const list = useList(recommendationQueue, { status: 'SUBMITTED', ordering: '-created_at' })
  const stats = useApi(() => recommendationQueueStats(), [])

  const kinds = useMemo(() => labelMap(options.listing_kinds), [options.listing_kinds])
  const types = useMemo(() => labelMap(options.property_types), [options.property_types])
  const periods = useMemo(() => labelMap(options.price_periods), [options.price_periods])
  const active = list.filters.status || ''

  const review = useAction(
    async (row) => {
      const updated = await startDueDiligence(row.id)
      list.reload()
      stats.reload()
      return updated
    },
    {
      onDone: (updated) => {
        if (!updated) return undefined
        toast.success(`“${updated.title}” is marked as in due diligence.`)
        return undefined
      },
    }
  )

  const error = review.error

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Portfolio"
        title="Recommended properties"
        lead="What owners have put in front of the desk. Inspect the property, check the papers and confirm the contracts, then verify it — verification publishes the listing on the owner's account at once. Anything you have not verified stays on the owner's own account and never appears publicly."
        actions={
          <Button variant="outline" to="/manage/properties">
            <ExternalLink size={15} /> Published listings
          </Button>
        }
      />

      <Callout tone="navy">
        Verification means the office has seen the property and the papers behind it. The price an
        owner writes here is his own expectation, not a valuation by Mant Bridges.
      </Callout>

      {error ? <Callout>{error}</Callout> : null}

      <Panel
        title="The queue"
        action={<span className="muted small">{stats.data?.total ?? 0} recommendations</span>}
      >
        <Tabs
          tabs={TABS.map((tab) => ({
            ...tab,
            count: tab.value ? stats.data?.[tab.value] : stats.data?.total,
          }))}
          active={active}
          onChange={(value) => list.patchFilters({ status: value || undefined })}
        />

        <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Title, address, plot reference or owner…"
            onSubmit={() => list.patchFilters({ search: search || undefined })}
            buttonLabel="Search"
          />
        </div>

        <Table
          caption="Property recommendations the office has to check"
          head={['Property', 'Offered by', 'For', 'Where', { label: 'Expected', num: true }, 'Status', '']}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          empty={
            <EmptyState icon={ShieldCheck} title="Nothing in this part of the queue">
              Owners recommend properties from their own portal. A draft only lands here once the
              owner sends it.
            </EmptyState>
          }
        renderRow={(row) => (
            <tr key={row.id}>
              <Td>
                <button type="button" className="btn btn-link" onClick={() => setOpen(row)}>
                  <span className="bold">{row.title || 'An untitled recommendation'}</span>
                </button>
                <span className="hint" style={{ display: 'block' }}>
                  {types[row.property_type] || 'Kind not given'}
                  {row.bedrooms ? ` · ${row.bedrooms} bed` : ''}
                  {row.submitted_at ? ` · sent ${dateLabel(row.submitted_at)}` : ' · not sent yet'}
                </span>
              </Td>
              <Td>
                {row.recommender_name}
                <span className="hint" style={{ display: 'block' }}>
                  {row.recommender_phone || row.recommender_email}
                </span>
              </Td>
              <Td>{kinds[row.listing_kind] || '—'}</Td>
              <Td>{row.city || '—'}</Td>
              <Td num>
                {row.price_expectation
                  ? money(row.price_expectation, row.currency || 'UGX')
                  : 'Not stated'}
              </Td>
              <Td>
                <StatusBadge value={row.status} label={row.status_display} />
                {row.listing_slug ? (
                  <Link
                    to={`/properties/${row.listing_slug}`}
                    className="hint"
                    style={{ display: 'block' }}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Live listing
                  </Link>
                ) : null}
              </Td>
              <Td>
                <Actions>
                  <Button size="sm" variant="outline" onClick={() => setOpen(row)}>
                    Open
                  </Button>
                  {row.status === 'SUBMITTED' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => review.execute(row)}
                      pending={review.pending}
                    >
                      Due diligence
                    </Button>
                  ) : null}
                </Actions>
              </Td>
            </tr>
        )}
        />

        <Pagination
          page={list.page}
          pageCount={list.pageCount}
          total={list.count}
          onChange={list.setPage}
          noun="recommendation"
        />
      </Panel>

      {open ? (
        <DecisionModal
          key={open.id}
          row={open}
          kinds={kinds}
          types={types}
          periods={periods}
          currency={options.currency}
          onClose={() => setOpen(null)}
          onDone={(decided) => {
            list.reload()
            stats.reload()
            setOpen(null)
            toast.success(
              decided === 'decline'
                ? 'Turned down, and the owner reads your reason in his portal.'
                : 'Verified and published on the owner’s account.'
            )
          }}
          call={async (payload) => {
            if (payload.mode === 'decline') {
              return declineRecommendation(open.id, { note: payload.note })
            }
            return verifyRecommendation(open.id, {
              listing_type: payload.listing_type || undefined,
              price: payload.price || undefined,
              currency: payload.currency || undefined,
              note: payload.note || undefined,
            })
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * The desk's decision. Verify publishes now; decline writes the note the owner sees.
 */
function DecisionModal({ row, kinds, types, periods, currency, onClose, onDone, call }) {
  const [mode, setMode] = useState('verify')
  const [note, setNote] = useState('')
  const [price, setPrice] = useState(row.price_expectation ? String(row.price_expectation) : '')
  const [listingType, setListingType] = useState(row.listing_kind === 'BOTH' ? '' : row.listing_kind)
  const settled = row.status === 'VERIFIED' || row.status === 'DECLINED'

  const decision = useAction(
    async () => {
      const decided = await call({
        mode,
        note,
        price,
        listing_type: listingType,
        currency: row.currency || currency || 'UGX',
      })
      if (decided) onDone(mode)
      return mode
    },
    {}
  )

  return (
    <Modal
      open
      size="lg"
      title={row.title || 'Recommendation'}
      onClose={onClose}
      footer={
        settled ? (
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose} disabled={decision.pending}>
              Cancel
            </Button>
            <Button pending={decision.pending} onClick={decision.execute}>
              {mode === 'verify' ? <ShieldCheck size={15} /> : <X size={15} />}
              {mode === 'verify' ? 'Verify and publish' : 'Turn it down'}
            </Button>
          </>
        )
      }
    >
      <div className="stack">
        <FormAlert error={decision.error} />

        <KeyValue
          items={[
            { label: 'Offered by', value: `${row.recommender_name} · ${row.recommender_email}` },
            { label: 'Phone', value: row.recommender_phone || row.inspection_contact || '' },
            { label: 'For', value: kinds[row.listing_kind] || '' },
            { label: 'Kind', value: types[row.property_type] || '' },
            {
              label: 'Bed / bath / parking',
              value: [row.bedrooms, row.bathrooms, row.parking_spaces].map((n) => n ?? '—').join(' / '),
            },
            {
              label: 'Size',
              value: row.area
                ? `${Number(row.area).toLocaleString()} ${AREA_UNITS[row.area_unit] || row.area_unit || ''}`.trim()
                : '',
            },
            { label: 'Where', value: [row.address, row.district, row.city].filter(Boolean).join(', ') },
            { label: 'Plot reference', value: row.plot_reference || '' },
            {
              label: 'Expectation',
              value: row.price_expectation
                ? `${money(row.price_expectation, row.currency || 'UGX')}${
                    row.price_period ? ` · ${periods[row.price_period] || row.price_period}` : ''
                  }`
                : 'Not stated',
            },
            { label: 'How it relates to them', value: row.ownership_display || row.ownership || '' },
            { label: 'Occupancy', value: row.occupancy_display || '' },
            {
              label: 'Papers',
              value: [row.paperwork_display, row.paperwork_note].filter(Boolean).join(' — '),
            },
            { label: 'To view it', value: row.inspection_contact || '' },
            { label: 'Sent', value: row.submitted_at ? dateTimeLabel(row.submitted_at) : 'Not sent yet' },
          ]}
        />

        <div className="callout">
          <strong>What the owner wrote</strong>
          <p className="soft" style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
            {row.description || 'Nothing was described.'}
          </p>
        </div>

        {row.admin_note ? (
          <Callout tone="navy">
            <strong>Note on file:</strong> {row.admin_note}
            {row.decided_by_name ? ` — ${row.decided_by_name}, ${dateLabel(row.decided_at)}` : ''}
          </Callout>
        ) : null}

        {row.status === 'VERIFIED' ? (
          <Callout>
            Already published as{' '}
            {row.listing_slug ? (
              <Link to={`/properties/${row.listing_slug}`} target="_blank" rel="noreferrer">
                {row.listing_title}
              </Link>
            ) : (
              <strong>{row.listing_title}</strong>
            )}
            . Verifying it again would create a second listing, so this decision is closed.
          </Callout>
        ) : null}

        {row.status === 'DECLINED' ? (
          <Callout>This was turned down and the owner has been told why.</Callout>
        ) : null}

        {settled ? null : (
          <>
            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className={`chip${mode === 'verify' ? ' chip-active' : ''}`}
                onClick={() => setMode('verify')}
              >
                <ShieldCheck size={13} /> Verify and publish
              </button>
              <button
                type="button"
                className={`chip${mode === 'decline' ? ' chip-active' : ''}`}
                onClick={() => setMode('decline')}
              >
                <X size={13} /> Turn it down
              </button>
            </div>

            {mode === 'verify' ? (
              <div className="form-grid">
                <Field
                  name="listing_type"
                  label="Which listing to publish"
                  required={row.listing_kind === 'BOTH'}
                  error={decision.errors.listing_type?.[0]}
                  hint="A property offered for sale and to rent is published one at a time — choose which the first listing shows."
                >
                  <Input as="select" name="listing_type" value={listingType} onChange={setListingType}>
                    <option value="">Use what the owner said</option>
                    <SelectOptions
                      items={[
                        { value: 'RENT', label: 'For rent' },
                        { value: 'SALE', label: 'For sale' },
                      ]}
                    />
                  </Input>
                </Field>
                <Field
                  name="price"
                  label="Asking price to publish"
                  error={decision.errors.price?.[0]}
                  hint="Leave it as it stands to publish the owner's own expectation. The desk has not valued the property."
                >
                  <Input kind="number" name="price" value={price} onChange={setPrice} min="0" step="1000" />
                </Field>
                <Field
                  name="note"
                  label="Note for the owner"
                  span2
                  hint="Optional — what you checked and what happens next. He reads this in his portal."
                >
                  <Input as="textarea" name="note" rows={3} value={note} onChange={setNote} />
                </Field>
              </div>
            ) : (
              <Field
                name="note"
                label="Why, in the owner's words"
                required
                span2
                error={decision.errors.note?.[0]}
                hint="He reads this in his portal. Say what is missing, or why Mant Bridges cannot take the property."
              >
                <Input as="textarea" name="note" rows={4} value={note} onChange={setNote} />
              </Field>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

function labelMap(items) {
  return (items || []).reduce((acc, item) => {
    acc[item.value] = item.label
    return acc
  }, {})
}
