import { ErrorState, Loading, RowsSkeleton } from './Feedback.jsx'

export function Table({ head, rows, renderRow, loading, error, empty, onRetry, caption }) {
  if (loading) {
    return (
      <div className="table-wrap">
        <RowsSkeleton rows={6} />
      </div>
    )
  }
  if (error) return <ErrorState error={error} onRetry={onRetry} />
  if (!rows?.length) return empty ?? null

  return (
    <div className="table-wrap">
      <table className="table">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {head.map((column) => {
              const label = typeof column === 'string' ? column : column.label
              const numeric = typeof column === 'string' ? false : Boolean(column.num)
              return (
                <th key={label} scope="col" className={numeric ? 'num' : ''}>
                  {label}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>{rows.map((row, index) => renderRow(row, index))}</tbody>
      </table>
    </div>
  )
}

export function Td({ children, num = false, className = '', colSpan, ...rest }) {
  return (
    <td colSpan={colSpan} className={`${num ? 'num ' : ''}${className}`.trim()} {...rest}>
      {children}
    </td>
  )
}

export function Actions({ children }) {
  return <div className="table-actions">{children}</div>
}

export function ListState({ loading, error, empty, rows, onRetry, children }) {
  if (loading) return <Loading />
  if (error) return <ErrorState error={error} onRetry={onRetry} />
  if (!rows?.length) return empty ?? null
  return children
}
