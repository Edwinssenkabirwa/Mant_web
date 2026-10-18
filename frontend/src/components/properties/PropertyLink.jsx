import { ExternalLink } from 'lucide-react'

/**
 * A property name that opens the public listing in a new tab. Rows whose listing has no
 * published page (or that a tenant is reading about their own tenancy) fall back to plain
 * text rather than a link that would 404.
 */
export default function PropertyLink({ slug, title, className = '', fallback = null }) {
  if (!title) return <>{fallback}</>
  if (!slug) return <span className={className}>{title}</span>
  return (
    <a
      href={`/properties/${slug}`}
      target="_blank"
      rel="noreferrer"
      className={`property-link ${className}`.trim()}
    >
      <span className="truncate">{title}</span>
      <ExternalLink size={12} />
    </a>
  )
}
