import React from 'react'
import { ChevronLeft } from 'lucide-react'
import EasyGoLogo from './EasyGoLogo'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'

interface NavItem { id: string; label: string; icon: React.ElementType }
interface Props {
  items: NavItem[]
  active: string
  onNav: (id: string) => void
  onBack?: () => void
  canGoBack?: boolean
}

const RIDE_COLORS: Record<string, string> = {
  searching:  '#f59e0b',
  accepted:   '#3b82f6',
  pickup:     '#3b82f6',
  inprogress: '#22c55e',
}
const RIDE_LABELS: Record<string, string> = {
  searching:  'Finding driver…',
  accepted:   'Driver en route',
  pickup:     'Driver arriving',
  inprogress: 'Ride in progress',
}

export default function Navbar({ onNav, onBack, canGoBack = false }: Props) {
  const { user } = useAuth()
  const { activeRide, incomingCall } = useSocket()

  const rideColor = incomingCall ? '#ef4444'
    : activeRide ? (RIDE_COLORS[activeRide.status] ?? null) : null
  const rideLabel = incomingCall ? 'Incoming call'
    : activeRide ? (RIDE_LABELS[activeRide.status] ?? null) : null

  const initial = (user?.fullName || user?.name || '?')[0].toUpperCase()

  return (
    <header
      className="position-fixed top-0 start-0 end-0 d-flex align-items-center px-3 gap-2"
      style={{
        height: 56,
        background: 'var(--eg-800)',
        borderBottom: '1px solid var(--eg-600)',
        zIndex: 1060,
      }}
    >
      {canGoBack ? (
        <button
          onPointerDown={e => { e.preventDefault(); onBack?.() }}
          className="btn btn-secondary p-2 flex-shrink-0"
          style={{ minWidth: 40, minHeight: 40 }}
          aria-label="Go back"
        >
          <ChevronLeft size={18} />
        </button>
      ) : (
        <div className="flex-shrink-0">
          <EasyGoLogo height={28} />
        </div>
      )}

      {rideLabel && rideColor && (
        <div
          className="d-flex align-items-center gap-2 rounded-pill px-2 py-1 ms-1"
          style={{ background: `${rideColor}18`, border: `1px solid ${rideColor}35`, overflow: 'hidden' }}
        >
          <span
            className="ping-ring flex-shrink-0"
            style={{ width: 7, height: 7, borderRadius: '50%', background: rideColor, display: 'inline-block' }}
          />
          <span style={{ color: rideColor, fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {rideLabel}
          </span>
        </div>
      )}

      <button
        className="ms-auto flex-shrink-0 border-0 p-0 d-flex align-items-center justify-content-center"
        style={{
          width: 34, height: 34, borderRadius: '50%',
          background: 'rgba(34,197,94,0.15)',
          color: '#4ade80', fontWeight: 700, fontSize: '0.85rem',
          cursor: 'pointer',
          border: '1px solid rgba(34,197,94,0.2)',
        }}
        onPointerDown={e => { e.preventDefault(); onNav('account') }}
        aria-label="Account"
      >
        {initial}
      </button>
    </header>
  )
}
