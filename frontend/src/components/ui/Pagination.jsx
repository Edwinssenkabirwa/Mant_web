import { ChevronLeft, ChevronRight } from 'lucide-react'

function windowed(current, total) {
  const pages = []
  const from = Math.max(1, Math.min(current - 2, total - 4))
  const to = Math.min(total, from + 4)
  for (let page = Math.max(1, from === 1 ? 1 : from); page <= to; page += 1) pages.push(page)
  return pages
}

export function Pagination({ page, pageCount, total, onChange, noun = 'result' }) {
  if (pageCount <= 1) {
    return total ? (
      <p className="muted small center" style={{ marginTop: 18 }}>
        Showing all {total} {noun === 'result' ? 'results' : `${noun}s`}
      </p>
    ) : null
  }

  const pages = windowed(page, pageCount)

  return (
    <>
      <nav className="pagination" aria-label="Pagination">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        {pages[0] > 1 ? <button type="button" onClick={() => onChange(1)}>1</button> : null}
        {pages[0] > 2 ? <span className="muted">…</span> : null}
        {pages.map((item) => (
          <button
            key={item}
            type="button"
            className={item === page ? 'active' : ''}
            onClick={() => onChange(item)}
            aria-current={item === page ? 'page' : undefined}
          >
            {item}
          </button>
        ))}
        {pages[pages.length - 1] < pageCount - 1 ? <span className="muted">…</span> : null}
        {pages[pages.length - 1] < pageCount ? (
          <button type="button" onClick={() => onChange(pageCount)}>
            {pageCount}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </nav>
      <p className="muted small center">
        Page {page} of {pageCount} · {total.toLocaleString()} {noun}s
      </p>
    </>
  )
}
