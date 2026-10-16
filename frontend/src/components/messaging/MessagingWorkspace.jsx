import { useEffect, useMemo, useRef, useState } from 'react'
import { Ban, Check, FileText, Paperclip, Send, Trash2, UserPlus } from 'lucide-react'
import {
  closeConversation,
  conversationById,
  deleteConversation,
  listConversations,
  markRead,
  sendMessage,
} from '../../api/messaging.js'
import { describeError } from '../../api/client.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useApi } from '../../hooks/useApi.js'
import { useDebouncedValue } from '../../hooks/useDebounce.js'
import { useList } from '../../hooks/useList.js'
import { dateTimeLabel, relativeTime } from '../../utils/format.js'
import { mediaUrl } from '../../utils/media.js'
import { Avatar } from '../ui/Blocks.jsx'
import { Button } from '../ui/Button.jsx'
import { StatusBadge } from '../ui/Badge.jsx'
import { EmptyState, ErrorState, Loading, RowsSkeleton } from '../ui/Feedback.jsx'
import { Field, Input, SearchBar, SelectOptions } from '../ui/Form.jsx'
import NewConversationModal from './NewConversationModal.jsx'

const CATEGORIES = [
  { value: 'GENERAL', label: 'General' },
  { value: 'RENT', label: 'Rent' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'VIEWING', label: 'Viewing' },
  { value: 'DOCUMENTS', label: 'Documents' },
  { value: 'COMPLAINT', label: 'Complaint' },
]

export default function MessagingWorkspace({ allowScopeAll = false, onActivity }) {
  const { user } = useAuth()
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [scopeAll, setScopeAll] = useState(false)
  const [composing, setComposing] = useState(false)
  const [threadError, setThreadError] = useState(null)
  const scrollRef = useRef(null)

  const debouncedSearch = useDebouncedValue(search, 350)

  const list = useList(listConversations, {}, { enabled: true })
  const params = useMemo(
    () => ({
      q: debouncedSearch || undefined,
      category: category || undefined,
      status: statusFilter || undefined,
      ordering: '-last_message_at',
      ...(allowScopeAll && scopeAll ? { scope: 'all' } : {}),
    }),
    [debouncedSearch, category, statusFilter, scopeAll, allowScopeAll]
  )

  useEffect(() => {
    list.setFilters(params)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const conversations = useMemo(
    () => (unreadOnly ? list.rows.filter((row) => row.unread_count > 0) : list.rows),
    [list.rows, unreadOnly]
  )

  useEffect(() => {
    if (!selectedId && conversations.length) setSelectedId(conversations[0].id)
  }, [conversations, selectedId])

  const thread = useApi(() => (selectedId ? conversationById(selectedId) : Promise.resolve(null)), [selectedId], {
    skip: !selectedId,
  })

  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [thread.data])

  const selected = thread.data
  const isAdmin = user?.role === 'ADMIN'

  const afterChange = () => {
    list.reload()
    onActivity?.()
  }

  const openThread = (id) => {
    setSelectedId(id)
    setThreadError(null)
  }

  const refreshThread = async () => {
    if (!selectedId) return
    const fresh = await conversationById(selectedId).catch((error) => {
      setThreadError(describeError(error))
      return null
    })
    if (fresh) thread.setData(fresh)
  }

  const onClose = async () => {
    if (!selected) return
    try {
      const updated = await closeConversation(selected.id)
      thread.setData(updated)
      afterChange()
    } catch (error) {
      setThreadError(describeError(error))
    }
  }

  const onDelete = async () => {
    if (!selected) return
    try {
      await deleteConversation(selected.id)
      thread.setData(null)
      setSelectedId(null)
      afterChange()
    } catch (error) {
      setThreadError(describeError(error))
    }
  }

  const onMarkRead = async () => {
    if (!selected) return
    await markRead(selected.id).catch((error) => setThreadError(describeError(error)))
    refreshThread()
    afterChange()
  }

  return (
    <>
      <div className="chat">
        <aside className="chat-list">
          <div className="chat-list-head">
            <strong>Inbox</strong>
            <Button size="sm" variant="accent" onClick={() => setComposing(true)}>
              <UserPlus size={14} /> New
            </Button>
          </div>
          <div className="stack stack-sm" style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)', gap: 8 }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Search subjects and messages…" />
            <div className="row" style={{ gap: 8 }}>
              <Input
                as="select"
                name="category"
                value={category}
                onChange={setCategory}
                aria-label="Filter by category"
              >
                <SelectOptions items={CATEGORIES} placeholder="All categories" />
              </Input>
              <Input
                as="select"
                name="status"
                value={statusFilter}
                onChange={setStatusFilter}
                aria-label="Filter by status"
              >
                <option value="">Any status</option>
                <option value="OPEN">Open</option>
                <option value="CLOSED">Closed</option>
              </Input>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`chip chip-button${unreadOnly ? ' chip-active' : ''}`}
                onClick={() => setUnreadOnly((value) => !value)}
              >
                Unread only
              </button>
              {allowScopeAll ? (
                <button
                  type="button"
                  className={`chip chip-button${scopeAll ? ' chip-active' : ''}`}
                  onClick={() => setScopeAll((value) => !value)}
                >
                  All teams
                </button>
              ) : null}
            </div>
          </div>

          <div className="chat-list-items">
            {list.loading ? <RowsSkeleton rows={6} /> : null}
            {list.error ? <ErrorState error={list.error} onRetry={list.reload} title="Inbox unavailable" /> : null}
            {!list.loading && !list.error && !conversations.length ? (
              <EmptyState icon={Send} title="No conversations">
                {unreadOnly ? 'Nothing unread in this page of results.' : 'Start a thread to message the team.'}
              </EmptyState>
            ) : null}
            {conversations.map((conversation) => (
              <button
                type="button"
                key={conversation.id}
                className={`chat-item${conversation.id === selectedId ? ' active' : ''}`}
                onClick={() => openThread(conversation.id)}
              >
                <Avatar user={conversation.counterpart} />
                <div className="chat-item-body">
                  <div className="row-between" style={{ gap: 8 }}>
                    <span className="chat-item-title">{conversation.subject}</span>
                    {conversation.unread_count ? <span className="badge badge-red">{conversation.unread_count}</span> : null}
                  </div>
                  <div className="chat-item-preview">
                    {conversation.counterpart?.full_name || 'Mant Bridges'} ·{' '}
                    {conversation.last_message?.body || 'No messages yet'}
                  </div>
                  <div className="row" style={{ gap: 8, marginTop: 4 }}>
                    <span className="hint">{relativeTime(conversation.last_message_at || conversation.created_at)}</span>
                    {conversation.status === 'CLOSED' ? <span className="badge badge-outline">Closed</span> : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="chat-panel">
          {thread.loading && !selected ? <Loading label="Opening thread…" /> : null}
          {thread.error && !selected ? <ErrorState error={thread.error} onRetry={thread.reload} /> : null}
          {!selectedId && !thread.loading ? (
            <EmptyState icon={Send} title="Select a conversation">
              Choose a thread on the left to read and reply.
            </EmptyState>
          ) : null}
          {selected ? (
            <>
              <header className="chat-head">
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <strong>{selected.subject}</strong>
                    <StatusBadge value={selected.status} label={selected.status_display} />
                    {selected.category_display ? (
                      <span className="badge badge-outline">{selected.category_display}</span>
                    ) : null}
                  </div>
                  <p className="hint" style={{ margin: '4px 0 0' }}>
                    With {selected.counterpart?.full_name || '—'}
                    {selected.property_title ? ` · ${selected.property_title}` : ''}
                    {selected.lease_number ? ` · Lease ${selected.lease_number}` : ''}
                  </p>
                </div>
                <div className="row-end">
                  {selected.unread_count ? (
                    <Button size="sm" variant="outline" onClick={onMarkRead}>
                      <Check size={14} /> Mark read
                    </Button>
                  ) : null}
                  {selected.status === 'OPEN' && (isAdmin || selected.created_by === user?.id) ? (
                    <Button size="sm" variant="outline" onClick={onClose}>
                      <Ban size={14} /> Close
                    </Button>
                  ) : null}
                  {isAdmin ? (
                    <Button size="sm" variant="danger" onClick={onDelete}>
                      <Trash2 size={14} /> Delete
                    </Button>
                  ) : null}
                </div>
              </header>

              {threadError ? (
                <div className="alert alert-error" role="alert" style={{ margin: '12px 16px 0' }}>
                  {threadError}
                </div>
              ) : null}

              <div className="chat-scroll" ref={scrollRef}>
                {thread.loading && selected ? <RowsSkeleton rows={3} /> : null}
                {(selected.messages || []).map((message) => (
                  <Bubble key={message.id} message={message} own={message.sender === user?.id} />
                ))}
                {!thread.loading && !selected.messages?.length ? (
                  <p className="muted">No messages in this thread yet.</p>
                ) : null}
              </div>

              <Composer
                conversation={selected}
                canReply={selected.status === 'OPEN' || isAdmin}
                onSent={async () => {
                  await refreshThread()
                  afterChange()
                }}
                onError={setThreadError}
              />
            </>
          ) : null}
        </section>
      </div>

      <NewConversationModal
        open={composing}
        onClose={() => setComposing(false)}
        onCreated={(conversation) => {
          setComposing(false)
          openThread(conversation.id)
          afterChange()
        }}
      />
    </>
  )
}

function Bubble({ message, own }) {
  const url = message.attachment_url ? mediaUrl(message.attachment_url, { fallback: '' }) : ''
  return (
    <div className={`bubble${own ? ' bubble-own' : ''}`}>
      <p className="bubble-text">{message.body}</p>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="row"
          style={{ gap: 6, fontSize: '.82rem', color: own ? '#fff' : 'var(--navy-700)' }}
        >
          <FileText size={14} /> Attachment
        </a>
      ) : null}
      <div className="bubble-meta">
        <span>{own ? 'You' : message.sender_name}</span>
        <span title={dateTimeLabel(message.created_at)}>{relativeTime(message.created_at)}</span>
      </div>
    </div>
  )
}

function Composer({ conversation, canReply, onSent, onError }) {
  const [body, setBody] = useState('')
  const [file, setFile] = useState(null)
  const [pending, setPending] = useState(false)
  const inputRef = useRef(null)

  const submit = async (event) => {
    event.preventDefault()
    if (!body.trim() && !file) return
    setPending(true)
    try {
      await sendMessage(conversation.id, body.trim(), file || undefined)
      setBody('')
      setFile(null)
      await onSent()
    } catch (error) {
      onError(describeError(error))
    } finally {
      setPending(false)
    }
  }

  if (!canReply) {
    return (
      <div className="chat-composer">
        <p className="hint" style={{ margin: 0 }}>
          This conversation is closed. Administrators can reopen it by replying, or start a new thread.
        </p>
      </div>
    )
  }

  return (
    <form className="chat-composer" onSubmit={submit}>
      <Field name="body">
        <Input
          as="textarea"
          name="body"
          rows={2}
          value={body}
          onChange={setBody}
          placeholder={`Reply to ${conversation.counterpart?.full_name || 'this thread'}…`}
        />
      </Field>
      <input
        ref={inputRef}
        id="message-attachment"
        type="file"
        className="sr-only"
        onChange={(event) => setFile(event.target.files?.[0] || null)}
      />
      <div className="stack" style={{ gap: 6 }}>
        <label className="chip chip-button" htmlFor="message-attachment">
          <Paperclip size={14} /> {file ? file.name : 'Attach'}
        </label>
        <Button type="submit" size="sm" block pending={pending} disabled={pending || (!body.trim() && !file)}>
          <Send size={14} /> Send
        </Button>
      </div>
    </form>
  )
}
