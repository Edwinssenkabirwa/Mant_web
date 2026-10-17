import { Link } from 'react-router-dom'
import { useLookups } from '../../context/LookupContext.jsx'
import { mediaUrl } from '../../utils/media.js'

export function Brand({ compact = false }) {
  const { company } = useLookups()
  const logo = company?.logo_url ? mediaUrl(company.logo_url, { fallback: '' }) : ''
  return (
    <Link to="/" className="brand" aria-label={`${company?.name || 'Mant Bridges LTD'} home`}>
      {logo ? (
        <img
          src={logo}
          alt=""
          style={{ width: 100, height: 70, borderRadius: 9, objectFit: 'contain', background: '#fff' }}
        />
      ) : (
        <span className="brand-mark">MB</span>
      )}
      <span className="brand-text">
        <span className="brand-name">{company?.name || 'Mant Bridges'}</span>
        {compact ? null : <span className="brand-sub">{company?.tagline || 'Bridging Gaps'}</span>}
      </span>
    </Link>
  )
}

export default Brand
