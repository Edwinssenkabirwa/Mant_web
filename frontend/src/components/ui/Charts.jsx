import { shortMoney } from '../../utils/format.js'

const NAVY = '#1D4373'
const NAVY_DARK = '#0B2545'
const RED = '#D7263D'
const SLATE = '#93A6BC'

/** Paired bars for invoiced vs collected, straight from analytics.monthly. */
export function MonthlyBars({ series, currency = 'UGX' }) {
  const rows = series || []
  const peak = Math.max(1, ...rows.flatMap((row) => [row.invoiced || 0, row.collected || 0]))
  if (!rows.length) return <p className="muted small">No billing history yet.</p>
  return (
    <>
      <div className="bar-chart">
        {rows.map((row) => (
          <div className="bar-group" key={row.month}>
            <div className="bar-pair">
              <div
                className="bar"
                style={{ height: `${((row.invoiced || 0) / peak) * 100}%` }}
                title={`Invoiced ${shortMoney(row.invoiced, currency)}`}
              />
              <div
                className="bar bar-accent"
                style={{ height: `${((row.collected || 0) / peak) * 100}%` }}
                title={`Collected ${shortMoney(row.collected, currency)}`}
              />
            </div>
            <span className="bar-label">{row.label?.replace(/ \d{4}$/, '') ?? row.month}</span>
          </div>
        ))}
      </div>
      <div className="legend" style={{ marginTop: 14 }}>
        <span className="legend-item">
          <span className="legend-dot" /> Invoiced
        </span>
        <span className="legend-item">
          <span className="legend-dot accent" /> Collected
        </span>
      </div>
    </>
  )
}

export function ProgressBar({ value, max = 100, tone, label }) {
  const pct = Math.max(0, Math.min(100, (Number(value) / (Number(max) || 1)) * 100))
  return (
    <div>
      <div className="progress-track">
        <div className={`progress-fill${tone ? ` ${tone}` : ''}`} style={{ width: `${pct}%` }} />
      </div>
      {label ? <p className="tiny muted" style={{ margin: '6px 0 0' }}>{label}</p> : null}
    </div>
  )
}

/** analytics.aging -> label / bar of the largest bucket / amount. */
export function AgingList({ buckets, currency = 'UGX' }) {
  const rows = buckets || []
  const peak = Math.max(1, ...rows.map((row) => row.amount || 0))
  if (!rows.length) return <p className="muted small">Nothing outstanding.</p>
  return (
    <div>
      {rows.map((row) => (
        <div className="aging-row" key={row.key}>
          <span className="semi">{row.label}</span>
          <div className="progress-track">
            <div
              className={`progress-fill${row.key === 'not_due' ? '' : ' accent'}`}
              style={{ width: `${((row.amount || 0) / peak) * 100}%`, opacity: row.key === 'not_due' ? 0.45 : 1 }}
            />
          </div>
          <span className="num semi" style={{ textAlign: 'right' }}>
            {shortMoney(row.amount, currency)}
            <span className="tiny muted" style={{ display: 'block' }}>
              {row.count} invoice{row.count === 1 ? '' : 's'}
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}

export function Donut({ segments, value, label, colors = [NAVY_DARK, RED, SLATE, NAVY] }) {
  const rows = (segments || []).filter((segment) => Number(segment.value) > 0)
  const total = rows.reduce((sum, segment) => sum + Number(segment.value), 0)
  let offset = 0
  const stops = rows.map((segment, index) => {
    const share = (Number(segment.value) / (total || 1)) * 100
    const stop = `var(--c${index}) ${offset}% ${offset + share}%`
    offset += share
    return stop
  })
  const background = stops.length
    ? `conic-gradient(${stops.join(', ')})`
    : 'conic-gradient(#E5EAF1 0%, #E5EAF1 100%)'
  const palette = colors.reduce(
    (acc, color, index) => ({ ...acc, [`--c${index}`]: color }),
    {}
  )

  return (
    <div className="row" style={{ gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
      <div className="donut" style={{ background, ...palette }}>
        <div className="donut-hole">
          <div>
            <div className="donut-value">{value}</div>
            <div className="donut-label">{label}</div>
          </div>
        </div>
      </div>
      <div className="stack stack-sm grow" style={{ minWidth: 180 }}>
        {rows.map((segment, index) => (
          <div className="row-between" key={segment.label} style={{ gap: 10 }}>
            <span className="legend-item">
              <span className="legend-dot" style={{ background: colors[index % colors.length] }} />
              {segment.label}
            </span>
            <strong className="small nowrap">{segment.display ?? segment.value}</strong>
          </div>
        ))}
        {!rows.length ? <p className="muted small">No data to chart yet.</p> : null}
      </div>
    </div>
  )
}

/** Horizontal ranked bars — used for top debtors and by-property arrears. */
export function RankedList({ rows, currency = 'UGX', emptyLabel = 'Nothing to rank yet.' }) {
  if (!rows?.length) return <p className="muted small">{emptyLabel}</p>
  const peak = Math.max(1, ...rows.map((row) => Number(row.value) || 0))
  return (
    <div className="stack stack-sm">
      {rows.map((row, index) => (
        <div key={`${row.label}-${index}`}>
          <div className="row-between" style={{ marginBottom: 5 }}>
            <span className="semi small truncate">{row.label}</span>
            <span className="tiny muted nowrap">{row.meta}</span>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill accent"
              style={{ width: `${((Number(row.value) || 0) / peak) * 100}%` }}
            />
          </div>
          <p className="tiny bold" style={{ margin: '4px 0 10px', color: 'var(--navy-800)' }}>
            {shortMoney(row.value, currency)}
          </p>
        </div>
      ))}
    </div>
  )
}
