import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileSpreadsheet, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import {
  LEASE_ORDERING,
  deleteLease,
  generateLeaseInvoices,
  leaseStatement,
  listLeases,
  leaseStats,
} from '../../api/leases.js'
import { useList, hasActiveFilters } from '../../hooks/useList.js'
import { useApi } from '../../hooks/useApi.js'
import { useAction } from '../../hooks/useAction.js'
import { useLookups } from '../../context/LookupContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import StatementTable from '../../components/billing/StatementTable.jsx'
import { StatusBadge } from '../../components/ui/Badge.jsx'
import { Callout, PageHeader, Panel, Stat } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Input, SearchBar, SelectOptions } from '../../components/ui/Form.jsx'
import { ConfirmDialog, Modal } from '../../components/ui/Modal.jsx'
import { Pagination } from '../../components/ui/Pagination.jsx'
import { Td, Table } from '../../components/ui/Table.jsx'
import { dateLabel, money } from '../../utils/format.js'

export default function Leases() {
  const { options } = useLookups()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [statementLease, setStatementLease] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [pendingGenerate, setPendingGenerate] = useState(null)

  const list = useList(listLeases, { ordering: '-created_at' })
  const stats = useApi(() => leaseStats(), [])
  const statement = useApi(() => leaseStatement(statementLease.id), [statementLease?.id], {
    skip: !statementLease,
  })
  const active = hasActiveFilters(list.filters, ['ordering'])

  useEffect(() => setSearch(list.filters.q || ''), [list.filters.q])

  const generate = useAction(
    async (lease) => {
      const result = await generateLeaseInvoices(lease.id)
      list.reload()
      return result
    },
    {
      onDone: (result) => {
        toast.success(result.detail)
        setPendingGenerate(null)
      },
    }
  )

  const remove = useAction(async (id) => deleteLease(id), {
    onDone: () => {
      toast.success('Tenancy deleted.')
      setPendingDelete(null)
      list.reload()
      stats.reload()
    },
  })

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Rent book"
        title="Tenancies"
        lead="Each lease drives the invoices raised against it. Marking a lease Active starts invoicing immediately, so check the dates and rent first."
        actions={
          <Button to="/manage/leases/new">
            <Plus size={15} /> New tenancy
          </Button>
        }
      />

      {stats.data ? (
        <div className="grid grid-4">
          <Stat label="Tenancies" value={(stats.data.total ?? 0).toLocaleString()} icon={FileSpreadsheet} />
          <Stat label="Active" value={(stats.data.active ?? 0).toLocaleString()} tone="ok" />
          <Stat
            label="Expiring in 60 days"
            value={(stats.data.expiring_soon ?? 0).toLocaleString()}
            tone="warn"
            foot="Renew or let them lapse"
          />
          <Stat
            label="Draft"
            value={(stats.data.by_status?.DRAFT ?? 0).toLocaleString()}
            foot="No invoices raised yet"
          />
        </div>
      ) : null}

      {generate.error || remove.error ? <Callout>{generate.error || remove.error}</Callout> : null}

      <Panel
        title="All tenancies"
        action={
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Number, tenant or property…"
            onSubmit={() => list.patchFilters({ q: search })}
            buttonLabel="Search"
          />
        }
      >
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <Input
            as="select"
            name="status"
            value={list.filters.status || ''}
            onChange={(value) => list.patchFilters({ status: value || undefined })}
            style={{ minWidth: 150 }}
          >
            <option value="">Any status</option>
            <SelectOptions items={options.lease_statuses} />
          </Input>
          <Input
            as="select"
            name="active"
            value={list.filters.active || ''}
            onChange={(value) => list.patchFilters({ active: value || undefined })}
            style={{ minWidth: 150 }}
          >
            <option value="">Running and ended</option>
            <option value="true">Running now</option>
            <option value="false">Not running</option>
          </Input>
          <Input
            as="select"
            name="expiring_soon"
            value={list.filters.expiring_soon || ''}
            onChange={(value) => list.patchFilters({ expiring_soon: value || undefined })}
            style={{ minWidth: 170 }}
          >
            <option value="">Any end date</option>
            <option value="true">Ending within 60 days</option>
          </Input>
          <Input
            as="select"
            name="ordering"
            value={list.filters.ordering}
            onChange={(value) => list.patchFilters({ ordering: value }, { keepPage: true })}
            style={{ minWidth: 180 }}
          >
            <SelectOptions items={LEASE_ORDERING} />
          </Input>
          {active ? (
            <button type="button" className="chip chip-button" onClick={list.reset}>
              Clear
            </button>
          ) : null}
        </div>

        <Table
          head={[
            'Tenancy',
            'Tenant',
            'Property',
            { label: 'Rent', num: true },
            'Term',
            { label: 'Outstanding', num: true },
            'Status',
            'Actions',
          ]}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          empty={
            <div className="empty">
              <h3>No tenancies yet</h3>
              <p className="muted">
                Sign a lease and Mant Bridges starts invoicing on the billing frequency you set.
              </p>
              <Button to="/manage/leases/new">
                <Plus size={15} /> Add the first tenancy
              </Button>
            </div>
          }
          renderRow={(lease) => (
            <tr key={lease.id}>
              <Td>
                <Link to={`/manage/leases/${lease.id}/edit`} className="bold">
                  {lease.number}
                </Link>
                <span className="tiny muted" style={{ display: 'block' }}>
                  {lease.frequency_display} · due day {lease.due_day_of_month}
                </span>
              </Td>
              <Td>
                {lease.tenant_name}
                <span className="tiny muted" style={{ display: 'block' }}>
                  {lease.tenant_detail?.phone || lease.tenant_detail?.email}
                </span>
              </Td>
              <Td className="truncate">
                {lease.property_title}
                <span className="tiny muted" style={{ display: 'block' }}>
                  {lease.landlord_name}
                </span>
              </Td>
              <Td num>
                <span className="bold">{lease.monthly_rent_display}</span>
                {Number(lease.service_charge) ? (
                  <span className="tiny muted" style={{ display: 'block' }}>
                    + {money(lease.service_charge, lease.currency)} service
                  </span>
                ) : null}
              </Td>
              <Td className="tiny">
                {dateLabel(lease.start_date)}
                <span style={{ display: 'block' }}>to {dateLabel(lease.end_date)}</span>
              </Td>
              <Td num>
                <span
                  className={Number(lease.outstanding_balance) > 0 ? 'bold' : ''}
                  style={Number(lease.outstanding_balance) > 0 ? { color: 'var(--red-600)' } : undefined}
                >
                  {money(lease.outstanding_balance, lease.currency)}
                </span>
                <span className="tiny muted" style={{ display: 'block' }}>
                  of {money(lease.total_invoiced, lease.currency)}
                </span>
              </Td>
              <Td>
                <StatusBadge value={lease.status} label={lease.status_display} />
                {lease.is_current ? <span className="hint" style={{ display: 'block' }}>running</span> : null}
              </Td>
              <Td>
                <div className="table-actions">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm btn-icon"
                    title="Statement of account"
                    onClick={() => setStatementLease(lease)}
                  >
                    <FileSpreadsheet size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm btn-icon"
                    title="Bring invoices up to date"
                    onClick={() => setPendingGenerate(lease)}
                  >
                    <RefreshCw size={14} />
                  </button>
                  <Link
                    to={`/manage/leases/${lease.id}/edit`}
                    className="btn btn-outline btn-sm btn-icon"
                    title="Edit tenancy"
                  >
                    <Pencil size={14} />
                  </Link>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm btn-icon"
                    title="Delete tenancy"
                    onClick={() => setPendingDelete(lease)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </Td>
            </tr>
          )}
        />

        <Pagination page={list.page} pageCount={list.pageCount} total={list.count} onChange={list.setPage} noun="tenancy" />

        <Callout tone="navy">
          Deleting a tenancy is refused while its invoices exist — the API protects the money trail. To stop a lease
          without losing history, set it to Terminated or Expired instead.
        </Callout>
      </Panel>

      <Modal
        open={Boolean(statementLease)}
        title={`Statement — ${statementLease?.number ?? ''}`}
        onClose={() => setStatementLease(null)}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setStatementLease(null)}>
              Close
            </Button>
            <Button to={`/manage/invoices?lease=${statementLease?.id ?? ''}`} variant="link" size="sm">
              Open its invoices
            </Button>
          </>
        }
      >
        {statement.loading ? (
          <p className="muted small">Building the ledger…</p>
        ) : statement.error ? (
          <Callout>{statement.error}</Callout>
        ) : statement.data ? (
          <StatementTable data={statement.data} />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingGenerate)}
        title="Raise missing invoices?"
        message={`Mant Bridges will create an invoice for every unbilled period of ${pendingGenerate?.number ?? ''} up to today.`}
        detail={
          <span>
            Existing periods are never duplicated. The run is idempotent, so pressing it twice does not charge the
            tenant twice.
          </span>
        }
        confirmLabel="Generate invoices"
        pending={generate.pending}
        onConfirm={() => generate.execute(pendingGenerate)}
        onClose={() => setPendingGenerate(null)}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this tenancy?"
        message={`${pendingDelete?.number ?? ''} — ${pendingDelete?.tenant_name ?? ''}`}
        detail={
          <span>
            This only succeeds when no invoice or payment is attached. If the API refuses, change the status to
            Terminated instead.
          </span>
        }
        confirmLabel="Delete tenancy"
        danger
        pending={remove.pending}
        onConfirm={() => remove.execute(pendingDelete.id)}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  )
}
