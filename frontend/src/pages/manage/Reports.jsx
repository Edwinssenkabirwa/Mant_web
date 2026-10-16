import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, FileText } from 'lucide-react'
import { analytics, statements } from '../../api/billing.js'
import { listLeases } from '../../api/leases.js'
import { listUsers } from '../../api/users.js'
import { collect } from '../../api/paginate.js'
import { useApi } from '../../hooks/useApi.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useLookups } from '../../context/LookupContext.jsx'
import StatementTable from '../../components/billing/StatementTable.jsx'
import { AgingList, Donut, MonthlyBars, RankedList } from '../../components/ui/Charts.jsx'
import { KeyValue, PageHeader, Panel, Stat, StatGrid } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Field, Input, SelectOptions } from '../../components/ui/Form.jsx'
import { ErrorState, Loading } from '../../components/ui/Feedback.jsx'
import { Td, Table } from '../../components/ui/Table.jsx'
import { dateLabel, money, percent, shortMoney } from '../../utils/format.js'

const MONTHS = [
  { value: '3', label: 'Last 3 months' },
  { value: '6', label: 'Last 6 months' },
  { value: '12', label: 'Last 12 months' },
]

export default function Reports() {
  const { user } = useAuth()
  const { company, paymentMethodLabel } = useLookups()
  const [months, setMonths] = useState('6')

  const isAdmin = user?.role === 'ADMIN'
  const [leaseId, setLeaseId] = useState('')
  const [tenantId, setTenantId] = useState('')

  const report = useApi(() => analytics({ months }), [months])
  const leases = useApi(() => listLeases({ active: true, ordering: 'end_date' }), [])
  const tenants = useApi(() => collect(listUsers, { role: 'TENANT', ordering: 'first_name' }), [], {
    skip: !isAdmin,
  })

  const statementKey = `${leaseId}|${tenantId}`
  const statement = useApi(
    () =>
      statements({
        lease: leaseId || undefined,
        tenant: tenantId || undefined,
        currency: company?.currency,
      }),
    [statementKey],
    { skip: !leaseId && !tenantId }
  )

  if (report.loading && !report.data) return <Loading label="Crunching the numbers…" />
  if (report.error) return <ErrorState error={report.error} onRetry={report.reload} />

  const data = report.data ?? {}
  const totals = data.totals ?? {}
  const currency = data.currency || company?.currency || 'UGX'
  const statusCounts = data.status_counts ?? {}

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Reports"
        title="Rent performance"
        lead="Everything here is aggregated by the API from invoices, payments and receipts inside your scope. Nothing is estimated in the browser."
        actions={
          <Input
            as="select"
            name="months"
            value={months}
            onChange={setMonths}
            aria-label="Reporting window"
            style={{ minWidth: 180 }}
          >
            <SelectOptions items={MONTHS} />
          </Input>
        }
      />

      <StatGrid>
        <Stat label="Invoiced" value={money(totals.invoiced, currency)} foot={`${totals.invoices ?? 0} invoices`} />
        <Stat label="Collected" value={money(totals.collected, currency)} foot={`${totals.payments ?? 0} payments`} />
        <Stat
          label="Outstanding"
          value={money(totals.outstanding, currency)}
          foot={`${totals.overdue ? money(totals.overdue, currency) + ' overdue' : 'nothing overdue'}`}
          tone="warn"
        />
        <Stat
          label="Collection rate"
          value={percent(totals.collection_rate)}
          foot={`as at ${data.as_of ? dateLabel(data.as_of) : 'today'}`}
          tone={(totals.collection_rate ?? 0) >= 85 ? 'ok' : 'warn'}
        />
      </StatGrid>

      <div className="grid grid-2">
        <Panel title="Invoiced against collected">
          <MonthlyBars series={data.monthly} currency={currency} />
        </Panel>
        <Panel title="Invoice status mix">
          <Donut
            value={(totals.invoices ?? 0).toLocaleString()}
            label="invoices"
            segments={[
              { label: 'Paid', value: statusCounts.paid ?? 0 },
              { label: 'Overdue', value: statusCounts.overdue ?? 0 },
              { label: 'Partial', value: statusCounts.partial ?? 0 },
              { label: 'Unpaid', value: statusCounts.unpaid ?? 0 },
              { label: 'Draft', value: statusCounts.draft ?? 0 },
              { label: 'Cancelled', value: statusCounts.cancelled ?? 0 },
            ]}
            colors={['#0B2545', '#D7263D', '#1D4373', '#93A6BC', '#C7D2E0', '#E9EEF5']}
          />
        </Panel>
      </div>

      <div className="grid grid-2">
        <Panel title="Arrears by age">
          <AgingList buckets={data.aging} currency={currency} />
        </Panel>
        <Panel title="How money arrives">
          <Table
            head={['Method', { label: 'Confirmed', num: true }, { label: 'Count', num: true }]}
            rows={data.by_method ?? []}
            empty={<p className="muted small">No confirmed payments in this window.</p>}
            renderRow={(row) => (
              <tr key={row.method}>
                <Td>{paymentMethodLabel(row.method)}</Td>
                <Td num>{money(row.total, currency)}</Td>
                <Td num>{row.count}</Td>
              </tr>
            )}
          />
        </Panel>
      </div>

      <div className="grid grid-2">
        <Panel
          title="Tenants with overdue balances"
          action={
            <Button to="/manage/invoices?overdue=true" variant="link" size="sm">
              Open invoices
            </Button>
          }
        >
          <RankedList
            currency={currency}
            emptyLabel="No tenant is past a due date."
            rows={(data.top_debtors ?? []).map((row) => ({
              label: row.name || row.email,
              meta: `${row.invoices} invoice${row.invoices === 1 ? '' : 's'} · ${row.email}`,
              value: Number(row.outstanding),
            }))}
          />
          <p className="tiny muted">
            Contact details come from the report so the desk can chase payment. Do not share this list outside the
            team.
          </p>
        </Panel>

        <Panel title="Overdue by property">
          <RankedList
            currency={currency}
            emptyLabel="Every property is up to date."
            rows={(data.by_property ?? []).map((row) => ({
              label: row.title,
              meta: `${row.reference ?? row.property_id} · ${row.invoices} invoice${
                row.invoices === 1 ? '' : 's'
              }`,
              value: Number(row.outstanding),
            }))}
          />
        </Panel>
      </div>

      <Panel
        title="Ledger extract"
        action={
          <span className="row" style={{ gap: 8 }}>
            <FileText size={15} />
            <span className="muted small">charges and confirmed payments</span>
          </span>
        }
      >
        <div className="stack">
          <div className="form-grid">
            <Field name="lease" label="Tenancy">
              <Input as="select" name="lease" value={leaseId} onChange={setLeaseId}>
                <option value="">All tenancies</option>
                {(leases.data?.results ?? []).map((lease) => (
                  <option key={lease.id} value={lease.id}>
                    {lease.number} — {lease.tenant_name} · {lease.property_title}
                  </option>
                ))}
              </Input>
            </Field>
            {isAdmin ? (
              <Field name="tenant" label="Tenant">
                <Input as="select" name="tenant" value={tenantId} onChange={setTenantId}>
                  <option value="">All tenants</option>
                  <SelectOptions items={(tenants.data ?? []).map((row) => ({ value: row.id, label: row.full_name }))} />
                </Input>
              </Field>
            ) : null}
          </div>

          {!leaseId && !tenantId ? (
            <p className="muted small">
              Pick a tenancy{isAdmin ? ' or a tenant' : ''} to pull a running balance. The server scopes every extract
              to your own rows — a landlord cannot read another landlord&apos;s book.
            </p>
          ) : statement.loading ? (
            <Loading label="Building the ledger…" />
          ) : statement.error ? (
            <ErrorState error={statement.error} onRetry={statement.reload} />
          ) : statement.data ? (
            <>
              <StatementTable data={statement.data} />
              <div className="row-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(statement.data, null, 2)], {
                      type: 'application/json',
                    })
                    const url = URL.createObjectURL(blob)
                    const link = document.createElement('a')
                    link.href = url
                    link.download = `mant-bridges-ledger-${leaseId || tenantId || 'all'}.json`
                    link.click()
                    URL.revokeObjectURL(url)
                  }}
                >
                  <Download size={15} /> Download this extract (JSON)
                </Button>
                <Button to="/manage/receipts" variant="link" size="sm">
                  Receipts
                </Button>
              </div>
              <p className="tiny muted">
                PDF statements are not produced by the API yet — see the backend follow-up list. The JSON extract
                carries the same server-computed rows.
              </p>
            </>
          ) : null}
        </div>
      </Panel>

      <KeyValue
        items={[
          { label: 'Active tenancies in scope', value: (data.leases ?? 0).toLocaleString() },
          {
            label: 'Reporting scope',
            value: isAdmin ? 'All Mant Bridges books' : 'Your own tenancies',
          },
          { label: 'Currency', value: currency },
        ]}
      />

      <p className="muted small">
        Individual documents live in{' '}
        <Link to="/manage/invoices">invoices</Link> and <Link to="/manage/receipts">receipts</Link>.
        Total across the window: {shortMoney(totals.invoiced, currency)} invoiced.
      </p>
    </div>
  )
}
