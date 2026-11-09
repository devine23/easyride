import React, { useState } from 'react'
import { X, CreditCard, Banknote, Smartphone, CheckCircle, Loader } from 'lucide-react'
import { PaymentMethod } from '../types'
import api from '../services/api'

interface Props {
  fare: number;
  rideId?: string;
  allowVoucher?: boolean;
  onPay: (method: PaymentMethod, details?: Record<string, string>) => Promise<void>;
  onClose: () => void;
}

export default function PaymentModal({ fare, rideId, allowVoucher, onPay, onClose }: Props) {
  const [method,    setMethod]    = useState<PaymentMethod>('cash')
  const [ecoNumber, setEcoNumber] = useState('')
  const [voucherNo, setVoucherNo] = useState('')
  const [loading,   setLoading]   = useState(false)
  const [success,   setSuccess]   = useState(false)
  const [error,     setError]     = useState('')
  const [pollMsg,   setPollMsg]   = useState('')

  async function handlePay() {
    setLoading(true)
    setError('')
    try {
      if (method === 'ecocash' && rideId) {
        // Initiate real Paynow EcoCash payment
        await api.post('/payments/initiate', { rideId, phone: ecoNumber })
        setPollMsg('Check your phone for the EcoCash prompt…')
        // Poll up to 12 times (1 min) for confirmation
        let paid = false
        for (let i = 0; i < 12; i++) {
          await new Promise(r => setTimeout(r, 5000))
          const poll = await api.post('/payments/poll', { rideId })
          if (poll.data.paid) { paid = true; break }
        }
        if (!paid) { setError('Payment not confirmed. Please try again.'); setLoading(false); return }
      } else {
        await onPay(
          method,
          method === 'ecocash' ? { number: ecoNumber }
          : method === 'voucher' ? { voucherNo }
          : undefined,
        )
      }
      setSuccess(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Payment failed. Please try again.')
    } finally {
      setLoading(false)
      setPollMsg('')
    }
  }

  const METHODS: { id: PaymentMethod; icon: React.ElementType; label: string; desc: string; color: string }[] = [
    { id: 'cash',    icon: Banknote,   label: 'Cash',    desc: 'Pay driver directly',    color: '#4ade80' },
    { id: 'ecocash', icon: Smartphone, label: 'EcoCash', desc: 'Mobile money transfer',  color: '#22c55e' },
    ...(allowVoucher ? [{ id: 'voucher' as PaymentMethod, icon: CreditCard, label: 'Voucher', desc: 'Corporate voucher', color: '#60a5fa' }] : []),
  ]

  if (success) return (
    <div
      className="position-fixed top-0 start-0 end-0 bottom-0 d-flex align-items-center justify-content-center p-4"
      style={{ zIndex: 1055, background: 'rgba(0,0,0,0.8)' }}
    >
      <div className="card p-5 text-center animate-fade-in" style={{ maxWidth: 360, width: '100%', border: '1px solid rgba(34,197,94,0.3)' }}>
        <div
          className="d-flex align-items-center justify-content-center rounded-circle mx-auto mb-4"
          style={{ width: 64, height: 64, background: 'var(--eg-brand-dim)' }}
        >
          <CheckCircle size={32} className="text-brand" />
        </div>
        <h4 className="fw-bold mb-2">Payment Confirmed!</h4>
        <p className="text-muted small mb-1">Amount: <span className="text-white fw-semibold">${fare.toFixed(2)}</span></p>
        <p className="text-muted small mb-4">Method: <span className="text-white fw-semibold text-capitalize">{method}</span></p>
        <button onClick={onClose} className="btn btn-primary w-100">Done</button>
      </div>
    </div>
  )

  return (
    <div
      className="position-fixed top-0 start-0 end-0 bottom-0 d-flex align-items-end align-items-sm-center justify-content-center p-0 p-sm-4"
      style={{ zIndex: 1055, background: 'rgba(0,0,0,0.75)' }}
    >
      <div className="card w-100 animate-fade-in" style={{ maxWidth: 480, borderRadius: '1rem 1rem 0 0' }}>
        <div className="card-header d-flex align-items-center justify-content-between">
          <h5 className="fw-bold mb-0">Complete Payment</h5>
          <button onClick={onClose} className="btn btn-secondary p-2"><X size={18} /></button>
        </div>

        <div className="card-body p-4 d-flex flex-column gap-3">
          <div className="rounded-xl p-4 text-center bg-700">
            <p className="text-muted small mb-1">Total Fare</p>
            <p className="fw-bold text-brand mb-0" style={{ fontSize: '2.25rem' }}>${fare.toFixed(2)}</p>
          </div>

          <div>
            <p className="form-label mb-2">Select payment method</p>
            <div className="d-flex flex-column gap-2">
              {METHODS.map(({ id, icon: Icon, label, desc, color }) => (
                <button
                  key={id} type="button" onClick={() => setMethod(id)}
                  className="d-flex align-items-center gap-3 p-3 rounded-xl text-start w-100 border-0"
                  style={{
                    outline: `1px solid ${method === id ? 'rgba(34,197,94,0.5)' : 'var(--eg-600)'}`,
                    background: method === id ? 'rgba(34,197,94,0.08)' : 'var(--eg-700)',
                    transition: 'all 0.15s', color: 'inherit',
                  }}
                >
                  <div className="d-flex align-items-center justify-content-center rounded-xl flex-shrink-0" style={{ width: 40, height: 40, background: 'var(--eg-800)' }}>
                    <Icon size={20} style={{ color }} />
                  </div>
                  <div className="flex-grow-1">
                    <p className="fw-semibold small mb-0">{label}</p>
                    <p className="text-xs text-muted mb-0">{desc}</p>
                  </div>
                  <div
                    className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                    style={{ width: 20, height: 20, border: `2px solid ${method === id ? '#22c55e' : 'var(--eg-600)'}` }}
                  >
                    {method === id && <div style={{ width: 10, height: 10, background: '#22c55e', borderRadius: '50%' }} />}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {method === 'ecocash' && (
            <div>
              <label className="form-label">EcoCash Number</label>
              <input
                className="form-control" placeholder="+263 7XX XXX XXX"
                value={ecoNumber} onChange={e => setEcoNumber(e.target.value)}
              />
              <p className="text-xs text-muted mt-1">You'll receive an EcoCash prompt to confirm</p>
            </div>
          )}

          {method === 'voucher' && allowVoucher && (
            <div>
              <label className="form-label">Voucher Number</label>
              <input
                className="form-control" placeholder="e.g. 0806"
                value={voucherNo} onChange={e => setVoucherNo(e.target.value)}
              />
            </div>
          )}

          {pollMsg && <p className="text-brand small text-center mb-0">{pollMsg}</p>}
          {error && <p className="text-danger small text-center mb-0">{error}</p>}

          <button
            onClick={handlePay}
            disabled={loading || (method === 'ecocash' && !ecoNumber) || (method === 'voucher' && !voucherNo)}
            className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2"
          >
            {loading && <Loader size={15} className="animate-spin" />}
            {method === 'cash'    ? 'Confirm Cash Payment'
             : method === 'ecocash' ? (loading ? 'Processing…' : 'Send EcoCash Payment')
             : 'Redeem Voucher'}
          </button>
        </div>
      </div>
    </div>
  )
}
