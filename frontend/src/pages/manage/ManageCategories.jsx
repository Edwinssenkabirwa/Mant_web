import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { createCategory, deleteCategory, manageCategories, updateCategory } from '../../api/blog.js'
import { collect } from '../../api/paginate.js'
import { useApi } from '../../hooks/useApi.js'
import { useAction } from '../../hooks/useAction.js'
import { useToast } from '../../context/ToastContext.jsx'
import { Callout, PageHeader, Panel } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Field, FormAlert, Input } from '../../components/ui/Form.jsx'
import { ConfirmDialog, Modal } from '../../components/ui/Modal.jsx'
import { ListState } from '../../components/ui/Table.jsx'
import { EmptyState } from '../../components/ui/Feedback.jsx'
import { pluralize } from '../../utils/format.js'

/**
 * Blog categories. The API builds the URL slug from the name and keeps it
 * stable, so the slug is shown but never edited.
 */
export default function ManageCategories() {
  const toast = useToast()
  const rows = useApi(() => collect(manageCategories, {}, 100), [])

  const [editing, setEditing] = useState(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [deleting, setDeleting] = useState(null)

  const save = useAction(
    async () => {
      const payload = { name: name.trim(), description: description.trim() }
      const saved = editing?.id ? await updateCategory(editing.id, payload) : await createCategory(payload)
      await rows.reload()
      return saved
    },
    {
      onDone: (saved) => {
        if (!saved) return undefined
        toast.success(editing?.id ? `Updated “${saved.name}”.` : `Created “${saved.name}”.`)
        closeForm()
        return undefined
      },
    }
  )

  const remove = useAction(
    async () => {
      await deleteCategory(deleting.id)
      await rows.reload()
      return deleting
    },
    {
      onDone: (category) => {
        if (!category) return undefined
        toast.success(`Deleted ${category.name}. Its articles are now uncategorised.`)
        setDeleting(null)
        return undefined
      },
    }
  )

  const openNew = () => {
    setEditing({})
    setName('')
    setDescription('')
  }

  const openEdit = (category) => {
    setEditing(category)
    setName(category.name)
    setDescription(category.description || '')
  }

  const closeForm = () => setEditing(null)

  const list = rows.data || []

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Content"
        title="Blog categories"
        lead="Group the articles visitors can filter on the blog. Categories are shared with the public site, so keep the names plain and useful."
        actions={
          <Button onClick={openNew}>
            <Plus size={15} /> New category
          </Button>
        }
      />

      {save.error || remove.error ? <Callout>{save.error || remove.error}</Callout> : null}

      <Panel title={pluralize(list.length, 'category', 'categories')}>
        <ListState
          loading={rows.loading}
          error={rows.error}
          onRetry={rows.reload}
          rows={list}
          empty={
            <EmptyState title="No categories yet">
              Articles can be published without a category, but a few clear groups make the blog easier to browse.
            </EmptyState>
          }
        >
          <div className="stack stack-sm">
            {list.map((category) => (
              <div className="row-between" key={category.id} style={{ gap: 14, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <strong>{category.name}</strong>
                    <span className="badge badge-outline">{category.slug}</span>
                    <span className="tiny muted">
                      {pluralize(category.post_count ?? 0, 'article')}
                    </span>
                  </div>
                  {category.description ? (
                    <p className="muted small" style={{ margin: '4px 0 0' }}>
                      {category.description}
                    </p>
                  ) : (
                    <p className="hint" style={{ margin: '4px 0 0' }}>
                      No description — it appears under the category header on filtered blog pages.
                    </p>
                  )}
                </div>
                <div className="row-end">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm btn-icon"
                    title="Edit"
                    onClick={() => openEdit(category)}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm btn-icon"
                    title="Delete"
                    onClick={() => setDeleting(category)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </ListState>

        <Callout tone="navy">
          Deleting a category does not delete its articles — they stay published and simply lose their grouping, which
          is how the API is configured.
        </Callout>
      </Panel>

      <Modal
        open={Boolean(editing)}
        title={editing?.id ? `Edit ${editing.name}` : 'New category'}
        onClose={closeForm}
        footer={
          <>
            <Button variant="outline" onClick={closeForm} disabled={save.pending}>
              Cancel
            </Button>
            <Button pending={save.pending} disabled={save.pending || name.trim().length < 2} onClick={() => save.execute()}>
              {save.pending ? 'Saving…' : editing?.id ? 'Save changes' : 'Create category'}
            </Button>
          </>
        }
      >
        <div className="stack">
          <FormAlert error={save.error} />
          <Field
            name="name"
            label="Name"
            required
            hint="The URL slug is generated from the name and does not change when you rename the category."
            error={save.errors.name?.[0]}
          >
            <Input name="name" value={name} onChange={setName} error={save.errors.name} />
          </Field>
          <Field name="description" label="Description">
            <Input as="textarea" name="description" rows={3} value={description} onChange={setDescription} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this category?"
        danger
        confirmLabel="Delete category"
        pending={remove.pending}
        message={deleting ? `${deleting.name} holds ${deleting.post_count ?? 0} article(s).` : ''}
        detail={<span>The articles remain published but lose their category and disappear from category filters.</span>}
        onConfirm={() => remove.execute()}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}
