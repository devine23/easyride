import React, { useState, useEffect, useRef } from 'react'
import { X, Loader, Smartphone, Globe, Check, AlertTriangle, DollarSign } from 'lucide-react'
import api from '../services/api'

interface Props {
  defaultPhone?: string
  onClose:   () => void
  onFunded:  (wallet: { balance: number; heldBalance: number; total: number }) => void
}

type Method = 'ecocash' | 'paynow_web'
type Phase  = 'form' | 'awaiting' | 'done' | 'error'

const PRESETS = [5, 10, 20, 50]
const POLL_INTERVAL_MS = 5000
const POLL_TIMEOUT_MS  = 120_000  // 2 min — Paynow usually settles in 30-60 s

/**
 * Driver wallet top-up modal.
 *
 * Flow:
 *   1. Driver picks amount + method (EcoCash push OR Paynow web checkout)
 *   2. For EcoCash: shows "approve on your phone" + polls every 5 s
 *   3. For Paynow web: opens hosted checkout in a new tab + polls every 5 s
 *   4. On first successful poll, parent is notified with fresh wallet balance
 *
 * Idempotency is server-side — multiple polls that race a successful payment
 * all return the same credited balance without double-charging.
 */
export default function WalletTopUpModal({ defaultPhone, onClose, onFunded }: Props) {
  const [amount, setAmount] = useState('10')
  const [method, setMethod] = useState<Method>('ecocash')
  const [phone,  setPhone]  = useState(defaultPhone || '')
  const [phase,  setPhase]  = useState<Phase>('form')
  const [error,  setError]  = useState<string | null>(null)
  const [topUpId, setTopUpId] = useState<string | null>(null)
  const [instructions, setInstructions] = useState<string | null>(null)
  const pollTimer = useRef<number | null>(null)
  const giveUpAt  = useRef<number>(0)

  useEffect(() => {
    return () => { if (pollTimer.current) window.clearTimeout(pollTimer.current) }
  }, [])

  async function startTopUp() {
    const n = parseFloat(amount)
    if (!Number.isFinite(n) || n < 1) { setError('Minimum top-up is $1.00'); return }
    if (n > 500)                      { setError('Maximum top-up is $500'); return }
    if (method === 'ecocash' && !phone.trim()) { setError('Enter your EcoCash number'); return }

    setPhase('awaiting'); setError(null)
    try {
      const res = await api.post('/bids/_wallet/topup', {
        amount: n, method, phone: phone.trim(),
      })
      setTopUpId(res.data.topUpId)
      setInstructions(res.data.instructions || null)

      if (method === 'paynow_web' && res.data.redirectUrl) {
        window.open(res.data.redirectUrl, '_blank', 'noopener,noreferrer')
      }

      giveUpAt.current = Date.now() + POLL_TIMEOUT_MS
      schedulePoll(res.data.topUpId)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not start top-up')
      setPhase('error')
    }
  }

  function schedulePoll(id: string) {
    pollTimer.current = window.setTimeout(() => poll(id), POLL_INTERVAL_MS)
  }

  async function poll(id: string) {
    try {
      const res = await api.post(`/bids/_wallet/topup/${id}/poll`, {})
      if (res.data.paid && res.data.wallet) {
        setPhase('done')
        onFunded(res.data.wallet)
        setTimeout(onClose, 1500)
        return
      }
      if (Date.now() > giveUpAt.current) {
        setError('Payment timed out. If you completed it, refresh your wallet shortly.')
        setPhase('error')
        return
      }
      schedulePoll(id)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not check payment status')
      setPhase('error')
    }
  }

  return (
    <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
         style={{ zIndex: 1080, background: 'rgba(0,0,0,0.85)' }}>
      <div className="card p-4 shadow animate-fade-in" style={{ maxWidth: 440, width: '100%' }}>

        {/* Header */}
        <div className="d-flex align-items-center justify-content-between mb-3">
          <div>
            <h5 className="fw-bold mb-0">Top up wallet</h5>
            <p className="text-xs text-muted mb-0">EcoCash push or Paynow web checkout</p>
          </div>
          <button onClick={onClose}
                  className="btn p-0 border-0 text-muted" style={{ background: 'transparent' }}
                  disabled={phase === 'awaiting'}
                  aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {phase === 'form' && (
          <>
            {/* Amount */}
            <label className="text-xs text-muted mb-1 d-block">Amount (USD)</label>
            <div className="input-group mb-2">
              <span className="input-group-text"
                    style={{ background: 'var(--eg-700)', color: '#9ca3af', border: '1px solid var(--eg-600)' }}>
                <DollarSign size={14} />
              </span>
              <input
                type="number"
                step="0.50" min="1" max="500"
                value={amount}
                onChange={e => { setAmount(e.target.value); setError(null) }}
                className="form-control"
                style={{ fontSize: '1.1rem', fontWeight: 600 }}
              />
            </div>
            <div className="d-flex gap-2 mb-3">
              {PRESETS.map(p => (
                <button key={p} onClick={() => setAmount(String(p))}
                        className={`btn btn-sm flex-grow-1 ${parseFloat(amount) === p ? 'btn-primary' : 'btn-secondary'}`}>
                  ${p}
                </button>
              ))}
            </div>

            {/* Method picker */}
            <label className="text-xs text-muted mb-2 d-block fw-semibold text-uppercase">Payment method</label>
            <div className="d-flex flex-column gap-2 mb-3">
              <button
                onClick={() => setMethod('ecocash')}
                className={`btn text-start p-3 d-flex align-items-center gap-3 ${method === 'ecocash' ? 'btn-primary' : 'btn-secondary'}`}>
                <Smartphone size={20} />
                <div className="flex-grow-1">
                  <p className="fw-semibold mb-0">EcoCash</p>
                  <p className="text-xs mb-0 opacity-75">Approve a push on your phone</p>
                </div>
                {method === 'ecocash' && <Check size={16} />}
              </button>
              <button
                onClick={() => setMethod('paynow_web')}
                className={`btn text-start p-3 d-flex align-items-center gap-3 ${method === 'paynow_web' ? 'btn-primary' : 'btn-secondary'}`}>
                <Globe size={20} />
                <div className="flex-grow-1">
                  <p className="fw-semibold mb-0">Paynow web</p>
                  <p className="text-xs mb-0 opacity-75">Visa, Mastercard, OneMoney, Innbucks</p>
                </div>
                {method === 'paynow_web' && <Check size={16} />}
              </button>
            </div>

            {/* Phone (EcoCash only) */}
            {method === 'ecocash' && (
              <>
                <label className="text-xs text-muted mb-1 d-block">EcoCash number</label>
                <input
                  type="tel"
                  placeholder="+263 77X XXX XXX"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="form-control mb-3"
                />
              </>
            )}

            {error && (
              <div className="rounded-xl px-3 py-2 d-flex align-items-start gap-2 mb-3"
                   style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                <AlertTriangle size={14} style={{ color: '#f87171', flexShrink: 0, marginTop: 2 }} />
                <p className="text-xs mb-0" style={{ color: '#fca5a5' }}>{error}</p>
              </div>
            )}

            <button
              onClick={startTopUp}
              className="btn btn-primary w-100 fw-semibold py-2">
              Pay ${parseFloat(amount || '0').toFixed(2)}
            </button>
          </>
        )}

        {phase === 'awaiting' && (
          <div className="text-center py-4">
            <Loader size={28} className="animate-spin mb-3" style={{ color: '#60a5fa' }} />
            <p className="fw-semibold mb-1">Awaiting payment confirmation</p>
            <p className="text-xs text-muted mb-3">
              {method === 'ecocash'
                ? (instructions || 'Approve the push notification on your EcoCash handset.')
                : 'Complete the payment in the Paynow tab we just opened.'}
            </p>
            <p className="text-xs text-muted mb-0">This usually takes 30-60 seconds.</p>
          </div>
        )}

        {phase === 'done' && (
          <div className="text-center py-4">
            <div className="rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3"
                 style={{ width: 56, height: 56, background: 'rgba(34,197,94,0.15)' }}>
              <Check size={28} style={{ color: '#4ade80' }} />
            </div>
            <p className="fw-semibold mb-1" style={{ color: '#4ade80' }}>Wallet credited</p>
            <p className="text-xs text-muted mb-0">You'll start seeing bids again.</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="text-center py-4">
            <AlertTriangle size={28} className="mb-3" style={{ color: '#f87171' }} />
            <p className="fw-semibold mb-2">{error || 'Payment failed'}</p>
            <button onClick={() => { setPhase('form'); setError(null) }} className="btn btn-secondary btn-sm">
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
