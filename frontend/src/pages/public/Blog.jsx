import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { X } from 'lucide-react'
import { listCategories, listPosts, postTags } from '../../api/blog.js'
import { collect } from '../../api/paginate.js'
import { useDebouncedValue } from '../../hooks/useDebounce.js'
import { useApi } from '../../hooks/useApi.js'
import { hasActiveFilters, useList } from '../../hooks/useList.js'
import PostCard from '../../components/blog/PostCard.jsx'
import { Breadcrumb, Callout } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Input, SearchBar, SelectOptions } from '../../components/ui/Form.jsx'
import { Pagination } from '../../components/ui/Pagination.jsx'
import { ErrorState, Skeleton } from '../../components/ui/Feedback.jsx'

const IGNORED = ['ordering', 'page']

const ORDERING = [
  { value: '-published_at', label: 'Newest first' },
  { value: 'published_at', label: 'Oldest first' },
  { value: '-views', label: 'Most read' },
  { value: 'title', label: 'Title A–Z' },
]

export default function Blog() {
  const location = useLocation()
  const initial = useMemo(() => filtersFromSearch(location.search), [location.search])
  const [search, setSearch] = useState(initial.q || '')
  const debounced = useDebouncedValue(search, 350)

  const list = useList(listPosts, initial)
  const categories = useApi(() => collect(listCategories, {}, 100), [])
  const tags = useApi(() => postTags(), [])
  const active = hasActiveFilters(list.filters, IGNORED)

  useEffect(() => {
    if (debounced) list.patchFilters({ q: debounced })
    else if (list.filters.q) list.setFilters({ ...list.filters, q: undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const reset = () => {
    setSearch('')
    list.reset()
  }

  return (
    <div className="container section-tight stack">
      <Breadcrumb items={[{ label: 'Home', to: '/' }, { label: 'Blog' }]} />
      <header className="section-head" style={{ marginBottom: 6 }}>
        <div>
          <p className="eyebrow">Company news, market insights, renting tips and landlord desk</p>
          <h1>Insights</h1>
          <p>
          
          </p>
        </div>
      </header>

      <div className="split">
        <div className="stack">
          <div className="row-between">
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search articles…"
              onSubmit={() => list.patchFilters({ q: search })}
              buttonLabel="Search"
            />
            <div className="row" style={{ gap: 8 }}>
              <label className="hint nowrap" htmlFor="ordering">
                Sort
              </label>
              <Input
                as="select"
                name="ordering"
                value={list.filters.ordering || ORDERING[0].value}
                onChange={(value) => list.patchFilters({ ordering: value })}
                style={{ minWidth: 170 }}
              >
                <SelectOptions items={ORDERING} />
              </Input>
            </div>
          </div>

          <div className="row" style={{ gap: 8 }}>
            <span className="muted small">
              {list.loading ? 'Loading…' : `${list.count.toLocaleString()} article${list.count === 1 ? '' : 's'}`}
            </span>
            {active ? (
              <button type="button" className="chip chip-button" onClick={reset}>
                <X size={13} /> Clear filters
              </button>
            ) : null}
          </div>

          {list.error ? (
            <ErrorState error={list.error} onRetry={list.reload} title="The blog could not be loaded" />
          ) : list.loading ? (
            <div className="auto-grid">
              {[0, 1, 2, 3, 4, 5].map((key) => (
                <Skeleton key={key} height={230} />
              ))}
            </div>
          ) : list.rows.length === 0 ? (
            <div className="empty">
              <h3>No articles match this search</h3>
              <p className="muted">
                Try another word, or{' '}
                <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
                  clear the filters
                </button>
                .
              </p>
            </div>
          ) : (
            <div className="auto-grid">
              {list.rows.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}

          <Pagination
            page={list.page}
            pageCount={list.pageCount}
            total={list.count}
            onChange={list.setPage}
            noun="article"
          />

          <Callout tone="navy">
            Want an article on a topic we have not covered?{' '}
            <Link to="/contact">Send us a note</Link> — reader requests shape this page.
          </Callout>
        </div>

        <aside className="sticky-side stack">
          <div className="card">
            <div className="card-head">
              <h3>Categories</h3>
            </div>
            <div className="card-body">
              {categories.error ? (
                <p className="muted small">{categories.error}</p>
              ) : categories.loading ? (
                <Skeleton height={90} />
              ) : (
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <CategoryChip
                    label="All articles"
                    isActive={!list.filters.category}
                    onClick={() => list.patchFilters({ category: undefined })}
                  />
                  {(categories.data ?? [])
                    .filter((category) => category.post_count > 0)
                    .map((category) => (
                      <CategoryChip
                        key={category.id}
                        label={`${category.name} (${category.post_count})`}
                        isActive={list.filters.category === category.slug}
                        onClick={() =>
                          list.patchFilters({
                            category: list.filters.category === category.slug ? undefined : category.slug,
                          })
                        }
                      />
                    ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Tags</h3>
            </div>
            <div className="card-body">
              {tags.error ? (
                <p className="muted small">{tags.error}</p>
              ) : tags.loading ? (
                <Skeleton height={90} />
              ) : (tags.data ?? []).length === 0 ? (
                <p className="muted small">No tags have been used yet.</p>
              ) : (
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  {(tags.data ?? []).map((item) => (
                    <CategoryChip
                      key={item.tag}
                      label={`#${item.tag} (${item.count})`}
                      isActive={list.filters.tag === item.tag}
                      onClick={() =>
                        list.patchFilters({ tag: list.filters.tag === item.tag ? undefined : item.tag })
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <label className="check">
                <input
                  type="checkbox"
                  checked={Boolean(list.filters.featured)}
                  onChange={(event) => list.patchFilters({ featured: event.target.checked || undefined })}
                />
                <span>Featured only</span>
              </label>
              <Button to="/careers" variant="outline" block size="sm" style={{ marginTop: 14 }}>
                See open roles
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function CategoryChip({ label, isActive, onClick }) {
  return (
    <button type="button" className={`chip${isActive ? ' chip-active' : ''}`} onClick={onClick}>
      {label}
    </button>
  )
}

function filtersFromSearch(searchString) {
  const params = new URLSearchParams(searchString)
  const out = {}
  ;['q', 'category', 'tag'].forEach((key) => {
    if (params.get(key)) out[key] = params.get(key)
  })
  if (params.get('featured') === 'true') out.featured = true
  out.ordering = params.get('ordering') || ORDERING[0].value
  return out
}
