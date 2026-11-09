import React, { useState, useEffect } from 'react'
import {
  Home, FileText, Users, BarChart2, CreditCard, Navigation, Plus, Eye,
  Download, MapPin, Phone, MessageSquare, X, Building2, Loader, CheckCircle, ArrowLeft,
  User, LogOut, Bell, BellOff, ChevronRight,
} from 'lucide-react'
import Navbar from '../../components/Navbar'
import BottomNav from '../../components/BottomNav'
import PageHeader, { useSwipeBack } from '../../components/PageHeader'
import MapView from '../../components/MapView'
import ChatPanel from '../../components/ChatPanel'
import CallModal from '../../components/CallModal'
import PaymentModal from '../../components/PaymentModal'
import VoucherForm from './VoucherForm'
import { useAuth } from '../../context/AuthContext'
import { useSocket } from '../../context/SocketContext'
import { useGeolocation } from '../../hooks/useGeolocation'
import { Voucher, Ride, Employee } from '../../types'
import api from '../../services/api'
import { exportCorporateRides } from '../../utils/exportExcel'
import { useBackButton } from '../../hooks/useBackButton'

const NAV = [
  { id: 'home',      label: 'Dashboard',  icon: Home },
  { id: 'book',      label: 'Book Ride',  icon: Navigation },
  { id: 'vouchers',  label: 'Vouchers',   icon: FileText },
  { id: 'employees', label: 'Employees',  icon: Users },
  { id: 'reports',   label: 'Reports',    icon: BarChart2 },
  { id: 'payments',  label: 'Payments',   icon: CreditCard },
]

const BOTTOM_TABS = [
  { id: 'home',     label: 'Home',     icon: Home },
  { id: 'book',     label: 'Book',     icon: Navigation },
  { id: 'vouchers', label: 'Vouchers', icon: FileText },
  { id: 'reports',  label: 'Reports',  icon: BarChart2 },
  { id: 'account',  label: 'Account',  icon: User },
]

export default function CorporateDashboard() {
  const { user, logout } = useAuth()
  const { activeRide, setActiveRide, requestRide, driverLocation, messages } = useSocket()
  const { coords } = useGeolocation()
  const [tab, setTab] = useState('home')
  const [tabStack, setTabStack] = useState<string[]>([])
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [rides, setRides] = useState<Ride[]>([])
  const [showVoucherForm, setShowVoucherForm] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [callState, setCallState] = useState<{ open: boolean; type: 'audio' | 'video' }>({ open: false, type: 'audio' })
  const [showPayment, setShowPayment] = useState(false)
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null)
  const [booking, setBooking] = useState({ pickup: '', dropoff: '', employee: '', department: '', payMethod: 'voucher' as 'cash' | 'ecocash' | 'voucher' })
  const [bookLoading, setBookLoading] = useState(false)
  const [bookError, setBookError] = useState('')

  const [notificationsOn, setNotificationsOn] = useState(() => localStorage.getItem('easyride_notifs') !== 'off')
  function toggleNotifications() {
    const next = !notificationsOn
    setNotificationsOn(next)
    localStorage.setItem('easyride_notifs', next ? 'on' : 'off')
  }

  useEffect(() => {
    api.get('/rides/history').then(r => setRides(r.data)).catch(() => {})
    api.get('/vouchers').then(r => setVouchers(r.data)).catch(() => {})
  }, [])

  function navigateTo(id: string) {
    if (id === tab) return
    setTabStack(prev => [...prev, tab])
    setTab(id)
  }

  function goBack() {
    setTabStack(prev => {
      if (prev.length === 0) return prev
      const next = [...prev]
      const previous = next.pop()!
      setTab(previous)
      return next
    })
  }

  useBackButton(() => {
    if (tabStack.length > 0) { goBack(); return true }
    return false
  })

  // Swipe right from the left edge → go back (iOS-style gesture)
  useSwipeBack(tabStack.length > 0, goBack)

  // Reset scroll on tab change so new section isn't buried behind the fixed topbar
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }) }, [tab])

  async function geocodeAddress(address: string) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=zw&limit=1`
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } })
      const data = await res.json()
      if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    } catch {}
    return null
  }

  async function handleBook(e: React.FormEvent) {
    e.preventDefault(); setBookLoading(true); setBookError('')
    try {
      if (!coords) throw new Error('Your location is unavailable. Please enable location access and try again.')
      const [pCoords, dCoords] = await Promise.all([
        geocodeAddress(booking.pickup),
        geocodeAddress(booking.dropoff),
      ])
      const pFinal = pCoords || coords
      if (!dCoords) throw new Error('Could not find drop-off location. Please check the address and try again.')
      const ride: Ride = {
        id: crypto.randomUUID(), clientId: user!.id, status: 'searching',
        pickupAddress: booking.pickup, dropoffAddress: booking.dropoff,
        paymentMethod: booking.payMethod, createdAt: new Date().toISOString(),
        employeeName: booking.employee, departmentCode: booking.department,
        pickupCoords: pFinal,
        dropoffCoords: dCoords,
      }
      setActiveRide(ride); requestRide(ride)
      setTab('home')
    } catch (err: unknown) {
      setBookError(err instanceof Error ? err.message : 'Failed to book ride. Please try again.')
    } finally { setBookLoading(false) }
  }

  function handleVoucherSaved(v: Voucher) {
    setVouchers(prev => [v, ...prev])
    setShowVoucherForm(false)
  }

  const totalSpend = rides.filter(r => r.status === 'completed').reduce((s, r) => s + (r.fare || 0), 0)
  const deptBreakdown = rides.reduce((acc, r) => {
    const dept = r.departmentCode || 'General'; acc[dept] = (acc[dept] || 0) + (r.fare || 0); return acc
  }, {} as Record<string, number>)

  return (
    <div className="min-vh-100 bg-900 d-flex">
      <Navbar items={NAV} active={tab} onNav={navigateTo} onBack={goBack} canGoBack={tabStack.length > 0} />

      <main className="eg-main flex-grow-1 px-3 px-lg-4 overflow-x-hidden">

        {/* HOME */}
        {tab === 'home' && (
          <div className="animate-fade-in" style={{ maxWidth: 900 }}>
            <PageHeader
              title="Corporate Dashboard"
              subtitle={user?.companyName || 'Your Company'}
              icon={Building2}
              iconColor="#60a5fa"
              canGoBack={tabStack.length > 0}
              onBack={goBack}
              action={<span className="badge-info-soft d-flex align-items-center gap-1 px-3 py-2"><Building2 size={14} /> Corporate</span>}
            />
            <div className="row g-3 mb-4">
              {[
                { label: 'Total Rides', value: rides.length, sub: 'This month', color: '#4ade80' },
                { label: 'Total Spend', value: `$${totalSpend.toFixed(2)}`, sub: 'All time', color: '#60a5fa' },
                { label: 'Vouchers', value: vouchers.filter(v => v.status === 'pending').length, sub: 'Pending', color: '#fbbf24' },
                { label: 'Employees', value: employees.length, sub: 'Active', color: '#c084fc' },
              ].map(k => (
                <div key={k.label} className="col-6 col-lg-3">
                  <div className="card h-100 p-3">
                    <p className="fw-bold mb-1" style={{ fontSize: '1.5rem', color: k.color }}>{k.value}</p>
                    <p className="fw-semibold small mb-0">{k.label}</p>
                    <p className="text-xs text-muted mb-0">{k.sub}</p>
                  </div>
                </div>
              ))}
            </div>

            {activeRide && activeRide.status !== 'completed' && (
              <div className="card mb-4 p-3" style={{ border: '1px solid rgba(34,197,94,0.4)', background: 'rgba(34,197,94,0.05)' }}>
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <p className="fw-semibold text-brand mb-0">Active Corporate Ride</p>
                  <div className="d-flex gap-2">
                    <button onClick={() => setCallState({ open: true, type: 'audio' })} className="btn btn-secondary btn-sm d-flex align-items-center gap-1">
                      <Phone size={12} /> Call
                    </button>
                    <button onClick={() => setShowChat(true)} className="btn btn-outline-primary btn-sm d-flex align-items-center gap-1">
                      <MessageSquare size={12} /> Chat
                    </button>
                  </div>
                </div>
                <MapView driverLocation={driverLocation || undefined} clientLocation={coords || undefined} className="h-48" />
                <div className="small mt-3">
                  <p className="mb-1"><span className="text-muted">Employee:</span> {activeRide.employeeName}</p>
                  <p className="mb-0"><span className="text-muted">Route:</span> {activeRide.pickupAddress} → {activeRide.dropoffAddress}</p>
                </div>
                {activeRide.status === 'inprogress' && (
                  <button onClick={() => setShowPayment(true)} className="btn btn-primary w-100 mt-3 small">Complete & Pay</button>
                )}
              </div>
            )}

            <div className="card p-3">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h2 className="fw-semibold small mb-0">Recent Rides</h2>
                <button onClick={() => navigateTo('reports')} className="text-xs text-brand" style={{ background: 'none', border: 'none' }}>View reports →</button>
              </div>
              {rides.slice(0, 4).map(r => (
                <div key={r.id} className="d-flex align-items-center gap-3 py-3 border-bottom" style={{ borderColor: 'var(--eg-600)' }}>
                  <div className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0 fw-bold text-brand text-xs"
                    style={{ width: 32, height: 32, background: 'var(--eg-700)' }}>
                    {(r.employeeName || 'U')[0]}
                  </div>
                  <div className="flex-grow-1 overflow-hidden">
                    <p className="small fw-medium text-truncate mb-0">{r.pickupAddress} → {r.dropoffAddress}</p>
                    <p className="text-xs text-muted mb-0">{r.employeeName} · {r.departmentCode}</p>
                  </div>
                  <div className="text-end flex-shrink-0">
                    <p className="small fw-bold text-brand mb-0">{r.fare ? `$${r.fare.toFixed(2)}` : '—'}</p>
                    <span className={`text-xs ${r.status === 'completed' ? 'text-brand' : 'text-warning'}`}>{r.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BOOK */}
        {tab === 'book' && (
          <div className="animate-fade-in" style={{ maxWidth: 640 }}>
            <PageHeader
              title="Book Corporate Ride"
              subtitle="Request a ride on behalf of an employee"
              icon={Navigation}
              iconColor="#4ade80"
              canGoBack={tabStack.length > 0}
              onBack={goBack}
            />
            <div className="card p-4 mb-4">
              <form onSubmit={handleBook} className="d-flex flex-column gap-3">
                <div className="row g-3">
                  <div className="col-6">
                    <label className="form-label">Employee Name</label>
                    <input className="form-control" placeholder="e.g. John Moyo" value={booking.employee} onChange={e => setBooking(b => ({ ...b, employee: e.target.value }))} />
                  </div>
                  <div className="col-6">
                    <label className="form-label">Department</label>
                    <input className="form-control" placeholder="e.g. Finance" value={booking.department} onChange={e => setBooking(b => ({ ...b, department: e.target.value }))} />
                  </div>
                </div>
                <div className="input-group">
                  <span className="input-group-text"><MapPin size={15} className="text-brand" /></span>
                  <input className="form-control" placeholder="Pickup location" value={booking.pickup} onChange={e => setBooking(b => ({ ...b, pickup: e.target.value }))} required />
                </div>
                <div className="input-group">
                  <span className="input-group-text"><MapPin size={15} className="text-danger" /></span>
                  <input className="form-control" placeholder="Drop-off location" value={booking.dropoff} onChange={e => setBooking(b => ({ ...b, dropoff: e.target.value }))} required />
                </div>
                <div>
                  <label className="form-label">Payment Method</label>
                  <div className="row g-2">
                    {(['cash', 'ecocash', 'voucher'] as const).map(m => (
                      <div key={m} className="col-4">
                        <button type="button" onClick={() => setBooking(b => ({ ...b, payMethod: m }))}
                          className={`btn w-100 small fw-semibold ${booking.payMethod === m ? 'btn-primary' : 'btn-secondary'}`}>
                          {m === 'ecocash' ? 'EcoCash' : m.charAt(0).toUpperCase() + m.slice(1)}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                {bookError && (
                  <p className="text-xs mb-0" style={{ color: '#f87171' }}>{bookError}</p>
                )}
                <button type="submit" disabled={bookLoading} className="btn btn-primary d-flex align-items-center justify-content-center gap-2">
                  {bookLoading && <Loader size={15} className="animate-spin" />} Book Ride
                </button>
              </form>
            </div>
            <MapView clientLocation={coords || undefined} className="h-60" />
          </div>
        )}

        {/* VOUCHERS */}
        {tab === 'vouchers' && (
          <div className="animate-fade-in" style={{ maxWidth: 800 }}>
            <PageHeader
              title="Voucher Management"
              subtitle={`${vouchers.length} voucher${vouchers.length !== 1 ? 's' : ''} issued`}
              icon={FileText}
              iconColor="#4ade80"
              canGoBack={tabStack.length > 0}
              onBack={goBack}
              action={
                <button onClick={() => setShowVoucherForm(true)} className="btn btn-primary d-flex align-items-center gap-2 fw-semibold">
                  <Plus size={16} /> New Voucher
                </button>
              }
            />
            <div className="d-flex flex-column gap-3">
              {vouchers.map(v => (
                <div key={v.id} className="card p-3 d-flex flex-row align-items-start gap-3">
                  <div className="d-flex align-items-center justify-content-center rounded-xl flex-shrink-0"
                    style={{ width: 48, height: 48, background: 'var(--eg-brand-dim)' }}>
                    <FileText size={22} className="text-brand" />
                  </div>
                  <div className="flex-grow-1 overflow-hidden">
                    <div className="d-flex align-items-center gap-2 mb-2">
                      <p className="fw-bold mb-0">Voucher #{v.voucherNo}</p>
                      <span className={v.status === 'used' ? 'badge-brand' : v.status === 'cancelled' ? 'badge-danger-soft' : 'badge-warn'}>{v.status}</span>
                    </div>
                    <div className="row g-2 text-xs text-muted">
                      <div className="col-6 col-sm-3"><span className="text-secondary">Date:</span> {v.date}</div>
                      <div className="col-6 col-sm-3"><span className="text-secondary">Dept:</span> {v.department}</div>
                      <div className="col-6 col-sm-3"><span className="text-secondary">Employee:</span> {v.employeeNames}</div>
                      <div className="col-6 col-sm-3"><span className="text-secondary">Value:</span> <span className="text-brand fw-bold">${v.totalValue}</span></div>
                      <div className="col-6 col-sm-4"><span className="text-secondary">From:</span> {v.pickUpPoint}</div>
                      <div className="col-6 col-sm-4"><span className="text-secondary">To:</span> {v.dropOffPoint}</div>
                      <div className="col-6 col-sm-4"><span className="text-secondary">Mileage:</span> {v.totalMileage} km</div>
                    </div>
                  </div>
                  <div className="d-flex gap-2 flex-shrink-0">
                    <button onClick={() => setSelectedVoucher(v)} className="btn btn-secondary p-2"><Eye size={15} /></button>
                    <button onClick={() => window.print()} className="btn btn-secondary p-2"><Download size={15} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* EMPLOYEES */}
        {tab === 'employees' && (
          <div className="animate-fade-in" style={{ maxWidth: 800 }}>
            <PageHeader
              title="Employee Management"
              subtitle="Book rides on behalf of your staff"
              icon={Users}
              iconColor="#60a5fa"
              canGoBack={tabStack.length > 0}
              onBack={goBack}
              action={
                <button onClick={() => navigateTo('book')} className="btn btn-primary d-flex align-items-center gap-2 fw-semibold">
                  <Plus size={16} /> Book a Ride
                </button>
              }
            />
            <div className="card p-4 text-center text-muted mb-4" style={{ border: '1px dashed var(--eg-600)' }}>
              <Users size={36} className="mx-auto mb-3 opacity-30" />
              <p className="fw-semibold mb-1">No employees added yet</p>
              <p className="text-xs mb-3">To book a ride for an employee, go to <strong>Book Ride</strong> and enter their name and department manually.</p>
              <button onClick={() => navigateTo('book')} className="btn btn-primary btn-sm">Book Ride Now</button>
            </div>
            <div className="card overflow-x-auto">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    {['Name', 'Email', 'Department', 'Position', 'Actions'].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employees.map(emp => (
                    <tr key={emp.id}>
                      <td className="fw-medium">{emp.name}</td>
                      <td className="text-muted">{emp.email}</td>
                      <td><span className="badge-info-soft">{emp.department}</span></td>
                      <td className="text-muted">{emp.position}</td>
                      <td>
                        <button onClick={() => { setBooking(b => ({ ...b, employee: emp.name, department: emp.department })); navigateTo('book') }}
                          className="text-xs text-brand" style={{ background: 'none', border: 'none' }}>
                          Book Ride
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* REPORTS */}
        {tab === 'reports' && (
          <div className="animate-fade-in" style={{ maxWidth: 1000 }}>
            <PageHeader
              title="Reports & Analytics"
              subtitle={`$${totalSpend.toFixed(2)} total spend across ${rides.length} rides`}
              icon={BarChart2}
              iconColor="#60a5fa"
              canGoBack={tabStack.length > 0}
              onBack={goBack}
              action={
                <button
                  onClick={() => exportCorporateRides(rides, vouchers, user?.companyName || 'Corporate')}
                  className="btn btn-success d-flex align-items-center gap-2 fw-semibold"
                  title="Download trip report as Excel with voucher details"
                >
                  <Download size={16} /> Export Excel
                </button>
              }
            />
            <div className="row g-4">
              <div className="col-md-6">
                <div className="card p-3">
                  <h3 className="fw-semibold small mb-3">Spend by Department</h3>
                  {Object.entries(deptBreakdown).map(([dept, amount]) => {
                    const pct = Math.round((amount / totalSpend) * 100) || 0
                    return (
                      <div key={dept} className="mb-3">
                        <div className="d-flex justify-content-between small mb-1">
                          <span>{dept}</span><span className="text-brand fw-bold">${amount.toFixed(2)}</span>
                        </div>
                        <div className="progress" style={{ height: 8, background: 'var(--eg-700)' }}>
                          <div className="progress-bar" style={{ width: `${pct}%`, background: 'var(--eg-brand)' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="col-md-6">
                <div className="card p-3">
                  <h3 className="fw-semibold small mb-3">Payment Methods</h3>
                  {['cash', 'ecocash', 'voucher'].map(m => {
                    const count = rides.filter(r => r.paymentMethod === m).length
                    const pct = rides.length ? Math.round((count / rides.length) * 100) : 0
                    return (
                      <div key={m} className="mb-3">
                        <div className="d-flex justify-content-between small mb-1">
                          <span className="text-capitalize">{m === 'ecocash' ? 'EcoCash' : m}</span>
                          <span>{pct}%</span>
                        </div>
                        <div className="progress" style={{ height: 8, background: 'var(--eg-700)' }}>
                          <div className="progress-bar bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="col-12">
                <div className="card p-3">
                  <h3 className="fw-semibold small mb-3">All Trips</h3>
                  <div className="overflow-x-auto">
                    <table className="table table-hover small mb-0">
                      <thead>
                        <tr>
                          {['Date', 'Employee', 'Dept', 'Route', 'Payment', 'Fare', 'Voucher No.', 'Voucher Amount', 'Status'].map(h => (
                            <th key={h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rides.map(r => {
                          const isVoucher = r.paymentMethod === 'voucher'
                          const linked = isVoucher ? vouchers.find(v => v.id === r.voucherId) : undefined
                          return (
                            <tr key={r.id}>
                              <td className="text-muted">{new Date(r.createdAt).toLocaleDateString()}</td>
                              <td>{r.employeeName || '—'}</td>
                              <td><span className="badge-info-soft text-xs">{r.departmentCode || '—'}</span></td>
                              <td className="text-muted text-truncate" style={{ maxWidth: 180 }}>{r.pickupAddress} → {r.dropoffAddress}</td>
                              <td className="text-capitalize">{r.paymentMethod}</td>
                              <td className="fw-bold text-brand">{r.fare ? `$${r.fare.toFixed(2)}` : '—'}</td>
                              <td>
                                {isVoucher ? (
                                  <span className="badge-info-soft text-xs">#{linked?.voucherNo || r.voucherId?.slice(0, 6) || '—'}</span>
                                ) : <span className="text-muted">—</span>}
                              </td>
                              <td className="fw-semibold" style={{ color: isVoucher ? '#60a5fa' : undefined }}>
                                {isVoucher ? (r.fare ? `$${r.fare.toFixed(2)}` : (linked?.totalValue ? `$${linked.totalValue}` : '—')) : <span className="text-muted">—</span>}
                              </td>
                              <td><span className={r.status === 'completed' ? 'badge-brand' : 'badge-warn'}>{r.status}</span></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PAYMENTS */}
        {tab === 'payments' && (
          <div className="animate-fade-in" style={{ maxWidth: 520 }}>
            <PageHeader
              title="Payment Methods"
              subtitle="How your company pays for rides"
              icon={CreditCard}
              iconColor="#fbbf24"
              canGoBack={tabStack.length > 0}
              onBack={goBack}
            />
            <div className="d-flex flex-column gap-3">
              {[
                { icon: '💵', name: 'Cash', desc: 'Pay driver directly', note: 'Driver receives cash on completion' },
                { icon: '📱', name: 'EcoCash', desc: 'Mobile money via EcoCash Zimbabwe', note: '+263 77X XXX XXX on file' },
                { icon: '🎫', name: 'Voucher', desc: 'Pre-authorised company vouchers', note: `${vouchers.filter(v => v.status === 'pending').length} vouchers available` },
              ].map(m => (
                <div key={m.name} className="card p-3 d-flex flex-row align-items-center gap-3">
                  <span style={{ fontSize: '1.75rem' }}>{m.icon}</span>
                  <div className="flex-grow-1">
                    <p className="fw-semibold mb-0">{m.name}</p>
                    <p className="small text-muted mb-0">{m.desc}</p>
                    <p className="text-xs text-muted mb-0">{m.note}</p>
                  </div>
                  <span className="badge-brand">Active</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════ ACCOUNT ══════════════════════════════ */}
        {tab === 'account' && (
          <div className="animate-fade-in" style={{ maxWidth: 520 }}>
            <PageHeader
              title="Account"
              subtitle={user?.fullName || user?.name || 'Corporate account'}
              icon={User}
              iconColor="#60a5fa"
              canGoBack={tabStack.length > 0}
              onBack={goBack}
            />

            {/* Profile */}
            <div className="card p-4 mb-3">
              <div className="d-flex align-items-center gap-3">
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(96,165,250,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa', fontWeight: 700, fontSize: '1.3rem', flexShrink: 0 }}>
                  {(user?.companyName || user?.fullName || user?.name || '?')[0].toUpperCase()}
                </div>
                <div className="overflow-hidden">
                  <p className="fw-bold mb-0">{user?.companyName || user?.fullName || user?.name}</p>
                  {user?.phone && <p className="text-xs text-muted mb-1">{user.phone}</p>}
                  {user?.email && <p className="text-xs text-muted mb-1 text-truncate">{user.email}</p>}
                  <span className="badge-info-soft">Corporate</span>
                </div>
              </div>
            </div>

            {/* Preferences */}
            <div className="card mb-3" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid var(--eg-600)' }}>
                <p style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Preferences</p>
              </div>
              <button onPointerDown={(e) => { e.preventDefault(); toggleNotifications() }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', width: '100%', background: 'transparent', border: 'none', color: '#f9fafb', cursor: 'pointer', touchAction: 'manipulation' }}>
                {notificationsOn ? <Bell size={18} style={{ color: '#22c55e' }} /> : <BellOff size={18} style={{ color: '#6b7280' }} />}
                <div style={{ flexGrow: 1, textAlign: 'left' }}>
                  <p style={{ fontWeight: 500, fontSize: '0.85rem', margin: 0 }}>Push Notifications</p>
                  <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>{notificationsOn ? 'Alerts enabled' : 'Alerts silenced'}</p>
                </div>
                <div style={{ width: 40, height: 22, borderRadius: 11, padding: 2, background: notificationsOn ? '#22c55e' : '#374151', transition: 'background 0.2s', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', transform: notificationsOn ? 'translateX(18px)' : 'translateX(0)', transition: 'transform 0.2s' }} />
                </div>
              </button>
            </div>

            {/* More links */}
            <div className="card mb-3" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid var(--eg-600)' }}>
                <p style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>More</p>
              </div>
              {([
                { id: 'employees', label: 'Employees',       icon: Users },
                { id: 'payments',  label: 'Payment Methods', icon: CreditCard },
              ] as { id: string; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }, i, arr) => (
                <button key={id} onPointerDown={(e) => { e.preventDefault(); navigateTo(id) }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', width: '100%', background: 'transparent', border: 'none', borderBottom: i < arr.length - 1 ? '1px solid var(--eg-600)' : 'none', color: '#f9fafb', cursor: 'pointer', touchAction: 'manipulation' }}>
                  <Icon size={18} style={{ color: '#22c55e' }} />
                  <span style={{ flexGrow: 1, textAlign: 'left', fontSize: '0.85rem', fontWeight: 500 }}>{label}</span>
                  <ChevronRight size={16} style={{ color: '#6b7280' }} />
                </button>
              ))}
            </div>

            {/* Sign out */}
            <button onPointerDown={(e) => { e.preventDefault(); logout() }}
              className="btn w-100 d-flex align-items-center justify-content-center gap-2 fw-semibold"
              style={{ color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', borderRadius: '0.75rem', padding: '0.75rem', touchAction: 'manipulation' }}>
              <LogOut size={18} /> Sign Out
            </button>
          </div>
        )}
      </main>

      {showVoucherForm && <VoucherForm onSave={handleVoucherSaved} onClose={() => setShowVoucherForm(false)} />}
      {selectedVoucher && <VoucherDetail voucher={selectedVoucher} onClose={() => setSelectedVoucher(null)} />}
      {showChat && activeRide && (
        <div className="position-fixed p-3" style={{ inset: 16, zIndex: 1050 }}>
          <ChatPanel rideId={activeRide.id} peerId={activeRide.driverId || ''} peerName="Driver"
            onClose={() => setShowChat(false)} onCall={type => { setShowChat(false); setCallState({ open: true, type }) }} />
        </div>
      )}
      {callState.open && activeRide && (
        <CallModal peerId={activeRide.driverId || ''} peerName="Driver" callType={callState.type}
          onEnd={() => setCallState({ open: false, type: 'audio' })} />
      )}
      {showPayment && activeRide && (
        <PaymentModal fare={activeRide.fare || 6.00} allowVoucher
          onPay={async () => {
            try { await api.patch(`/rides/${activeRide.id}`, { status: 'completed' }) } catch { /* update via socket */ }
            setActiveRide({ ...activeRide, status: 'completed' })
          }}
          onClose={() => setShowPayment(false)} />
      )}

      <BottomNav
        items={BOTTOM_TABS}
        active={['employees', 'payments'].includes(tab) ? 'account' : tab}
        onNav={navigateTo}
      />
    </div>
  )
}

function VoucherDetail({ voucher: v, onClose }: { voucher: Voucher; onClose: () => void }) {
  return (
    <div className="position-fixed top-0 start-0 end-0 bottom-0 d-flex align-items-center justify-content-center p-4"
      style={{ zIndex: 1055, background: 'rgba(0,0,0,0.7)' }}>
      <div className="card w-100 animate-fade-in" style={{ maxWidth: 520 }}>
        <div className="card-header d-flex align-items-center justify-content-between">
          <h3 className="fw-bold mb-0 small">Voucher #{v.voucherNo}</h3>
          <button onClick={onClose} className="btn btn-secondary p-2"><X size={18} /></button>
        </div>
        <div className="card-body p-4">
          <div className="rounded-xl p-3 mb-4 d-flex align-items-center justify-content-between bg-700">
            <div>
              <p className="text-xs text-muted mb-1">Total Value</p>
              <p className="fw-bolder text-brand mb-0" style={{ fontSize: '1.75rem' }}>${v.totalValue}</p>
            </div>
            <span className={v.status === 'used' ? 'badge-brand' : v.status === 'cancelled' ? 'badge-danger-soft' : 'badge-warn'}>{v.status}</span>
          </div>
          <div className="row g-2 small">
            {[
              ['Date', v.date], ['Voucher No.', v.voucherNo], ['Pick Up', v.pickUpPoint], ['Drop Off', v.dropOffPoint],
              ['Department', v.department], ['Cost Center', v.costCenter], ['Employee', v.employeeNames], ['Authorised By', v.authorisedBy],
              ['Cab No.', v.cabNo], ['Driver', v.driverName], ['Pick Up Time', v.pickUpTime], ['Drop Off Time', v.dropOffTime],
              ['Opening Mileage', String(v.openingMileage)], ['Closing Mileage', String(v.closingMileage)],
              ['Total Mileage', String(v.totalMileage)], ['Waiting Charge', `$${v.waitingCharge}`],
            ].map(([label, val]) => (
              <div key={label} className="col-6">
                <div className="rounded-xl p-2 bg-700">
                  <p className="text-xs text-muted mb-0">{label}</p>
                  <p className="fw-medium mb-0 small">{val || '—'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

