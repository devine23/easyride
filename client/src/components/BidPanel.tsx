import React, { useEffect, useState, useRef } from 'react'
import {
  X, Zap, Clock, Star, Check, Loader, DollarSign, AlertTriangle,
} from 'lucide-react'
import { Bid, BidCounter, Ride, VehicleCategory, Coordinates } from '../types'
import { useSocket } from '../context/SocketContext'
import api from '../services/api'

interface Props {
  // Initial bid info — passed from the Book tab after `POST /api/bids`
  initialBid:  Bid
  envelope?:   { estimate: number; floor: number; distKm: number; durMin: number }
  onAccepted:  (ride: Ride) => void   // Called when driver counter is accepted
  onClose:     () => void             // User tapped the X or cancelled
}

/**
 * Full-screen bidding takeover for the rider. Lives on top of the Book tab
 * while a bid is open — hides automatically once a counter is accepted (parent
 * transitions to the Track tab).
 */
export default function BidPanel({ initialBid, envelope, onAccepted, onClose }: Props) {
  const { socket } = useSocket()
  const [bid, setBid]           = useState<Bid>(initialBid)
  const [accepting, setAccepting] = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState<number>(() => {
    const ms = new Date(initialBid.expiresAt).getTime() - Date.now()
    return Math.max(0, Math.round(ms / 1000))
  })

  // Expiry countdown
  const intervalRef = useRef<number | null>(null)
  useEffect(() => {
    intervalRef.current = window.setInterval(() => {
      const ms = new Date(bid.expiresAt).getTime() - Date.now()
      setSecondsLeft(Math.max(0, Math.round(ms / 1000)))
    }, 1000)
    return () => { if (intervalRef.current) window.clearInterval(intervalRef.current) }
  }, [bid.expiresAt])

  // Socket listeners for live counters
  useEffect(() => {
    if (!socket) return
    const onCounter = ({ bidId, counter }: { bidId: string; counter: BidCounter }) => {
      if (bidId !== bid.id) return
      setBid(prev => {
        if (prev.counters.some(c => c.id === counter.id)) return prev   // dedupe
        return { ...prev, counters: [...prev.counters, counter] }
      })
    }
    const onExpired = ({ bidId }: { bidId: string }) => {
      if (bidId === bid.id) setBid(prev => ({ ...prev, status: 'expired' }))
    }
    socket.on('bid:counter', onCounter)
    socket.on('bid:expired', onExpired)
    return () => { socket.off('bid:counter', onCounter); socket.off('bid:expired', onExpired) }
  }, [socket, bid.id])

  async function acceptCounter(counterId: string) {
    setAccepting(counterId); setError(null)
    try {
      const res = await api.post(`/bids/${bid.id}/accept`, { counterId })
      onAccepted(res.data.ride as Ride)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not accept counter — try another driver')
      setAccepting(null)
    }
  }

  async function cancelBid() {
    setCancelling(true)
    try { await api.delete(`/bids/${bid.id}`) } catch { /* best-effort */ }
    onClose()
  }

  // Sort counters: cheapest first, then quickest ETA
  const sortedCounters = [...bid.counters].sort((a, b) => {
    if (Math.abs(a.amount - b.amount) > 0.01) return a.amount - b.amount
    return (a.etaMin ?? 999) - (b.etaMin ?? 999)
  })

  const isActive = bid.status === 'open' && secondsLeft > 0

  return (
    <div className="position-fixed top-0 start-0 w-100 h-100 d-flex flex-column"
         style={{ zIndex: 1070, background: 'rgba(10,15,30,0.98)' }}>
      {/* ─── Header ───────────────────────────────────────────────── */}
      <div className="d-flex align-items-center justify-content-between px-3 py-3"
           style={{ background: 'var(--eg-800)', borderBottom: '1px solid var(--eg-600)' }}>
        <div className="d-flex align-items-center gap-2">
          <div className="d-flex align-items-center justify-content-center rounded-xl"
               style={{ width: 40, height: 40, background: 'rgba(251,191,36,0.15)' }}>
            <Zap size={20} style={{ color: '#fbbf24' }} />
          </div>
          <div>
            <h1 className="fw-bold mb-0" style={{ fontSize: '1.1rem', letterSpacing: '-0.01em' }}>
              Bid in progress
            </h1>
            <p className="text-xs text-muted mb-0">
              {bid.counters.length} offer{bid.counters.length !== 1 ? 's' : ''} received
            </p>
          </div>
        </div>
        <button onClick={cancelBid} disabled={cancelling}
                className="btn btn-secondary d-flex align-items-center justify-content-center flex-shrink-0"
                style={{ width: 42, height: 42, borderRadius: '50%' }}
                aria-label="Cancel bid">
          <X size={18} />
        </button>
      </div>

      {/* ─── Bid summary ──────────────────────────────────────────── */}
      <div className="px-3 py-3" style={{ background: 'var(--eg-800)' }}>
        <div className="row g-2 text-center">
          <div className="col-4">
            <p className="text-xs text-muted mb-1">Your offer</p>
            <p className="fw-bold mb-0" style={{ color: '#4ade80', fontSize: '1.1rem' }}>
              ${bid.passengerOffer.toFixed(2)}
            </p>
          </div>
          <div className="col-4">
            <p className="text-xs text-muted mb-1">Estimate</p>
            <p className="fw-bold mb-0" style={{ color: '#9ca3af', fontSize: '1.1rem' }}>
              ${bid.estimate.toFixed(2)}
            </p>
          </div>
          <div className="col-4">
            <p className="text-xs text-muted mb-1">Time left</p>
            <p className="fw-bold mb-0"
               style={{ color: secondsLeft < 15 ? '#f87171' : '#60a5fa', fontSize: '1.1rem' }}>
              {secondsLeft}s
            </p>
          </div>
        </div>
      </div>

      {/* ─── Counters list — the main area ───────────────────────── */}
      <div className="flex-grow-1 overflow-y-auto p-3" style={{ minHeight: 0 }}>
        {isActive && bid.counters.length === 0 && (
          <div className="text-center text-muted py-5">
            <Loader size={28} className="animate-spin mb-3" style={{ color: '#60a5fa' }} />
            <p className="small mb-1">Waiting for driver offers...</p>
            <p className="text-xs">Drivers nearby are seeing your bid now</p>
          </div>
        )}

        {!isActive && bid.status === 'expired' && (
          <div className="text-center text-muted py-5">
            <Clock size={28} className="mb-3" style={{ color: '#fbbf24' }} />
            <p className="small fw-semibold mb-1">Bid expired</p>
            <p className="text-xs mb-3">No driver accepted your offer in time.</p>
            <button className="btn btn-secondary" onClick={onClose}>Try another bid</button>
          </div>
        )}

        {sortedCounters.map(c => (
          <div key={c.id} className="card p-3 mb-2 animate-fade-in"
               style={{ borderColor: 'var(--eg-600)' }}>
            <div className="d-flex align-items-center gap-3">
              <div className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 fw-bold"
                   style={{ width: 44, height: 44, background: 'rgba(34,197,94,0.15)', color: '#4ade80', fontSize: '1rem' }}>
                {(c.driverName || 'D')[0].toUpperCase()}
              </div>
              <div className="flex-grow-1 overflow-hidden">
                <p className="fw-semibold mb-1 text-truncate">{c.driverName}</p>
                <div className="d-flex align-items-center gap-2 text-xs text-muted">
                  {c.rating != null && (
                    <span className="d-flex align-items-center gap-1">
                      <Star size={11} style={{ color: '#fbbf24' }} /> {c.rating.toFixed(1)}
                    </span>
                  )}
                  {c.etaMin != null && (
                    <>
                      <span>·</span>
                      <span className="d-flex align-items-center gap-1">
                        <Clock size={11} /> {Math.round(c.etaMin)} min away
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-end flex-shrink-0">
                <p className="fw-bolder mb-1" style={{ fontSize: '1.15rem', color: '#f3f4f6' }}>
                  ${c.amount.toFixed(2)}
                </p>
                <button
                  onClick={() => acceptCounter(c.id)}
                  disabled={!isActive || !!accepting}
                  className="btn btn-primary btn-sm d-flex align-items-center gap-1 fw-semibold">
                  {accepting === c.id ? <Loader size={12} className="animate-spin" /> : <Check size={12} />}
                  Accept
                </button>
              </div>
            </div>
          </div>
        ))}

        {error && (
          <div className="rounded-xl px-3 py-2 d-flex align-items-start gap-2 mt-2"
               style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <AlertTriangle size={14} style={{ color: '#f87171', flexShrink: 0, marginTop: 2 }} />
            <p className="text-xs mb-0" style={{ color: '#fca5a5' }}>{error}</p>
          </div>
        )}
      </div>

      {/* ─── Footer — floor & route info ────────────────────────── */}
      {envelope && (
        <div className="px-3 py-2 d-flex align-items-center justify-content-between flex-wrap gap-2"
             style={{ background: 'var(--eg-800)', borderTop: '1px solid var(--eg-700)' }}>
          <p className="text-xs text-muted mb-0 d-flex align-items-center gap-1">
            <DollarSign size={12} /> Floor: ${envelope.floor.toFixed(2)}
          </p>
          <p className="text-xs text-muted mb-0">
            {envelope.distKm.toFixed(1)} km · {Math.round(envelope.durMin)} min
          </p>
        </div>
      )}
    </div>
  )
}
