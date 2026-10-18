import { Link } from 'react-router-dom'
import { mediaUrl } from '../../utils/media.js'
import { initials as initialsOf } from '../../utils/format.js'

export function Panel({ title, action, children, footer, className = '' }) {
  return (
    <section className={`card ${className}`.trim()}>
      {(title || action) && (
        <header className="card-head">
          <h3>{title}</h3>
          {action}
        </header>
      )}
      <div className="card-body">{children}</div>
      {footer ? <footer className="card-foot">{footer}</footer> : null}
    </section>
  )
}

export function FlatPanel({ title, action, children, className = '' }) {
  return (
    <section className={`panel ${className}`.trim()}>
      {(title || action) && (
        <header className="row-between" style={{ marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, foot, tone, icon: Icon, to }) {
  const className = `stat${tone ? ` stat-${tone}` : ''}${to ? ' stat-link' : ''}`
  const body = (
    <>
      <span className="stat-label">
        {Icon ? <Icon size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} /> : null}
        {label}
      </span>
      <strong className="stat-value">{value}</strong>
      {foot ? <span className="stat-foot">{foot}</span> : null}
    </>
  )
  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}

export function StatGrid({ children, columns = 4 }) {
  return <div className={`grid grid-${columns}`}>{children}</div>
}

export function KeyValue({ items, className = '' }) {
  return (
    <dl className={`kv ${className}`.trim()}>
      {items
        .filter((item) => item && item.value !== undefined && item.value !== null && item.value !== '')
        .map((item) => (
          <div key={item.label} style={{ display: 'contents' }}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
    </dl>
  )
}

export function KvRows({ rows, total, foot }) {
  return (
    <div className="kv-list">
      {rows.map((row) => (
        <div className="kv-row" key={row.label}>
          <span className="muted">{row.label}</span>
          <strong>{row.value}</strong>
        </div>
      ))}
      {total ? (
        <div className="total-row">
          <span>{total.label}</span>
          <span>{total.value}</span>
        </div>
      ) : null}
      {foot}
    </div>
  )
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={active === tab.value}
          className={`tab${active === tab.value ? ' active' : ''}`}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
          {tab.count != null ? <span className="count-pill" style={{ marginLeft: 8 }}>{tab.count}</span> : null}
        </button>
      ))}
    </div>
  )
}

export function Avatar({ user, size = '', className = '' }) {
  const classes = `avatar${size ? ` avatar-${size}` : ''}${className ? ` ${className}` : ''}`
  const src = user?.avatar_url ? mediaUrl(user.avatar_url, { fallback: '' }) : ''
  return (
    <span className={classes} aria-hidden={src ? undefined : 'true'}>
      {src ? <img src={src} alt="" /> : initialsOf(user)}
    </span>
  )
}

export function Breadcrumb({ items }) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="row" style={{ gap: 8 }}>
          {index > 0 ? <span aria-hidden="true">/</span> : null}
          {item.to && index < items.length - 1 ? (
            <Link to={item.to}>{item.label}</Link>
          ) : (
            <span className="bold">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

export function PageHeader({ eyebrow, title, lead, actions, breadcrumb }) {
  return (
    <header className="stack stack-sm">
      {breadcrumb}
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <div className="row-between" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">{title}</h1>
          {lead ? <p className="lead" style={{ margin: 0, maxWidth: '70ch' }}>{lead}</p> : null}
        </div>
        {actions ? <div className="row-end">{actions}</div> : null}
      </div>
    </header>
  )
}

export function Callout({ children, tone = 'red', className = '' }) {
  return <div className={`callout${tone === 'navy' ? ' callout-navy' : ''} ${className}`.trim()}>{children}</div>
}

export function Alert({ tone = 'info', children }) {
  return <div className={`alert alert-${tone}`}>{children}</div>
}
