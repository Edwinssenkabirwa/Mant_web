import { dateLabel, money } from '../../utils/format.js'
import { badgeClass, humanStatus } from '../../utils/status.js'
import { KvRows } from '../ui/Blocks.jsx'
import { Td, Table } from '../ui/Table.jsx'

/** Ledger produced by /api/statements/ — running balance comes from the server. */
export default function StatementTable({ data, empty }) {
  if (!data) return null
  const currency = data.currency || 'UGX'
  const totals = data.totals || {}

  return (
    <div className="stack">
      <Table
        head={['Date', 'Reference', 'Description', { label: 'Charged', num: true }, { label: 'Received', num: true }, { label: 'Balance', num: true }]}
        rows={data.entries}
        empty={empty ?? null}
        caption="Statement of account"
        renderRow={(entry) => (
          <tr key={`${entry.type}-${entry.reference}`}>
            <Td>{dateLabel(entry.date)}</Td>
            <Td>
              <span className="row" style={{ gap: 7 }}>
                <strong>{entry.reference}</strong>
                <span className={badgeClass(entry.status)}>{humanStatus(entry.status)}</span>
              </span>
            </Td>
            <Td>
              {entry.description}
              {entry.property ? <div className="hint">{entry.property}</div> : null}
              {entry.receipt ? <div className="hint">Receipt {entry.receipt}</div> : null}
            </Td>
            <Td num>{Number(entry.debit) ? money(entry.debit, currency) : '—'}</Td>
            <Td num>{Number(entry.credit) ? money(entry.credit, currency) : '—'}</Td>
            <Td num>{money(entry.balance, currency)}</Td>
          </tr>
        )}
      />
      <KvRows
        rows={[
          { label: 'Entries', value: totals.entries ?? 0 },
          { label: 'Total charged', value: money(totals.charged, currency) },
          { label: 'Total received', value: money(totals.paid, currency) },
        ]}
        total={{ label: 'Closing balance', value: money(totals.balance, currency) }}
      />
    </div>
  )
}
