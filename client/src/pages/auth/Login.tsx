import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ArrowLeft, Loader, Phone, Lock, CheckCircle, KeyRound, User } from 'lucide-react'
import EasyGoLogo from '../../components/EasyGoLogo'
import { useAuth } from '../../context/AuthContext'
import api from '../../services/api'

type Screen = 'login' | 'forgot-phone' | 'forgot-otp' | 'forgot-reset' | 'reset-done'

export default function Login() {
  const navigate   = useNavigate()
  const { login, isAuthenticated } = useAuth()
  const [screen, setScreen] = useState<Screen>('login')

  // Login state
  const [phone,    setPhone]    = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  // Forgot password state
  const [fpPhone,    setFpPhone]    = useState('')
  const [fpLoading,  setFpLoading]  = useState(false)
  const [fpError,    setFpError]    = useState('')
  const [fpDigits,   setFpDigits]   = useState(['', '', '', '', '', ''])
  const [newPass,    setNewPass]    = useState('')
  const [newPassConfirm, setNewPassConfirm] = useState('')
  const [showNewPass, setShowNewPass] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  const otpR0 = useRef<HTMLInputElement>(null)
  const otpR1 = useRef<HTMLInputElement>(null)
  const otpR2 = useRef<HTMLInputElement>(null)
  const otpR3 = useRef<HTMLInputElement>(null)
  const otpR4 = useRef<HTMLInputElement>(null)
  const otpR5 = useRef<HTMLInputElement>(null)
  const otpRefs = [otpR0, otpR1, otpR2, otpR3, otpR4, otpR5]

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true })
  }, [isAuthenticated])

  // ── Login ──────────────────────────────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await login(phone, password)
      navigate('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid credentials. Please try again.')
    } finally { setLoading(false) }
  }

  // ── Forgot: send OTP ───────────────────────────────────────────────────────
  async function sendOtp(navigateToOtpScreen: boolean) {
    setFpLoading(true); setFpError('')
    try {
      await api.post('/auth/otp/send', { phone: fpPhone })
      setFpDigits(['', '', '', '', '', ''])
      if (navigateToOtpScreen) setScreen('forgot-otp')
      setTimeout(() => otpRefs[0].current?.focus(), 100)
    } catch (err: unknown) {
      setFpError(err instanceof Error ? err.message : 'Could not send OTP. Check the number and try again.')
    } finally { setFpLoading(false) }
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault()
    await sendOtp(true)
  }

  // ── Forgot: verify OTP ─────────────────────────────────────────────────────
  function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    const code = fpDigits.join('')
    if (code.length < 6) { setFpError('Please enter all 6 digits.'); return }
    setFpError('')
    // OTP is verified server-side at the reset step — advance now, error surfaces there if wrong
    setScreen('forgot-reset')
  }

  // ── Forgot: reset password ─────────────────────────────────────────────────
  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (newPass !== newPassConfirm) { setFpError('Passwords do not match.'); return }
    if (newPass.length < 6) { setFpError('Password must be at least 6 characters.'); return }
    setResetLoading(true); setFpError('')
    try {
      await api.post('/auth/reset-password', { phone: fpPhone, code: fpDigits.join(''), newPassword: newPass })
      setScreen('reset-done')
    } catch (err: unknown) {
      setFpError(err instanceof Error ? err.message : 'Reset failed. Your OTP may have expired — request a new one.')
    } finally { setResetLoading(false) }
  }

  function handleOtpDigit(i: number, val: string) {
    if (!/^\d?$/.test(val)) return
    const next = [...fpDigits]; next[i] = val; setFpDigits(next)
    if (val && i < 5) otpRefs[i + 1].current?.focus()
  }

  function handleOtpKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !fpDigits[i] && i > 0) otpRefs[i - 1].current?.focus()
  }

  function goBack() {
    setFpError('')
    if (screen === 'forgot-phone') setScreen('login')
    else if (screen === 'forgot-otp') setScreen('forgot-phone')
    else if (screen === 'forgot-reset') setScreen('forgot-otp')
    else setScreen('login')
  }

  // ── Shared left panel ──────────────────────────────────────────────────────
  const LeftPanel = () => (
    <div className="d-none d-lg-flex flex-column align-items-center justify-content-center col-lg-6 overflow-hidden position-relative p-5 text-center">
      <div
        className="position-absolute top-0 start-0 w-100 h-100"
        style={{ background: 'radial-gradient(ellipse at center, rgba(34,197,94,0.12) 0%, transparent 70%)', pointerEvents: 'none' }}
      />
      <div className="position-relative" style={{ zIndex: 1 }}>
        <div className="mb-4"><EasyGoLogo height={90} /></div>
        <p className="text-muted mb-5" style={{ fontSize: '1.05rem' }}>
          Zimbabwe's Premier Ride-Hailing Platform
        </p>
        <div className="row g-2 text-start" style={{ maxWidth: 280 }}>
          {['Live GPS Tracking', 'In-App Chat & Calls', 'EcoCash & Cash', 'Corporate Vouchers'].map(f => (
            <div key={f} className="col-6">
              <div className="d-flex align-items-center gap-2 rounded-xl px-3 py-2 text-xs"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#d1d5db' }}>
                <span className="rounded-circle flex-shrink-0"
                  style={{ width: 6, height: 6, background: '#4ade80', display: 'inline-block' }} />
                {f}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs mt-5" style={{ color: '#6b7280' }}>Cnr 3rd Kwame Nkrumah · Harare</p>
      </div>
    </div>
  )

  // ── Error alert ────────────────────────────────────────────────────────────
  const ErrorAlert = ({ msg }: { msg: string }) => msg ? (
    <div className="alert mb-3 py-2 px-3 text-xs rounded-3"
      style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
      {msg}
    </div>
  ) : null

  // ═══════════════════════════════════════════════════════════════════════════
  //  SCREEN: LOGIN
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === 'login') return (
    <div className="min-vh-100 bg-900">
      <div className="container-fluid h-100">
        <div className="row min-vh-100">
          <LeftPanel />

          <div className="col-12 col-lg-6 d-flex align-items-center justify-content-center p-4">
            <div className="w-100" style={{ maxWidth: 400 }}>

              <Link to="/" className="btn btn-secondary d-inline-flex align-items-center gap-2 mb-4 text-xs">
                <ArrowLeft size={15} /> Back to home
              </Link>

              <div className="mb-4">
                <h2 className="fw-bold mb-1" style={{ fontSize: '1.75rem' }}>Welcome back</h2>
                <p className="text-muted small mb-0">Sign in with your email or mobile number</p>
              </div>

              <ErrorAlert msg={error} />

              <form onSubmit={handleLogin} className="d-flex flex-column gap-3" autoComplete="on">

                <div>
                  <label className="form-label">Email or Phone Number</label>
                  <div className="input-group">
                    <span className="input-group-text"><User size={15} /></span>
                    <input
                      className="form-control"
                      type="text"
                      name="username"
                      autoComplete="username"
                      placeholder="Email or +263 7XX XXX XXX"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <div className="d-flex align-items-center justify-content-between mb-1">
                    <label className="form-label mb-0">Password or PIN</label>
                    <button
                      type="button"
                      onClick={() => { setFpPhone(phone); setScreen('forgot-phone') }}
                      className="btn btn-link p-0 text-xs"
                      style={{ color: '#60a5fa', textDecoration: 'none', fontSize: '0.78rem' }}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="input-group">
                    <span className="input-group-text"><Lock size={15} /></span>
                    <input
                      className="form-control"
                      type={showPass ? 'text' : 'password'}
                      name="password"
                      autoComplete="current-password"
                      placeholder="Enter password or 6-digit PIN"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="input-group-text"
                      onClick={() => setShowPass(s => !s)}
                      style={{ cursor: 'pointer' }}
                      aria-label={showPass ? 'Hide password' : 'Show password'}
                    >
                      {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2 mt-1"
                >
                  {loading && <Loader size={15} className="animate-spin" />}
                  Sign In
                </button>
              </form>

              <p className="text-center small text-muted mt-4 mb-0">
                Don't have an account?{' '}
                <Link to="/register" className="fw-semibold text-brand">Register here</Link>
              </p>

            </div>
          </div>
        </div>
      </div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  //  SCREEN: RESET DONE
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === 'reset-done') return (
    <div className="min-vh-100 bg-900 d-flex align-items-center justify-content-center p-4">
      <div className="card p-5 text-center animate-fade-in" style={{ maxWidth: 380, width: '100%', border: '1px solid rgba(34,197,94,0.3)' }}>
        <div className="d-flex align-items-center justify-content-center rounded-circle mx-auto mb-4"
          style={{ width: 72, height: 72, background: 'rgba(34,197,94,0.12)' }}>
          <CheckCircle size={36} className="text-brand" />
        </div>
        <h3 className="fw-bold fs-4 mb-2">Password Updated</h3>
        <p className="text-muted small mb-4">Your password has been reset successfully. Sign in with your new password.</p>
        <button
          onClick={() => { setScreen('login'); setNewPass(''); setNewPassConfirm(''); setFpDigits(['','','','','','']) }}
          className="btn btn-primary w-100"
        >
          Back to Sign In
        </button>
      </div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  //  SCREENS: FORGOT PASSWORD (phone → otp → reset)
  // ═══════════════════════════════════════════════════════════════════════════
  const stepIndex  = screen === 'forgot-phone' ? 0 : screen === 'forgot-otp' ? 1 : 2
  const stepLabels = ['Enter Number', 'Verify OTP', 'New Password']

  return (
    <div className="min-vh-100 bg-900 d-flex align-items-center justify-content-center p-3">
      <div className="w-100" style={{ maxWidth: 420 }}>

        {/* Back button */}
        <button
          onClick={goBack}
          className="btn btn-secondary d-inline-flex align-items-center gap-2 mb-4 text-xs"
        >
          <ArrowLeft size={15} />
          {screen === 'forgot-phone' ? 'Back to Sign In' : 'Back'}
        </button>

        <div className="card p-4 p-sm-5">

          {/* Icon + title */}
          <div className="text-center mb-4">
            <div className="d-flex align-items-center justify-content-center rounded-circle mx-auto mb-3"
              style={{ width: 60, height: 60, background: 'rgba(96,165,250,0.12)' }}>
              <KeyRound size={28} style={{ color: '#60a5fa' }} />
            </div>
            <h3 className="fw-bold fs-5 mb-1">Reset Password</h3>
            <p className="text-muted text-xs mb-0">We'll send a one-time code to your number</p>
          </div>

          {/* Step progress */}
          <div className="d-flex align-items-center gap-0 mb-4">
            {stepLabels.map((label, i) => (
              <React.Fragment key={i}>
                <div className="d-flex flex-column align-items-center flex-shrink-0" style={{ minWidth: 60 }}>
                  <div
                    className="d-flex align-items-center justify-content-center rounded-circle fw-bold"
                    style={{
                      width: 28, height: 28, fontSize: '0.75rem',
                      background: i <= stepIndex ? '#3b82f6' : 'var(--eg-700)',
                      color: i <= stepIndex ? '#fff' : '#6b7280',
                      transition: 'all 0.2s',
                    }}
                  >
                    {i < stepIndex ? '✓' : i + 1}
                  </div>
                  <p className="text-xs mt-1 mb-0" style={{ color: i <= stepIndex ? '#93c5fd' : '#6b7280', whiteSpace: 'nowrap' }}>
                    {label}
                  </p>
                </div>
                {i < 2 && (
                  <div className="flex-grow-1 mx-1 mb-4" style={{ height: 2, background: i < stepIndex ? '#3b82f6' : 'var(--eg-700)', transition: 'background 0.2s' }} />
                )}
              </React.Fragment>
            ))}
          </div>

          <ErrorAlert msg={fpError} />

          {/* ── Step 1: Enter phone ── */}
          {screen === 'forgot-phone' && (
            <form onSubmit={handleSendOtp} className="d-flex flex-column gap-3">
              <div>
                <label className="form-label">Mobile Number</label>
                <div className="input-group">
                  <span className="input-group-text"><Phone size={15} /></span>
                  <input
                    className="form-control"
                    type="tel"
                    autoComplete="tel"
                    placeholder="+263 7XX XXX XXX"
                    value={fpPhone}
                    onChange={e => setFpPhone(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <p className="text-xs text-muted mt-1 mb-0">Enter the number linked to your account</p>
              </div>
              <button
                type="submit"
                disabled={fpLoading || !fpPhone.trim()}
                className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2"
              >
                {fpLoading && <Loader size={15} className="animate-spin" />}
                {fpLoading ? 'Sending…' : 'Send OTP'}
              </button>
            </form>
          )}

          {/* ── Step 2: Enter OTP ── */}
          {screen === 'forgot-otp' && (
            <form onSubmit={handleVerifyOtp} className="d-flex flex-column gap-3">
              <p className="text-sm text-center mb-2">
                Code sent to <span className="fw-semibold text-white">{fpPhone}</span>
              </p>
              <div className="d-flex justify-content-center gap-2">
                {fpDigits.map((d, i) => (
                  <input
                    key={i}
                    ref={otpRefs[i]}
                    maxLength={1}
                    value={d}
                    onChange={e => handleOtpDigit(i, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(i, e)}
                    className="form-control text-center fw-bold"
                    style={{ width: 48, height: 52, fontSize: '1.3rem', padding: '0' }}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                ))}
              </div>
              <button
                type="submit"
                disabled={fpDigits.join('').length < 6}
                className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2"
              >
                  Verify Code
              </button>
              <button
                type="button"
                onClick={() => sendOtp(false)}
                disabled={fpLoading}
                className="btn btn-secondary w-100 text-xs"
              >
                {fpLoading ? 'Resending…' : 'Resend OTP'}
              </button>
            </form>
          )}

          {/* ── Step 3: New password ── */}
          {screen === 'forgot-reset' && (
            <form onSubmit={handleReset} className="d-flex flex-column gap-3" autoComplete="on">
              <div>
                <label className="form-label">New Password</label>
                <div className="input-group">
                  <span className="input-group-text"><Lock size={15} /></span>
                  <input
                    className="form-control"
                    type={showNewPass ? 'text' : 'password'}
                    name="new-password"
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                    value={newPass}
                    onChange={e => setNewPass(e.target.value)}
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    className="input-group-text"
                    onClick={() => setShowNewPass(s => !s)}
                    style={{ cursor: 'pointer' }}
                  >
                    {showNewPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <p className="text-xs text-muted mt-1 mb-0">Use the password suggested by your browser for maximum security</p>
              </div>
              <div>
                <label className="form-label">Confirm New Password</label>
                <div className="input-group">
                  <span className="input-group-text"><Lock size={15} /></span>
                  <input
                    className="form-control"
                    type={showNewPass ? 'text' : 'password'}
                    name="confirm-new-password"
                    autoComplete="new-password"
                    placeholder="Repeat password"
                    value={newPassConfirm}
                    onChange={e => setNewPassConfirm(e.target.value)}
                    required
                  />
                </div>
                {newPassConfirm && newPass !== newPassConfirm && (
                  <p className="text-xs text-danger mt-1 mb-0">Passwords don't match</p>
                )}
              </div>

              {/* Password strength bar */}
              {newPass && (
                <PasswordStrength password={newPass} />
              )}

              <button
                type="submit"
                disabled={resetLoading || !newPass || newPass !== newPassConfirm}
                className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2"
              >
                {resetLoading && <Loader size={15} className="animate-spin" />}
                {resetLoading ? 'Saving…' : 'Set New Password'}
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Password strength indicator ────────────────────────────────────────────
function PasswordStrength({ password }: { password: string }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ]
  const score = checks.filter(Boolean).length
  const levels = [
    { label: 'Weak',   color: '#ef4444' },
    { label: 'Fair',   color: '#f59e0b' },
    { label: 'Good',   color: '#3b82f6' },
    { label: 'Strong', color: '#22c55e' },
  ]
  const level = levels[Math.max(0, score - 1)]

  return (
    <div>
      <div className="d-flex gap-1 mb-1">
        {levels.map((_, i) => (
          <div
            key={i}
            className="flex-grow-1 rounded"
            style={{ height: 4, background: i < score ? level.color : 'var(--eg-700)', transition: 'background 0.2s' }}
          />
        ))}
      </div>
      <p className="text-xs mb-0" style={{ color: level.color }}>{level.label}</p>
    </div>
  )
}
