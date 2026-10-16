import { Link } from 'react-router-dom'
import { Spinner } from './Feedback.jsx'

const BASE = 'btn'

function classes({ variant, size, block, icon, className }) {
  return [
    BASE,
    variant ? `btn-${variant}` : '',
    size ? `btn-${size}` : '',
    block ? 'btn-block' : '',
    icon ? 'btn-icon' : '',
    className || '',
  ]
    .filter(Boolean)
    .join(' ')
}

export function Button({
  as,
  variant,
  size,
  block,
  icon = false,
  pending = false,
  className,
  children,
  disabled,
  to,
  href,
  type = 'button',
  ...rest
}) {
  const merged = classes({ variant, size, block, icon, className })
  const content = (
    <>
      {pending ? <Spinner small /> : null}
      {children}
    </>
  )

  if (to) {
    return (
      <Link to={to} className={merged} {...(rest || {})}>
        {content}
      </Link>
    )
  }
  if (href) {
    return (
      <a href={href} className={merged} target="_blank" rel="noreferrer" {...(rest || {})}>
        {content}
      </a>
    )
  }

  const Component = as || 'button'
  return (
    <Component
      type={Component === 'button' ? type : undefined}
      className={merged}
      disabled={disabled || pending}
      {...(rest || {})}
    >
      {content}
    </Component>
  )
}

export function LinkButton({ to, children, variant = 'link', className = '' }) {
  return (
    <Link to={to} className={`btn btn-${variant} ${className}`.trim()}>
      {children}
    </Link>
  )
}
