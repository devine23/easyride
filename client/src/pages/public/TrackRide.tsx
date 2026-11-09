import React, { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { MapPin, Navigation, Clock, Star, RefreshCw } from 'lucide-react'
import EasyGoLogo from '../../components/EasyGoLogo'

interface PublicRide {
  id: string
  status: string
  pickupAddress: string
  dropoffAddress: string
  pickupCoords?: { lat: number; lng: number }
  dropoffCoords?: { lat: number; lng: number }
  vehicleCategory?: string
  fare?: number
  driver?: { name: string; rating: number; vehicle: string; plate: string }
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  scheduled:  { label: 'Scheduled',     color: '#8b5cf6' },
  searching:  { label: 'Finding Driver', color: '#f59e0b' },
  accepted:   { label: 'Driver Assigned', color: '#3b82f6' },
  pickup:     { label: 'Driver En Route', color: '#3b82f6' },
  inprogress: { label: 'Ride In Progress', color: '#22c55e' },
  completed:  { label: 'Completed',     color: '#6b7280' },
  cancelled:  { label: 'Cancelled',     color: '#ef4444' },
}

const SERVER = import.meta.env.VITE_SERVER_URL || ''
const API = SERVER ? `${SERVER}/api` : '/api'

export default function TrackRide() {
  const { rideId } = useParams<{ rideId: string }>()
  const [ride, setRide] = useState<PublicRide | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchRide = useCallback(async () => {
    try {
      const res = await fetch(`${API}/rides/${rideId}/public`)
      if (!res.ok) { setError('Ride not found or link has expired.'); return }
      const data = await res.json()
      setRide(data)
      setLastUpdated(new Date())
      setError(null)
    } catch {
      setError('Unable to load ride details. Check your connection.')
    } finally { setLoading(false) }
  }, [rideId])

  useEffect(() => {
    fetchRide()
    const interval = setInterval(fetchRide, 10000)
    return () => clearInterval(interval)
  }, [fetchRide])

  const statusInfo = ride ? (STATUS_LABELS[ride.status] || { label: ride.status, color: '#9ca3af' }) : null
  const isActive = ride && !['completed', 'cancelled'].includes(ride.status)

  return (
    <div className="min-vh-100 bg-900 d-flex flex-column" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <header className="d-flex align-items-center justify-content-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--eg-600)', background: 'rgba(17,24,39,0.95)' }}>
        <EasyGoLogo height={36} />
        <span className="text-xs text-muted">Live Ride Tracking</span>
      </header>

      <main className="flex-grow-1 d-flex align-items-start justify-content-center p-3 p-md-5">
        <div style={{ width: '100%', maxWidth: 520 }}>

          {loading && (
            <div className="text-center py-5">
              <div className="spinner-border text-brand mb-3" style={{ width: '2.5rem', height: '2.5rem' }} />
              <p className="text-muted">Loading ride details…</p>
            </div>
          )}

          {!loading && error && (
            <div className="card p-5 text-center">
              <Navigation size={44} className="mx-auto mb-3 text-muted" />
              <h5 className="fw-semibold mb-2">Ride Not Found</h5>
              <p className="text-muted small">{error}</p>
            </div>
          )}

          {!loading && ride && (
            <div className="d-flex flex-column gap-3">

              {/* Status card */}
              <div className="card p-4">
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <div>
                    <p className="text-xs text-muted mb-1">Ride Status</p>
                    <div className="d-flex align-items-center gap-2">
                      {isActive && (
                        <span className="rounded-circle flex-shrink-0"
                          style={{ width: 8, height: 8, background: statusInfo!.color, display: 'inline-block', animation: 'menu-ring-pulse 1.8s ease-in-out infinite' }} />
                      )}
                      <span className="fw-semibold" style={{ color: statusInfo!.color, fontSize: '0.95rem' }}>
                        {statusInfo!.label}
                      </span>
                    </div>
                  </div>
                  {ride.fare && (
                    <div className="text-end">
                      <p className="text-xs text-muted mb-1">Fare</p>
                      <p className="fw-bold text-brand mb-0" style={{ fontSize: '1.2rem' }}>${ride.fare.toFixed(2)}</p>
                    </div>
                  )}
                </div>

                <div className="d-flex flex-column gap-2">
                  <div className="d-flex align-items-start gap-2 text-sm">
                    <MapPin size={15} className="text-brand flex-shrink-0 mt-1" />
                    <div>
                      <p className="text-xs text-muted mb-0">From</p>
                      <p className="mb-0 fw-medium">{ride.pickupAddress}</p>
                    </div>
                  </div>
                  <div style={{ width: 2, height: 12, background: 'var(--eg-600)', marginLeft: 6 }} />
                  <div className="d-flex align-items-start gap-2 text-sm">
                    <MapPin size={15} className="text-danger flex-shrink-0 mt-1" />
                    <div>
                      <p className="text-xs text-muted mb-0">To</p>
                      <p className="mb-0 fw-medium">{ride.dropoffAddress}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Driver card */}
              {ride.driver && (
                <div className="card p-4" style={{ borderColor: 'rgba(34,197,94,0.3)' }}>
                  <p className="text-xs text-muted mb-3">Your Driver</p>
                  <div className="d-flex align-items-center gap-3">
                    <div className="d-flex align-items-center justify-content-center rounded-circle fw-bold text-brand flex-shrink-0"
                      style={{ width: 48, height: 48, background: 'rgba(34,197,94,0.15)', fontSize: '1.1rem' }}>
                      {ride.driver.name[0]}
                    </div>
                    <div className="flex-grow-1">
                      <p className="fw-semibold mb-1">{ride.driver.name}</p>
                      <div className="d-flex align-items-center gap-2 text-xs text-muted flex-wrap">
                        <span className="text-warning d-flex align-items-center gap-1">
                          <Star size={11} /> {ride.driver.rating}
                        </span>
                        <span>·</span>
                        <span>{ride.driver.vehicle}</span>
                        <span>·</span>
                        <span className="fw-bold text-white" style={{ letterSpacing: '0.05em' }}>{ride.driver.plate}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Auto-refresh notice */}
              <div className="d-flex align-items-center justify-content-between px-1">
                <div className="d-flex align-items-center gap-2 text-xs text-muted">
                  <Clock size={12} />
                  {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Loading…'}
                </div>
                <button onClick={fetchRide} className="btn btn-secondary btn-sm d-flex align-items-center gap-1 text-xs py-1 px-2">
                  <RefreshCw size={11} /> Refresh
                </button>
              </div>

              {/* Powered by */}
              <p className="text-center text-xs text-muted mt-2 mb-0">
                Powered by <span className="text-brand fw-semibold">EasyRide</span> Zimbabwe
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
