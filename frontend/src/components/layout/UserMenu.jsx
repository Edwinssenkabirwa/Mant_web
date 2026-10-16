import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, KeyRound, LogOut, MessageSquare, UserCircle, LayoutDashboard } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { Avatar } from '../ui/Blocks.jsx'
import { humanStatus } from '../../utils/status.js'

export function UserMenu({ variant = 'dark', onAfterAction, unread = 0 }) {
  const { user, logout, homePath } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false)
    }
    function onEscape(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  if (!user) return null

  const close = () => {
    setOpen(false)
    onAfterAction?.()
  }

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className={`user-menu-button${variant === 'light' ? ' on-light' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Avatar user={user} size="sm" />
        <span className="hide-mobile">{user.first_name || user.full_name}</span>
        <ChevronDown size={14} />
      </button>

      {open ? (
        <div className="dropdown" role="menu">
          <div className="dropdown-head">
            <p className="bold" style={{ margin: 0, color: 'var(--navy-800)' }}>{user.full_name}</p>
            <p className="tiny muted" style={{ margin: '2px 0 0' }}>
              {user.email} · {humanStatus(user.role)}
            </p>
          </div>
          <Link className="dropdown-item" to={homePath} role="menuitem" onClick={close}>
            <LayoutDashboard size={16} /> Dashboard
          </Link>
          <Link
            className="dropdown-item"
            to={user.role === 'TENANT' ? '/portal/messages' : '/manage/messages'}
            role="menuitem"
            onClick={close}
          >
            <MessageSquare size={16} /> Messages
            {unread ? <span className="count-pill" style={{ marginLeft: 'auto' }}>{unread}</span> : null}
          </Link>
          <Link
            className="dropdown-item"
            to={user.role === 'TENANT' ? '/portal/profile' : '/manage/profile'}
            role="menuitem"
            onClick={close}
          >
            <UserCircle size={16} /> My account
          </Link>
          <Link
            className="dropdown-item"
            to={user.role === 'TENANT' ? '/portal/password' : '/manage/password'}
            role="menuitem"
            onClick={close}
          >
            <KeyRound size={16} /> Change password
          </Link>
          <div className="dropdown-sep" />
          <button
            type="button"
            className="dropdown-item danger"
            role="menuitem"
            onClick={() => {
              logout()
              close()
            }}
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  )
}
