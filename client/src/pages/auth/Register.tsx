import React, { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  User, Building2, ArrowLeft, ArrowRight, Check,
  Phone, Mail, Lock, Eye, EyeOff, Upload, X, Loader,
  Shield, AlertTriangle, Camera, FileText, MapPin, CreditCard, Car,
} from 'lucide-react'
import EasyGoLogo from '../../components/EasyGoLogo'
import { useAuth } from '../../context/AuthContext'
import { VehicleCategory, LicenceClass, PaymentPreference } from '../../types'
import api from '../../services/api'

// ─── Step indicator ────────────────────────────────────────────────────────

function StepBar({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="mb-4">
      <div className="d-flex align-items-center">
        {steps.map((s, i) => (
          <React.Fragment key={i}>
            <div className="d-flex flex-column align-items-center">
              <div className={`step-dot${i < current ? ' done' : i === current ? ' active' : ''}`}>
                {i < current ? <Check size={14} /> : i + 1}
              </div>
              <p className="text-muted d-none d-sm-block text-center mt-1 mb-0"
                style={{ fontSize: '0.65rem', maxWidth: 60, lineHeight: 1.2 }}>{s}</p>
            </div>
            {i < steps.length - 1 && <div className={`step-line${i < current ? ' done' : ''}`} />}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

// ─── Shared field wrapper ──────────────────────────────────────────────────

function Field({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode
}) {
  return (
    <div className="mb-3">
      <label className="form-label">
        {label}{required && <span className="text-danger ms-1">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-danger mt-1 mb-0">{error}</p>}
    </div>
  )
}

// ─── File upload ────────────────────────────────────────────────────────────

function FileUpload({ label, accept = 'image/*', value, onChange }: {
  label: string; accept?: string; value?: string; onChange: (val: string, name: string) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const isImage = accept.includes('image')

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setName(file.name)
    const reader = new FileReader()
    reader.onload = ev => onChange(ev.target?.result as string, file.name)
    reader.readAsDataURL(file)
  }

  return (
    <div>
      <button type="button" onClick={() => ref.current?.click()}
        className="w-100 d-flex flex-column align-items-center gap-2 py-3 px-3 rounded-xl text-xs"
        style={{
          border: `2px dashed ${value ? 'rgba(34,197,94,0.5)' : 'var(--eg-600)'}`,
          background: value ? 'var(--eg-brand-dim)' : 'var(--eg-700)',
          color: value ? '#4ade80' : '#6b7280',
        }}>
        {value && isImage
          ? <img src={value} alt="preview" className="rounded-3 object-fit-cover" style={{ width: 64, height: 64 }} />
          : <Upload size={22} />}
        <span>{name || label}</span>
        {value && !isImage && <FileText size={18} />}
      </button>
      <input ref={ref} type="file" accept={accept} className="d-none" onChange={handleChange} />
    </div>
  )
}

// ─── OTP Modal ─────────────────────────────────────────────────────────────

function OTPModal({ phone, onVerified, onClose }: {
  phone: string; onVerified: () => void; onClose: () => void
}) {
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const r0 = useRef<HTMLInputElement>(null)
  const r1 = useRef<HTMLInputElement>(null)
  const r2 = useRef<HTMLInputElement>(null)
  const r3 = useRef<HTMLInputElement>(null)
  const r4 = useRef<HTMLInputElement>(null)
  const r5 = useRef<HTMLInputElement>(null)
  const refs = [r0, r1, r2, r3, r4, r5]

  async function sendOTP() {
    setSending(true); setError('')
    try {
      const res = await api.post('/auth/otp/send', { phone })
      setSent(true)
      if (res.data?.devCode) {
        const c = String(res.data.devCode).split('')
        setDigits(c)
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        || 'Failed to send OTP. Check your number and try again.'
      setError(msg)
    } finally { setSending(false) }
  }

  async function verify() {
    setError('')
    try {
      await api.post('/auth/otp/verify', { phone, code: digits.join('') })
      onVerified()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        || 'Incorrect code. Please try again.'
      setError(msg)
    }
  }

  function handleDigit(i: number, val: string) {
    if (!/^\d?$/.test(val)) return
    const next = [...digits]; next[i] = val; setDigits(next)
    if (val && i < 5) refs[i + 1].current?.focus()
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs[i - 1].current?.focus()
  }

  return (
    <div className="position-fixed top-0 start-0 end-0 bottom-0 d-flex align-items-center justify-content-center p-4"
      style={{ zIndex: 1060, background: 'rgba(0,0,0,0.8)' }}>
      <div className="card w-100 animate-fade-in" style={{ maxWidth: 360 }}>
        <div className="card-body p-4">
          <div className="d-flex align-items-center justify-content-between mb-4">
            <h3 className="fw-bold mb-0">Verify Mobile Number</h3>
            <button onClick={onClose} className="btn btn-secondary p-2"><X size={18} /></button>
          </div>
          <div className="d-flex align-items-center justify-content-center rounded-xl mx-auto mb-3"
            style={{ width: 56, height: 56, background: 'var(--eg-brand-dim)' }}>
            <Phone size={28} className="text-brand" />
          </div>
          <p className="text-center text-muted small mb-4">
            We'll send a 6-digit OTP to <span className="text-white fw-medium">{phone}</span>
          </p>
          {!sent ? (
            <button onClick={sendOTP} disabled={sending} className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2">
              {sending && <Loader size={15} className="animate-spin" />}
              {sending ? 'Sending OTP...' : 'Send OTP'}
            </button>
          ) : (
            <>
              <div className="rounded-xl px-3 py-2 mb-3 text-center text-xs" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' }}>
                {digits.some(Boolean)
                  ? <>Code auto-filled below — tap <strong>Verify</strong></>
                  : <>OTP sent to {phone}</>}
              </div>
              <div className="d-flex gap-2 justify-content-center mb-3">
                {digits.map((d, i) => (
                  <input key={i} ref={refs[i]} maxLength={1} value={d}
                    onChange={e => handleDigit(i, e.target.value)}
                    onKeyDown={e => handleKeyDown(i, e)}
                    className="form-control text-center fw-bold"
                    style={{ width: 44, height: 48, fontSize: '1.2rem' }} />
                ))}
              </div>
              {error && <p className="text-xs text-danger text-center mb-3">{error}</p>}
              <button onClick={verify} disabled={digits.join('').length < 6} className="btn btn-primary w-100 mb-2">Verify</button>
              <button onClick={sendOTP} className="btn btn-secondary w-100 text-xs">Resend OTP</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Rider Registration ────────────────────────────────────────────────────

const RIDER_STEPS = ['Basic Info', 'Safety', 'Verify & Terms']

function RiderRegistration({ onSubmit, loading }: { onSubmit: (data: Record<string, unknown>) => Promise<void>; loading: boolean }) {
  const [step, setStep] = useState(0)
  const [otpOpen, setOtpOpen] = useState(false)
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [form, setForm] = useState({
    fullName: '', phone: '', email: '', password: '', pin: '', usePin: false,
    gender: '', profilePhoto: '',
    emergencyContactName: '', emergencyContactPhone: '',
    homeAddress: '', workAddress: '',
    preferredPayment: 'ecocash' as PaymentPreference,
    termsAccepted: false, termsTimestamp: '',
  })

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  function canProceed() {
    if (step === 0) return !!(form.fullName && form.phone && form.email && form.gender && form.profilePhoto && (form.password || (form.usePin && form.pin?.length === 6)))
    if (step === 1) return !!(form.emergencyContactName && form.emergencyContactPhone && form.homeAddress && form.workAddress)
    if (step === 2) return form.termsAccepted
    return true
  }

  function nextStep() {
    if (step === 0 && !phoneVerified) { setOtpOpen(true); return }
    setStep(s => s + 1)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onSubmit({ ...form, role: 'rider', phoneVerified, termsTimestamp: new Date().toISOString() })
  }

  return (
    <form onSubmit={step === RIDER_STEPS.length - 1 ? handleSubmit : e => { e.preventDefault(); nextStep() }}>
      <StepBar steps={RIDER_STEPS} current={step} />

      {step === 0 && (
        <div className="animate-fade-in">
          <h3 className="fw-bold mb-4">Basic Information</h3>
          <Field label="Full Name" required>
            <div className="input-group">
              <span className="input-group-text"><User size={15} /></span>
              <input className="form-control" placeholder="As on your national ID" value={form.fullName} onChange={e => set('fullName', e.target.value)} required />
            </div>
          </Field>
          <Field label="Mobile Number" required>
            <div className="d-flex gap-2">
              <div className="input-group flex-grow-1">
                <span className="input-group-text"><Phone size={15} /></span>
                <input className="form-control" type="tel" placeholder="+263 7XX XXX XXX" value={form.phone} onChange={e => set('phone', e.target.value)} required />
              </div>
              {phoneVerified
                ? <span className="d-flex align-items-center gap-1 text-xs badge-brand text-nowrap"><Check size={12} /> Verified</span>
                : <button type="button" onClick={() => form.phone && setOtpOpen(true)} className="btn btn-secondary text-xs text-nowrap">Verify OTP</button>
              }
            </div>
          </Field>
          <Field label="Email Address" required>
            <div className="input-group">
              <span className="input-group-text"><Mail size={15} /></span>
              <input className="form-control" type="email" placeholder="Your email address" value={form.email} onChange={e => set('email', e.target.value)} required />
            </div>
          </Field>

          <div className="mb-3">
            <div className="d-flex align-items-center gap-3 mb-2">
              <label className="form-label mb-0">Login method</label>
              <div className="btn-group btn-group-sm">
                {[['Password', false], ['6-digit PIN', true]].map(([label, val]) => (
                  <button key={String(val)} type="button" onClick={() => set('usePin', val)}
                    className={`btn ${form.usePin === val ? 'btn-primary' : 'btn-secondary'}`}>
                    {label as string}
                  </button>
                ))}
              </div>
            </div>
            {!form.usePin
              ? <div className="input-group">
                  <span className="input-group-text"><Lock size={15} /></span>
                  <input type={showPass ? 'text' : 'password'} className="form-control" placeholder="Minimum 8 characters" value={form.password} onChange={e => set('password', e.target.value)} />
                  <button type="button" className="input-group-text" onClick={() => setShowPass(s => !s)}>
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              : <input type="tel" inputMode="numeric" maxLength={6} className="form-control text-center fw-bold"
                  placeholder="● ● ● ● ● ●" value={form.pin} onChange={e => set('pin', e.target.value.replace(/\D/g, ''))}
                  style={{ letterSpacing: '0.5em', fontSize: '1.2rem' }} />
            }
          </div>

          <div className="row g-3">
            <div className="col-6">
              <Field label="Gender" required>
                <select className="form-select" value={form.gender} onChange={e => set('gender', e.target.value)} required>
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </Field>
            </div>
            <div className="col-6">
              <Field label="Profile Photo" required>
                <FileUpload label="Upload photo" value={form.profilePhoto} onChange={v => set('profilePhoto', v)} />
              </Field>
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="animate-fade-in">
          <h3 className="fw-bold mb-4">Safety & Preferences</h3>
          <div className="rounded-xl px-3 py-2 mb-3 d-flex gap-2 text-xs" style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', color: '#fbbf24' }}>
            <AlertTriangle size={15} className="flex-shrink-0 mt-0" />
            <p className="mb-0">Your emergency contact will be notified if you trigger the in-app SOS button during a ride.</p>
          </div>
          <div className="row g-3">
            <div className="col-6">
              <Field label="Emergency Contact Name" required>
                <input className="form-control" placeholder="Full name" value={form.emergencyContactName} onChange={e => set('emergencyContactName', e.target.value)} required />
              </Field>
            </div>
            <div className="col-6">
              <Field label="Emergency Contact Phone" required>
                <div className="input-group">
                  <span className="input-group-text"><Phone size={15} /></span>
                  <input className="form-control" type="tel" placeholder="+263..." value={form.emergencyContactPhone} onChange={e => set('emergencyContactPhone', e.target.value)} required />
                </div>
              </Field>
            </div>
          </div>
          <Field label="Home Address" required>
            <div className="input-group">
              <span className="input-group-text"><MapPin size={15} /></span>
              <input className="form-control" placeholder="Your home address" value={form.homeAddress} onChange={e => set('homeAddress', e.target.value)} required />
            </div>
          </Field>
          <Field label="Work Address" required>
            <div className="input-group">
              <span className="input-group-text"><MapPin size={15} /></span>
              <input className="form-control" placeholder="Your work address" value={form.workAddress} onChange={e => set('workAddress', e.target.value)} required />
            </div>
          </Field>
          <div className="mb-3">
            <label className="form-label">Preferred Payment Method</label>
            <div className="row g-2">
              {[{ id: 'ecocash', label: 'EcoCash', icon: '📱' }, { id: 'cash_usd', label: 'Cash (USD)', icon: '💵' }, { id: 'cash_zig', label: 'Cash (ZiG)', icon: '💴' }].map(p => (
                <div key={p.id} className="col-4">
                  <button type="button" onClick={() => set('preferredPayment', p.id)}
                    className={`btn w-100 d-flex flex-column align-items-center gap-1 py-3 ${form.preferredPayment === p.id ? 'btn-primary' : 'btn-secondary'}`}>
                    <span style={{ fontSize: '1.4rem' }}>{p.icon}</span>
                    <span className="text-xs">{p.label}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="animate-fade-in">
          <h3 className="fw-bold mb-4">Review & Confirm</h3>
          <div className="card mb-3 p-3">
            {[
              ['Name', form.fullName], ['Phone', form.phone], ['Email', form.email || 'Not provided'],
              ['Gender', form.gender || 'Not specified'], ['Emergency Contact', form.emergencyContactName],
              ['Preferred Payment', form.preferredPayment],
            ].map(([k, v]) => (
              <div key={k} className="d-flex justify-content-between py-2 border-bottom small" style={{ borderColor: 'var(--eg-700)' }}>
                <span className="text-muted">{k}</span>
                <span className="fw-medium">{v}</span>
              </div>
            ))}
          </div>
          {!phoneVerified && (
            <div className="rounded-xl px-3 py-2 mb-3 d-flex gap-2 text-xs" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
              <AlertTriangle size={15} className="flex-shrink-0" />
              <span>Phone not verified. <button type="button" onClick={() => setOtpOpen(true)} className="text-danger border-0 bg-transparent p-0 text-decoration-underline">Verify now</button></span>
            </div>
          )}
          <div className="d-flex align-items-start gap-2 mb-4" style={{ cursor: 'pointer' }} onClick={() => set('termsAccepted', !form.termsAccepted)}>
            <input type="checkbox" className="form-check-input flex-shrink-0 mt-1" checked={form.termsAccepted} onChange={() => {}} />
            <span className="text-muted small">
              I accept the <span className="text-brand">Terms of Service</span> and <span className="text-brand">Privacy Policy</span>. I understand my data will be processed to provide ride-hailing services.
            </span>
          </div>
          <button type="submit" disabled={!form.termsAccepted || !phoneVerified || loading}
            className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2">
            {loading && <Loader size={15} className="animate-spin" />}
            Create Rider Account
          </button>
        </div>
      )}

      {step < RIDER_STEPS.length - 1 && (
        <div className="d-flex gap-3 mt-4">
          {step > 0 && <button type="button" onClick={() => setStep(s => s - 1)} className="btn btn-secondary flex-grow-1 d-flex align-items-center justify-content-center gap-2"><ArrowLeft size={15} /> Back</button>}
          <button type="submit" disabled={!canProceed()} className="btn btn-primary flex-grow-1 d-flex align-items-center justify-content-center gap-2">
            Next <ArrowRight size={15} />
          </button>
        </div>
      )}
      {otpOpen && <OTPModal phone={form.phone} onVerified={() => { setPhoneVerified(true); setOtpOpen(false); if (step === 0) setStep(1) }} onClose={() => setOtpOpen(false)} />}
    </form>
  )
}

// ─── Driver Registration ───────────────────────────────────────────────────

const DRIVER_STEPS = ['Personal', 'Credentials', 'Vehicle', 'Photos', 'Agreements']

function DriverRegistration({ onSubmit, loading }: { onSubmit: (data: Record<string, unknown>) => Promise<void>; loading: boolean }) {
  const [step, setStep] = useState(0)
  const [otpOpen, setOtpOpen] = useState(false)
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [form, setForm] = useState({
    fullName: '', nationalIdNumber: '', nationalIdPhoto: '', dateOfBirth: '',
    phone: '', email: '', residentialAddress: '', proofOfResidence: '',
    selfiePhoto: '', nextOfKinName: '', nextOfKinPhone: '', password: '',
    licenceNumber: '', licenceClass: 'Class 4' as LicenceClass,
    licenceIssueDate: '', licenceExpiry: '', licencePhoto: '',
    defensiveDrivingCert: '', defensiveDrivingExpiry: '',
    policeClearance: '', policeClearanceDate: '',
    medicalCert: '', medicalCertExpiry: '',
    vehicleReg: '', vehicleMake: '', vehicleModel: '', vehicleYear: '',
    vehicleColour: '', seatingCapacity: '4', vehicleCategory: 'Economy' as VehicleCategory,
    regBookPhoto: '', zinaraExpiry: '', zinaraPhoto: '',
    insuranceType: 'third_party' as 'third_party' | 'comprehensive',
    insurer: '', insuranceExpiry: '', insurancePhoto: '',
    cofExpiry: '', cofPhoto: '', operatorPermit: '',
    photoFront: '', photoBack: '', photoLeft: '', photoRight: '', photoInterior: '',
    codeOfConduct: false, backgroundCheckConsent: false,
    commissionAcknowledgement: false, termsAccepted: false,
  })

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const stepValid = [
    () => !!(form.fullName && form.nationalIdNumber && form.nationalIdPhoto && form.dateOfBirth && form.phone && form.email && form.password && form.residentialAddress && form.proofOfResidence && form.selfiePhoto && form.nextOfKinName && form.nextOfKinPhone),
    () => !!(form.licenceNumber && form.licenceClass && form.licenceIssueDate && form.licenceExpiry && form.licencePhoto && form.defensiveDrivingCert && form.defensiveDrivingExpiry && form.policeClearance && form.policeClearanceDate && form.medicalCert && form.medicalCertExpiry),
    () => !!(form.vehicleReg && form.vehicleMake && form.vehicleModel && form.vehicleYear && form.vehicleColour && form.regBookPhoto && form.zinaraExpiry && form.zinaraPhoto && form.insurer && form.insuranceExpiry && form.insurancePhoto && form.cofExpiry && form.cofPhoto && form.operatorPermit),
    () => !!(form.photoFront && form.photoBack && form.photoLeft && form.photoRight && form.photoInterior),
    () => form.codeOfConduct && form.backgroundCheckConsent && form.commissionAcknowledgement && form.termsAccepted,
  ]

  async function next(e: React.FormEvent) {
    e.preventDefault()
    if (step === 0 && !phoneVerified) { setOtpOpen(true); return }
    if (step < DRIVER_STEPS.length - 1) setStep(s => s + 1)
    else await handleSubmit()
  }

  async function handleSubmit() {
    await onSubmit({ ...form, role: 'driver', phoneVerified, verificationStatus: 'pending', submittedAt: new Date().toISOString() })
  }

  return (
    <form onSubmit={next}>
      <StepBar steps={DRIVER_STEPS} current={step} />

      {step === 0 && (
        <div className="animate-fade-in">
          <h3 className="fw-bold mb-1">Personal Details</h3>
          <p className="text-muted text-xs mb-4">All details must match your national identity document.</p>
          <Field label="Full Name (as on National ID)" required>
            <div className="input-group">
              <span className="input-group-text"><User size={15} /></span>
              <input className="form-control" placeholder="Full legal name" value={form.fullName} onChange={e => set('fullName', e.target.value)} required />
            </div>
          </Field>
          <div className="row g-3">
            <div className="col-6">
              <Field label="National ID Number" required>
                <input className="form-control" placeholder="e.g. 63-123456A78" value={form.nationalIdNumber} onChange={e => set('nationalIdNumber', e.target.value)} required />
              </Field>
            </div>
            <div className="col-6">
              <Field label="Date of Birth" required>
                <input type="date" className="form-control" value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} required max={new Date(Date.now() - 23 * 365.25 * 24 * 3600 * 1000).toISOString().split('T')[0]} />
              </Field>
            </div>
          </div>
          <Field label="National ID Photo" required>
            <FileUpload label="Photo of both sides of your ID" value={form.nationalIdPhoto} onChange={v => set('nationalIdPhoto', v)} />
          </Field>
          <div className="row g-3">
            <div className="col-6">
              <Field label="Mobile Number (OTP)" required>
                <div className="input-group mb-1">
                  <span className="input-group-text"><Phone size={15} /></span>
                  <input className="form-control" type="tel" placeholder="+263 7XX XXX XXX" value={form.phone} onChange={e => set('phone', e.target.value)} required />
                </div>
                {phoneVerified
                  ? <p className="text-xs text-brand d-flex align-items-center gap-1 mb-0"><Check size={12} /> Verified</p>
                  : <button type="button" onClick={() => form.phone && setOtpOpen(true)} className="text-xs text-brand border-0 bg-transparent p-0 text-decoration-underline">Send OTP to verify</button>
                }
              </Field>
            </div>
            <div className="col-6">
              <Field label="Email Address" required>
                <div className="input-group">
                  <span className="input-group-text"><Mail size={15} /></span>
                  <input className="form-control" type="email" placeholder="Your email address" value={form.email} onChange={e => set('email', e.target.value)} required />
                </div>
              </Field>
            </div>
          </div>
          <Field label="Create Password" required>
            <div className="input-group">
              <span className="input-group-text"><Lock size={15} /></span>
              <input type="password" className="form-control" placeholder="Minimum 8 characters" value={form.password} onChange={e => set('password', e.target.value)} required />
            </div>
          </Field>
          <Field label="Residential Address" required>
            <div className="input-group">
              <span className="input-group-text"><MapPin size={15} /></span>
              <input className="form-control" placeholder="Full residential address" value={form.residentialAddress} onChange={e => set('residentialAddress', e.target.value)} required />
            </div>
          </Field>
          <Field label="Proof of Residence" required>
            <FileUpload label="Utility bill / council letter (not older than 3 months)" accept="image/*,.pdf" value={form.proofOfResidence} onChange={v => set('proofOfResidence', v)} />
          </Field>
          <Field label="Clear Selfie (for ID face-match)" required>
            <FileUpload label="Take or upload a clear selfie" value={form.selfiePhoto} onChange={v => set('selfiePhoto', v)} />
          </Field>
          <div className="row g-3">
            <div className="col-6">
              <Field label="Next of Kin Name" required>
                <input className="form-control" placeholder="Full name" value={form.nextOfKinName} onChange={e => set('nextOfKinName', e.target.value)} required />
              </Field>
            </div>
            <div className="col-6">
              <Field label="Next of Kin Phone" required>
                <div className="input-group">
                  <span className="input-group-text"><Phone size={15} /></span>
                  <input className="form-control" type="tel" placeholder="+263..." value={form.nextOfKinPhone} onChange={e => set('nextOfKinPhone', e.target.value)} required />
                </div>
              </Field>
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="animate-fade-in">
          <h3 className="fw-bold mb-1">Driving Credentials</h3>
          <div className="row g-3">
            <div className="col-6"><Field label="Driver's Licence Number" required><input className="form-control" placeholder="Licence number" value={form.licenceNumber} onChange={e => set('licenceNumber', e.target.value)} required /></Field></div>
            <div className="col-6">
              <Field label="Licence Class" required>
                <select className="form-select" value={form.licenceClass} onChange={e => set('licenceClass', e.target.value)} required>
                  <option value="Class 4">Class 4 (Sedans — minimum)</option>
                  <option value="Class 3">Class 3</option>
                  <option value="Class 2">Class 2</option>
                  <option value="Class 5">Class 5</option>
                </select>
              </Field>
            </div>
            <div className="col-6"><Field label="Issue Date" required><input type="date" className="form-control" value={form.licenceIssueDate} onChange={e => set('licenceIssueDate', e.target.value)} required /></Field></div>
            <div className="col-6"><Field label="Expiry Date" required><input type="date" className="form-control" value={form.licenceExpiry} onChange={e => set('licenceExpiry', e.target.value)} required /></Field></div>
          </div>
          <Field label="Licence Photo" required>
            <FileUpload label="Front and back of driver's licence" value={form.licencePhoto} onChange={v => set('licencePhoto', v)} />
          </Field>
          <div className="border-top pt-3 mt-2">
            <p className="text-xs fw-semibold text-muted mb-3 text-uppercase" style={{ letterSpacing: '0.06em' }}>Certificates</p>
            <div className="row g-3">
              <div className="col-6">
                <Field label="Defensive Driving Certificate" required><FileUpload label="Upload certificate" value={form.defensiveDrivingCert} onChange={v => set('defensiveDrivingCert', v)} /></Field>
                <Field label="Expiry Date" required><input type="date" className="form-control" value={form.defensiveDrivingExpiry} onChange={e => set('defensiveDrivingExpiry', e.target.value)} required /></Field>
              </div>
              <div className="col-6">
                <Field label="Police Clearance Certificate" required><FileUpload label="Within last 6 months" value={form.policeClearance} onChange={v => set('policeClearance', v)} /></Field>
                <Field label="Issue Date" required><input type="date" className="form-control" value={form.policeClearanceDate} onChange={e => set('policeClearanceDate', e.target.value)} required /></Field>
              </div>
            </div>
          </div>
          <div className="row g-3 mt-1">
            <div className="col-6">
              <Field label="Medical Certificate of Fitness" required><FileUpload label="Upload medical cert" value={form.medicalCert} onChange={v => set('medicalCert', v)} /></Field>
              <Field label="Expiry Date" required><input type="date" className="form-control" value={form.medicalCertExpiry} onChange={e => set('medicalCertExpiry', e.target.value)} required /></Field>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="animate-fade-in">
          <h3 className="fw-bold mb-1">Vehicle Details</h3>
          <div className="row g-3">
            <div className="col-6"><Field label="Registration / Number Plate" required><input className="form-control" placeholder="e.g. ABC 1234" value={form.vehicleReg} onChange={e => set('vehicleReg', e.target.value.toUpperCase())} required /></Field></div>
            <div className="col-6">
              <Field label="Vehicle Category" required>
                <select className="form-select" value={form.vehicleCategory} onChange={e => set('vehicleCategory', e.target.value)} required>
                  {(['Economy', 'Comfort', 'SUV', 'Tow Truck'] as VehicleCategory[]).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>
            <div className="col-6"><Field label="Make" required><input className="form-control" placeholder="e.g. Toyota" value={form.vehicleMake} onChange={e => set('vehicleMake', e.target.value)} required /></Field></div>
            <div className="col-6"><Field label="Model" required><input className="form-control" placeholder="e.g. Corolla" value={form.vehicleModel} onChange={e => set('vehicleModel', e.target.value)} required /></Field></div>
            <div className="col-6"><Field label="Year" required><input type="number" className="form-control" placeholder="e.g. 2019" min="2005" max="2026" value={form.vehicleYear} onChange={e => set('vehicleYear', e.target.value)} required /></Field></div>
            <div className="col-6"><Field label="Colour" required><input className="form-control" placeholder="e.g. White" value={form.vehicleColour} onChange={e => set('vehicleColour', e.target.value)} required /></Field></div>
            <div className="col-6">
              <Field label="Seating Capacity" required>
                <select className="form-select" value={form.seatingCapacity} onChange={e => set('seatingCapacity', e.target.value)} required>
                  {['4', '5', '6', '7', '8', '10', '12', '14'].map(n => <option key={n} value={n}>{n} seats</option>)}
                </select>
              </Field>
            </div>
          </div>
          <Field label="Vehicle Registration Book" required>
            <FileUpload label="Copy of registration book" accept="image/*,.pdf" value={form.regBookPhoto} onChange={v => set('regBookPhoto', v)} />
          </Field>
          <div className="row g-3">
            <div className="col-6">
              <Field label="ZINARA Licence Disc" required><FileUpload label="Photo of licence disc" value={form.zinaraPhoto} onChange={v => set('zinaraPhoto', v)} /></Field>
              <Field label="ZINARA Expiry" required><input type="date" className="form-control" value={form.zinaraExpiry} onChange={e => set('zinaraExpiry', e.target.value)} required /></Field>
            </div>
            <div className="col-6">
              <Field label="Certificate of Fitness (VID)" required><FileUpload label="VID CoF certificate" value={form.cofPhoto} onChange={v => set('cofPhoto', v)} /></Field>
              <Field label="CoF Expiry" required><input type="date" className="form-control" value={form.cofExpiry} onChange={e => set('cofExpiry', e.target.value)} required /></Field>
            </div>
          </div>
          <div className="border-top pt-3 mt-2">
            <p className="text-xs fw-semibold text-muted mb-3 text-uppercase" style={{ letterSpacing: '0.06em' }}>Insurance</p>
            <div className="row g-3">
              <div className="col-6">
                <Field label="Insurance Type" required>
                  <select className="form-select" value={form.insuranceType} onChange={e => set('insuranceType', e.target.value)} required>
                    <option value="third_party">Third Party</option>
                    <option value="comprehensive">Comprehensive</option>
                  </select>
                </Field>
              </div>
              <div className="col-6"><Field label="Insurance Company" required><input className="form-control" placeholder="e.g. FBC Insurance" value={form.insurer} onChange={e => set('insurer', e.target.value)} required /></Field></div>
              <div className="col-6"><Field label="Insurance Expiry" required><input type="date" className="form-control" value={form.insuranceExpiry} onChange={e => set('insuranceExpiry', e.target.value)} required /></Field></div>
              <div className="col-6"><Field label="Insurance Certificate" required><FileUpload label="Upload certificate" value={form.insurancePhoto} onChange={v => set('insurancePhoto', v)} /></Field></div>
            </div>
          </div>
          <Field label="Operator / Passenger-Carrying Permit" required>
            <FileUpload label="Upload permit" accept="image/*,.pdf" value={form.operatorPermit} onChange={v => set('operatorPermit', v)} />
          </Field>
        </div>
      )}

      {step === 3 && (
        <div className="animate-fade-in">
          <h3 className="fw-bold mb-1">Vehicle Photos</h3>
          <p className="text-muted text-xs mb-4">All 5 views are required. Ensure the number plate is visible in at least one photo.</p>
          <div className="row g-3">
            {[{ key: 'photoFront', label: 'Front View' }, { key: 'photoBack', label: 'Rear View' }, { key: 'photoLeft', label: 'Left Side' }, { key: 'photoRight', label: 'Right Side' }].map(({ key, label }) => (
              <div key={key} className="col-6">
                <Field label={label} required>
                  <FileUpload label={`Upload ${label.toLowerCase()}`} value={(form as Record<string, unknown>)[key] as string} onChange={v => set(key, v)} />
                </Field>
              </div>
            ))}
          </div>
          <Field label="Interior View" required>
            <FileUpload label="Upload interior photo" value={form.photoInterior} onChange={v => set('photoInterior', v)} />
          </Field>
          <div className="rounded-xl p-3 text-xs text-muted bg-700">
            <p className="fw-semibold mb-1" style={{ color: '#d1d5db' }}>Photo guidelines:</p>
            <p className="mb-1">• Ensure the number plate is clearly visible in at least one photo</p>
            <p className="mb-1">• Photos must be taken in good lighting</p>
            <p className="mb-0">• Interior must show clean, undamaged upholstery</p>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="animate-fade-in">
          <h3 className="fw-bold mb-4">Agreements & Consent</h3>
          {[
            { key: 'codeOfConduct', title: 'Driver Code of Conduct', desc: 'I have read and agree to abide by the EasyRide Driver Code of Conduct, which includes safety standards, professional behaviour, and vehicle maintenance requirements.' },
            { key: 'backgroundCheckConsent', title: 'Background Check Consent', desc: 'I consent to EasyRide performing background checks including verification of my national ID, police clearance, and driving history with relevant authorities.' },
            { key: 'commissionAcknowledgement', title: 'Commission & Fee Structure', desc: 'I understand and acknowledge the EasyRide commission structure. EasyRide retains a platform fee of 15% on all completed rides, with the remainder paid to the driver.' },
            { key: 'termsAccepted', title: 'Terms of Service & Privacy Policy', desc: 'I accept the EasyRide Terms of Service and Privacy Policy and understand my rights and obligations as a registered driver on the platform.' },
          ].map(({ key, title, desc }) => (
            <div key={key} className="card mb-3 p-3 d-flex flex-row align-items-start gap-3" style={{ cursor: 'pointer' }}
              onClick={() => set(key, !(form as Record<string, unknown>)[key] as boolean)}>
              <input type="checkbox" className="form-check-input flex-shrink-0 mt-1"
                checked={(form as Record<string, unknown>)[key] as boolean} onChange={() => {}} />
              <div>
                <p className="fw-medium small mb-1">{title}</p>
                <p className="text-xs text-muted mb-0 lh-sm">{desc}</p>
              </div>
            </div>
          ))}
          <div className="rounded-xl p-3 mb-4 text-xs" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}>
            <p className="fw-semibold text-brand mb-1">⏳ Verification Timeline</p>
            <p className="text-muted mb-0">After submitting, your application will be reviewed by the EasyRide team within <strong className="text-white">24–48 hours</strong>. You will receive an SMS notification once your account is approved or if additional documents are required.</p>
          </div>
          <button type="submit" disabled={!stepValid[4]() || loading}
            className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2">
            {loading && <Loader size={15} className="animate-spin" />}
            Submit Driver Application
          </button>
        </div>
      )}

      {step < DRIVER_STEPS.length - 1 && (
        <div className="d-flex gap-3 mt-4">
          {step > 0 && <button type="button" onClick={() => setStep(s => s - 1)} className="btn btn-secondary flex-grow-1 d-flex align-items-center justify-content-center gap-2"><ArrowLeft size={15} /> Back</button>}
          <button type="submit" disabled={!stepValid[step]()} className="btn btn-primary flex-grow-1 d-flex align-items-center justify-content-center gap-2">
            Next <ArrowRight size={15} />
          </button>
        </div>
      )}
      {step > 0 && step === DRIVER_STEPS.length - 1 && (
        <button type="button" onClick={() => setStep(s => s - 1)} className="btn btn-secondary w-100 mt-3 d-flex align-items-center justify-content-center gap-2"><ArrowLeft size={15} /> Back</button>
      )}
      {otpOpen && <OTPModal phone={form.phone} onVerified={() => { setPhoneVerified(true); setOtpOpen(false); setStep(1) }} onClose={() => setOtpOpen(false)} />}
    </form>
  )
}

// ─── Corporate Registration ───────────────────────────────────────────────

const CORP_STEPS = ['Company', 'Fleet & Finance', 'Terms']

function CorporateRegistration({ onSubmit, loading }: { onSubmit: (data: Record<string, unknown>) => Promise<void>; loading: boolean }) {
  const [step, setStep] = useState(0)
  const [otpOpen, setOtpOpen] = useState(false)
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [form, setForm] = useState({
    companyName: '', companyRegNumber: '', zimraBpNumber: '', taxClearanceDoc: '',
    contactPerson: '', contactEmail: '', contactPhone: '', password: '',
    numberOfVehicles: '', bankName: '', bankAccountNumber: '', bankBranch: '',
    termsAccepted: false,
  })
  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const stepValid = [
    () => !!(form.companyName && form.companyRegNumber && form.zimraBpNumber && form.taxClearanceDoc && form.contactPerson && form.contactPhone && form.contactEmail && form.password),
    () => !!(form.numberOfVehicles && form.bankName && form.bankAccountNumber && form.bankBranch),
    () => form.termsAccepted && phoneVerified,
  ]

  async function next(e: React.FormEvent) {
    e.preventDefault()
    if (step === 0 && !phoneVerified) { setOtpOpen(true); return }
    if (step < CORP_STEPS.length - 1) setStep(s => s + 1)
    else await handleSubmit()
  }

  async function handleSubmit() {
    await onSubmit({ ...form, role: 'corporate', phoneVerified, verificationStatus: 'pending', submittedAt: new Date().toISOString() })
  }

  return (
    <form onSubmit={next}>
      <StepBar steps={CORP_STEPS} current={step} />

      {step === 0 && (
        <div className="animate-fade-in">
          <h3 className="fw-bold mb-4">Company Information</h3>
          <Field label="Company / Organisation Name" required>
            <div className="input-group">
              <span className="input-group-text"><Building2 size={15} /></span>
              <input className="form-control" placeholder="Registered company name" value={form.companyName} onChange={e => set('companyName', e.target.value)} required />
            </div>
          </Field>
          <div className="row g-3">
            <div className="col-6"><Field label="Company Registration Number" required><input className="form-control" placeholder="e.g. 1234/2020" value={form.companyRegNumber} onChange={e => set('companyRegNumber', e.target.value)} required /></Field></div>
            <div className="col-6"><Field label="ZIMRA BP Number" required><input className="form-control" placeholder="Business Partner number" value={form.zimraBpNumber} onChange={e => set('zimraBpNumber', e.target.value)} required /></Field></div>
          </div>
          <Field label="Tax Clearance Certificate" required>
            <FileUpload label="Upload tax clearance doc" accept="image/*,.pdf" value={form.taxClearanceDoc} onChange={v => set('taxClearanceDoc', v)} />
          </Field>
          <div className="border-top pt-3 mt-2">
            <p className="text-xs fw-semibold text-muted mb-3 text-uppercase" style={{ letterSpacing: '0.06em' }}>Primary Contact Person</p>
            <Field label="Contact Person Full Name" required>
              <div className="input-group">
                <span className="input-group-text"><User size={15} /></span>
                <input className="form-control" placeholder="Name of account administrator" value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} required />
              </div>
            </Field>
            <div className="row g-3">
              <div className="col-6">
                <Field label="Mobile Number" required>
                  <div className="input-group mb-1">
                    <span className="input-group-text"><Phone size={15} /></span>
                    <input className="form-control" type="tel" placeholder="+263 7XX XXX XXX" value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} required />
                  </div>
                  {phoneVerified
                    ? <p className="text-xs text-brand d-flex align-items-center gap-1 mb-0"><Check size={12} /> Verified</p>
                    : <button type="button" onClick={() => form.contactPhone && setOtpOpen(true)} className="text-xs text-brand border-0 bg-transparent p-0 text-decoration-underline">Verify OTP</button>
                  }
                </Field>
              </div>
              <div className="col-6">
                <Field label="Email Address" required>
                  <div className="input-group">
                    <span className="input-group-text"><Mail size={15} /></span>
                    <input className="form-control" type="email" placeholder="Corporate email" value={form.contactEmail} onChange={e => set('contactEmail', e.target.value)} required />
                  </div>
                </Field>
              </div>
            </div>
            <Field label="Create Password" required>
              <div className="input-group">
                <span className="input-group-text"><Lock size={15} /></span>
                <input type="password" className="form-control" placeholder="Minimum 8 characters" value={form.password} onChange={e => set('password', e.target.value)} required />
              </div>
            </Field>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="animate-fade-in">
          <h3 className="fw-bold mb-4">Fleet & Banking Details</h3>
          <Field label="Number of Vehicles in Fleet" required>
            <input type="number" min="1" className="form-control" placeholder="How many vehicles does your company operate?" value={form.numberOfVehicles} onChange={e => set('numberOfVehicles', e.target.value)} required />
          </Field>
          <div className="border-top pt-3 mt-2">
            <p className="text-xs fw-semibold text-muted mb-3 text-uppercase" style={{ letterSpacing: '0.06em' }}>Company Bank Details (for invoicing)</p>
            <div className="row g-3">
              <div className="col-6"><Field label="Bank Name" required><input className="form-control" placeholder="e.g. CBZ Bank" value={form.bankName} onChange={e => set('bankName', e.target.value)} required /></Field></div>
              <div className="col-6"><Field label="Branch" required><input className="form-control" placeholder="e.g. Avondale" value={form.bankBranch} onChange={e => set('bankBranch', e.target.value)} required /></Field></div>
            </div>
            <Field label="Account Number" required>
              <input className="form-control" placeholder="Company bank account number" value={form.bankAccountNumber} onChange={e => set('bankAccountNumber', e.target.value)} required />
            </Field>
          </div>
          <div className="rounded-xl p-3 text-xs mt-3" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: '#93c5fd' }}>
            <p className="fw-semibold mb-2">ℹ️ Corporate Account Benefits</p>
            <ul className="mb-0 ps-3" style={{ color: 'rgba(147,197,253,0.8)' }}>
              <li>Monthly consolidated invoicing</li>
              <li>Pre-authorised digital vouchers for employees</li>
              <li>Department-level spend reporting</li>
              <li>Dedicated account manager</li>
            </ul>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="animate-fade-in">
          <h3 className="fw-bold mb-4">Review & Terms</h3>
          <div className="card mb-3 p-3">
            {[
              ['Company', form.companyName], ['Reg No.', form.companyRegNumber],
              ['Contact', form.contactPerson], ['Phone', form.contactPhone],
              ['Email', form.contactEmail], ['Fleet Size', form.numberOfVehicles || 'Not specified'],
            ].map(([k, v]) => (
              <div key={k} className="d-flex justify-content-between py-2 border-bottom small" style={{ borderColor: 'var(--eg-700)' }}>
                <span className="text-muted">{k}</span><span className="fw-medium">{v}</span>
              </div>
            ))}
          </div>
          {!phoneVerified && (
            <div className="rounded-xl px-3 py-2 mb-3 d-flex gap-2 text-xs" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
              <AlertTriangle size={15} className="flex-shrink-0" />
              <span>Phone not verified. <button type="button" onClick={() => setOtpOpen(true)} className="text-danger border-0 bg-transparent p-0 text-decoration-underline">Verify now</button></span>
            </div>
          )}
          <div className="d-flex align-items-start gap-2 mb-4" style={{ cursor: 'pointer' }} onClick={() => set('termsAccepted', !form.termsAccepted)}>
            <input type="checkbox" className="form-check-input flex-shrink-0 mt-1" checked={form.termsAccepted} onChange={() => {}} />
            <span className="text-muted small">
              I accept the <span className="text-brand">Corporate Terms of Service</span>, acknowledge the invoicing and payment terms, and confirm that the company details provided are accurate and legally registered.
            </span>
          </div>
          <button type="submit" disabled={!stepValid[2]() || loading}
            className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2">
            {loading && <Loader size={15} className="animate-spin" />}
            Submit Corporate Application
          </button>
        </div>
      )}

      {step < CORP_STEPS.length - 1 && (
        <div className="d-flex gap-3 mt-4">
          {step > 0 && <button type="button" onClick={() => setStep(s => s - 1)} className="btn btn-secondary flex-grow-1 d-flex align-items-center justify-content-center gap-2"><ArrowLeft size={15} /> Back</button>}
          <button type="submit" disabled={!stepValid[step]()} className="btn btn-primary flex-grow-1 d-flex align-items-center justify-content-center gap-2">
            Next <ArrowRight size={15} />
          </button>
        </div>
      )}
      {step > 0 && step === CORP_STEPS.length - 1 && (
        <button type="button" onClick={() => setStep(s => s - 1)} className="btn btn-secondary w-100 mt-3 d-flex align-items-center justify-content-center gap-2"><ArrowLeft size={15} /> Back</button>
      )}
      {otpOpen && <OTPModal phone={form.contactPhone} onVerified={() => { setPhoneVerified(true); setOtpOpen(false); setStep(1) }} onClose={() => setOtpOpen(false)} />}
    </form>
  )
}

// ─── Main Register Page ────────────────────────────────────────────────────

type RegRole = 'rider' | 'driver' | 'corporate'

export default function Register() {
  const navigate = useNavigate()
  const { register, isAuthenticated } = useAuth()
  const [role, setRole] = useState<RegRole | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pendingApproval, setPendingApproval] = useState(false)

  React.useEffect(() => { if (isAuthenticated) navigate('/dashboard', { replace: true }) }, [isAuthenticated])

  async function handleSubmit(data: Record<string, unknown>) {
    setLoading(true); setError('')
    try {
      await register(data as Parameters<typeof register>[0])
      if (data.role === 'driver' || data.role === 'corporate') setPendingApproval(true)
      else navigate('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.')
    } finally { setLoading(false) }
  }

  if (pendingApproval) return (
    <div className="min-vh-100 bg-900 d-flex align-items-center justify-content-center p-4">
      <div className="text-center" style={{ maxWidth: 480, width: '100%' }}>
        <div className="d-flex align-items-center justify-content-center rounded-3 mx-auto mb-4"
          style={{ width: 80, height: 80, background: 'rgba(234,179,8,0.2)' }}>
          <Shield size={40} className="text-warning" />
        </div>
        <h2 className="fw-bold mb-3">Application Submitted!</h2>
        <p className="text-muted mb-4">
          Your {role} application is under review. Our team will verify your documents within <strong className="text-white">24–48 hours</strong>. You'll receive an SMS on your registered mobile once approved.
        </p>
        <div className="card mb-4 p-3 text-start">
          <p className="fw-semibold small mb-3">What happens next?</p>
          <div className="d-flex flex-column gap-2 text-muted small">
            {['Our compliance team reviews your submitted documents', 'Face-match check between your selfie and national ID', 'Vehicle inspection booking (for drivers)', 'SMS notification with your account activation status'].map((s, i) => (
              <p key={i} className="d-flex align-items-start gap-2 mb-0">
                <span className="text-brand fw-bold flex-shrink-0">{i + 1}.</span>{s}
              </p>
            ))}
          </div>
        </div>
        <Link to="/login" className="btn btn-primary d-inline-flex align-items-center gap-2">Back to Login</Link>
      </div>
    </div>
  )

  return (
    <div className="min-vh-100 bg-900">
      <div className="sticky-top d-flex align-items-center justify-content-between px-4" style={{ height: 56, background: 'rgba(10,15,30,0.9)', backdropFilter: 'blur(8px)', borderBottom: '1px solid var(--eg-600)', zIndex: 40 }}>
        <Link to="/"><EasyGoLogo height={32} /></Link>
        <Link to="/login" className="text-muted text-xs d-flex align-items-center gap-1">
          <ArrowLeft size={14} /> Sign In
        </Link>
      </div>

      <div className="mx-auto px-3 py-4" style={{ maxWidth: 672 }}>
        {!role ? (
          <div className="animate-fade-in">
            <div className="text-center mb-5">
              <h1 className="fw-bold mb-2">Create your account</h1>
              <p className="text-muted">Choose how you'd like to use EasyRide</p>
            </div>
            {error && (
              <div className="rounded-xl px-3 py-2 mb-4 text-xs" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>{error}</div>
            )}
            <div className="d-flex flex-column gap-3">
              {[
                { id: 'rider' as RegRole, icon: User, title: 'Rider / Passenger', desc: 'Book rides, track your driver, and pay your way.', features: ['Live GPS tracking', 'Chat & call driver', 'EcoCash, USD & ZiG cash', 'Instant account activation'], color: '#4ade80' },
                { id: 'driver' as RegRole, icon: Car, title: 'Driver', desc: 'Earn money driving on the EasyRide platform.', features: ['Flexible hours', 'Weekly payouts', 'In-app navigation', 'Verified & insured'], color: '#fbbf24', note: 'Requires document verification — 24–48hrs review' },
                { id: 'corporate' as RegRole, icon: Building2, title: 'Corporate / Fleet Owner', desc: 'Manage company travel with vouchers and reporting.', features: ['Employee trip management', 'Voucher payments', 'Department reporting', 'Consolidated invoicing'], color: '#60a5fa', note: 'Business registration required' },
              ].map(({ id, icon: Icon, title, desc, features, color, note }) => (
                <button key={id} type="button" onClick={() => setRole(id)}
                  className="card text-start p-4 w-100 border"
                  style={{ borderColor: 'var(--eg-600)', cursor: 'pointer', transition: 'border-color 0.15s' }}
                  onMouseOver={e => (e.currentTarget.style.borderColor = color)}
                  onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--eg-600)')}>
                  <div className="d-flex align-items-start gap-3">
                    <div className="d-flex align-items-center justify-content-center rounded-xl flex-shrink-0"
                      style={{ width: 48, height: 48, background: `${color}22` }}>
                      <Icon size={24} style={{ color }} />
                    </div>
                    <div className="flex-grow-1">
                      <p className="fw-bold mb-1" style={{ fontSize: '1.05rem' }}>{title}</p>
                      <p className="text-muted small mb-3">{desc}</p>
                      <div className="row g-2">
                        {features.map(f => (
                          <div key={f} className="col-6">
                            <p className="text-xs text-muted d-flex align-items-center gap-1 mb-0">
                              <span className="rounded-circle flex-shrink-0" style={{ width: 5, height: 5, background: '#4ade80', display: 'inline-block' }} />{f}
                            </p>
                          </div>
                        ))}
                      </div>
                      {note && <p className="text-xs text-warning d-flex align-items-center gap-1 mb-0 mt-2"><AlertTriangle size={12} />{note}</p>}
                    </div>
                    <ArrowRight size={18} className="text-muted flex-shrink-0 mt-1" />
                  </div>
                </button>
              ))}
            </div>
            <p className="text-center small text-muted mt-4">
              Already registered? <Link to="/login" className="text-brand fw-semibold">Sign in</Link>
            </p>
          </div>
        ) : (
          <div>
            <button type="button" onClick={() => setRole(null)}
              className="btn btn-secondary d-inline-flex align-items-center gap-2 mb-4 text-xs">
              <ArrowLeft size={14} />
              {role === 'rider' ? 'Rider Registration' : role === 'driver' ? 'Driver Registration' : 'Corporate Registration'}
            </button>
            {error && (
              <div className="rounded-xl px-3 py-2 mb-4 text-xs" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>{error}</div>
            )}
            {role === 'rider'     && <RiderRegistration onSubmit={handleSubmit} loading={loading} />}
            {role === 'driver'    && <DriverRegistration onSubmit={handleSubmit} loading={loading} />}
            {role === 'corporate' && <CorporateRegistration onSubmit={handleSubmit} loading={loading} />}
          </div>
        )}
      </div>
    </div>
  )
}
