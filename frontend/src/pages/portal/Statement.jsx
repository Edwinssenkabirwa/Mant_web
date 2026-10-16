import { useMemo, useState } from 'react'
import { Scale } from 'lucide-react'
import { listLeases } from '../../api/leases.js'
import { statements } from '../../api/billing.js'
import { useApi } from '../../hooks/useApi.js'
import { useLookups } from '../../context/LookupContext.jsx'
import StatementTable from '../../components/billing/StatementTable.jsx'
import { Callout, PageHeader, Panel } from '../../components/ui/Blocks.jsx'
import { Input, SelectOptions } from '../../components/ui/Form.jsx'
import { EmptyState, Loading } from '../../components/ui/Feedback.jsx'
import { collect } from '../../api/paginate.js'

/**
 * The tenant’s own ledger. With no lease selected the API returns everything in
 * the requester’s scope, which for a tenant is their whole account.
 */
export default function Statement() {
  const { currency } = useLookups()
  const [leaseId, setLeaseId] = useState('')

  const leases = useApi(() => collect(listLeases, { ordering: '-start_date' }, 100), [])
  const key = useMemo(() => `${leaseId}-${currency}`, [leaseId, currency])
  const ledger = useApi(() => statements({ lease: leaseId || undefined, currency }), [key])

  return (
    <div className="stack">
      <PageHeader
        eyebrow="My home"
        title="Account statement"
        lead="Every charge raised and every payment confirmed on your account, in date order with a running balance."
        actions={
          <Input as="select" name="lease" value={leaseId} onChange={setLeaseId} style={{ minWidth: 240 }}>
            <option value="">All my tenancies</option>
            <SelectOptions
              items={(leases.data || []).map((lease) => ({
                value: String(lease.id),
                label: `${lease.number} · ${lease.property_title}`,
              }))}
            />
          </Input>
        }
      />

      <Panel title={leaseId ? 'Statement for one tenancy' : 'Statement for your account'}>
        {ledger.loading ? <Loading label="Building the ledger…" /> : null}
        {ledger.error ? <Callout>{ledger.error}</Callout> : null}
        {!ledger.loading && !ledger.error && ledger.data ? (
          <StatementTable
            data={ledger.data}
            empty={
              <div className="empty">
                <h3>Nothing on the account yet</h3>
                <p className="muted">Charges appear as soon as the first billing period is invoiced.</p>
              </div>
            }
          />
        ) : null}
      </Panel>

      <Callout tone="navy">
        <span className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
          <Scale size={16} style={{ flex: 'none', marginTop: 2 }} />
          <span>
            Pending payments are not listed — only confirmed money appears here, because that is what the books count.
            A PDF statement is not produced by the API yet, so print this page from the browser if you need a copy for
            your records.
          </span>
        </span>
      </Callout>

      {!leases.loading && !leases.error && !leases.data?.length ? (
        <EmptyState title="No tenancy to statement">
          Your account has no lease on it yet, so there is nothing to reconcile.
        </EmptyState>
      ) : null}
    </div>
  )
}
