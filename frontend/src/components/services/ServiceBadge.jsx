import { Building2, Coins, FileText, Gavel, Handshake, KeyRound, Landmark, ShieldCheck } from 'lucide-react'

/** Keys of Service.Icon on the backend — an unknown value renders nothing. */
const ICONS = {
  building: Building2,
  keys: KeyRound,
  landmark: Landmark,
  gavel: Gavel,
  handshake: Handshake,
  shield: ShieldCheck,
  document: FileText,
  coins: Coins,
}

export default function ServiceBadge({ icon, size = 24 }) {
  const Glyph = ICONS[icon]
  if (!Glyph) return null
  return (
    <span className="service-badge" aria-hidden="true">
      <Glyph size={size} strokeWidth={1.9} />
    </span>
  )
}
