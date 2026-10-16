const CLASS_BY_KIND = {
  text: 'input',
  email: 'input',
  password: 'input',
  number: 'input',
  tel: 'input',
  date: 'input',
  datetime: 'input',
  select: 'select',
  textarea: 'textarea',
}

export function Field({
  label,
  name,
  hint,
  error,
  required = false,
  span2 = false,
  children,
  htmlFor,
}) {
  const messageId = `${name || htmlFor || 'field'}-messages`
  return (
    <div className={`field${span2 ? ' span-2' : ''}`}>
      {label ? (
        <label htmlFor={htmlFor || name}>
          {label}
          {required ? ' *' : ''}
        </label>
      ) : null}
      {children}
      {hint && !error ? (
        <span className="hint" id={messageId}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="field-error" id={messageId} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  )
}

export function Input({
  kind = 'text',
  name,
  value,
  onChange,
  error,
  as,
  rows,
  className = '',
  children,
  ...rest
}) {
  const base = CLASS_BY_KIND[as || kind] || 'input'
  const classes = `${base}${error ? ' input-error' : ''}${className ? ` ${className}` : ''}`
  const handler = (event) => {
    if (onChange) onChange(event.target.value, event)
  }

  if (as === 'select') {
    return (
      <select id={name} name={name} value={value ?? ''} onChange={handler} className={classes} {...rest}>
        {children}
      </select>
    )
  }

  if (as === 'textarea') {
    return (
      <textarea
        id={name}
        name={name}
        rows={rows || 4}
        value={value ?? ''}
        onChange={handler}
        className={classes}
        {...rest}
      />
    )
  }

  return (
    <input
      id={name}
      name={name}
      type={kind}
      value={value ?? ''}
      onChange={handler}
      className={classes}
      {...rest}
    />
  )
}

export function Check({ label, name, checked, onChange, hint, children }) {
  return (
    <label className="check">
      <input
        type="checkbox"
        name={name}
        checked={Boolean(checked)}
        onChange={(event) => onChange?.(event.target.checked, event)}
      />
      <span>
        {label}
        {hint ? <span className="hint" style={{ display: 'block' }}>{hint}</span> : null}
        {children}
      </span>
    </label>
  )
}

export function FormGrid({ children, className = '' }) {
  return <div className={`form-grid ${className}`.trim()}>{children}</div>
}

export function SearchBar({ value, onChange, placeholder = 'Search…', onSubmit, buttonLabel }) {
  return (
    <form
      className="search-bar"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit?.()
      }}
      role="search"
    >
      <input
        value={value ?? ''}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {buttonLabel ? (
        <button type="submit" className="btn btn-sm">
          {buttonLabel}
        </button>
      ) : null}
    </form>
  )
}

export function SelectOptions({ items, placeholder, valueKey = 'value', labelKey = 'label' }) {
  return (
    <>
      {placeholder ? <option value="">{placeholder}</option> : null}
      {(items || []).map((item) => {
        const value = typeof item === 'string' ? item : item[valueKey]
        const label = typeof item === 'string' ? item : item[labelKey] ?? value
        return (
          <option key={`${value}`} value={value}>
            {label}
          </option>
        )
      })}
    </>
  )
}

export function FormAlert({ error, success }) {
  if (success) return <div className="alert alert-success">{success}</div>
  if (error) return <div className="alert alert-error" role="alert">{error}</div>
  return null
}
