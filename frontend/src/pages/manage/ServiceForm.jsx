import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, ImagePlus, Save, Trash2 } from 'lucide-react'
import {
  createService,
  deleteService,
  manageServiceById,
  updateService,
  uploadServiceImage,
} from '../../api/services.js'
import { lookups } from '../../api/site.js'
import { describeError } from '../../api/client.js'
import { useApi } from '../../hooks/useApi.js'
import { useAction } from '../../hooks/useAction.js'
import { useToast } from '../../context/ToastContext.jsx'
import ServiceBadge, { ICON_OPTIONS } from '../../components/services/ServiceBadge.jsx'
import { parseBlocks } from '../../components/services/ServiceView.jsx'
import { Callout, PageHeader, Panel } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Check, Field, FormAlert, FormGrid, Input, SelectOptions } from '../../components/ui/Form.jsx'
import { ConfirmDialog } from '../../components/ui/Modal.jsx'
import { Loading } from '../../components/ui/Feedback.jsx'
import { dateTimeLabel } from '../../utils/format.js'
import { mediaUrl } from '../../utils/media.js'

const BLANK = {
  name: '',
  category: 'OTHER',
  icon: '',
  summary: '',
  description: '',
  highlights: '',
  limitations: '',
  image_alt: '',
  order: '0',
  is_published: false,
}

/**
 * Write one service. `description` and `highlights` are plain text in the small structure the
 * service page understands — blank lines, "## " for a heading and "- " for a bullet — so the copy
 * typed here reads on the site exactly as it reads in the preview.
 */
export default function ServiceForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const [form, setForm] = useState(BLANK)
  const [image, setImage] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isEdit = Boolean(id)
  const existing = useApi(() => manageServiceById(id), [id], { skip: !id })
  const options = useApi(() => lookups(), [])

  useEffect(() => {
    if (!existing.data) return
    const service = existing.data
    setForm({
      name: service.name || '',
      category: service.category || 'OTHER',
      icon: service.icon || '',
      summary: service.summary || '',
      description: service.description || '',
      highlights: (service.highlights || []).join('\n'),
      limitations: service.limitations || '',
      image_alt: service.image_alt || '',
      order: String(service.order ?? 0),
      is_published: Boolean(service.is_published),
    })
  }, [existing.data])

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))

  const service = existing.data
  const points = splitLines(form.highlights)

  const copy = useMemo(() => {
    const blocks = parseBlocks(chunksOf(form.description))
    return {
      words: form.description.split(/\s+/).filter(Boolean).length,
      headings: blocks.filter((block) => block.kind === 'h').length,
      lists: blocks.filter((block) => block.kind === 'ul').length,
      paragraphs: blocks.filter((block) => block.kind === 'p').length,
    }
  }, [form.description])

  const save = useAction(
    async () => {
      const payload = {
        name: form.name,
        category: form.category,
        icon: form.icon,
        summary: form.summary,
        description: form.description,
        highlights: points,
        limitations: form.limitations,
        image_alt: form.image_alt,
        order: Math.max(0, Number(form.order) || 0),
        is_published: form.is_published,
      }
      const saved = isEdit ? await updateService(Number(id), payload) : await createService(payload)
      if (!image) return saved
      try {
        return await uploadServiceImage(saved.id, image)
      } catch (err) {
        // The record is already stored, so take the desk to it instead of leaving a row behind a
        // blank "New service" form that would create a second one on the next click.
        toast.error(
          `“${saved.name}” is saved, but its picture did not upload: ${describeError(err)} Open it again and save with the file.`
        )
        navigate(`/manage/services/${saved.id}/edit`)
        throw err
      }
    },
    {
      onDone: (saved) => {
        if (!saved) return undefined
        toast.success(
          saved.is_published
            ? `“${saved.name}” saved and live on the website.`
            : `“${saved.name}” saved as a draft.`
        )
        navigate('/manage/services')
        return undefined
      },
    }
  )

  const remove = useAction(async () => {
    await deleteService(Number(id))
    toast.success('Service deleted.')
    navigate('/manage/services')
  })

  const errors = save.errors

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Content"
        breadcrumb={
          <Link to="/manage/services" className="row" style={{ gap: 6, width: 'fit-content' }}>
            <ArrowLeft size={14} /> Back to services
          </Link>
        }
        title={isEdit ? `Edit “${service?.name || 'service'}”` : 'New service'}
        lead="This record is the service page. The home page list, the services cards and the page itself are built from what you write here — nothing is duplicated in the website."
        actions={
          isEdit && service?.is_published ? (
            <a
              href={`/services/${service.slug}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline btn-sm"
            >
              View live <ExternalLink size={13} />
            </a>
          ) : null
        }
      />

      {isEdit && existing.loading ? <Loading label="Loading the service…" /> : null}
      {existing.error ? <Callout>{existing.error}</Callout> : null}

      {isEdit && service ? (
        <p className="muted small">
          Address <span className="mono">/services/{service.slug}</span> · created{' '}
          {dateTimeLabel(service.created_at)} · updated {dateTimeLabel(service.updated_at)} ·{' '}
          <Link to={`/manage/services/${service.id}/preview`}>preview</Link>
        </p>
      ) : null}

      <div className="split">
        <div className="stack">
          <Panel title="What it is called">
            <div className="stack">
              <FormAlert error={save.error} />
              <Field
                name="name"
                label="Name"
                required
                span2
                hint="Used in the band at the top of the page, on the cards and in the home page list. The web address is built from it, and renaming the service later leaves the address as it was."
                error={errors.name?.[0]}
              >
                <Input name="name" value={form.name} onChange={set('name')} error={errors.name} />
              </Field>
              <FormGrid>
                <Field
                  name="category"
                  label="Category"
                  hint="Groups the service for the desk. Visitors read the name, not the category."
                  error={errors.category?.[0]}
                >
                  <Input as="select" name="category" value={form.category} onChange={set('category')}>
                    <SelectOptions items={options.data?.service_categories || []} />
                  </Input>
                </Field>
                <Field
                  name="icon"
                  label="Badge"
                  hint="The round mark beside the name on the cards and in the band at the top of the page."
                  error={errors.icon?.[0]}
                >
                  <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                    <Input as="select" name="icon" value={form.icon} onChange={set('icon')}>
                      <SelectOptions items={ICON_OPTIONS} />
                    </Input>
                    <ServiceBadge icon={form.icon} size={18} />
                  </div>
                </Field>
              </FormGrid>
              <Field
                name="summary"
                label="Short summary"
                span2
                hint={`${form.summary.length}/300 characters, shown under the name in the band and on the card. Left blank, the site opens with the first 200 characters of the full description.`}
                error={errors.summary?.[0]}
              >
                <Input
                  as="textarea"
                  name="summary"
                  rows={2}
                  value={form.summary}
                  onChange={set('summary')}
                  error={errors.summary}
                />
              </Field>
            </div>
          </Panel>

          <Panel title="The full description">
            <div className="stack">
              <Field
                name="description"
                label="Copy on the service page"
                span2
                hint={`${copy.words} words · ${copy.headings} heading(s), ${copy.lists} list(s), ${copy.paragraphs} paragraph(s). A blank line starts a new block, a line beginning "## " becomes a heading, and consecutive lines beginning "- " become a bulleted list.`}
                error={errors.description?.[0]}
              >
                <Input
                  as="textarea"
                  name="description"
                  rows={18}
                  value={form.description}
                  onChange={set('description')}
                  error={errors.description}
                />
              </Field>
              <Field
                name="highlights"
                label="What it covers"
                span2
                hint={`${points.length}/20 points, one per line. They print under a "What it covers" heading on the page, and a twenty-first line is dropped.`}
                error={errors.highlights?.[0]}
              >
                <Input
                  as="textarea"
                  name="highlights"
                  rows={8}
                  value={form.highlights}
                  onChange={set('highlights')}
                  error={errors.highlights}
                />
              </Field>
              <Field
                name="limitations"
                label="Notes for the desk"
                span2
                hint="What this service does not cover or cannot promise. No public page prints it — the website states what Mant Bridges does and leaves the hedging here."
                error={errors.limitations?.[0]}
              >
                <Input
                  as="textarea"
                  name="limitations"
                  rows={3}
                  value={form.limitations}
                  onChange={set('limitations')}
                  error={errors.limitations}
                />
              </Field>
            </div>
          </Panel>

          <Panel title="Picture on the page">
            <div className="row" style={{ gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <ImagePreview image={image} currentUrl={service?.image_url} />
              <div className="grow stack stack-sm" style={{ minWidth: 220 }}>
                <input
                  id="service-image-input"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => setImage(event.target.files?.[0] || null)}
                />
                <label className="chip chip-button" htmlFor="service-image-input">
                  <ImagePlus size={14} /> {image ? image.name : 'Choose a picture'}
                </label>
                {image ? (
                  <button type="button" className="btn-link" onClick={() => setImage(null)}>
                    Remove the selected file
                  </button>
                ) : null}
                <p className="hint" style={{ margin: 0 }}>
                  {isEdit
                    ? 'Picking a file replaces the current picture when you save. Saving without picking one leaves it alone.'
                    : 'Optional. Shown above the copy on the service page.'}
                </p>
                <Field
                  name="image_alt"
                  label="Description of the picture"
                  hint="Read out for screen readers, and shown as the caption when the picture loads."
                  error={errors.image_alt?.[0]}
                >
                  <Input name="image_alt" value={form.image_alt} onChange={set('image_alt')} />
                </Field>
              </div>
            </div>
          </Panel>
        </div>

        <aside className="stack">
          <Panel title="Publishing">
            <div className="stack">
              <Check
                name="is_published"
                label="Publish to the website"
                checked={form.is_published}
                onChange={set('is_published')}
                hint="A draft keeps its page for your own preview but visitors cannot open it, and it stays off the home page and the services page."
              />
              <Field
                name="order"
                label="Position"
                hint="Lower numbers come first on the home page and the services page. The arrows on the services list move a service without retyping anything."
                error={errors.order?.[0]}
              >
                <Input
                  kind="number"
                  name="order"
                  min="0"
                  value={form.order}
                  onChange={set('order')}
                  error={errors.order}
                />
              </Field>
            </div>
          </Panel>

          <Panel title="Save">
            <div className="stack stack-sm">
              <Button block pending={save.pending} disabled={existing.loading} onClick={() => save.execute()}>
                <Save size={15} /> {isEdit ? 'Save changes' : 'Create service'}
              </Button>
              <Button block variant="outline" onClick={() => navigate('/manage/services')} disabled={save.pending}>
                Cancel
              </Button>
              {isEdit ? (
                <Button block variant="outline" onClick={() => setConfirmDelete(true)} disabled={save.pending}>
                  <Trash2 size={14} /> Delete service
                </Button>
              ) : null}
              <p className="hint" style={{ margin: 0 }}>
                {isEdit
                  ? 'The wording is saved first, then a newly picked picture replaces the old one. If the picture fails, the text is already stored — save again with just the file.'
                  : 'The record is created first, then a newly picked picture is attached to it. If the picture fails, the service still exists and this form opens on it so you can try the file again.'}
              </p>
            </div>
          </Panel>

          <Callout tone="navy">
            Write what Mant Bridges actually does. Everything published here is read by clients as the company’s own
            word.
          </Callout>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this service?"
        danger
        confirmLabel="Delete service"
        pending={remove.pending}
        message={service ? `“${service.name}” and its page are removed from the website.` : ''}
        detail={remove.error ? <span>{remove.error}</span> : null}
        onConfirm={() => remove.execute()}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  )
}

function ImagePreview({ image, currentUrl }) {
  const [objectUrl, setObjectUrl] = useState('')

  useEffect(() => {
    if (!image) {
      setObjectUrl('')
      return undefined
    }
    const url = URL.createObjectURL(image)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [image])

  const preview = objectUrl || (currentUrl ? mediaUrl(currentUrl) : '')
  const style = {
    width: 220,
    height: 132,
    borderRadius: 12,
    border: image || currentUrl ? '1px solid var(--line)' : '1px dashed var(--line)',
    objectFit: 'cover',
  }

  return preview ? (
    <img src={preview} alt={image ? 'Selected picture preview' : 'Current picture'} style={style} />
  ) : (
    <span style={{ ...style, display: 'grid', placeItems: 'center', color: 'var(--ink-muted)', fontSize: '.8rem' }}>
      No picture
    </span>
  )
}

function splitLines(value) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20)
}

/** Same split as the Service.paragraphs field the page renders from: blank lines separate blocks. */
function chunksOf(text) {
  return text
    .split('\n\n')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
}
