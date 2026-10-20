import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ExternalLink, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import {
  MANAGE_PROPERTY_ORDERING,
  deleteProperty,
  manageList,
  manageStats,
  patchProperty,
} from '../../api/properties.js'
import { hasActiveFilters, useList } from '../../hooks/useList.js'
import { useApi } from '../../hooks/useApi.js'
import { useAction } from '../../hooks/useAction.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useLookups } from '../../context/LookupContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { StatusBadge } from '../../components/ui/Badge.jsx'
import { Callout, PageHeader, Panel, Stat } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Input, SearchBar, SelectOptions } from '../../components/ui/Form.jsx'
import { ConfirmDialog } from '../../components/ui/Modal.jsx'
import { Pagination } from '../../components/ui/Pagination.jsx'
import { Td, Table } from '../../components/ui/Table.jsx'
import { mediaUrl } from '../../utils/media.js'
import { dateLabel } from '../../utils/format.js'

export default function Properties() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { options, company } = useLookups()
  const toast = useToast()
  const isAdmin = user?.role === 'ADMIN'

  const [search, setSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null)

  const list = useList(manageList, { ordering: '-created_at' })
  const stats = useApi(() => manageStats(), [])
  const active = hasActiveFilters(list.filters, ['ordering'])

  const toggle = useAction(
    async (property, field) => {
      const next = await patchProperty(property.id, { [field]: !property[field] })
      list.reload()
      stats.reload()
      return next
    },
    {
      onDone: (next) => toast.success(`“${next.title}” updated.`),
    }
  )

  const remove = useAction(async (id) => deleteProperty(id), {
    onDone: () => {
      toast.success('Listing removed.')
      setPendingDelete(null)
      list.reload()
      stats.reload()
    },
  })

  useEffect(() => {
    setSearch(list.filters.q || '')
  }, [list.filters.q])

  const runSearch = () => list.patchFilters({ q: search })

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Portfolio"
        title={isAdmin ? 'Every listing' : 'My listings'}
        lead={
          isAdmin
            ? 'All property on the Mant Bridges books, including drafts and off-market rows. Public visitors only ever see published, available listings.'
            : 'Property registered to your account. You do not add listings here — the office writes up each one after its own verification. To put a new property forward, use the recommendation form.'
        }
        actions={
          isAdmin ? (
            <Button onClick={() => navigate('/manage/properties/new')}>
              <Plus size={15} /> New listing
            </Button>
          ) : (
            <Button to="/landlord/recommendations">
              <Plus size={15} /> Recommend a property
            </Button>
          )
        }
      />

      {toggle.error || remove.error ? <Callout>{toggle.error || remove.error}</Callout> : null}

      {stats.data ? (
        <div className="grid grid-4">
          <Stat label="Listings" value={(stats.data.total ?? 0).toLocaleString()} />
          <Stat label="Published" value={(stats.data.published ?? 0).toLocaleString()} tone="ok" />
          <Stat label="Featured" value={(stats.data.featured ?? 0).toLocaleString()} />
          <Stat
            label="Occupied"
            value={(stats.data.by_status?.OCCUPIED ?? 0).toLocaleString()}
            foot={`${stats.data.for_rent ?? 0} to rent · ${stats.data.for_sale ?? 0} for sale`}
          />
        </div>
      ) : null}

      <Panel
        title="Listings"
        action={
          <div className="row" style={{ gap: 8 }}>
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Title, address, reference…"
              onSubmit={runSearch}
              buttonLabel="Search"
            />
          </div>
        }
      >
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <Input
            as="select"
            name="status"
            value={list.filters.status || ''}
            onChange={(value) => list.patchFilters({ status: value || undefined })}
            style={{ minWidth: 160 }}
          >
            <option value="">Any status</option>
            <SelectOptions items={options.property_statuses} />
          </Input>
          <Input
            as="select"
            name="listing_type"
            value={list.filters.listing_type || ''}
            onChange={(value) => list.patchFilters({ listing_type: value || undefined })}
            style={{ minWidth: 150 }}
          >
            <option value="">Rent and sale</option>
            <SelectOptions items={options.listing_types} />
          </Input>
          <Input
            as="select"
            name="city"
            value={list.filters.city || ''}
            onChange={(value) => list.patchFilters({ city: value || undefined })}
            style={{ minWidth: 150 }}
          >
            <option value="">Any city</option>
            <SelectOptions items={(options.cities || []).map((city) => ({ value: city, label: city }))} />
          </Input>
          <Input
            as="select"
            name="ordering"
            value={list.filters.ordering}
            onChange={(value) => list.patchFilters({ ordering: value }, { keepPage: true })}
            style={{ minWidth: 190 }}
          >
            <SelectOptions items={MANAGE_PROPERTY_ORDERING} />
          </Input>
          {active ? (
            <button type="button" className="chip chip-button" onClick={list.reset}>
              Clear
            </button>
          ) : null}
        </div>

        <Table
          head={[
            'Listing',
            'Location',
            { label: 'Price', num: true },
            'Status',
            'Public',
            { label: 'Views', num: true },
            'Actions',
          ]}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          empty={
            <div className="empty">
              <h3>{active ? 'No listing matches these filters' : 'No property yet'}</h3>
              <p className="muted">
                {active
                  ? 'Try a different status or clear the filters.'
                  : isAdmin
                    ? 'Create the first listing and it will appear here and on the public catalogue.'
                    : 'Nothing is registered to your account yet. Send the property details to the desk and the office lists it after its own checks.'}
              </p>
            </div>
          }
          renderRow={(property) => (
            <tr key={property.id}>
              <Td>
                <span className="row" style={{ gap: 10 }}>
                  <img
                    src={mediaUrl(property.cover_image_url)}
                    alt=""
                    className="thumb"
                    onError={(event) => {
                      event.currentTarget.src = mediaUrl('')
                    }}
                  />
                  <span>
                    {isAdmin ? (
                      <Link to={`/manage/properties/${property.id}/edit`} className="bold">
                        {property.title}
                      </Link>
                    ) : (
                      <span className="bold">{property.title}</span>
                    )}
                    {property.is_published ? (
                      <a
                        href={`/properties/${property.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="property-link tiny"
                        style={{ display: 'inline-flex', marginLeft: 6 }}
                      >
                        on the site <ExternalLink size={11} />
                      </a>
                    ) : null}
                    <span className="tiny muted" style={{ display: 'block' }}>
                      {property.reference || property.slug} · added {dateLabel(property.created_at)}
                      {property.is_featured ? ' · featured' : ''}
                    </span>
                  </span>
                </span>
              </Td>
              <Td>
                {property.city}
                {property.district ? <span className="muted"> · {property.district}</span> : null}
                <span className="tiny muted" style={{ display: 'block' }}>
                  {property.owner_name}
                </span>
              </Td>
              <Td num>
                <span className="bold">{property.price_display}</span>
                <span className="tiny muted" style={{ display: 'block' }}>
                  {property.bedrooms ?? 0} bed · {property.bathrooms ?? 0} bath
                </span>
              </Td>
              <Td>
                <StatusBadge value={property.status} label={property.status_display} />
              </Td>
              <Td>
                {isAdmin ? (
                  <button
                    type="button"
                    className={`chip${property.is_published ? ' chip-active' : ''}`}
                    onClick={() => toggle.execute(property, 'is_published')}
                    disabled={toggle.pending}
                  >
                    {property.is_published ? 'Published' : 'Hidden'}
                  </button>
                ) : (
                  <span className={`chip${property.is_published ? ' chip-active' : ''}`}>
                    {property.is_published ? 'Published' : 'Not published'}
                  </span>
                )}
              </Td>
              <Td num>{(property.views ?? 0).toLocaleString()}</Td>
              <Td>
                <div className="table-actions">
                  <Link
                    to={`/properties/${property.slug}`}
                    className="btn btn-outline btn-sm btn-icon"
                    title="Open the public page"
                  >
                    <ExternalLink size={14} />
                  </Link>
                  {isAdmin ? (
                    <>
                      <Link
                        to={`/manage/properties/${property.id}/edit`}
                        className="btn btn-outline btn-sm btn-icon"
                        title="Edit listing"
                      >
                        <Pencil size={14} />
                      </Link>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm btn-icon"
                        title="Feature on the homepage"
                        onClick={() => toggle.execute(property, 'is_featured')}
                        disabled={toggle.pending}
                        style={property.is_featured ? { color: 'var(--red-600)', borderColor: 'var(--red-100)' } : undefined}
                      >
                        <Star size={14} fill={property.is_featured ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm btn-icon"
                        title="Delete listing"
                        onClick={() => setPendingDelete(property)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
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
          noun="listing"
        />

        {!isAdmin ? (
          <Callout tone="navy">
            These listings were written up by {company?.name ?? 'Mant Bridges'} from your
            recommendations, after the desk did its own checks. If anything here is wrong or you
            want a property added, send it through the recommendation form — only administrators
            edit the listing itself.
          </Callout>
        ) : null}
      </Panel>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this listing?"
        message={`“${pendingDelete?.title ?? ''}” will be removed from the catalogue.`}
        detail={
          <span>
            The API refuses to delete property that already has a tenancy attached, so a let property cannot vanish by
            accident. Images attached to it are removed with it.
          </span>
        }
        confirmLabel="Delete listing"
        danger
        pending={remove.pending}
        onConfirm={() => remove.execute(pendingDelete.id)}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  )
}
