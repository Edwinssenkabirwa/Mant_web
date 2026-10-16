import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Compass } from 'lucide-react'

export function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname])
  return null
}

export function NotFound() {
  return (
    <div className="container" style={{ paddingBlock: 80 }}>
      <div className="empty">
        <div className="empty-icon">
          <Compass size={22} />
        </div>
        <h3>That page has moved or never existed</h3>
        <p className="muted">The address you followed does not match anything on this site.</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
          <Link to="/" className="btn">
            Back to the homepage
          </Link>
          <Link to="/properties" className="btn btn-outline">
            Browse properties
          </Link>
        </div>
      </div>
    </div>
  )
}
