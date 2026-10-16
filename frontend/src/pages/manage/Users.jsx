import { useEffect, useState } from 'react'
import { KeyRound, Pencil, Plus, Search, Trash2, UserCheck, UserPlus } from 'lucide-react'
import {
  USER_ORDERING,
  createUser,
  deleteUser,
  listUsers,
  patchUser,
  updateUser,
  userStats,
} from '../../api/users.js'
import { useList, hasActiveFilters } from '../../hooks/useList.js'
import { useApi } from '../../hooks/useApi.js'
import { useAction } from '../../hooks/useAction.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useLookups } from '../../context/LookupContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { RoleBadge, StatusBadge } from '../../components/ui/Badge.jsx'
import { Avatar, Callout, PageHeader, Panel, Stat } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Check, Field, FormAlert, Input, SelectOptions } from '../../components/ui/Form.jsx'
import { ConfirmDialog, Modal } from '../../components/ui/Modal.jsx'
import { Pagination } from '../../components/ui/Pagination.jsx'
import { Td, Table } from '../../components/ui/Table.jsx'
import { dateLabel } from '../../utils/format.js'

const BLANK = {
  email: '',
  first_name: '',
  last_name: '',
  phone: '',
  role: 'TENANT',
  city: '',
  address: '',
  organisation: '',
  national_id: '',
  tin_number: '',
  is_active: true,
  is_verified: false,
  password: '',
}

export default function Users() {
  const { user } = useAuth()
  const { options } = useLookups()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [form, setForm] = useState(BLANK)

  const list = useList(listUsers, { ordering: 'first_name' })
  const stats = useApi(() => userStats(), [])
  const active = hasActiveFilters(list.filters, ['ordering'])

  const openNew = () => {
    setForm({ ...BLANK, role: 'TENANT' })
    setEditing('new')
  }

  const openEdit = (record) => {
    setForm({
      ...BLANK,
      ...Object.fromEntries(Object.keys(BLANK).map((key) => [key, record[key] ?? BLANK[key]])),
      password: '',
    })
    setEditing(record)
  }

  const save = useAction(
    async () => {
      const payload = { ...form }
      if (!payload.password) delete payload.password
      if (!payload.phone) delete payload.phone
      if (!payload.address) delete payload.address
      if (!payload.organisation) delete payload.organisation
      if (!payload.national_id) delete payload.national_id
      if (!payload.tin_number) delete payload.tin_number
      if (!payload.city) delete payload.city
      if (editing === 'new') return createUser(payload)
      return updateUser(editing.id, payload)
    },
    {
      onDone: (record) => {
        toast.success(editing === 'new' ? `${record.email} added.` : 'Account updated.')
        setEditing(null)
        list.reload()
        stats.reload()
      },
    }
  )

  const toggleActive = useAction(
    async (record) => {
      const next = await patchUser(record.id, { is_active: !record.is_active })
      list.reload()
      stats.reload()
      return next
    },
    { onDone: (record) => toast.success(`${record.email} is now ${record.is_active ? 'active' : 'suspended'}.`) }
  )

  const remove = useAction(async (id) => deleteUser(id), {
    onDone: () => {
      toast.success('Account deleted.')
      setPendingDelete(null)
      list.reload()
      stats.reload()
    },
  })

  useEffect(() => {
    setSearch(list.filters.search || '')
  }, [list.filters.search])

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))

  return (
    <div className="stack">
      <PageHeader
        eyebrow="People"
        title="Accounts"
        lead="Administrators create and maintain every account. Tenants and landlords register themselves; this is where the desk corrects, verifies or suspends them."
        actions={
          <Button onClick={openNew}>
            <UserPlus size={15} /> New account
          </Button>
        }
      />

      {stats.data ? (
        <div className="grid grid-4">
          <Stat label="Accounts" value={(stats.data.total ?? 0).toLocaleString()} icon={KeyRound} />
          <Stat label="Landlords" value={(stats.data.landlords ?? 0).toLocaleString()} />
          <Stat label="Tenants" value={(stats.data.tenants ?? 0).toLocaleString()} />
          <Stat
            label="Suspended"
            value={(stats.data.inactive ?? 0).toLocaleString()}
            foot={`${stats.data.active ?? 0} active`}
            tone="warn"
            icon={UserCheck}
          />
        </div>
      ) : null}

      <Callout>
        National ID and TIN are held only where the team needs them for a tenancy or a receipt. They are not shown in
        this table, and the search box matches them server-side — never paste account lists into email or chat.
      </Callout>

      <Panel
        title="All accounts"
        action={
          <form
            className="search-bar"
            onSubmit={(event) => {
              event.preventDefault()
              list.patchFilters({ search: search })
            }}
            role="search"
          >
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, email or phone…"
              aria-label="Search accounts"
            />
            <button type="submit" className="btn btn-sm">
              <Search size={14} /> Search
            </button>
          </form>
        }
      >
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <Input
            as="select"
            name="role"
            value={list.filters.role || ''}
            onChange={(value) => list.patchFilters({ role: value || undefined })}
            style={{ minWidth: 150 }}
          >
            <option value="">Every role</option>
            <SelectOptions items={options.roles} />
          </Input>
          <Input
            as="select"
            name="is_active"
            value={list.filters.is_active || ''}
            onChange={(value) => list.patchFilters({ is_active: value || undefined })}
            style={{ minWidth: 150 }}
          >
            <option value="">Active and suspended</option>
            <option value="true">Active only</option>
            <option value="false">Suspended only</option>
          </Input>
          <Input
            as="select"
            name="is_verified"
            value={list.filters.is_verified || ''}
            onChange={(value) => list.patchFilters({ is_verified: value || undefined })}
            style={{ minWidth: 150 }}
          >
            <option value="">Any verification</option>
            <option value="true">Verified</option>
            <option value="false">Unverified</option>
          </Input>
          <Input
            as="select"
            name="ordering"
            value={list.filters.ordering}
            onChange={(value) => list.patchFilters({ ordering: value }, { keepPage: true })}
            style={{ minWidth: 180 }}
          >
            <SelectOptions items={USER_ORDERING} />
          </Input>
          {active ? (
            <button type="button" className="chip chip-button" onClick={list.reset}>
              Clear
            </button>
          ) : null}
        </div>

        <Table
          head={['Person', 'Role', 'Contact', 'Verified', 'Joined', 'Actions']}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          empty={<p className="muted small">No account matches this search.</p>}
          renderRow={(record) => (
            <tr key={record.id}>
              <Td>
                <span className="row" style={{ gap: 10 }}>
                  <Avatar user={record} size="sm" />
                  <span>
                    <span className="bold">{record.full_name}</span>
                    {record.is_active ? null : (
                      <span className="badge badge-outline" style={{ marginLeft: 8 }}>
                        Suspended
                      </span>
                    )}
                    <span className="tiny muted" style={{ display: 'block' }}>
                      {record.organisation || record.city || '—'}
                    </span>
                  </span>
                </span>
              </Td>
              <Td>
                <RoleBadge role={record.role} />
              </Td>
              <Td>
                <a href={`mailto:${record.email}`} className="small truncate">
                  {record.email}
                </a>
                <span className="tiny muted" style={{ display: 'block' }}>
                  {record.phone || 'No phone on file'}
                </span>
              </Td>
              <Td>
                <StatusBadge
                  value={record.is_verified ? 'TRUE' : 'PENDING'}
                  label={record.is_verified ? 'Verified' : 'Unverified'}
                />
              </Td>
              <Td className="tiny">{dateLabel(record.date_joined)}</Td>
              <Td>
                <div className="table-actions">
                  <button type="button" className="btn btn-outline btn-sm btn-icon" title="Edit account" onClick={() => openEdit(record)}>
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => toggleActive.execute(record)}
                    disabled={toggleActive.pending || record.id === user?.id}
                    title={record.is_active ? 'Suspend access' : 'Restore access'}
                  >
                    {record.is_active ? 'Suspend' : 'Restore'}
                  </button>
                  {record.id === user?.id ? null : (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm btn-icon"
                      title="Delete account"
                      onClick={() => setPendingDelete(record)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </Td>
            </tr>
          )}
        />

        <Pagination page={list.page} pageCount={list.pageCount} total={list.count} onChange={list.setPage} noun="account" />
        {toggleActive.error || save.error || remove.error ? (
          <Callout>{toggleActive.error || save.error || remove.error}</Callout>
        ) : null}
      </Panel>

      <Modal
        open={Boolean(editing)}
        title={editing === 'new' ? 'New account' : `Edit ${editing?.full_name ?? ''}`}
        onClose={() => setEditing(null)}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={save.pending}>
              Cancel
            </Button>
            <Button onClick={save.execute} pending={save.pending}>
              <Plus size={15} /> {editing === 'new' ? 'Create account' : 'Save changes'}
            </Button>
          </>
        }
      >
        <div className="stack">
          <div className="form-grid">
            <Field name="first_name" label="First name" required error={save.errors.first_name?.[0]}>
              <Input name="first_name" value={form.first_name} onChange={set('first_name')} />
            </Field>
            <Field name="last_name" label="Last name" required error={save.errors.last_name?.[0]}>
              <Input name="last_name" value={form.last_name} onChange={set('last_name')} />
            </Field>
            <Field name="email" label="Email (used to sign in)" required error={save.errors.email?.[0]} span2>
              <Input kind="email" name="email" value={form.email} onChange={set('email')} />
            </Field>
            <Field name="role" label="Role" required error={save.errors.role?.[0]}>
              <Input as="select" name="role" value={form.role} onChange={set('role')}>
                <SelectOptions items={options.roles} />
              </Input>
            </Field>
            <Field
              name="password"
              label={editing === 'new' ? 'Password' : 'New password (optional)'}
              required={editing === 'new'}
              error={save.errors.password?.[0]}
              hint="At least 8 characters and not wholly numeric."
            >
              <Input kind="password" name="password" value={form.password} onChange={set('password')} autoComplete="new-password" />
            </Field>
            <Field name="phone" label="Phone" error={save.errors.phone?.[0]}>
              <Input name="phone" value={form.phone} onChange={set('phone')} placeholder="+256 7xx xxx xxx" />
            </Field>
            <Field name="city" label="City">
              <Input name="city" value={form.city} onChange={set('city')} />
            </Field>
            <Field name="address" label="Address" span2>
              <Input name="address" value={form.address} onChange={set('address')} />
            </Field>
            {form.role === 'LANDLORD' ? (
              <Field name="organisation" label="Company / organisation" span2>
                <Input name="organisation" value={form.organisation} onChange={set('organisation')} />
              </Field>
            ) : null}
            <Field name="national_id" label="National ID" hint="Kept for tenancy paperwork only.">
              <Input name="national_id" value={form.national_id} onChange={set('national_id')} />
            </Field>
            <Field name="tin_number" label="TIN">
              <Input name="tin_number" value={form.tin_number} onChange={set('tin_number')} />
            </Field>
            <div>
              <Check name="is_active" label="Account is active" checked={form.is_active} onChange={set('is_active')} />
              <Check
                name="is_verified"
                label="Identity verified by the desk"
                checked={form.is_verified}
                onChange={set('is_verified')}
                hint="Self-service verification is not implemented; this is a manual flag."
              />
            </div>
          </div>
          <p className="hint">
            Passwords are never emailed. When you set one here, hand it to the person through a channel you control and
            ask them to change it after signing in.
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this account?"
        message={`${pendingDelete?.full_name ?? ''} (${pendingDelete?.email ?? ''}) will lose access immediately.`}
        detail={
          <span>
            The API protects related records: a tenancy or invoice is refused if it points at the account, so deletion
            only succeeds where nothing depends on it. Suspending instead keeps the history intact.
          </span>
        }
        confirmLabel="Delete account"
        danger
        pending={remove.pending}
        onConfirm={() => remove.execute(pendingDelete.id)}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  )
}
