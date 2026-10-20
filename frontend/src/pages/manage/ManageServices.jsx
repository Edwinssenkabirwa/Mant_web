import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react'
import { deleteService, manageServices as fetchServices, patchService } from '../../api/services.js'
import { collect } from '../../api/paginate.js'
import { useApi } from '../../hooks/useApi.js'
import { useAction } from '../../hooks/useAction.js'
import { useToast } from '../../context/ToastContext.jsx'
import ServiceBadge from '../../components/services/ServiceBadge.jsx'
import { Callout, PageHeader, Panel, Stat } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { ConfirmDialog } from '../../components/ui/Modal.jsx'
import { Td, Table } from '../../components/ui/Table.jsx'
import { EmptyState } from '../../components/ui/Feedback.jsx'
import { dateLabel } from '../../utils/format.js'
import { mediaUrl } from '../../utils/media.js'

/**
 * The five (or six, or two) services the website advertises. Nothing about them is written in
 * the front end, so this list and the editor behind it are the only place to change what
 * visitors read on the home page, the services page and every service page.
 */
export default function ManageServices() {
  const navigate = useNavigate()
  const toast = useToast()
  const rows = useApi(() => collect(fetchServices, {}, 100), [])
  const [deleting, setDeleting] = useState(null)

  const list = sortLikeSite(rows.data || [])
  const published = list.filter((row) => row.is_published)

  const toggle = useAction(
    async (service) => {
      const updated = await patchService(service.id, { is_published: !service.is_published })
      await rows.reload()
      return updated
    },
    {
      onDone: (updated) => {
        if (!updated) return undefined
        toast.success(
          updated.is_published
            ? `“${updated.name}” is live on the website.`
            : `“${updated.name}” is back in drafts — visitors can no longer open its page.`
        )
        return undefined
      },
    }
  )

  const move = useAction(
    async (service, direction) => {
      const index = list.findIndex((row) => row.id === service.id)
      const neighbour = list[index + direction]
      if (!neighbour) return undefined
      if (neighbour.order !== service.order) {
        await Promise.all([
          patchService(service.id, { order: neighbour.order }),
          patchService(neighbour.id, { order: service.order }),
        ])
      } else {
        // Two records left with the same number: nudge this one past the other.
        await patchService(service.id, { order: Math.max(0, service.order + direction) })
      }
      await rows.reload()
      return { name: service.name, direction }
    },
    {
      onDone: (result) => {
        if (!result) return undefined
        toast.success(`“${result.name}” moved ${result.direction < 0 ? 'up' : 'down'} the list.`)
        return undefined
      },
    }
  )

  const remove = useAction(
    async () => {
      await deleteService(deleting.id)
      await rows.reload()
      return deleting
    },
    {
      onDone: (service) => {
        if (!service) return undefined
        toast.success(`Deleted “${service.name}”.`)
        setDeleting(null)
        return undefined
      },
    }
  )

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Content"
        title="Services"
        lead="Write, order and publish what Mant Bridges offers. The home page, the services page and every service page read from these records, so a change here is the change on the site."
        actions={
          <Button onClick={() => navigate('/manage/services/new')}>
            <Plus size={15} /> New service
          </Button>
        }
      />

      <div className="grid grid-4">
        <Stat label="Services" value={list.length} />
        <Stat label="Live on the site" value={published.length} tone="ok" />
        <Stat label="Drafts" value={list.length - published.length} tone="warn" />
        <Stat label="Points published" value={published.reduce((sum, row) => sum + (row.highlights?.length || 0), 0)} />
      </div>

      {toggle.error || move.error || remove.error ? (
        <Callout>{toggle.error || move.error || remove.error}</Callout>
      ) : null}

      <Panel title="Order shown on the website">
        <Table
          head={['Service', 'Category', { label: 'Order', num: true }, 'Status', 'Artwork', 'Actions']}
          rows={list}
          loading={rows.loading}
          error={rows.error}
          onRetry={rows.reload}
          empty={
            <EmptyState title="No services yet">
              Create the first one and it appears in the home page list as soon as you publish it.
            </EmptyState>
          }
          renderRow={(service, index) => (
            <tr key={service.id}>
              <Td>
                <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                  <ServiceBadge icon={service.icon} size={18} />
                  <div className="truncate">
                    <Link to={`/manage/services/${service.id}/edit`} className="bold">
                      {service.name}
                    </Link>
                    {service.is_published ? (
                      <a
                        href={`/services/${service.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="property-link tiny"
                        style={{ marginLeft: 6 }}
                      >
                        on the site <ExternalLink size={11} />
                      </a>
                    ) : null}
                    <span className="tiny muted" style={{ display: 'block' }}>
                      {service.summary_text}
                    </span>
                  </div>
                </div>
              </Td>
              <Td className="tiny">
                {service.category_display || 'No category'}
                <span className="tiny muted" style={{ display: 'block' }}>
                  {service.paragraphs?.length || 0} blocks · {service.highlights?.length || 0} points
                </span>
              </Td>
              <Td num>
                <div className="row-end" style={{ gap: 4 }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm btn-icon"
                    title="Move up"
                    onClick={() => move.execute(service, -1)}
                    disabled={move.pending || index === 0}
                  >
                    <ArrowUp size={13} />
                  </button>
                  <span className="mono">{service.order}</span>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm btn-icon"
                    title="Move down"
                    onClick={() => move.execute(service, 1)}
                    disabled={move.pending || index === list.length - 1}
                  >
                    <ArrowDown size={13} />
                  </button>
                </div>
              </Td>
              <Td>
                <span className={`badge ${service.is_published ? 'badge-ok' : 'badge-outline'}`}>
                  {service.is_published ? 'Published' : 'Draft'}
                </span>
                <span className="tiny muted" style={{ display: 'block' }}>
                  Updated {service.updated_at ? dateLabel(service.updated_at) : '—'}
                </span>
              </Td>
              <Td>
                {service.image_url ? (
                  <img className="thumb" src={mediaUrl(service.image_url)} alt="" />
                ) : (
                  <span className="tiny muted">None</span>
                )}
              </Td>
              <Td num>
                <div className="table-actions">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => toggle.execute(service)}
                    disabled={toggle.pending}
                  >
                    {service.is_published ? 'Unpublish' : 'Publish'}
                  </button>
                  <Link
                    to={`/manage/services/${service.id}/edit`}
                    className="btn btn-outline btn-sm btn-icon"
                    title="Edit"
                  >
                    <Pencil size={13} />
                  </Link>
                  <Link
                    to={`/manage/services/${service.id}/preview`}
                    className="btn btn-outline btn-sm btn-icon"
                    title="Preview as it will read"
                  >
                    <ExternalLink size={13} />
                  </Link>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm btn-icon"
                    title="Delete"
                    onClick={() => setDeleting(service)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </Td>
            </tr>
          )}
        />

        <p className="muted small">
          Publish, unpublish and the arrows change one field at a time, so the wording you have already saved is never
          resent. A draft keeps its page for you to preview but is closed to visitors, and only published services
          reach the home page and the services page.
        </p>
      </Panel>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this service?"
        danger
        confirmLabel="Delete service"
        pending={remove.pending}
        message={deleting ? `“${deleting.name}” will be removed from the website.` : ''}
        detail={
          <span>
            The page, its artwork link and its points are deleted from the database and there is no restore. Unpublish
            it instead if you only want it off the site for now.
          </span>
        }
        onConfirm={() => remove.execute()}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}

/** The API already orders by number then name; this keeps the two arrows honest. */
function sortLikeSite(list) {
  return [...list].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}
