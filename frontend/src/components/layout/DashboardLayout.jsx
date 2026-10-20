import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ExternalLink, Menu, X } from 'lucide-react'
import { Brand } from './Brand.jsx'
import { UserMenu } from './UserMenu.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { navFor } from '../../utils/nav.js'
import { invoiceSummary, paymentSummary } from '../../api/billing.js'
import { unreadCount } from '../../api/messaging.js'
import { enquiryStats } from '../../api/site.js'

/** nav items grouped under their preceding `section` marker. */
function groupNav(items) {
  const groups = []
  let current = null
  for (const item of items) {
    if (item.section) {
      current = { section: item.section, links: [] }
      groups.push(current)
      continue
    }
    if (!current) {
      current = { section: null, links: [] }
      groups.push(current)
    }
    current.links.push(item)
  }
  return groups.filter((group) => group.links.length)
}

export function DashboardLayout() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [counts, setCounts] = useState({})
  const location = useLocation()

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  const loadCounts = useCallback(async () => {
    if (!user) return
    const tasks = [unreadCount().then((data) => ({ unread: data.unread }))]
    // The rent book summaries are the office's and the tenant's own; a landlord's portal
    // reports its figures through /api/landlord/overview/, so do not ask for records he
    // is not permitted to read.
    if (user.role === 'ADMIN') {
      tasks.push(
        invoiceSummary().then((data) => ({
          overdue_invoices: data.overdue_count,
          unpaid_invoices: data.outstanding_count,
        })),
        paymentSummary().then((data) => ({ pending_payments: data.pending_count })),
        enquiryStats().then((data) => ({ new_enquiries: data.new ?? 0 })),
      )
    }
    if (user.role === 'TENANT') {
      tasks.push(invoiceSummary().then((data) => ({ unpaid_invoices: data.outstanding_count })))
    }
    const results = await Promise.allSettled(tasks)
    setCounts(
      results.reduce(
        (merged, result) => (result.status === 'fulfilled' ? { ...merged, ...result.value } : merged),
        {}
      )
    )
  }, [user])

  useEffect(() => {
    loadCounts()
    const timer = setInterval(loadCounts, 90000)
    return () => clearInterval(timer)
  }, [loadCounts])

  const groups = useMemo(() => groupNav(navFor(user)), [user])

  return (
    <div className="dash">
      {open ? <div className="sidebar-scrim" onClick={() => setOpen(false)} aria-hidden="true" /> : null}

      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="sidebar-brand">
          <div className="row-between">
            <Brand />
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              style={{ color: '#fff' }}
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <nav aria-label="Dashboard navigation">
          {groups.map((group) => (
            <div key={group.section || 'top'}>
              {group.section ? <p className="sidebar-section">{group.section}</p> : null}
              <div className="sidebar-nav">
                {group.links.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
                  >
                    <item.icon size={17} />
                    <span>{item.label}</span>
                    {item.countKey && counts[item.countKey] ? (
                      <span className="count-pill">{counts[item.countKey]}</span>
                    ) : null}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <p className="bold" style={{ margin: 0, color: '#fff' }}>{user?.full_name}</p>
          <p style={{ margin: '2px 0 10px' }}>{user?.email}</p>
          <a href="/" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: 'inherit' }}>
            <ExternalLink size={13} /> View public site
          </a>
        </div>
      </aside>

      <div className="dash-main">
        <header className="dash-topbar">
          <button
            type="button"
            className="btn btn-outline btn-icon mobile-only"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>
          <div className="grow" />
          <UserMenu variant="light" unread={counts.unread} />
        </header>
        <main className="dash-content">
          <Outlet context={{ counts, reloadCounts: loadCounts }} />
        </main>
      </div>
    </div>
  )
}
