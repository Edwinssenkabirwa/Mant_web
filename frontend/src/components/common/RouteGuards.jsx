import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { ShieldX } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { homePathFor } from '../../utils/nav.js'
import { Loading } from '../ui/Feedback.jsx'
import { Button } from '../ui/Button.jsx'

export function ProtectedRoute({ roles }) {
  const { user, ready, authenticated } = useAuth()
  const location = useLocation()

  if (!ready) return <Loading label="Checking your session…" />

  if (!authenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  if (roles && !roles.includes(user.role)) {
    return <NotPermitted role={user.role} homePath={homePathFor(user)} />
  }

  return <Outlet />
}

/** Client-side convenience only — Django permissions stay authoritative. */
export function RoleRoute({ roles }) {
  return <ProtectedRoute roles={roles} />
}

export function PublicOnlyRoute() {
  const { user, ready, authenticated } = useAuth()
  if (ready && authenticated && user) return <Navigate to={homePathFor(user)} replace />
  return <Outlet />
}

export function NotPermitted({ role, homePath }) {
  return (
    <div className="container" style={{ paddingBlock: 70 }}>
      <div className="empty">
        <div className="empty-icon">
          <ShieldX size={22} />
        </div>
        <h3>This area is not open to your account</h3>
        <p className="muted">
          You are signed in as {role ? role.toLowerCase() : 'a guest'}. The server decides what each
          role can reach, and it has refused this request.
        </p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
          <Button to={homePath}>Go to my dashboard</Button>
          <Link to="/contact" className="btn btn-outline">
            Ask the desk for access
          </Link>
        </div>
      </div>
    </div>
  )
}
