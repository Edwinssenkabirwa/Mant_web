import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ExternalLink, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import {
  deletePost,
  listCategories,
  manageList as listManagePosts,
  manageStats as postStats,
  patchPost,
} from '../../api/blog.js'
import { collect } from '../../api/paginate.js'
import { hasActiveFilters, useList } from '../../hooks/useList.js'
import { useApi } from '../../hooks/useApi.js'
import { useAction } from '../../hooks/useAction.js'
import { useToast } from '../../context/ToastContext.jsx'
import { StatusBadge } from '../../components/ui/Badge.jsx'
import { Callout, PageHeader, Panel, Stat } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Input, SearchBar, SelectOptions } from '../../components/ui/Form.jsx'
import { ConfirmDialog } from '../../components/ui/Modal.jsx'
import { Pagination } from '../../components/ui/Pagination.jsx'
import { Td, Table } from '../../components/ui/Table.jsx'
import { dateLabel } from '../../utils/format.js'
import { mediaUrl } from '../../utils/media.js'

const count = (value) => (Number(value) || 0).toLocaleString()

const ORDERING = [
  { value: '-created_at', label: 'Created most recently' },
  { value: '-published_at', label: 'Published most recently' },
  { value: '-views', label: 'Most read' },
  { value: 'title', label: 'Title A–Z' },
]

const STATUSES = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
]

/** Blog administration — the API restricts this to administrators. */
export default function ManagePosts() {
  const navigate = useNavigate()
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState(null)

  const list = useList(listManagePosts, { ordering: ORDERING[0].value })
  const stats = useApi(() => postStats(), [])
  const categories = useApi(() => collect(listCategories, {}, 100), [])
  const active = hasActiveFilters(list.filters, ['ordering'])

  useEffect(() => setSearch(list.filters.q || ''), [list.filters.q])

  const toggle = useAction(
    async (post, changes) => {
      const updated = await patchPost(post.id, changes)
      list.reload()
      stats.reload()
      return { updated, changes }
    },
    {
      onDone: (result) => {
        if (!result) return undefined
        const { updated, changes } = result
        toast.success(
          changes.is_featured !== undefined
            ? `“${updated.title}” ${updated.is_featured ? 'added to' : 'removed from'} the featured articles.`
            : `“${updated.title}” is ${updated.status === 'PUBLISHED' ? 'live on the blog' : 'back in drafts'}.`
        )
        return undefined
      },
    }
  )

  const remove = useAction(
    async () => {
      await deletePost(deleting.id)
      list.reload()
      stats.reload()
      return deleting
    },
    {
      onDone: (post) => {
        if (!post) return undefined
        toast.success(`Deleted “${post.title}”.`)
        setDeleting(null)
        return undefined
      },
    }
  )

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Content"
        title="Blog posts"
        lead="Write, stage and publish the articles shown on the public blog. Drafts are invisible to visitors until they are published."
        actions={
          <Button onClick={() => navigate('/manage/posts/new')}>
            <Plus size={15} /> New article
          </Button>
        }
      />

      {stats.data ? (
        <div className="grid grid-4">
          <Stat label="Articles" value={count(stats.data.total)} />
          <Stat label="Published" value={count(stats.data.published)} tone="ok" />
          <Stat label="Drafts" value={count(stats.data.drafts)} tone="warn" />
          <Stat
            label="Total reads"
            value={count(stats.data.total_views)}
            foot={`${count(stats.data.featured)} featured`}
          />
        </div>
      ) : null}

      {toggle.error || remove.error ? <Callout>{toggle.error || remove.error}</Callout> : null}

      <Panel title="All articles">
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Title, body or author…"
            onSubmit={() => list.patchFilters({ q: search })}
            buttonLabel="Search"
          />
          <Input
            as="select"
            name="status"
            value={list.filters.status || ''}
            onChange={(value) => list.patchFilters({ status: value || undefined }, { keepPage: true })}
            style={{ minWidth: 140 }}
          >
            <SelectOptions items={STATUSES} placeholder="Any status" />
          </Input>
          <Input
            as="select"
            name="category_id"
            value={list.filters.category_id || ''}
            onChange={(value) => list.patchFilters({ category_id: value || undefined }, { keepPage: true })}
            style={{ minWidth: 170 }}
          >
            <SelectOptions items={categories.data || []} valueKey="id" labelKey="name" placeholder="Any category" />
          </Input>
          <Input
            as="select"
            name="ordering"
            value={list.filters.ordering || ORDERING[0].value}
            onChange={(value) => list.patchFilters({ ordering: value }, { keepPage: true })}
            style={{ minWidth: 190 }}
          >
            <SelectOptions items={ORDERING} />
          </Input>
          <button
            type="button"
            className={`chip chip-button${list.filters.featured ? ' chip-active' : ''}`}
            onClick={() =>
              list.patchFilters({ featured: list.filters.featured ? undefined : 'true' }, { keepPage: true })
            }
          >
            Featured only
          </button>
          {active ? (
            <button type="button" className="chip chip-button" onClick={list.reset}>
              Clear all
            </button>
          ) : null}
        </div>

        <Table
          head={['Article', 'Category', 'Status', 'Published', { label: 'Reads', num: true }, 'Actions']}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          empty={
            <div className="empty">
              <h3>No articles yet</h3>
              <p className="muted">Publish the first post, or clear these filters.</p>
            </div>
          }
          renderRow={(post) => (
            <tr key={post.id}>
              <Td>
                <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                  {post.cover_image_url ? (
                    <img className="thumb" src={mediaUrl(post.cover_image_url)} alt="" />
                  ) : (
                    <span className="thumb" />
                  )}
                  <div className="truncate">
                    <Link to={`/manage/posts/${post.id}/edit`} className="bold">
                      {post.title}
                    </Link>
                    {post.is_featured ? (
                      <span className="badge badge-navy" style={{ marginLeft: 6 }}>
                        Featured
                      </span>
                    ) : null}
                    {post.status === 'PUBLISHED' ? (
                      <a
                        href={`/blog/${post.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="property-link tiny"
                        style={{ marginLeft: 6 }}
                      >
                        on the site <ExternalLink size={11} />
                      </a>
                    ) : null}
                    <span className="tiny muted" style={{ display: 'block' }}>
                      {post.excerpt_text || 'No excerpt'}
                    </span>
                  </div>
                </div>
              </Td>
              <Td className="tiny">{post.category_name || '—'}</Td>
              <Td>
                <StatusBadge value={post.status} label={post.status_display} />
              </Td>
              <Td className="tiny">{post.published_at ? dateLabel(post.published_at) : 'Not published'}</Td>
              <Td num>{count(post.views)}</Td>
              <Td num>
                <div className="table-actions">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => toggle.execute(post, { status: post.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED' })}
                    disabled={toggle.pending}
                  >
                    {post.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm btn-icon"
                    title={post.is_featured ? 'Remove from featured' : 'Feature on the homepage'}
                    onClick={() => toggle.execute(post, { is_featured: !post.is_featured })}
                    disabled={toggle.pending}
                  >
                    <Star size={13} />
                  </button>
                  <Link
                    to={`/manage/posts/${post.id}/edit`}
                    className="btn btn-outline btn-sm btn-icon"
                    title="Edit"
                  >
                    <Pencil size={13} />
                  </Link>
                  {post.status === 'PUBLISHED' && post.slug ? (
                    <a
                      href={`/blog/${post.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-outline btn-sm btn-icon"
                      title="View live"
                    >
                      <ExternalLink size={13} />
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-outline btn-sm btn-icon"
                    title="Delete"
                    onClick={() => setDeleting(post)}
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
          noun="article"
        />

        <p className="muted small">
          Publish and feature toggles are partial updates, so the article body is untouched. Only a published article
          appears on the public blog, and views count reads of the live page.
        </p>
      </Panel>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this article?"
        danger
        confirmLabel="Delete article"
        pending={remove.pending}
        message={deleting ? `“${deleting.title}” will be removed from the blog.` : ''}
        detail={
          <span>
            The article and its view count are removed from the database. There is no restore, so unpublish it instead
            if you only want it off the site for now.
          </span>
        }
        onConfirm={() => remove.execute()}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}
