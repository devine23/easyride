import React, { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Car, User, Building2, Eye, EyeOff, ArrowLeft, Loader } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

interface Props { mode: 'login' | 'register' }

type Role = 'private' | 'corporate' | 'driver'

export default function AuthPage({ mode }: Props) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { login, register, isAuthenticated } = useAuth()
  const [form, setForm] = useState({
    name: '', email: '', password: '', phone: '',
    role: (params.get('role') || 'private') as Role,
    companyName: '', vehicleReg: '', vehicleModel: ''
  })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (isAuthenticated) navigate('/dashboard', { replace: true }) }, [isAuthenticated])

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); setError('') }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      if (mode === 'login') {
        await login(form.email, form.password)
      } else {
        const data: Record<string, unknown> = {
          name: form.name, email: form.email, password: form.password,
          phone: form.phone, role: form.role,
          ...(form.role === 'corporate' && { companyName: form.companyName }),
          ...(form.role === 'driver' && { vehicleReg: form.vehicleReg, vehicleModel: form.vehicleModel }),
        }
        await register(data)
      }
      navigate('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally { setLoading(false) }
  }

  const ROLES: { id: Role; icon: React.ElementType; label: string; desc: string }[] = [
    { id: 'private',   icon: User,      label: 'Private Client',   desc: 'Book rides for personal travel' },
    { id: 'corporate', icon: Building2, label: 'Corporate Client',  desc: 'Manage company transport & vouchers' },
    { id: 'driver',    icon: Car,       label: 'Driver',            desc: 'Earn money driving with EasyRide' },
  ]

  return (
    <div className="min-h-screen bg-dark-900 flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-brand-900/50 to-dark-800 items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-radial from-brand-500/20 via-transparent to-transparent" />
        <div className="relative text-center">
          <div className="w-20 h-20 bg-brand-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-brand-500/40">
            <Car className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-extrabold mb-4">Easy<span className="text-brand-400">Ride</span></h1>
          <p className="text-gray-300 text-lg max-w-sm">Zimbabwe's premier ride-hailing platform — Fast, Safe &amp; Reliable.</p>
          <div className="mt-12 grid grid-cols-2 gap-4 text-left">
            {['Live GPS Tracking', 'In-App Chat & Calls', 'Secure Payments', 'Corporate Vouchers'].map(f => (
              <div key={f} className="flex items-center gap-2 text-sm text-gray-300">
                <span className="w-2 h-2 bg-brand-400 rounded-full" /> {f}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Link to="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" /> Back to home
          </Link>

          <h2 className="text-3xl font-bold mb-2">
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h2>
          <p className="text-gray-400 mb-8">
            {mode === 'login'
              ? 'Sign in to your EasyRide account'
              : 'Join EasyRide and start your journey'}
          </p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl mb-6 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Role selector — only on register */}
            {mode === 'register' && (
              <div>
                <label className="text-sm text-gray-400 mb-2 block">I am a...</label>
                <div className="grid grid-cols-3 gap-3">
                  {ROLES.map(({ id, icon: Icon, label }) => (
                    <button key={id} type="button" onClick={() => set('role', id)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all ${
                        form.role === id
                          ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                          : 'border-dark-600 bg-dark-700 text-gray-400 hover:border-dark-500'
                      }`}>
                      <Icon className="w-5 h-5" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mode === 'register' && (
              <input className="input-field" placeholder="Full name" value={form.name}
                onChange={e => set('name', e.target.value)} required />
            )}

            <input className="input-field" type="email" placeholder="Email address" value={form.email}
              onChange={e => set('email', e.target.value)} required />

            {mode === 'register' && (
              <input className="input-field" type="tel" placeholder="Phone number (+263...)" value={form.phone}
                onChange={e => set('phone', e.target.value)} required />
            )}

            <div className="relative">
              <input className="input-field pr-12" type={showPass ? 'text' : 'password'}
                placeholder="Password" value={form.password} onChange={e => set('password', e.target.value)} required />
              <button type="button" onClick={() => setShowPass(s => !s)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {mode === 'register' && form.role === 'corporate' && (
              <input className="input-field" placeholder="Company name" value={form.companyName}
                onChange={e => set('companyName', e.target.value)} required />
            )}

            {mode === 'register' && form.role === 'driver' && (
              <>
                <input className="input-field" placeholder="Vehicle registration (e.g. ABD 1234)" value={form.vehicleReg}
                  onChange={e => set('vehicleReg', e.target.value)} required />
                <input className="input-field" placeholder="Vehicle model (e.g. Toyota Corolla 2018)" value={form.vehicleModel}
                  onChange={e => set('vehicleModel', e.target.value)} required />
              </>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
              {loading && <Loader className="w-4 h-4 animate-spin" />}
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-400 mt-6">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <Link to={mode === 'login' ? '/register' : '/login'}
              className="text-brand-400 hover:text-brand-300 font-medium">
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </Link>
          </p>

        </div>
      </div>
    </div>
  )
}
