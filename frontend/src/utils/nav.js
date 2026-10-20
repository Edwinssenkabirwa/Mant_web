import {
  BarChart3,
  Briefcase,
  Building2,
  FileText,
  HandCoins,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Mail,
  MessageSquare,
  PlusCircle,
  Receipt,
  Scale,
  Send,
  Settings,
  ShieldCheck,
  Tag,
  UserCircle,
  Users,
  Wallet,
} from 'lucide-react';

export const MANAGE_HOME = '/manage';
export const TENANT_HOME = '/portal';
export const LANDLORD_HOME = '/landlord';

/** The route prefix a signed-in person's own screens live under. */
export function areaFor(user) {
  if (user?.role === 'TENANT') return TENANT_HOME;
  if (user?.role === 'LANDLORD') return LANDLORD_HOME;
  return MANAGE_HOME;
}

export function homePathFor(user) {
  if (!user) return '/';
  if (user.role === 'ADMIN') return MANAGE_HOME;
  if (user.role === 'LANDLORD') return LANDLORD_HOME;
  if (user.role === 'TENANT') return TENANT_HOME;
  return '/';
}

const MANAGE_ADMIN = [
  { section: 'Overview' },
  { to: '/manage', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/manage/reports', label: 'Reports', icon: BarChart3 },
  { section: 'Rent book' },
  { to: '/manage/invoices', label: 'Invoices', icon: FileText, countKey: 'overdue_invoices' },
  { to: '/manage/payments', label: 'Payments', icon: Wallet, countKey: 'pending_payments' },
  { to: '/manage/receipts', label: 'Receipts', icon: Receipt },
  { to: '/manage/leases', label: 'Leases', icon: KeyRound },
  { section: 'Portfolio' },
  { to: '/manage/properties', label: 'Properties', icon: Building2 },
  { to: '/manage/recommendations', label: 'Recommendations', icon: ShieldCheck },
  { to: '/manage/users', label: 'People', icon: Users },
  { section: 'Desk' },
  { to: '/manage/enquiries', label: 'Enquiries', icon: Inbox, countKey: 'new_enquiries' },
  { to: '/manage/messages', label: 'Messages', icon: MessageSquare, countKey: 'unread' },
  { section: 'Publishing' },
  { to: '/manage/posts', label: 'Blog posts', icon: Briefcase },
  { to: '/manage/categories', label: 'Blog categories', icon: Tag },
  { section: 'Email' },
  { to: '/manage/email/campaigns', label: 'Campaigns', icon: Send },
  { to: '/manage/email/subscribers', label: 'Newsletter list', icon: Mail },
  { section: 'Settings' },
  { to: '/manage/company', label: 'Company profile', icon: Settings },
  { to: '/manage/profile', label: 'My account', icon: UserCircle },
];

/**
 * The owner's portal. Read-only by design: his collection trend, the occupancy of his own
 * properties and his thread with the office. The rent book itself — invoices, payments,
 * receipts, leases — stays with the Mant Bridges desk, and new properties reach the desk as
 * recommendations the office verifies before anything is published.
 */
const LANDLORD_PORTAL = [
  { section: 'My book' },
  { to: LANDLORD_HOME, label: 'Overview', icon: LayoutDashboard, end: true },
  { to: `${LANDLORD_HOME}/properties`, label: 'My properties', icon: Building2 },
  { to: `${LANDLORD_HOME}/recommendations`, label: 'Recommend a property', icon: PlusCircle },
  { section: 'Desk' },
  { to: `${LANDLORD_HOME}/messages`, label: 'Messages', icon: MessageSquare, countKey: 'unread' },
  { to: `${LANDLORD_HOME}/profile`, label: 'My account', icon: UserCircle },
];

const TENANT_PORTAL = [
  { section: 'My home' },
  { to: '/portal', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/portal/leases', label: 'My leases', icon: KeyRound },
  { to: '/portal/statement', label: 'Account statement', icon: Scale },
  { section: 'Money' },
  { to: '/portal/invoices', label: 'My invoices', icon: FileText, countKey: 'unpaid_invoices' },
  { to: '/portal/payments', label: 'Payment history', icon: HandCoins },
  { to: '/portal/receipts', label: 'My receipts', icon: Receipt },
  { section: 'Support' },
  { to: '/portal/messages', label: 'Messages', icon: MessageSquare, countKey: 'unread' },
  { to: '/portal/profile', label: 'My account', icon: UserCircle },
];

export function navFor(user) {
  if (!user) return [];
  if (user.role === 'ADMIN') return MANAGE_ADMIN;
  if (user.role === 'LANDLORD') return LANDLORD_PORTAL;
  if (user.role === 'TENANT') return TENANT_PORTAL;
  return [];
}

export const PUBLIC_NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/properties', label: 'Properties' },
  { to: '/services', label: 'Services' },
  { to: '/about', label: 'About' },
  { to: '/blog', label: 'Blog' },
  { to: '/careers', label: 'Careers' },
  { to: '/contact', label: 'Contact' },
];
