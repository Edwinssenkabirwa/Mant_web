import { useParams } from 'react-router-dom'
import { ArrowLeft, Inbox } from 'lucide-react'
import { listServices, serviceBySlug } from '../../api/services.js'
import { collect } from '../../api/paginate.js'
import { useApi } from '../../hooks/useApi.js'
import ServiceView from '../../components/services/ServiceView.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { EmptyState, ErrorState, Loading } from '../../components/ui/Feedback.jsx'

export default function ServiceDetail() {
  const { slug } = useParams()
  const service = useApi(() => serviceBySlug(slug), [slug])
  const others = useApi(() => collect(listServices, {}, 5), [])

  if (service.loading) return <Loading label="Opening the service page…" />

  if (service.error) {
    return (
      <div className="container section-tight">
        <ErrorState
          error={service.error}
          onRetry={service.reload}
          title="This service page could not be opened"
        />
      </div>
    )
  }

  const record = service.data

  if (!record || !record.name) {
    return (
      <div className="container section-tight">
        <EmptyState icon={Inbox} title="That service is not published" action={
          <Button to="/services" variant="outline">
            <ArrowLeft size={15} /> Back to services
          </Button>
        }>
          The page you asked for is not one of the services we publish. The current list is on the services page.
        </EmptyState>
      </div>
    )
  }

  return <ServiceView record={record} others={others.data ?? []} />
}
