import { useOutletContext } from 'react-router-dom'
import { PageHeader } from '../../components/ui/Blocks.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import MessagingWorkspace from '../../components/messaging/MessagingWorkspace.jsx'

/**
 * One workspace for every signed-in role. Administrators can additionally ask
 * the API for threads between other people (`?scope=all`).
 */
export default function Messages() {
  const { user } = useAuth()
  const outlet = useOutletContext() || {}

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Messages"
        title="Inbox"
        lead={
          user?.role === 'LANDLORD'
            ? 'Your correspondence with the Mant Bridges desk. A thread that also holds a tenant belongs to that tenant and is not shown to you. Attachments are stored with the message; there are no email or SMS notifications yet, so read the inbox to stay up to date.'
            : 'Threads between tenants, landlords and the Mant Bridges desk. Attachments are stored with the message; there are no email or SMS notifications yet, so read the inbox to stay up to date.'
        }
      />
      <MessagingWorkspace
        allowScopeAll={user?.role === 'ADMIN'}
        onActivity={() => outlet.reloadCounts?.()}
      />
    </div>
  )
}
