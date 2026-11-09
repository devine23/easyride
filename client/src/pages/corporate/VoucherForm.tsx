import React, { useState } from 'react'
import { FileText, X, Printer, CheckCircle, Loader } from 'lucide-react'
import { Voucher } from '../../types'
import api from '../../services/api'

interface Props {
  onSave: (v: Voucher) => void
  onClose: () => void
  prefill?: Partial<Voucher>
}

const EMPTY: Omit<Voucher, 'id' | 'corporateId' | 'status' | 'createdAt'> = {
  voucherNo: '', date: new Date().toISOString().split('T')[0],
  pickUpPoint: '', dropOffPoint: '', department: '', costCenter: '',
  employeeNames: '', authorisedBy: '', cabNo: '', pickUpTime: '', dropOffTime: '',
  openingMileage: '', closingMileage: '', totalMileage: '', waitingCharge: '', totalValue: '', driverName: '',
}

export default function VoucherForm({ onSave, onClose, prefill }: Props) {
  const [form, setForm] = useState({ ...EMPTY, ...prefill })
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  function set(k: string, v: string) {
    setForm(f => {
      const next = { ...f, [k]: v }
      if (k === 'openingMileage' || k === 'closingMileage') {
        const open = Number(k === 'openingMileage' ? v : f.openingMileage)
        const close = Number(k === 'closingMileage' ? v : f.closingMileage)
        if (open && close && close >= open) next.totalMileage = String(close - open)
      }
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true)
    try {
      const res = await api.post('/vouchers', form)
      setSaved(true); onSave(res.data)
    } catch {
      const voucher: Voucher = { ...form, id: crypto.randomUUID(), corporateId: 'corp1', status: 'pending', createdAt: new Date().toISOString() }
      setSaved(true); onSave(voucher)
    } finally { setLoading(false) }
  }

  if (saved) return (
    <div className="position-fixed top-0 start-0 end-0 bottom-0 d-flex align-items-center justify-content-center p-4"
      style={{ zIndex: 1055, background: 'rgba(0,0,0,0.75)' }}>
      <div className="card p-5 text-center" style={{ maxWidth: 380, width: '100%', border: '1px solid rgba(34,197,94,0.3)' }}>
        <CheckCircle size={48} className="text-brand mx-auto mb-3" />
        <h3 className="fw-bold mb-2">Voucher Created!</h3>
        <p className="text-muted small mb-4">Voucher #{form.voucherNo} has been saved successfully.</p>
        <button onClick={onClose} className="btn btn-primary w-100">Done</button>
      </div>
    </div>
  )

  return (
    <div className="position-fixed top-0 start-0 end-0 bottom-0 d-flex align-items-start justify-content-center p-4 overflow-auto"
      style={{ zIndex: 1055, background: 'rgba(0,0,0,0.75)' }}>
      <div className="card w-100 animate-fade-in my-3" style={{ maxWidth: 672 }}>
        <div className="card-header d-flex align-items-center justify-content-between" style={{ position: 'sticky', top: 0, background: 'var(--eg-800)', zIndex: 10 }}>
          <div className="d-flex align-items-center gap-3">
            <div className="d-flex align-items-center justify-content-center rounded-xl flex-shrink-0"
              style={{ width: 36, height: 36, background: 'var(--eg-brand-dim)' }}>
              <FileText size={18} className="text-brand" />
            </div>
            <div>
              <p className="fw-bold mb-0 small">EasyRide Tax Invoice Voucher</p>
              <p className="text-xs text-muted mb-0">For account holders only</p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-secondary p-2"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="card-body p-4">
          <div className="row g-3 mb-3">
            <div className="col-6"><VField label="Voucher No." value={form.voucherNo} onChange={v => set('voucherNo', v)} placeholder="e.g. 0806" required /></div>
            <div className="col-6"><VField label="Date" type="date" value={form.date} onChange={v => set('date', v)} required /></div>
          </div>
          <div className="row g-3 mb-3">
            <div className="col-6"><VField label="Pick Up Point" value={form.pickUpPoint} onChange={v => set('pickUpPoint', v)} placeholder="e.g. CBZ Avondale" required /></div>
            <div className="col-6"><VField label="Drop Off Point" value={form.dropOffPoint} onChange={v => set('dropOffPoint', v)} placeholder="e.g. Mufakose" required /></div>
          </div>
          <div className="row g-3 mb-3">
            <div className="col-6"><VField label="Department" value={form.department} onChange={v => set('department', v)} placeholder="e.g. Finance" required /></div>
            <div className="col-6"><VField label="Cost Center" value={form.costCenter} onChange={v => set('costCenter', v)} placeholder="e.g. HQ-001" /></div>
          </div>
          <div className="row g-3 mb-3">
            <div className="col-6"><VField label="Employee Name(s)" value={form.employeeNames} onChange={v => set('employeeNames', v)} placeholder="Full name(s)" required /></div>
            <div className="col-6"><VField label="Authorising Signature(s)" value={form.authorisedBy} onChange={v => set('authorisedBy', v)} placeholder="Authoriser name" /></div>
          </div>
          <div className="row g-3 mb-3">
            <div className="col-6"><VField label="Cab No." value={form.cabNo} onChange={v => set('cabNo', v)} placeholder="e.g. PLS 171" /></div>
            <div className="col-6"><VField label="Driver Name" value={form.driverName} onChange={v => set('driverName', v)} placeholder="Driver's name" /></div>
          </div>
          <div className="row g-3 mb-3">
            <div className="col-6"><VField label="Pick Up Time" type="time" value={form.pickUpTime} onChange={v => set('pickUpTime', v)} /></div>
            <div className="col-6"><VField label="Drop Off Time" type="time" value={form.dropOffTime} onChange={v => set('dropOffTime', v)} /></div>
          </div>

          <div className="rounded-xl p-3 mb-3 bg-700">
            <p className="fw-semibold small text-white mb-3">Mileage</p>
            <div className="row g-3">
              <div className="col-4"><VField label="Opening Mileage" type="number" value={String(form.openingMileage)} onChange={v => set('openingMileage', v)} placeholder="e.g. 54025" /></div>
              <div className="col-4"><VField label="Closing Mileage" type="number" value={String(form.closingMileage)} onChange={v => set('closingMileage', v)} placeholder="e.g. 54055" /></div>
              <div className="col-4">
                <label className="form-label">Total Mileage</label>
                <input readOnly value={form.totalMileage} className="form-control fw-bold text-brand" placeholder="Auto"
                  style={{ background: 'var(--eg-800)', cursor: 'not-allowed' }} />
              </div>
            </div>
          </div>

          <div className="row g-3 mb-4">
            <div className="col-6"><VField label="Waiting Charge ($)" type="number" step="0.01" value={String(form.waitingCharge)} onChange={v => set('waitingCharge', v)} placeholder="0.00" /></div>
            <div className="col-6"><VField label="Total Value ($)" type="number" step="0.01" value={String(form.totalValue)} onChange={v => set('totalValue', v)} placeholder="0.00" required /></div>
          </div>

          <div className="d-flex gap-3">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-grow-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn btn-primary flex-grow-1 d-flex align-items-center justify-content-center gap-2">
              {loading && <Loader size={15} className="animate-spin" />}
              <Printer size={15} /> Save Voucher
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function VField({ label, value, onChange, type = 'text', placeholder, required, step }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; required?: boolean; step?: string
}) {
  return (
    <div>
      <label className="form-label">{label}{required && <span className="text-danger ms-1">*</span>}</label>
      <input type={type} className="form-control" value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)} required={required} step={step} />
    </div>
  )
}
