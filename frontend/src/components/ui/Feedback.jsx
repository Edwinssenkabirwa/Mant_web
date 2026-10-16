import { AlertTriangle, RefreshCw } from 'lucide-react'

export function Spinner({ small = false }) {
  return <span className={`spinner${small ? ' spinner-sm' : ''}`} aria-hidden="true" />
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="loader" role="status">
      <Spinner />
      <span>{label}</span>
    </div>
  )
}

export function ErrorState({ error, onRetry, title = 'We could not load this' }) {
  return (
    <div className="empty" role="alert">
      <div className="empty-icon">
        <AlertTriangle size={22} />
      </div>
      <h3>{title}</h3>
      <p className="muted">{error || 'The request failed.'}</p>
      {onRetry ? (
        <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}>
          <RefreshCw size={15} /> Try again
        </button>
      ) : null}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="empty">
      {Icon ? <div className="empty-icon">{Icon ? <Icon size={22} /> : null}</div> : null}
      <h3>{title}</h3>
      {children ? <p className="muted">{children}</p> : null}
      {action ? <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>{action}</div> : null}
    </div>
  )
}

export function Skeleton({ height = 16, width = '100%', style }) {
  return <div className="skeleton" style={{ height, width, ...style }} />
}

export function CardSkeleton({ count = 6, ratio = '4 / 3' }) {
  return (
    <div className="auto-grid">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="card">
          <Skeleton height={0} style={{ aspectRatio: ratio, borderRadius: 0 }} />
          <div className="property-body">
            <Skeleton height={20} width="45%" />
            <Skeleton height={14} width="80%" />
            <Skeleton height={14} width="60%" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function RowsSkeleton({ rows = 5 }) {
  return (
    <div className="stack" style={{ padding: 18 }}>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} height={34} />
      ))}
    </div>
  )
}
