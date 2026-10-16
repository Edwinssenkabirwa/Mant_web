import { Building2 } from 'lucide-react'
import PropertyCard from './PropertyCard.jsx'
import { CardSkeleton, EmptyState, ErrorState } from '../ui/Feedback.jsx'
import { Button } from '../ui/Button.jsx'

export default function PropertyGrid({ properties, loading, error, onRetry, emptyTitle = 'No properties match', emptyNote, onResetFilters, featured }) {
  if (loading) return <CardSkeleton count={featured ? 3 : 6} />
  if (error) return <ErrorState error={error} onRetry={onRetry} title="Properties could not be loaded" />
  if (!properties?.length) {
    return (
      <EmptyState
        icon={Building2}
        title={emptyTitle}
        action={
          <>
            {onResetFilters ? (
              <Button variant="outline" onClick={onResetFilters}>
                Clear filters
              </Button>
            ) : null}
            <Button to="/contact" variant="accent">
              Ask us to source it
            </Button>
          </>
        }
      >
        {emptyNote || 'Try widening the location, price or bedroom filters.'}
      </EmptyState>
    )
  }

  return (
    <div className="auto-grid">
      {properties.map((property) => (
        <PropertyCard key={property.id || property.slug} property={property} />
      ))}
    </div>
  )
}
