import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ImagePlus, Save, Trash2 } from 'lucide-react'
import { createPost, deletePost, listCategories, manageById, updatePost } from '../../api/blog.js'
import { collect } from '../../api/paginate.js'
import { peopleOptions } from '../../api/users.js'
import { useApi } from '../../hooks/useApi.js'
import { useAction } from '../../hooks/useAction.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { Callout, PageHeader, Panel } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Check, Field, FormAlert, Input, SelectOptions } from '../../components/ui/Form.jsx'
import { ConfirmDialog } from '../../components/ui/Modal.jsx'
import { Loading } from '../../components/ui/Feedback.jsx'
import { dateTimeLabel } from '../../utils/format.js'
import { mediaUrl } from '../../utils/media.js'

const STATUSES = [
  { value: 'DRAFT', label: 'Draft — hidden from visitors' },
  { value: 'PUBLISHED', label: 'Published — live on the blog' },
]

const BLANK = {
  title: '',
  excerpt: '',
  content: '',
  category: '',
  author: '',
  tags: '',
  status: 'DRAFT',
  is_featured: false,
  allow_comments: false,
}

/** Write or amend a blog article. The body is plain text; blank lines make paragraphs. */
export default function PostForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()

  const [form, setForm] = useState(BLANK)
  const [cover, setCover] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isEdit = Boolean(id)
  const existing = useApi(() => manageById(id), [id], { skip: !id })
  const categories = useApi(() => collect(listCategories, {}, 100), [])
  const authors = useApi(() => peopleOptions().then((rows) => rows.filter((row) => row.role !== 'TENANT')), [])

  useEffect(() => {
    if (!existing.data) return
    const post = existing.data
    setForm({
      title: post.title || '',
      excerpt: post.excerpt || '',
      content: post.content || '',
      category: post.category ? String(post.category) : '',
      author: post.author ? String(post.author) : '',
      tags: (post.tags || []).join(', '),
      status: post.status || 'DRAFT',
      is_featured: Boolean(post.is_featured),
      allow_comments: Boolean(post.allow_comments),
    })
  }, [existing.data])

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))

  const words = useMemo(() => form.content.split(/\s+/).filter(Boolean).length, [form.content])

  const save = useAction(async () => {
    const payload = {
      title: form.title,
      excerpt: form.excerpt,
      content: form.content,
      category: form.category ? Number(form.category) : null,
      author: form.author ? Number(form.author) : undefined,
      tags: splitTags(form.tags),
      status: form.status,
      is_featured: form.is_featured,
      allow_comments: form.allow_comments,
    }
    const post = isEdit
      ? await updatePost(Number(id), payload, cover || undefined)
      : await createPost(payload, cover || undefined)
    toast.success(post.status === 'PUBLISHED' ? 'Article published.' : 'Draft saved.')
    navigate('/manage/posts')
    return post
  })

  const remove = useAction(async () => {
    await deletePost(Number(id))
    toast.success('Article deleted.')
    navigate('/manage/posts')
  })

  const errors = save.errors
  const post = existing.data

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Content"
        breadcrumb={
          <Link to="/manage/posts" className="row" style={{ gap: 6, width: 'fit-content' }}>
            <ArrowLeft size={14} /> Back to articles
          </Link>
        }
        title={isEdit ? 'Edit article' : 'New article'}
        lead="Plain text only — separate paragraphs with a blank line. The reading estimate and the article URL are produced by the API."
      />

      {isEdit && existing.loading ? <Loading label="Loading the article…" /> : null}
      {existing.error ? <Callout>{existing.error}</Callout> : null}

      {isEdit && post ? (
        <p className="muted small">
          Created {dateTimeLabel(post.created_at)} · {post.views ?? 0} reads ·{' '}
          {post.slug ? (
            <a href={`/blog/${post.slug}`} target="_blank" rel="noreferrer">
              view live
            </a>
          ) : (
            'no URL yet'
          )}
        </p>
      ) : null}

      <div className="split">
        <div className="stack">
          <Panel title="The article">
            <div className="stack">
              <FormAlert error={save.error} />
              <Field name="title" label="Title" required error={errors.title?.[0]} span2>
                <Input name="title" value={form.title} onChange={set('title')} error={errors.title} />
              </Field>
              <Field
                name="excerpt"
                label="Excerpt"
                hint={`${form.excerpt.length}/400 characters. Shown on cards and in search results; left blank, the API uses the opening of the article.`}
                error={errors.excerpt?.[0]}
                span2
              >
                <Input
                  as="textarea"
                  name="excerpt"
                  rows={2}
                  value={form.excerpt}
                  onChange={set('excerpt')}
                  error={errors.excerpt}
                />
              </Field>
              <Field
                name="content"
                label="Body"
                required
                hint={`${words} words · roughly ${Math.max(1, Math.round(words / 200))} minute read. Blank lines become paragraphs.`}
                error={errors.content?.[0]}
                span2
              >
                <Input
                  as="textarea"
                  name="content"
                  rows={16}
                  value={form.content}
                  onChange={set('content')}
                  error={errors.content}
                />
              </Field>
            </div>
          </Panel>

          <Panel title="Cover image">
            <div className="row" style={{ gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <CoverPreview cover={cover} currentUrl={post?.cover_image_url} />
              <div className="grow stack stack-sm" style={{ minWidth: 220 }}>
                <input
                  id="cover-input"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => setCover(event.target.files?.[0] || null)}
                />
                <label className="chip chip-button" htmlFor="cover-input">
                  <ImagePlus size={14} /> {cover ? cover.name : 'Choose an image'}
                </label>
                {cover ? (
                  <button type="button" className="btn-link" onClick={() => setCover(null)}>
                    Remove the selected file
                  </button>
                ) : null}
                <p className="hint" style={{ margin: 0 }}>
                  {isEdit
                    ? 'Picking a file replaces the current cover. Saving without picking a file keeps the existing image.'
                    : 'Optional. The cover is the card image on the blog index and the header on the article page.'}
                </p>
              </div>
            </div>
          </Panel>
        </div>

        <aside className="stack">
          <Panel title="Publishing">
            <div className="stack">
              <Field name="status" label="Status" error={errors.status?.[0]}>
                <Input as="select" name="status" value={form.status} onChange={set('status')}>
                  <SelectOptions items={STATUSES} />
                </Input>
              </Field>
              <Check
                name="is_featured"
                label="Feature this article"
                checked={form.is_featured}
                onChange={set('is_featured')}
                hint="Featured articles appear on the home page and can be filtered on the blog."
              />
              <Check
                name="allow_comments"
                label="Open for comments"
                checked={form.allow_comments}
                onChange={set('allow_comments')}
                hint="This is a flag on the record only. The site has no comment form or comment API, so the article page tells readers to write to the desk instead."
              />
              <Field name="category" label="Category" error={errors.category?.[0]}>
                <Input as="select" name="category" value={form.category} onChange={set('category')}>
                  <SelectOptions
                    items={(categories.data || []).map((row) => ({ value: row.id, label: row.name }))}
                    placeholder="No category"
                  />
                </Input>
              </Field>
              <Field
                name="author"
                label="Author"
                hint={errors.author?.[0] || 'Administrators and landlords on the team.'}
              >
                <Input as="select" name="author" value={form.author} onChange={set('author')}>
                  <SelectOptions
                    items={(authors.data || []).map((row) => ({
                      value: row.id,
                      label: row.full_name || row.email,
                    }))}
                    placeholder={user?.full_name ? `Me — ${user.full_name}` : 'Me'}
                  />
                </Input>
              </Field>
              <Field
                name="tags"
                label="Tags"
                hint="Comma separated, up to ten. Each tag becomes a clickable filter on the blog."
                error={errors.tags?.[0]}
                span2
              >
                <Input name="tags" value={form.tags} onChange={set('tags')} error={errors.tags} />
              </Field>
            </div>
          </Panel>

          <Panel title="Save">
            <div className="stack stack-sm">
              <Button block pending={save.pending} onClick={() => save.execute()}>
                <Save size={15} /> {isEdit ? 'Save changes' : 'Create article'}
              </Button>
              <Button block variant="outline" onClick={() => navigate('/manage/posts')} disabled={save.pending}>
                Cancel
              </Button>
              {isEdit ? (
                <Button block variant="outline" onClick={() => setConfirmDelete(true)} disabled={save.pending}>
                  <Trash2 size={14} /> Delete article
                </Button>
              ) : null}
              <p className="hint" style={{ margin: 0 }}>
                Saving as a draft clears the featured flag, and publishing stamps the article with the server’s own
                date and time. The URL is built from the title and cannot be edited here.
              </p>
            </div>
          </Panel>

          {!isEdit ? (
            <Callout tone="navy">
              Write from what Mant Bridges actually does — a completed valuation, a letting process, a repair standard.
              Do not publish invented statistics, client names or awards.
            </Callout>
          ) : null}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this article?"
        danger
        confirmLabel="Delete article"
        pending={remove.pending}
        message="The article is removed from the blog and there is no restore."
        detail={remove.error ? <span>{remove.error}</span> : null}
        onConfirm={() => remove.execute()}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  )
}

function CoverPreview({ cover, currentUrl }) {
  const [objectUrl, setObjectUrl] = useState('')

  useEffect(() => {
    if (!cover) {
      setObjectUrl('')
      return undefined
    }
    const url = URL.createObjectURL(cover)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [cover])

  const preview = objectUrl || (currentUrl ? mediaUrl(currentUrl) : '')
  const style = {
    width: 220,
    height: 132,
    borderRadius: 12,
    border: cover || currentUrl ? '1px solid var(--line)' : '1px dashed var(--line)',
    objectFit: 'cover',
  }

  return preview ? (
    <img src={preview} alt={cover ? 'Selected cover preview' : 'Current cover'} style={style} />
  ) : (
    <span style={{ ...style, display: 'grid', placeItems: 'center', color: 'var(--ink-muted)', fontSize: '.8rem' }}>
      No cover
    </span>
  )
}

function splitTags(value) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 10)
}
