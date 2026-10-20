import { Link } from 'react-router-dom'
import { Building2, MessageSquare, PhoneCall, PlusCircle } from 'lucide-react'
import { landlordOverview } from '../../api/billing.js'
import { useApi } from '../../hooks/useApi.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useLookups } from '../../context/LookupContext.jsx'
import { StatusBadge } from '../../components/ui/Badge.jsx'
import { Callout, PageHeader, Panel, Stat } from '../../components/ui/Blocks.jsx'
import { Donut, MonthlyBars, ProgressBar } from '../../components/ui/Charts.jsx'
import { EmptyState, Loading } from '../../components/ui/Feedback.jsx'
import { Td, Table } from '../../components/ui/Table.jsx'
import { dateLabel, money, pluralize } from '../../utils/format.js'

/**
 * Landlord home. Everything here is an aggregate of the owner's own book, served by
 * /api/landlord/overview/ — the invoices, payments and receipts behind these totals
 * name a tenant and stay with the Mant Bridges desk.
 */
export default function LandlordOverview() {
  const { user } = useAuth()
  const { company } = useLookups()
  const overview = useApi(() => landlordOverview({ months: 6 }), [])

  const data = overview.data
  if (overview.error) return <Callout>{overview.error}</Callout>
  if (!data) return <Loading label="Loading your book…" />

  const currency = data.currency || company?.currency || 'UGX'
  const collection = data.collection
  const occupancy = data.occupancy

  const segments = [
    { label: 'Occupied', value: occupancy.occupied },
    { label: 'Available', value: occupancy.available },
    { label: 'Awaiting paperwork', value: occupancy.pending },
    { label: 'Sold', value: occupancy.sold },
    { label: 'Off market', value: occupancy.off_market },
  ].filter((segment) => segment.value > 0)

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Landlord portal"
        title={`Good day, ${user?.first_name || user?.full_name || 'there'}`}
        lead="What the rent-collection desk has taken in on your properties and how full your book is. This page is a read-only summary — charges, tenant details and the receipts issued to tenants are kept by the office, and you can ask for anything behind a figure below."
        actions={
          <>
            <Link to="/landlord/recommendations" className="btn btn-outline">
              <PlusCircle size={15} /> Recommend a property
            </Link>
            <Link to="/landlord/messages" className="btn btn-outline">
              <MessageSquare size={15} /> Message the desk
            </Link>
          </>
        }
      />

      <div className="grid grid-4">
        <Stat
          label="Collected on your book"
          value={money(collection.collected, currency)}
          foot={`${money(collection.invoiced, currency)} charged`}
          tone="ok"
        />
        <Stat
          label="Not yet collected"
          value={money(collection.outstanding, currency)}
          foot={
            Number(collection.overdue) > 0
              ? `${money(collection.overdue, currency)} past its due date`
              : 'Nothing past its due date'
          }
          tone={Number(collection.overdue) > 0 ? 'warn' : undefined}
        />
        <Stat
          label="Collection rate"
          value={`${Number(collection.collection_rate).toFixed(1)}%`}
          foot="Of everything charged, confirmed in the desk's account"
        />
        <Stat
          label="Occupancy"
          value={`${Number(occupancy.rate).toFixed(1)}%`}
          foot={`${occupancy.occupied} of ${pluralize(occupancy.properties, 'property', 'properties')} let`}
          to="/landlord/properties"
        />
      </div>

      <div className="split">
        <div className="stack">
          <Panel title="Collection trend" action={<span className="tiny muted">Last 6 months</span>}>
            {collection.monthly.some((row) => Number(row.invoiced) || Number(row.collected)) ? (
              <>
                <MonthlyBars series={collection.monthly} currency={currency} />
                <div style={{ marginTop: 16 }}>
                  <ProgressBar
                    value={Number(collection.collection_rate)}
                    max={100}
                    label={`Of the ${money(collection.invoiced, currency)} charged on your properties, ${money(
                      collection.collected,
                      currency,
                    )} has reached the desk and been confirmed.`}
                  />
                </div>
              </>
            ) : (
              <EmptyState icon={PhoneCall} title="No collection history yet">
                Nothing has been charged on your properties so far. The trend fills in as the desk bills each period.
              </EmptyState>
            )}
            <p className="hint" style={{ margin: '14px 0 0' }}>
              Figures are taken from the desk's records as at {dateLabel(data.as_of)}. A month shows what was charged
              and what was confirmed in that month, so a late payment lifts the month it was actually paid in.
            </p>
          </Panel>

          <Panel
            title="Properties on your book"
            action={
              <Link to="/landlord/properties" className="btn btn-outline btn-sm">
                <Building2 size={14} /> Open my properties
              </Link>
            }
          >
            <Table
              head={['Property', 'Where', 'Status', { label: 'Collected', num: true }, { label: 'Outstanding', num: true }]}
              caption="Your properties with what the desk has collected and is still chasing on each"
              rows={occupancy.by_property}
              empty={
                <div className="empty">
                  <h3>No property recorded yet</h3>
                  <p className="muted">
                    Recommended properties appear here once the office has verified and listed them.
                  </p>
                </div>
              }
              renderRow={(property) => (
                <tr key={property.id}>
                  <Td>
                    <span className="bold small">{property.title}</span>
                    <span className="tiny muted" style={{ display: 'block' }}>
                      {property.reference} · {property.listing_display}
                      {property.is_published ? '' : ' · not published'}
                    </span>
                  </Td>
                  <Td className="tiny">{property.city}</Td>
                  <Td>
                    <StatusBadge value={property.status} label={property.status_display} />
                  </Td>
                  <Td num className="bold">{money(property.collected, currency)}</Td>
                  <Td num className={Number(property.outstanding) > 0 ? 'bold' : 'muted'}>
                    {money(property.outstanding, currency)}
                  </Td>
                </tr>
              )}
            />
          </Panel>
        </div>

        <aside className="sticky-side stack">
          <Panel title="How full your book is" action={<span className="tiny muted">{occupancy.properties} properties</span>}>
            {segments.length ? (
              <Donut
                segments={segments}
                value={`${Number(occupancy.rate).toFixed(0)}%`}
                label="occupied"
              />
            ) : (
              <p className="muted small">No property is on your book yet.</p>
            )}
            <div className="stack stack-sm" style={{ marginTop: 16 }}>
              <div className="row-between">
                <span className="muted small">Tenancies running</span>
                <strong className="small">{occupancy.active_leases}</strong>
              </div>
              <div className="row-between">
                <span className="muted small">Ending within 60 days</span>
                <strong className="small">{occupancy.leases_expiring_soon}</strong>
              </div>
            </div>
          </Panel>

          <Panel title="Money records and receipts">
            <div className="stack stack-sm">
              <p className="small" style={{ margin: 0 }}>
                Each charge and each receipt is issued in the tenant's name, so those documents stay with the office and
                out of this portal — what reaches you is the total above, per property, and the trend behind it.
              </p>
              <Callout tone="navy">
                Ask the desk for a statement of any month or any single property and it is prepared from these same
                records.
              </Callout>
              <Link to="/landlord/messages" className="btn btn-outline">
                <MessageSquare size={15} /> Request a statement
              </Link>
            </div>
          </Panel>

          <Panel title="Talking to the office">
            <p className="small" style={{ margin: 0 }}>
              Your inbox holds your threads with the Mant Bridges team. Repairs, tenant disputes, new tenancies and
              anything behind a figure on this page are handled there.
            </p>
            <Link to="/landlord/messages" className="btn btn-outline" style={{ marginTop: 12 }}>
              <MessageSquare size={15} /> Open my messages
            </Link>
          </Panel>
        </aside>
      </div>
    </div>
  )
}
