import { Link } from 'react-router-dom'
import { Bath, BedDouble, Building2, Car, MapPin, Ruler } from 'lucide-react'
import { mediaUrl } from '../../utils/media.js'
import { titleCase } from '../../utils/format.js'

function Meta({ icon: Icon, children }) {
  if (children == null || children === '') return null
  return (
    <span>
      <Icon size={14} aria-hidden="true" />
      {children}
    </span>
  )
}

export default function PropertyCard({ property }) {
  const area = property.area ? `${Number(property.area).toLocaleString()} ${titleCase(property.area_unit || 'sqm')}` : ''

  return (
    <article className="property-card">
      <div className="property-media">
        <img
          src={mediaUrl(property.cover_image_url)}
          alt={
            property.cover_is_illustrative
              ? `${property.title} — illustrative render, not a photograph`
              : property.title
          }
          loading="lazy"
          onError={(event) => {
            event.currentTarget.src = mediaUrl('')
          }}
        />
        <div className="media-tags">
          <span className={`badge badge-${property.listing_type === 'SALE' ? 'red' : 'navy'}`}>
            For {property.listing_type === 'SALE' ? 'Sale' : 'Rent'}
          </span>
          <span className={`badge badge-${property.status === 'AVAILABLE' ? 'ok' : 'outline'}`}>
            {property.status_display || titleCase(property.status)}
          </span>
          {property.cover_is_illustrative ? (
            <span className="badge badge-outline">Illustrative render</span>
          ) : null}
        </div>
      </div>

      <div className="property-body">
        <p className="property-price">{property.price_display || 'Price on request'}</p>
        <h3 className="property-title">
          <Link className="stretched-link" to={`/properties/${property.slug}`}>
            {property.title}
          </Link>
        </h3>
        <p className="location-line">
          <MapPin size={14} aria-hidden="true" />
          {property.location || property.city || 'Uganda'}
          {property.reference ? ` · ${property.reference}` : ''}
        </p>

        <div className="property-meta">
          <Meta icon={BedDouble}>{property.bedrooms ? `${property.bedrooms} bed` : null}</Meta>
          <Meta icon={Bath}>{property.bathrooms ? `${property.bathrooms} bath` : null}</Meta>
          <Meta icon={Car}>{property.parking_spaces ? `${property.parking_spaces} parking` : null}</Meta>
          <Meta icon={Ruler}>{area || null}</Meta>
          <Meta icon={Building2}>{property.property_type_display || null}</Meta>
        </div>
      </div>
    </article>
  )
}
