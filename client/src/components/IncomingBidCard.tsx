import React, { useState, useEffect, useRef } from 'react'
import { MapPin, Clock, DollarSign, Check, X, Loader, Zap, AlertTriangle } from 'lucide-react'
import { Bid, Ride } from '../types'
import { useSocket } from '../context/SocketContext'
import api from '../services/api'

interface Props {
  bid: Bid
  onWon:      (ride: Ride) => void
  onDismiss:  () => void
}

/**
 * Driver-side bid takeover. The parent listens for `bid:new` and renders this
 * component with the incoming bid. Handles: accept-at-offer, counter-offer,
 * waiting-for-rider state, and the three terminal socket events
 * (bid:accepted → onWon; bid:lost/cancelled/expired → onDismiss with reason).
 */
export default function IncomingBidCard({ bid, onWon, onDismiss }: Props) {
  const { socket } = useSocket()
  const [amount,  setAmount]  = useState<string>(bid.passengerOffer.toFixed(2))
  const [etaMin,  setEtaMin]  = useState<string>('5')
  const [phase,   setPhase]   = useState<'idle' | 'sending' | 'waiting' | 'lost'>('idle')
  const [error,   setError]   = useState<string | null>(null)
  const [reason,  setReason]  = useState<string>('')
  const [secondsLeft, setSecondsLeft] = useState<number>(() => {
    const ms = new Date(bid.expiresAt).getTime() - Date.now()
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

  // Terminal events — accepted / lost / cancelled / expired
  useEffect(() => {
    if (!socket) return
    const onAccepted = ({ bidId, ride }: { bidId: string; ride: Ride }) => {
      if (bidId === bid.id) onWon(ride)
    }
    const onLost = ({ bidId }: { bidId: string }) => {
      if (bidId !== bid.id) return
      setPhase('lost'); setReason('Rider chose another driver')
      setTimeout(onDismiss, 2500)
    }
    const onCancelled = ({ bidId }: { bidId: string }) => {
      if (bidId !== bid.id) return
      setPhase('lost'); setReason('Rider cancelled the bid')
      setTimeout(onDismiss, 2000)
    }
    socket.on('bid:accepted',  onAccepted)
    socket.on('bid:lost',      onLost)
    socket.on('bid:cancelled', onCancelled)
    return () => {
      socket.off('bid:accepted',  onAccepted)
      socket.off('bid:lost',      onLost)
      socket.off('bid:cancelled', onCancelled)
    }
  }, [socket, bid.id])

  // Auto-dismiss on local expiry
  useEffect(() => {
    if (secondsLeft === 0 && phase !== 'lost') {
      setPhase('lost'); setReason('Bid expired')
      setTimeout(onDismiss, 1500)
    }
  }, [secondsLeft])

  async function submitCounter(useAmount?: number) {
    const n = useAmount ?? parseFloat(amount)
    const eta = parseInt(etaMin, 10)
    if (!Number.isFinite(n) || n < bid.floor) {
      setError(`Minimum counter is $${bid.floor.toFixed(2)}`); return
    }
    if (!Number.isFinite(eta) || eta < 1 || eta > 60) {
      setError('ETA must be between 1 and 60 minutes'); return
    }
    setPhase('sending'); setError(null)
    try {
      await api.post(`/bids/${bid.id}/counter`, { amount: n, etaMin: eta })
      setPhase('waiting')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not submit counter')
      setPhase('idle')
    }
  }

  const estimateDiff = (parseFloat(amount) || 0) - bid.estimate
  const diffColor = estimateDiff >= 0 ? '#4ade80' : estimateDiff >= -bid.estimate * 0.1 ? '#fbbf24' : '#f87171'

  return (
    <div className="position-fixed top-0 start-0 w-100 h-100 d-flex flex-column"
         style={{ zIndex: 1070, background: 'rgba(10,15,30,0.98)' }}>
      {/* ─── Header ─── */}
      <div className="d-flex align-items-center justify-content-between px-3 py-3"
           style={{ background: 'var(--eg-800)', borderBottom: '1px solid var(--eg-600)' }}>
        <div className="d-flex align-items-center gap-2">
          <div className="d-flex align-items-center justify-content-center rounded-xl"
               style={{ width: 40, height: 40, background: 'rgba(251,191,36,0.15)' }}>
            <Zap size={20} style={{ color: '#fbbf24' }} />
          </div>
          <div>
            <h1 className="fw-bold mb-0" style={{ fontSize: '1.1rem' }}>Incoming bid</h1>
            <p className="text-xs text-muted mb-0">{bid.category} · {bid.distKm?.toFixed(1)} km</p>
          </div>
        </div>
        <button onClick={onDismiss}
                className="btn btn-secondary d-flex align-items-center justify-content-center flex-shrink-0"
                style={{ width: 42, height: 42, borderRadius: '50%' }}
                aria-label="Dismiss">
          <X size={18} />
        </button>
      </div>

      {/* ─── Route + numbers ─── */}
      <div className="px-3 py-3" style={{ background: 'var(--eg-800)' }}>
        <div className="d-flex flex-column gap-2 mb-3 small">
          <div className="d-flex align-items-start gap-2">
            <MapPin size={14} className="text-brand flex-shrink-0 mt-1" />
            <span className="text-truncate">{bid.pickupAddress || 'Pickup location'}</span>
          </div>
          <div className="d-flex align-items-start gap-2">
            <MapPin size={14} className="text-danger flex-shrink-0 mt-1" />
            <span className="text-truncate">{bid.dropoffAddress || 'Dropoff location'}</span>
          </div>
        </div>
        <div className="row g-2 text-center">
          <div className="col-4">
            <p className="text-xs text-muted mb-1">Rider offer</p>
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

      {/* ─── Body ─── */}
      <div className="flex-grow-1 overflow-y-auto p-3" style={{ minHeight: 0 }}>
        {phase === 'lost' && (
          <div className="text-center text-muted py-5">
            <AlertTriangle size={28} className="mb-3" style={{ color: '#fbbf24' }} />
            <p className="small fw-semibold mb-1">{reason}</p>
          </div>
        )}

        {phase === 'waiting' && (
          <div className="text-center text-muted py-5">
            <Loader size={28} className="animate-spin mb-3" style={{ color: '#60a5fa' }} />
            <p className="small fw-semibold mb-1">Counter sent — waiting for rider</p>
            <p className="text-xs">You'll see a response within {secondsLeft}s</p>
          </div>
        )}

        {(phase === 'idle' || phase === 'sending') && (
          <>
            <button
              onClick={() => submitCounter(bid.passengerOffer)}
              disabled={phase === 'sending'}
              className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2 fw-semibold py-3 mb-3">
              <Check size={16} />
              Accept at ${bid.passengerOffer.toFixed(2)}
            </button>

            <div className="card p-3 mb-2" style={{ borderColor: 'var(--eg-600)' }}>
              <p className="text-xs text-muted mb-2 fw-semibold text-uppercase">Counter offer</p>

              <label className="text-xs text-muted mb-1 d-block">Your price</label>
              <div className="input-group mb-2">
                <span className="input-group-text"
                      style={{ background: 'var(--eg-700)', color: '#9ca3af', border: '1px solid var(--eg-600)' }}>
                  <DollarSign size={14} />
                </span>
                <input
                  type="number"
                  step="0.50"
                  min={bid.floor}
                  value={amount}
                  onChange={e => { setAmount(e.target.value); setError(null) }}
                  className="form-control"
                  style={{ fontSize: '1.1rem', fontWeight: 600 }}
                  disabled={phase === 'sending'}
                />
              </div>
              <p className="text-xs mb-2" style={{ color: diffColor }}>
                {estimateDiff >= 0
                  ? `+$${estimateDiff.toFixed(2)} above estimate`
                  : `-$${Math.abs(estimateDiff).toFixed(2)} below estimate`}
                {' · '}
                <span className="text-muted">Floor ${bid.floor.toFixed(2)}</span>
              </p>

              <label className="text-xs text-muted mb-1 d-block">ETA to pickup (min)</label>
              <div className="input-group mb-3">
                <span className="input-group-text"
                      style={{ background: 'var(--eg-700)', color: '#9ca3af', border: '1px solid var(--eg-600)' }}>
                  <Clock size={14} />
                </span>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="60"
                  value={etaMin}
                  onChange={e => setEtaMin(e.target.value)}
                  className="form-control"
                  disabled={phase === 'sending'}
                />
              </div>

              <button
                onClick={() => submitCounter()}
                disabled={phase === 'sending'}
                className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2 fw-semibold">
                {phase === 'sending' ? <Loader size={14} className="animate-spin" /> : <Zap size={14} />}
                Send counter
              </button>
            </div>

            {error && (
              <div className="rounded-xl px-3 py-2 d-flex align-items-start gap-2 mt-2"
                   style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                <AlertTriangle size={14} style={{ color: '#f87171', flexShrink: 0, marginTop: 2 }} />
                <p className="text-xs mb-0" style={{ color: '#fca5a5' }}>{error}</p>
              </div>
            )}

            <button
              onClick={onDismiss}
              disabled={phase === 'sending'}
              className="btn btn-link text-muted w-100 mt-2 small">
              Decline bid
            </button>
          </>
        )}
      </div>
    </div>
  )
}
