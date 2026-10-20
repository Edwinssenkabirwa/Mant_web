import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { listServices, manageServiceById } from '../../api/services.js'
import { collect } from '../../api/paginate.js'
import { useApi } from '../../hooks/useApi.js'
import ServiceView from '../../components/services/ServiceView.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { ErrorState, Loading } from '../../components/ui/Feedback.jsx'

/**
 * The service page exactly as a visitor will see it, opened with the office's own credentials, so
 * a draft can be read before it is published. The public address answers 404 until then.
 */
export default function ServicePreview() {
  const { id } = useParams()
  const service = useApi(() => manageServiceById(id), [id])
  const others = useApi(() => collect(listServices, {}, 5), [])

  if (service.loading) return <Loading label="Opening the preview…" />
  if (service.error) {
    return (
      <div className="stack">
        <ErrorState error={service.error} onRetry={service.reload} title="This preview could not be opened" />
      </div>
    )
  }

  return (
    <div>
      <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <Link to={`/manage/services/${id}/edit`} className="row" style={{ gap: 6 }}>
          <ArrowLeft size={14} /> Back to the editor
        </Link>
        <Button to="/manage/services" variant="outline" size="sm">
          All services
        </Button>
      </div>

      <ServiceView record={service.data} others={others.data ?? []} preview />
    </div>
  )
}
