import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, LogIn, Menu, UserPlus, X } from 'lucide-react'
import { Brand } from './Brand.jsx'
import { UserMenu } from './UserMenu.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { PUBLIC_NAV } from '../../utils/nav.js'

export function SiteHeader() {
  const { authenticated, homePath } = useAuth()
  const [open, setOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  return (
    <header className="site-header">
      <div className="container container-wide">
        <div className="site-header-inner">
          <Brand />

          <nav className={`nav${open ? ' open' : ''}`} aria-label="Main navigation">
            {PUBLIC_NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}>
                {item.label}
              </NavLink>
            ))}
            {authenticated ? (
              <Link to={homePath} className="nav-cta">
                <LayoutDashboard size={15} /> Dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="nav-cta">
                  <LogIn size={15} /> Sign in
                </Link>
                <Link to="/register" className="btn btn-accent btn-sm">
                  <UserPlus size={15} /> Open an account
                </Link>
              </>
            )}
          </nav>

          {authenticated ? <UserMenu /> : null}

          <button
            type="button"
            className="nav-toggle"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>
    </header>
  )
}
