import React, { useState, useEffect, useCallback } from 'react'
import {
  LayoutDashboard, Users, Car, FileText, Activity, BarChart2,
  Shield, LogOut, X, Search, RefreshCw,
  Trash2, Lock, Unlock, Eye, AlertTriangle, CheckCircle,
  TrendingUp, DollarSign, Navigation, User, Building2, Ban, Info, Zap, Download,
  ClipboardList, Clock, XCircle, ChevronRight, FileCheck, Tag, Plus, Banknote, Loader,
  Wallet, Sliders, ArrowUpCircle, ArrowDownCircle,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useSocket } from '../../context/SocketContext'
import EasyGoLogo from '../../components/EasyGoLogo'
import { User as UserType, Ride, Voucher, ActivityLog, AccountStatus, DocumentAlert, PromoCode, Payout } from '../../types'
import api from '../../services/api'
import { exportAdminRides, exportAdminFullReport } from '../../utils/exportExcel'
import { exportAdminFullReportPdf, exportRidesPdf } from '../../utils/exportPdf'
import { FileSpreadsheet, FileText as FileTextIcon } from 'lucide-react'
import { calcFare, FARE_RATES } from '../../utils/fareCalc'

const NAV = [
  { id: 'overview',       label: 'Overview',        icon: LayoutDashboard },
  { id: 'verifications',  label: 'Verifications',   icon: ClipboardList },
  { id: 'users',          label: 'User Management', icon: Users },
  { id: 'rides',          label: 'All Rides',       icon: Navigation },
  { id: 'vouchers',       label: 'Vouchers',        icon: FileText },
  { id: 'promos',         label: 'Promo Codes',     icon: Tag },
  { id: 'pricing',        label: 'Pricing',         icon: Zap },
  { id: 'cashouts',       label: 'Cashouts',        icon: Banknote },
  { id: 'wallets',        label: 'Driver Wallets',  icon: Wallet },
  { id: 'activity',       label: 'Activity Log',    icon: Activity },
  { id: 'reports',        label: 'Reports',         icon: BarChart2 },
]

export default function AdminDashboard() {
  const { user, logout } = useAuth()
  const { socket } = useSocket()
  const [tab, setTab] = useState('overview')

  // When tab changes, reset scroll to top so the first element isn't buried
  // behind the fixed topbar + nav pills (104 px of fixed UI at top).
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }) }, [tab])

  const [users, setUsers] = useState<UserType[]>([])
  const [rides, setRides] = useState<Ride[]>([])
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmState | null>(null)
  const [searchQuery, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [logFilter, setLogFilter] = useState<string>('all')
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null)
  const [freezeReason, setFreezeReason] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [selectedVerifUser, setSelectedVerifUser] = useState<UserType | null>(null)

  // Promo codes
  const [promos, setPromos] = useState<PromoCode[]>([])
  const [promoForm, setPromoForm] = useState<Partial<PromoCode>>({ code: '', type: 'percent', value: 10, description: '', active: true, maxUses: null, minFare: 0 })
  const [showPromoForm, setShowPromoForm] = useState(false)
  const [editingPromo, setEditingPromo] = useState<PromoCode | null>(null)
  const [promoSaving, setPromoSaving] = useState(false)
  const [promoError, setPromoError] = useState<string | null>(null)
  const [ridesSearch, setRidesSearch] = useState('')
  const [sosAlert, setSosAlert] = useState<{ rideId: string; userId: string; userName: string; timestamp: string } | null>(null)

  // Fuel price / pricing (petrol + diesel)
  const [fuelData, setFuelData] = useState({
    petrol: { price: 1.65, base: 1.65, multiplier: 1 },
    diesel: { price: 1.85, base: 1.85, multiplier: 1 },
  })
  const [petrolInput, setPetrolInput] = useState('1.65')
  const [dieselInput, setDieselInput] = useState('1.85')
  const [fuelPriceSaving, setFuelPriceSaving] = useState(false)
  const [fuelPriceError, setFuelPriceError] = useState<string | null>(null)
  const [fuelPriceSuccess, setFuelPriceSuccess] = useState(false)

  // Cashouts
  const [payouts,         setPayouts]         = useState<Payout[]>([])
  const [cashoutRejReason, setCashoutRejReason] = useState('')
  const [cashoutProcessing, setCashoutProcessing] = useState<string | null>(null)

  // Driver wallets (phase 6)
  interface AdminWalletRow {
    driverId: string; driverName: string; phone: string; email: string; status: string
    balance: number; heldBalance: number; total: number; lastTopUpAt: string | null
  }
  interface AdminWalletDetail extends AdminWalletRow {
    transactions: Array<{ id: string; type: string; amount: number; balanceAfter: number; createdAt: string; reference?: string; metadata?: Record<string, unknown> }>
  }
  const [wallets,         setWallets]         = useState<AdminWalletRow[]>([])
  const [walletSearch,    setWalletSearch]    = useState('')
  const [walletsLoading,  setWalletsLoading]  = useState(false)
  const [selectedWallet,  setSelectedWallet]  = useState<AdminWalletDetail | null>(null)
  const [adjustDelta,     setAdjustDelta]     = useState('')
  const [adjustReason,    setAdjustReason]    = useState('')
  const [adjustSaving,    setAdjustSaving]    = useState(false)
  const [adjustError,     setAdjustError]     = useState<string | null>(null)

  // Commission config
  const [commissionCfg,   setCommissionCfg]   = useState<{ default: number; min: number; max: number; walletMinBalance: number } | null>(null)
  const [commissionSaving, setCommissionSaving] = useState(false)
  const [commissionSuccess, setCommissionSuccess] = useState(false)

  async function fetchWallets() {
    setWalletsLoading(true)
    try { const r = await api.get<AdminWalletRow[]>('/admin/wallets'); setWallets(r.data) }
    catch (err) { console.error('Wallet fetch failed:', err) }
    finally { setWalletsLoading(false) }
  }

  async function openWalletDetail(driverId: string) {
    try {
      const r = await api.get<AdminWalletDetail>(`/admin/wallets/${driverId}`)
      setSelectedWallet(r.data)
      setAdjustDelta(''); setAdjustReason(''); setAdjustError(null)
    } catch (err) { console.error('Wallet detail failed:', err) }
  }

  async function submitAdjust() {
    if (!selectedWallet) return
    const delta = parseFloat(adjustDelta)
    if (!Number.isFinite(delta) || delta === 0) { setAdjustError('Enter a non-zero amount'); return }
    if (!adjustReason.trim())                   { setAdjustError('Reason is required'); return }
    setAdjustSaving(true); setAdjustError(null)
    try {
      await api.post(`/admin/wallets/${selectedWallet.driverId}/adjust`, { delta, reason: adjustReason.trim() })
      // Refresh both the detail and the list row
      const [detail, list] = await Promise.all([
        api.get<AdminWalletDetail>(`/admin/wallets/${selectedWallet.driverId}`),
        api.get<AdminWalletRow[]>('/admin/wallets'),
      ])
      setSelectedWallet(detail.data); setWallets(list.data)
      setAdjustDelta(''); setAdjustReason('')
    } catch (err: unknown) {
      setAdjustError(err instanceof Error ? err.message : 'Adjustment failed')
    } finally { setAdjustSaving(false) }
  }

  useEffect(() => {
    if (tab === 'wallets' && wallets.length === 0) fetchWallets()
    if (tab === 'pricing' && !commissionCfg) {
      api.get('/admin/commission').then(r => setCommissionCfg(r.data)).catch(() => {})
    }
  }, [tab])

  async function saveCommission() {
    if (!commissionCfg) return
    setCommissionSaving(true); setCommissionSuccess(false)
    try {
      const r = await api.patch('/admin/commission', commissionCfg)
      setCommissionCfg(r.data)
      setCommissionSuccess(true)
      setTimeout(() => setCommissionSuccess(false), 2000)
    } catch (err) { console.error('Commission save failed:', err) }
    finally { setCommissionSaving(false) }
  }

  const pendingVerifications = users.filter(u => u.verification?.status === 'pending')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [ur, rr, vr, lr, pr, fp, co] = await Promise.all([
        api.get('/admin/users'), api.get('/admin/rides'),
        api.get('/admin/vouchers'), api.get('/admin/logs'),
        api.get('/admin/promos').catch(() => ({ data: [] })),
        api.get('/config/fuel-price').catch(() => ({ data: null })),
        api.get('/admin/cashouts').catch(() => ({ data: [] })),
      ])
      setUsers(ur.data); setRides(rr.data); setVouchers(vr.data); setLogs(lr.data); setPromos(pr.data)
      if (fp.data?.petrol && fp.data?.diesel) {
        setFuelData({ petrol: fp.data.petrol, diesel: fp.data.diesel })
        setPetrolInput(String(fp.data.petrol.price))
        setDieselInput(String(fp.data.diesel.price))
      }
      setPayouts(co.data)
    } catch (err) {
      console.error('Admin fetch failed:', err)
      addLog({ type: 'system', severity: 'critical', description: 'Failed to load dashboard data — check server connection' })
    }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!socket) return
    const handleRideUpdate = (ride: Ride) => {
      setRides(prev => {
        const idx = prev.findIndex(r => r.id === ride.id)
        return idx >= 0 ? prev.map(r => r.id === ride.id ? ride : r) : [ride, ...prev]
      })
    }
    const handleKycSubmitted = () => {
      api.get('/admin/users').then(r => setUsers(r.data)).catch(() => {})
    }
    const handleSos = (data: { rideId: string; userId: string; userName: string; timestamp: string }) => {
      setSosAlert(data)
      addLog({ type: 'system', severity: 'critical', description: `🚨 SOS ALERT — ${data.userName} triggered emergency during ride #${data.rideId.slice(0, 8)}` })
    }
    const handleCashoutNew = (p: Payout) => setPayouts(prev => [p, ...prev])
    socket.on('admin:ride_update', handleRideUpdate)
    socket.on('admin:kyc_submitted', handleKycSubmitted)
    socket.on('sos:alert', handleSos)
    socket.on('cashout:new', handleCashoutNew)
    return () => {
      socket.off('admin:ride_update', handleRideUpdate)
      socket.off('admin:kyc_submitted', handleKycSubmitted)
      socket.off('sos:alert', handleSos)
      socket.off('cashout:new', handleCashoutNew)
    }
  }, [socket])

  async function approveVerification(uid: string) {
    try {
      await api.post(`/admin/verifications/${uid}`, { action: 'approve' })
      setUsers(prev => prev.map(u => u.id === uid ? { ...u, verification: { ...(u.verification || { submittedAt: new Date().toISOString() }), status: 'approved', reviewedAt: new Date().toISOString(), reviewedBy: 'Admin' } } : u))
      addLog({ type: 'verification', severity: 'info', description: `Application approved — ${users.find(u => u.id === uid)?.fullName || uid}` })
      setSelectedVerifUser(null)
    } catch { addLog({ type: 'system', severity: 'critical', description: `Failed to approve verification for ${uid}` }) }
  }

  async function rejectVerification(uid: string) {
    if (!rejectReason.trim()) return
    try {
      await api.post(`/admin/verifications/${uid}`, { action: 'reject', rejectionReason: rejectReason })
      setUsers(prev => prev.map(u => u.id === uid ? { ...u, verification: { ...(u.verification || { submittedAt: new Date().toISOString() }), status: 'rejected', rejectionReason: rejectReason, reviewedAt: new Date().toISOString() } } : u))
      addLog({ type: 'verification', severity: 'warning', description: `Application rejected — ${users.find(u => u.id === uid)?.fullName || uid}: ${rejectReason}` })
      setSelectedVerifUser(null); setRejectReason('')
    } catch { addLog({ type: 'system', severity: 'critical', description: `Failed to reject verification for ${uid}` }) }
  }

  async function freezeUser(uid: string, reason: string) {
    try {
      await api.patch(`/admin/users/${uid}`, { accountStatus: 'frozen', frozenReason: reason })
      setUsers(prev => prev.map(u => u.id === uid ? { ...u, accountStatus: 'frozen', frozenReason: reason, frozenAt: new Date().toISOString() } : u))
      addLog({ type: 'account', severity: 'warning', userId: uid, description: `Account frozen — ${reason}` })
      setConfirmAction(null); setSelectedUser(null); setFreezeReason('')
    } catch { addLog({ type: 'system', severity: 'critical', description: `Failed to freeze account ${uid}` }) }
  }

  async function unfreezeUser(uid: string) {
    try {
      await api.patch(`/admin/users/${uid}`, { accountStatus: 'active' })
      setUsers(prev => prev.map(u => u.id === uid ? { ...u, accountStatus: 'active', frozenReason: undefined } : u))
      addLog({ type: 'account', severity: 'info', userId: uid, description: 'Account unfrozen by admin' })
      setConfirmAction(null)
    } catch { addLog({ type: 'system', severity: 'critical', description: `Failed to unfreeze account ${uid}` }) }
  }

  async function deleteUser(uid: string) {
    try {
      await api.delete(`/admin/users/${uid}`)
      setUsers(prev => prev.map(u => u.id === uid ? { ...u, accountStatus: 'deleted' } : u))
      addLog({ type: 'account', severity: 'critical', userId: uid, description: 'Account permanently deleted by admin' })
      setConfirmAction(null)
    } catch { addLog({ type: 'system', severity: 'critical', description: `Failed to delete account ${uid}` }) }
  }

  function addLog(entry: Omit<ActivityLog, 'id' | 'timestamp'>) {
    const log: ActivityLog = { id: crypto.randomUUID(), timestamp: new Date().toISOString(), userName: 'Admin', userRole: 'admin', ...entry }
    setLogs(prev => [log, ...prev])
  }

  const activeUsers  = users.filter(u => u.accountStatus !== 'deleted' && u.accountStatus !== 'frozen').length
  const frozenUsers  = users.filter(u => u.accountStatus === 'frozen').length
  const totalRevenue = rides.filter(r => r.status === 'completed').reduce((s, r) => s + (r.fare || 0), 0)
  const activeRides  = rides.filter(r => !['completed', 'cancelled'].includes(r.status)).length
  const criticalLogs = logs.filter(l => l.severity === 'critical').length

  const filteredUsers = users.filter(u => {
    const q = searchQuery.toLowerCase()
    const matchSearch = !q || (u.fullName || u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (u.phone || '').includes(q)
    const matchRole   = roleFilter === 'all' || u.role === roleFilter
    const matchStatus = statusFilter === 'all' || (u.accountStatus || 'active') === statusFilter
    return matchSearch && matchRole && matchStatus
  })

  // ── sidebar link style ─────────────────────────────────────────────────────
  function navLinkStyle(id: string) {
    return tab === id ? { color: '#f87171', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' } : {}
  }

  return (
    <div className="min-vh-100 bg-900">

      {/* ── Fixed top header ─────────────────────────────────────── */}
      <header
        className="position-fixed top-0 start-0 end-0 d-flex align-items-center justify-content-between px-3"
        style={{ height: 56, background: 'var(--eg-800)', borderBottom: '1px solid var(--eg-600)', zIndex: 1060 }}
      >
        <div className="d-flex align-items-center gap-2">
          <EasyGoLogo height={28} />
          <div className="d-flex align-items-center gap-1">
            <Shield size={11} className="text-danger" />
            <span className="text-xs text-danger fw-semibold d-none d-sm-inline" style={{ letterSpacing: '0.06em' }}>ADMIN</span>
          </div>
        </div>
        <div className="d-flex align-items-center gap-2">
          {frozenUsers > 0 && (
            <span className="badge-warn d-none d-sm-flex align-items-center gap-1 text-xs">
              <Lock size={11} /> {frozenUsers} frozen
            </span>
          )}
          <button onClick={fetchData} className={`btn btn-secondary p-2 ${loading ? 'animate-spin' : ''}`} title="Refresh">
            <RefreshCw size={15} />
          </button>
          <button
            onClick={logout}
            className="btn p-2 d-flex align-items-center justify-content-center"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '0.75rem', color: '#f87171' }}
            title="Sign Out"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* ── Horizontal nav pills ─────────────────────────────────── */}
      <div
        className="position-fixed start-0 end-0 overflow-x-auto overflow-y-hidden"
        style={{ top: 56, height: 48, zIndex: 1050, background: 'var(--eg-800)', borderBottom: '1px solid var(--eg-600)' }}
      >
        <div className="d-flex gap-1 px-3 py-2 align-items-center" style={{ minWidth: 'max-content', height: '100%' }}>
          {NAV.map(({ id, label, icon: Icon }) => {
            const isActive = tab === id
            const badge =
              id === 'activity'      && criticalLogs > 0                                 ? criticalLogs
              : id === 'verifications' && pendingVerifications.length > 0                ? pendingVerifications.length
              : id === 'cashouts'    && payouts.filter(p => p.status === 'pending').length > 0
                  ? payouts.filter(p => p.status === 'pending').length
              : 0
            const badgeBg    = id === 'verifications' ? '#eab308' : id === 'activity' ? '#ef4444' : '#60a5fa'
            const badgeColor = id === 'verifications' ? '#111' : '#fff'
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className="btn btn-sm d-flex align-items-center gap-1"
                style={{
                  fontSize: '0.78rem', fontWeight: isActive ? 600 : 400,
                  whiteSpace: 'nowrap',
                  background: isActive ? 'rgba(239,68,68,0.12)' : 'transparent',
                  color: isActive ? '#f87171' : '#9ca3af',
                  border: `1px solid ${isActive ? 'rgba(239,68,68,0.3)' : 'transparent'}`,
                  borderRadius: '0.65rem', padding: '0.3rem 0.65rem',
                  transition: 'all 0.15s',
                }}
              >
                <Icon size={14} />
                {label}
                {badge > 0 && (
                  <span style={{
                    marginLeft: 2, minWidth: 16, height: 16, borderRadius: 999,
                    background: badgeBg, color: badgeColor,
                    fontSize: '0.6rem', fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 4px',
                  }}>
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────── */}
      <main className="p-3 p-lg-4 overflow-x-hidden" style={{ paddingTop: 120, paddingBottom: 32, minHeight: '100vh' }}>

          {/* OVERVIEW */}
          {tab === 'overview' && (
            <div className="animate-fade-in" style={{ maxWidth: 1100 }}>
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4 pb-3" style={{ borderBottom: '1px solid var(--eg-700)' }}>
                <div>
                  <h1 className="fw-bold mb-1" style={{ fontSize: '1.75rem', letterSpacing: '-0.01em' }}>Dashboard</h1>
                  <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>Full operational overview — live stats across the whole platform</p>
                </div>
                <div className="btn-group" role="group" aria-label="Download full report">
                  <button
                    onClick={() => exportAdminFullReport({ users, rides, payouts })}
                    className="btn btn-success d-flex align-items-center gap-2 fw-semibold"
                    title="Full Report as 6-sheet Excel workbook"
                  >
                    <FileSpreadsheet size={16} />
                    Excel
                  </button>
                  <button
                    onClick={() => exportAdminFullReportPdf({ users, rides, payouts })}
                    className="btn btn-danger d-flex align-items-center gap-2 fw-semibold"
                    title="Full Report as a printable PDF"
                  >
                    <FileTextIcon size={16} />
                    PDF
                  </button>
                </div>
              </div>
              <div className="row g-3 mb-5">
                {[
                  { label: 'Total Users', value: users.filter(u => u.accountStatus !== 'deleted').length, icon: Users, color: '#60a5fa', bg: 'rgba(59,130,246,0.1)', sub: `${frozenUsers} frozen` },
                  { label: 'Active Rides', value: activeRides, icon: Navigation, color: '#4ade80', bg: 'rgba(34,197,94,0.1)', sub: `${rides.filter(r => r.status === 'completed').length} completed` },
                  { label: 'Total Revenue', value: `$${totalRevenue.toFixed(2)}`, icon: DollarSign, color: '#fbbf24', bg: 'rgba(234,179,8,0.1)', sub: 'All time' },
                  { label: 'Critical Alerts', value: criticalLogs, icon: AlertTriangle, color: '#f87171', bg: 'rgba(239,68,68,0.1)', sub: 'Needs review' },
                ].map(k => (
                  <div key={k.label} className="col-6 col-lg-3">
                    <div className="card h-100 p-4" style={{ borderColor: k.color === '#f87171' && criticalLogs > 0 ? 'rgba(239,68,68,0.4)' : 'var(--eg-600)' }}>
                      <div className="d-flex align-items-center justify-content-center rounded-xl mb-3" style={{ width: 48, height: 48, background: k.bg }}>
                        <k.icon size={22} style={{ color: k.color }} />
                      </div>
                      <p className="fw-bolder mb-1" style={{ fontSize: '1.9rem', lineHeight: 1.1, color: k.color }}>{k.value}</p>
                      <p className="fw-semibold mb-1" style={{ fontSize: '0.95rem' }}>{k.label}</p>
                      <p className="text-muted mb-0" style={{ fontSize: '0.8rem' }}>{k.sub}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="row g-4 mb-5">
                <div className="col-lg-6">
                  <div className="card p-4 h-100">
                    <h3 className="fw-bold mb-4 d-flex align-items-center gap-2" style={{ fontSize: '1.05rem' }}><Users size={18} style={{ color: '#60a5fa' }} /> User Breakdown</h3>
                    {[
                      { role: 'rider', label: 'Private Clients', icon: User, color: '#4ade80', bg: 'bg-success' },
                      { role: 'corporate', label: 'Corporate Clients', icon: Building2, color: '#60a5fa', bg: 'bg-primary' },
                      { role: 'driver', label: 'Drivers', icon: Car, color: '#fbbf24', bg: 'bg-warning' },
                    ].map(({ role, label, icon: Icon, color, bg }) => {
                      const count = users.filter(u => u.role === role && u.accountStatus !== 'deleted').length
                      const total = users.filter(u => u.accountStatus !== 'deleted').length
                      const pct = total ? Math.round((count / total) * 100) : 0
                      return (
                        <div key={role} className="mb-3">
                          <div className="d-flex align-items-center justify-content-between small mb-2">
                            <span className="d-flex align-items-center gap-2"><Icon size={15} style={{ color }} />{label}</span>
                            <span className="fw-bold">{count} <span className="text-muted fw-normal">({pct}%)</span></span>
                          </div>
                          <div className="progress" style={{ height: 8, background: 'var(--eg-700)' }}>
                            <div className={`progress-bar ${bg}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="col-lg-6">
                  <div className="card p-4 h-100">
                    <h3 className="fw-bold mb-4 d-flex align-items-center gap-2" style={{ fontSize: '1.05rem' }}><Activity size={18} className="text-danger" /> Recent Critical Alerts</h3>
                    <div className="d-flex flex-column gap-1">
                      {logs.filter(l => l.severity !== 'info').slice(0, 5).map(log => <LogRow key={log.id} log={log} compact />)}
                      {logs.filter(l => l.severity !== 'info').length === 0 && (
                        <p className="text-muted small text-center py-4 mb-0">No alerts — all clear ✓</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="card p-4 mb-5">
                <h3 className="fw-bold mb-4 d-flex align-items-center gap-2" style={{ fontSize: '1.05rem' }}><Shield size={18} className="text-danger" /> Account Status Summary</h3>
                <div className="row g-3 text-center">
                  {[
                    { label: 'Active', count: activeUsers, color: '#4ade80', bg: 'rgba(34,197,94,0.1)', icon: CheckCircle },
                    { label: 'Frozen', count: frozenUsers, color: '#fbbf24', bg: 'rgba(234,179,8,0.1)', icon: Lock },
                    { label: 'Deleted', count: users.filter(u => u.accountStatus === 'deleted').length, color: '#f87171', bg: 'rgba(239,68,68,0.1)', icon: Trash2 },
                  ].map(s => (
                    <div key={s.label} className="col-4">
                      <div className="rounded-xl p-3" style={{ background: s.bg }}>
                        <s.icon size={24} style={{ color: s.color }} className="mx-auto mb-2 d-block" />
                        <p className="fw-bolder mb-0" style={{ fontSize: '1.5rem', color: s.color }}>{s.count}</p>
                        <p className="small text-muted mb-0">{s.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card p-4">
                <div className="d-flex align-items-center justify-content-between mb-4">
                  <h3 className="fw-bold mb-0 d-flex align-items-center gap-2" style={{ fontSize: '1.05rem' }}><Navigation size={18} style={{ color: '#4ade80' }} /> Recent Rides</h3>
                  <button onClick={() => setTab('rides')} className="btn btn-sm btn-secondary text-brand fw-semibold">View all →</button>
                </div>
                <div className="overflow-x-auto"><RideTable rides={rides.slice(0, 6)} users={users} compact /></div>
              </div>
            </div>
          )}

          {/* VERIFICATIONS */}
          {tab === 'verifications' && (
            <div className="animate-fade-in" style={{ maxWidth: 900 }}>
              <div className="mb-4 pb-3" style={{ borderBottom: '1px solid var(--eg-700)' }}>
                <h1 className="fw-bold mb-1 d-flex align-items-center gap-2" style={{ fontSize: '1.75rem', letterSpacing: '-0.01em' }}>
                  <FileCheck size={24} style={{ color: '#fbbf24' }} /> Verifications
                </h1>
                <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>Review driver and corporate KYC applications</p>
              </div>
              <div className="row g-3 mb-5">
                {[
                  { label: 'Pending Applications', value: pendingVerifications.length, color: '#fbbf24', bg: 'rgba(234,179,8,0.1)' },
                  { label: 'Approved Accounts', value: users.filter(u => u.verification?.status === 'approved').length, color: '#4ade80', bg: 'rgba(34,197,94,0.1)' },
                  { label: 'Rejected', value: users.filter(u => u.verification?.status === 'rejected').length, color: '#f87171', bg: 'rgba(239,68,68,0.1)' },
                ].map(s => (
                  <div key={s.label} className="col-sm-4">
                    <div className="card p-4 text-center" style={{ background: s.bg }}>
                      <p className="fw-bolder mb-1" style={{ fontSize: '1.9rem', lineHeight: 1.1, color: s.color }}>{s.value}</p>
                      <p className="fw-semibold mb-0" style={{ fontSize: '0.9rem', color: s.color }}>{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mb-4">
                <h3 className="fw-bold mb-3 d-flex align-items-center gap-2" style={{ fontSize: '1.05rem' }}>
                  <Clock size={18} className="text-warning" /> Pending Applications
                  {pendingVerifications.length > 0 && (
                    <span className="d-flex align-items-center justify-content-center rounded-circle text-dark fw-bold ms-1"
                      style={{ width: 24, height: 24, background: '#eab308', fontSize: '0.72rem' }}>{pendingVerifications.length}</span>
                  )}
                </h3>
                {pendingVerifications.length === 0 ? (
                  <div className="card text-center py-5 text-muted" style={{ border: '1px solid var(--eg-600)' }}>
                    <CheckCircle size={40} className="mx-auto mb-3 text-brand opacity-50" />
                    <p className="mb-0">No pending applications — all clear!</p>
                  </div>
                ) : (
                  <div className="d-flex flex-column gap-3">
                    {pendingVerifications.map(u => (
                      <div key={u.id} className="card p-3" style={{ border: '1px solid rgba(234,179,8,0.2)', cursor: 'pointer' }}
                        onClick={() => setSelectedVerifUser(u)}>
                        <div className="d-flex align-items-center justify-content-between gap-3">
                          <div className="d-flex align-items-center gap-3 overflow-hidden">
                            <div className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0 fw-bold"
                              style={{ width: 44, height: 44, background: 'rgba(234,179,8,0.2)', color: '#fbbf24', fontSize: '1.1rem' }}>
                              {(u.fullName || u.name || '?')[0]}
                            </div>
                            <div className="overflow-hidden">
                              <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
                                <p className="fw-semibold mb-0">{u.fullName || u.name}</p>
                                <span className="badge-warn text-capitalize">{u.role}</span>
                                {u.role === 'driver' && u.driverDocuments && <span className="badge-info-soft">{u.driverDocuments.licenceClass}</span>}
                                {u.role === 'corporate' && u.corporateProfile && <span className="badge-info-soft">{u.corporateProfile.companyName}</span>}
                              </div>
                              <div className="text-xs text-muted d-flex flex-wrap gap-3">
                                <span>{u.phone}</span>
                                {u.verification?.submittedAt && <span>Submitted {new Date(u.verification.submittedAt).toLocaleDateString()}</span>}
                                {u.role === 'driver' && u.vehicleDetails && <span>🚗 {u.vehicleDetails.registration} · {u.vehicleDetails.make} {u.vehicleDetails.model}</span>}
                              </div>
                            </div>
                          </div>
                          <button onClick={e => { e.stopPropagation(); setSelectedVerifUser(u) }}
                            className="btn btn-secondary btn-sm d-flex align-items-center gap-1 flex-shrink-0">
                            <Eye size={13} /> Review <ChevronRight size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {(() => {
                const driversWithAlerts = users.filter(u => u.role === 'driver' && u.verification?.status === 'approved' && (u.verification.documentAlerts?.length ?? 0) > 0)
                if (driversWithAlerts.length === 0) return null
                return (
                  <div>
                    <h3 className="fw-semibold small mb-3 d-flex align-items-center gap-2"><AlertTriangle size={15} className="text-danger" /> Document Expiry Alerts</h3>
                    <div className="card overflow-x-auto">
                      <table className="table table-hover small mb-0" style={{ minWidth: 560 }}>
                        <thead><tr>{['Driver', 'Document', 'Expiry Date', 'Status'].map(h => <th key={h}>{h}</th>)}</tr></thead>
                        <tbody>
                          {driversWithAlerts.flatMap(u => (u.verification!.documentAlerts || []).map(alert => (
                            <tr key={`${u.id}-${alert.docType}`}>
                              <td className="fw-medium">{u.fullName || u.name}</td>
                              <td className="text-capitalize">{alert.docType.replace(/([A-Z])/g, ' $1').trim()}</td>
                              <td className="text-muted">{alert.expiryDate}</td>
                              <td>
                                <span className="text-xs px-2 py-1 rounded-pill fw-medium" style={{
                                  background: alert.isExpired ? 'rgba(239,68,68,0.2)' : alert.daysUntilExpiry <= 14 ? 'rgba(249,115,22,0.2)' : 'rgba(234,179,8,0.2)',
                                  color: alert.isExpired ? '#f87171' : alert.daysUntilExpiry <= 14 ? '#fb923c' : '#fbbf24',
                                }}>
                                  {alert.isExpired ? 'EXPIRED' : `${alert.daysUntilExpiry}d left`}
                                </span>
                              </td>
                            </tr>
                          )))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* USERS */}
          {tab === 'users' && (
            <div className="animate-fade-in" style={{ maxWidth: 1100 }}>
              <div className="mb-4 pb-3" style={{ borderBottom: '1px solid var(--eg-700)' }}>
                <h1 className="fw-bold mb-1 d-flex align-items-center gap-2" style={{ fontSize: '1.75rem', letterSpacing: '-0.01em' }}>
                  <Users size={24} style={{ color: '#60a5fa' }} /> Users
                </h1>
                <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>
                  {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''} shown · search, filter and manage account status
                </p>
              </div>
              <div className="d-flex flex-column flex-sm-row gap-3 mb-4">
                <div className="input-group flex-grow-1">
                  <span className="input-group-text"><Search size={15} /></span>
                  <input className="form-control" placeholder="Search by name, email or phone..."
                    value={searchQuery} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="d-flex gap-2">
                  <select className="form-select" style={{ width: 140 }} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                    <option value="all">All Roles</option>
                    <option value="rider">Private</option>
                    <option value="corporate">Corporate</option>
                    <option value="driver">Driver</option>
                  </select>
                  <select className="form-select" style={{ width: 140 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="frozen">Frozen</option>
                    <option value="deleted">Deleted</option>
                  </select>
                </div>
              </div>
              <div className="d-flex flex-column gap-3">
                {filteredUsers.map(u => (
                  <UserCard key={u.id} user={u}
                    onView={() => setSelectedUser(u)}
                    onFreeze={() => { setSelectedUser(u); setConfirmAction({ type: 'freeze', userId: u.id, userName: u.fullName || u.name || u.id }) }}
                    onUnfreeze={() => setConfirmAction({ type: 'unfreeze', userId: u.id, userName: u.fullName || u.name || u.id })}
                    onDelete={() => setConfirmAction({ type: 'delete', userId: u.id, userName: u.fullName || u.name || u.id })} />
                ))}
                {filteredUsers.length === 0 && <div className="card text-center py-5 text-muted">No users match your filters</div>}
              </div>
            </div>
          )}

          {/* RIDES */}
          {tab === 'rides' && (
            <div className="animate-fade-in" style={{ maxWidth: 1100 }}>
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4 pb-3" style={{ borderBottom: '1px solid var(--eg-700)' }}>
                <div>
                  <h1 className="fw-bold mb-1 d-flex align-items-center gap-2" style={{ fontSize: '1.75rem', letterSpacing: '-0.01em' }}>
                    <Navigation size={24} style={{ color: '#4ade80' }} /> Rides
                  </h1>
                  <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>
                    {rides.length} total · {rides.filter(r => r.status === 'completed').length} completed · {activeRides} active
                  </p>
                </div>
                <div className="btn-group" role="group">
                  <button
                    onClick={() => exportAdminRides(rides, users)}
                    className="btn btn-success d-flex align-items-center gap-2 fw-semibold"
                    title="Rides as Excel"
                  >
                    <FileSpreadsheet size={16} /> Excel
                  </button>
                  <button
                    onClick={() => exportRidesPdf(rides, users)}
                    className="btn btn-danger d-flex align-items-center gap-2 fw-semibold"
                    title="Rides as PDF"
                  >
                    <FileTextIcon size={16} /> PDF
                  </button>
                </div>
              </div>
              <div className="input-group mb-3" style={{ maxWidth: 400 }}>
                <span className="input-group-text"><Search size={15} /></span>
                <input
                  className="form-control"
                  placeholder="Search rides..."
                  value={ridesSearch}
                  onChange={e => setRidesSearch(e.target.value)}
                />
              </div>
              <div className="card overflow-x-auto"><RideTable rides={rides.filter(r => {
                const q = ridesSearch.toLowerCase()
                return !q || (r.pickupAddress || '').toLowerCase().includes(q) || (r.dropoffAddress || '').toLowerCase().includes(q) || (r.id || '').toLowerCase().includes(q)
              })} users={users} /></div>
            </div>
          )}

          {/* VOUCHERS */}
          {tab === 'vouchers' && (
            <div className="animate-fade-in" style={{ maxWidth: 1100 }}>
              <div className="mb-4 pb-3" style={{ borderBottom: '1px solid var(--eg-700)' }}>
                <h1 className="fw-bold mb-1 d-flex align-items-center gap-2" style={{ fontSize: '1.75rem', letterSpacing: '-0.01em' }}>
                  <FileText size={24} style={{ color: '#4ade80' }} /> Vouchers
                </h1>
                <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>Corporate ride vouchers awaiting verification</p>
              </div>
              <div className="row g-3 mb-5">
                {[
                  { label: 'Total Vouchers', value: vouchers.length, color: '#60a5fa', bg: 'rgba(59,130,246,0.08)' },
                  { label: 'Pending Review',  value: vouchers.filter(v => v.status === 'pending').length, color: '#fbbf24', bg: 'rgba(234,179,8,0.08)' },
                  { label: 'Used',            value: vouchers.filter(v => v.status === 'used').length, color: '#4ade80', bg: 'rgba(34,197,94,0.08)' },
                ].map(s => (
                  <div key={s.label} className="col-sm-4">
                    <div className="card p-4 text-center" style={{ background: s.bg }}>
                      <p className="fw-bolder mb-1" style={{ fontSize: '1.9rem', lineHeight: 1.1, color: s.color }}>{s.value}</p>
                      <p className="fw-semibold mb-0" style={{ fontSize: '0.9rem', color: s.color }}>{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="d-flex flex-column gap-3">
                {vouchers.map(v => (
                  <div key={v.id} className="card p-3">
                    <div className="d-flex align-items-start gap-3">
                      <div className="d-flex align-items-center justify-content-center rounded-xl flex-shrink-0"
                        style={{ width: 48, height: 48, background: 'rgba(34,197,94,0.1)' }}>
                        <FileText size={22} className="text-brand" />
                      </div>
                      <div className="flex-grow-1 overflow-hidden">
                        <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                          <p className="fw-bold mb-0">Voucher #{v.voucherNo}</p>
                          <span className={v.status === 'used' ? 'badge-brand' : v.status === 'cancelled' ? 'badge-danger-soft' : 'badge-warn'}>{v.status}</span>
                          <span className="badge-info-soft">{v.department}</span>
                        </div>
                        <div className="row g-1 text-xs text-muted">
                          <div className="col-6 col-sm-3"><span className="text-secondary">Date:</span> {v.date}</div>
                          <div className="col-6 col-sm-3"><span className="text-secondary">From:</span> {v.pickUpPoint}</div>
                          <div className="col-6 col-sm-3"><span className="text-secondary">To:</span> {v.dropOffPoint}</div>
                          <div className="col-6 col-sm-3"><span className="text-secondary">Value:</span> <span className="text-brand fw-bold">${v.totalValue}</span></div>
                          <div className="col-6 col-sm-3"><span className="text-secondary">Employee:</span> {v.employeeNames}</div>
                          <div className="col-6 col-sm-3"><span className="text-secondary">Cab:</span> {v.cabNo}</div>
                          <div className="col-6 col-sm-3"><span className="text-secondary">Driver:</span> {v.driverName}</div>
                          <div className="col-6 col-sm-3"><span className="text-secondary">Mileage:</span> {v.totalMileage} km</div>
                        </div>
                      </div>
                      <div className="d-flex flex-column gap-2 flex-shrink-0">
                        {v.status === 'pending' && (
                          <>
                            <button onClick={async () => {
                              try {
                                await api.patch(`/admin/vouchers/${v.id}`, { status: 'used' })
                                setVouchers(prev => prev.map(x => x.id === v.id ? { ...x, status: 'used' } : x))
                                addLog({ type: 'voucher', severity: 'info', description: `Voucher #${v.voucherNo} verified by admin` })
                              } catch { addLog({ type: 'system', severity: 'critical', description: `Failed to verify voucher #${v.voucherNo}` }) }
                            }} className="btn btn-primary btn-sm d-flex align-items-center gap-1">
                              <CheckCircle size={13} /> Verify
                            </button>
                            <button onClick={async () => {
                              try {
                                await api.patch(`/admin/vouchers/${v.id}`, { status: 'cancelled' })
                                setVouchers(prev => prev.map(x => x.id === v.id ? { ...x, status: 'cancelled' } : x))
                                addLog({ type: 'voucher', severity: 'warning', description: `Voucher #${v.voucherNo} cancelled by admin` })
                              } catch { addLog({ type: 'system', severity: 'critical', description: `Failed to cancel voucher #${v.voucherNo}` }) }
                            }} className="btn btn-sm d-flex align-items-center gap-1" style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#f87171', background: 'transparent' }}>
                              <Ban size={13} /> Cancel
                            </button>
                          </>
                        )}
                        {v.status !== 'pending' && <span className="text-xs text-muted text-center">No actions</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ACTIVITY LOG */}
          {tab === 'cashouts' && (
            <div className="animate-fade-in" style={{ maxWidth: 900 }}>
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4 pb-3" style={{ borderBottom: '1px solid var(--eg-700)' }}>
                <div>
                  <h1 className="fw-bold mb-1 d-flex align-items-center gap-2" style={{ fontSize: '1.75rem', letterSpacing: '-0.01em' }}>
                    <Banknote size={24} style={{ color: '#60a5fa' }} /> Driver Cashouts
                  </h1>
                  <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>Review and process driver payout requests</p>
                </div>
                <div className="d-flex gap-2 flex-wrap">
                  {(['pending','approved','paid','rejected'] as const).map(s => {
                    const n = payouts.filter(p => p.status === s).length
                    const colors: Record<string, string> = { pending: '#fbbf24', approved: '#4ade80', paid: '#60a5fa', rejected: '#f87171' }
                    return n > 0 ? (
                      <span key={s} className="badge rounded-pill px-3 py-2 text-capitalize fw-semibold"
                        style={{ background: `${colors[s]}22`, color: colors[s], border: `1px solid ${colors[s]}44`, fontSize: '0.75rem' }}>
                        {n} {s}
                      </span>
                    ) : null
                  })}
                </div>
              </div>
              {payouts.length === 0 ? (
                <div className="card p-5 text-center text-muted">
                  <Banknote size={48} className="mx-auto mb-3 opacity-40" />
                  <p className="mb-0">No cashout requests yet</p>
                </div>
              ) : (
                <div className="d-flex flex-column gap-3">
                  {payouts.map(p => {
                    const statusColor: Record<string, string> = { pending: '#fbbf24', approved: '#4ade80', paid: '#60a5fa', rejected: '#f87171' }
                    const isPending = p.status === 'pending'
                    return (
                      <div key={p.id} className="card p-4">
                        <div className="d-flex align-items-start justify-content-between gap-3 flex-wrap">
                          <div className="flex-grow-1">
                            <div className="d-flex align-items-center gap-2 mb-1">
                              <span className="fw-semibold">{p.driverName}</span>
                              <span className="badge rounded-pill text-xs text-capitalize"
                                style={{ background: `${statusColor[p.status]}22`, color: statusColor[p.status], border: `1px solid ${statusColor[p.status]}44` }}>
                                {p.status}
                              </span>
                            </div>
                            <p className="text-muted text-xs mb-1">
                              {p.method === 'ecocash' ? '📱 EcoCash' : '🏦 Bank'} · {p.phone}
                              {p.driverPhone && ` · ${p.driverPhone}`}
                            </p>
                            <p className="text-muted text-xs mb-0">
                              Requested {new Date(p.requestedAt).toLocaleString()}
                              {p.processedAt && ` · Processed ${new Date(p.processedAt).toLocaleString()}`}
                            </p>
                            {p.rejectionReason && (
                              <p className="text-xs mt-1 mb-0" style={{ color: '#f87171' }}>Reason: {p.rejectionReason}</p>
                            )}
                          </div>
                          <div className="text-end flex-shrink-0">
                            <p className="fs-5 fw-bold mb-0" style={{ color: '#60a5fa' }}>${p.amount.toFixed(2)}</p>
                            {isPending && (
                              <div className="d-flex gap-2 mt-2">
                                <button
                                  disabled={cashoutProcessing === p.id}
                                  onClick={async () => {
                                    setCashoutProcessing(p.id)
                                    try {
                                      const res = await api.patch(`/admin/cashouts/${p.id}`, { status: 'approved' })
                                      setPayouts(prev => prev.map(x => x.id === p.id ? res.data : x))
                                    } catch { /* noop */ } finally { setCashoutProcessing(null) }
                                  }}
                                  className="btn btn-sm d-flex align-items-center gap-1 fw-semibold"
                                  style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)', fontSize: '0.75rem' }}
                                >
                                  {cashoutProcessing === p.id ? <Loader size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                                  Approve
                                </button>
                                <button
                                  disabled={cashoutProcessing === p.id}
                                  onClick={async () => {
                                    const reason = window.prompt('Rejection reason (optional):') ?? ''
                                    setCashoutProcessing(p.id)
                                    try {
                                      const res = await api.patch(`/admin/cashouts/${p.id}`, { status: 'rejected', rejectionReason: reason })
                                      setPayouts(prev => prev.map(x => x.id === p.id ? res.data : x))
                                    } catch { /* noop */ } finally { setCashoutProcessing(null) }
                                  }}
                                  className="btn btn-sm d-flex align-items-center gap-1 fw-semibold"
                                  style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', fontSize: '0.75rem' }}
                                >
                                  <XCircle size={12} /> Reject
                                </button>
                              </div>
                            )}
                            {p.status === 'approved' && (
                              <button
                                disabled={cashoutProcessing === p.id}
                                onClick={async () => {
                                  setCashoutProcessing(p.id)
                                  try {
                                    const res = await api.patch(`/admin/cashouts/${p.id}`, { status: 'paid' })
                                    setPayouts(prev => prev.map(x => x.id === p.id ? res.data : x))
                                  } catch { /* noop */ } finally { setCashoutProcessing(null) }
                                }}
                                className="btn btn-sm mt-2 d-flex align-items-center gap-1 fw-semibold"
                                style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)', fontSize: '0.75rem' }}
                              >
                                {cashoutProcessing === p.id ? <Loader size={12} className="animate-spin" /> : <DollarSign size={12} />}
                                Mark Paid
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ─── WALLETS TAB ─────────────────────────────────────── */}
          {tab === 'wallets' && (
            <div className="animate-fade-in" style={{ maxWidth: 900 }}>
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4 pb-3" style={{ borderBottom: '1px solid var(--eg-700)' }}>
                <div>
                  <h1 className="fw-bold mb-1 d-flex align-items-center gap-2" style={{ fontSize: '1.75rem', letterSpacing: '-0.01em' }}>
                    <Wallet size={24} style={{ color: '#60a5fa' }} /> Driver Wallets
                  </h1>
                  <p className="text-muted small mb-0">{wallets.length} wallet{wallets.length !== 1 ? 's' : ''} · credit / debit, review ledger, confirm bank deposits</p>
                </div>
                <button onClick={fetchWallets} disabled={walletsLoading}
                        className="btn btn-secondary btn-sm d-flex align-items-center gap-2">
                  {walletsLoading ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Refresh
                </button>
              </div>

              <div className="input-group mb-3">
                <span className="input-group-text"
                      style={{ background: 'var(--eg-700)', color: '#9ca3af', border: '1px solid var(--eg-600)' }}>
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  placeholder="Search by name or phone..."
                  value={walletSearch}
                  onChange={e => setWalletSearch(e.target.value)}
                  className="form-control"
                />
              </div>

              {walletsLoading ? (
                <div className="text-center py-5"><Loader size={24} className="animate-spin text-muted" /></div>
              ) : wallets.length === 0 ? (
                <div className="card p-5 text-center" style={{ border: '2px dashed var(--eg-600)' }}>
                  <Wallet size={40} className="text-muted mx-auto mb-3" />
                  <p className="text-muted mb-0">No driver wallets yet. They're created on first top-up or ride commission.</p>
                </div>
              ) : (
                <div className="d-flex flex-column gap-2">
                  {wallets
                    .filter(w => !walletSearch.trim() || w.driverName.toLowerCase().includes(walletSearch.toLowerCase()) || w.phone.includes(walletSearch))
                    .map(w => (
                      <div key={w.driverId}
                           onClick={() => openWalletDetail(w.driverId)}
                           className="card p-3 d-flex align-items-center gap-3"
                           style={{ cursor: 'pointer', borderColor: w.balance < 1 ? 'rgba(239,68,68,0.4)' : 'var(--eg-600)' }}>
                        <div className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 fw-bold"
                             style={{ width: 40, height: 40, background: 'rgba(96,165,250,0.15)', color: '#60a5fa' }}>
                          {w.driverName[0]?.toUpperCase() || 'D'}
                        </div>
                        <div className="flex-grow-1 overflow-hidden">
                          <p className="fw-semibold mb-0 text-truncate">{w.driverName}</p>
                          <p className="text-xs text-muted mb-0">{w.phone}</p>
                        </div>
                        <div className="text-end flex-shrink-0">
                          <p className="fw-bold mb-0" style={{ fontSize: '1.05rem' }}>${w.balance.toFixed(2)}</p>
                          {w.heldBalance > 0 && (
                            <p className="text-xs text-muted mb-0">+${w.heldBalance.toFixed(2)} held</p>
                          )}
                        </div>
                        {w.balance < 1 && (
                          <span className="badge rounded-pill" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                            Low
                          </span>
                        )}
                        <ChevronRight size={16} className="text-muted flex-shrink-0" />
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {tab === 'activity' && (
            <div className="animate-fade-in" style={{ maxWidth: 900 }}>
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4 pb-3" style={{ borderBottom: '1px solid var(--eg-700)' }}>
                <div>
                  <h1 className="fw-bold mb-1 d-flex align-items-center gap-2" style={{ fontSize: '1.75rem', letterSpacing: '-0.01em' }}>
                    <Activity size={24} style={{ color: '#f87171' }} /> Activity Log
                  </h1>
                  <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>
                    {logs.length} total entries · {logs.filter(l => l.severity === 'critical').length} critical · {logs.filter(l => l.severity === 'warning').length} warnings
                  </p>
                </div>
                <button onClick={() => {
                  const csv = ['Timestamp,Severity,Type,Description,User'].concat(logs.map(l => `"${l.timestamp}","${l.severity}","${l.type}","${l.description}","${l.userName || ''}"`)).join('\n')
                  const blob = new Blob([csv], { type: 'text/csv' }); const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob); a.download = 'easyride-activity-log.csv'; a.click()
                }} className="btn btn-success d-flex align-items-center gap-2 fw-semibold">
                  <Download size={16} /> Export CSV
                </button>
              </div>
              <div className="d-flex gap-2 flex-wrap mb-3">
                {(['all', 'critical', 'warning', 'info'] as const).map(s => {
                  const count = s === 'all' ? logs.length : logs.filter(l => l.severity === s).length
                  const isActive = logFilter === s
                  const tint = s === 'critical' ? '#f87171' : s === 'warning' ? '#fbbf24' : s === 'info' ? '#60a5fa' : '#9ca3af'
                  return (
                    <button key={s} onClick={() => setLogFilter(s)}
                      className="btn btn-sm d-flex align-items-center gap-2 fw-semibold text-capitalize"
                      style={{
                        background: isActive ? `${tint}22` : 'var(--eg-700)',
                        color:      isActive ? tint : '#9ca3af',
                        border:     `1px solid ${isActive ? `${tint}66` : 'transparent'}`,
                        borderRadius: '0.65rem',
                        padding: '0.4rem 0.9rem',
                      }}>
                      {s}
                      <span className="badge rounded-pill" style={{ background: isActive ? tint : 'var(--eg-600)', color: isActive ? '#111' : '#d1d5db', fontSize: '0.68rem' }}>
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="card p-3">
                {logs.filter(l => logFilter === 'all' || l.severity === logFilter).map(log => <LogRow key={log.id} log={log} />)}
                {logs.filter(l => logFilter === 'all' || l.severity === logFilter).length === 0 && (
                  <p className="text-center text-muted py-5 mb-0">No {logFilter !== 'all' ? logFilter : ''} activity logged yet</p>
                )}
              </div>
            </div>
          )}

          {/* PROMO CODES */}
          {tab === 'promos' && (
            <div className="animate-fade-in" style={{ maxWidth: 900 }}>
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4 pb-3" style={{ borderBottom: '1px solid var(--eg-700)' }}>
                <div>
                  <h1 className="fw-bold mb-1 d-flex align-items-center gap-2" style={{ fontSize: '1.75rem', letterSpacing: '-0.01em' }}>
                    <Tag size={24} style={{ color: '#fbbf24' }} /> Promo Codes
                  </h1>
                  <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>
                    {promos.length} code{promos.length !== 1 ? 's' : ''} created · {promos.filter(p => p.active).length} active
                  </p>
                </div>
                <button onClick={() => { setEditingPromo(null); setPromoForm({ code: '', type: 'percent', value: 10, description: '', active: true, maxUses: null, minFare: 0 }); setPromoError(null); setShowPromoForm(true) }}
                  className="btn btn-primary d-flex align-items-center gap-2 fw-semibold">
                  <Plus size={16} /> New Code
                </button>
              </div>

              {/* Create / Edit form */}
              {showPromoForm && (
                <div className="card p-4 mb-4" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
                  <h6 className="fw-semibold mb-3">{editingPromo ? 'Edit Promo Code' : 'Create Promo Code'}</h6>
                  <div className="row g-3">
                    <div className="col-12 col-sm-4">
                      <label className="form-label text-xs">Code</label>
                      <input className="form-control" placeholder="e.g. WELCOME20"
                        value={promoForm.code || ''} onChange={e => setPromoForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                        style={{ textTransform: 'uppercase' }} disabled={!!editingPromo}
                      />
                    </div>
                    <div className="col-6 col-sm-2">
                      <label className="form-label text-xs">Type</label>
                      <select className="form-select" value={promoForm.type}
                        onChange={e => setPromoForm(f => ({ ...f, type: e.target.value as 'percent' | 'fixed' }))}>
                        <option value="percent">Percent %</option>
                        <option value="fixed">Fixed $</option>
                      </select>
                    </div>
                    <div className="col-6 col-sm-2">
                      <label className="form-label text-xs">Value</label>
                      <input className="form-control" type="number" min="0"
                        value={promoForm.value ?? ''} onChange={e => setPromoForm(f => ({ ...f, value: +e.target.value }))}
                      />
                    </div>
                    <div className="col-6 col-sm-2">
                      <label className="form-label text-xs">Max Uses</label>
                      <input className="form-control" type="number" min="0" placeholder="Unlimited"
                        value={promoForm.maxUses ?? ''} onChange={e => setPromoForm(f => ({ ...f, maxUses: e.target.value ? +e.target.value : null }))}
                      />
                    </div>
                    <div className="col-6 col-sm-2">
                      <label className="form-label text-xs">Min Fare $</label>
                      <input className="form-control" type="number" min="0"
                        value={promoForm.minFare ?? 0} onChange={e => setPromoForm(f => ({ ...f, minFare: +e.target.value }))}
                      />
                    </div>
                    <div className="col-12 col-sm-4">
                      <label className="form-label text-xs">Expires At</label>
                      <input className="form-control" type="date"
                        value={promoForm.expiresAt ? promoForm.expiresAt.slice(0, 10) : ''}
                        onChange={e => setPromoForm(f => ({ ...f, expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                      />
                    </div>
                    <div className="col-12 col-sm-8">
                      <label className="form-label text-xs">Description</label>
                      <input className="form-control" placeholder="e.g. Welcome discount for new users"
                        value={promoForm.description || ''} onChange={e => setPromoForm(f => ({ ...f, description: e.target.value }))}
                      />
                    </div>
                  </div>
                  {promoError && <p className="text-danger small mt-3 mb-0">{promoError}</p>}
                  <div className="d-flex gap-2 mt-3">
                    <button type="button" disabled={promoSaving}
                      onClick={async () => {
                        if (!promoForm.code?.trim() || !promoForm.value) return
                        setPromoSaving(true); setPromoError(null)
                        try {
                          if (editingPromo) {
                            const res = await api.patch(`/admin/promos/${editingPromo.id}`, promoForm)
                            setPromos(p => p.map(x => x.id === editingPromo.id ? res.data : x))
                          } else {
                            const res = await api.post('/admin/promos', promoForm)
                            setPromos(p => [res.data, ...p])
                          }
                          setShowPromoForm(false); setEditingPromo(null)
                        } catch (err) { setPromoError(err instanceof Error ? err.message : 'Failed to save promo code') }
                        finally { setPromoSaving(false) }
                      }}
                      className="btn btn-primary text-xs d-flex align-items-center gap-1">
                      {promoSaving ? 'Saving…' : editingPromo ? 'Save Changes' : 'Create Code'}
                    </button>
                    <button type="button" onClick={() => { setShowPromoForm(false); setEditingPromo(null); setPromoError(null) }}
                      className="btn btn-secondary text-xs">Cancel</button>
                  </div>
                </div>
              )}

              {/* Promo table */}
              {promos.length === 0 ? (
                <div className="card p-5 text-center text-muted">
                  <Tag size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="mb-0">No promo codes yet. Create your first one above.</p>
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <div className="table-responsive">
                    <table className="table table-dark table-sm mb-0 text-xs">
                      <thead style={{ background: 'var(--eg-700)' }}>
                        <tr>
                          <th className="ps-3 py-2">Code</th>
                          <th>Discount</th>
                          <th>Uses</th>
                          <th>Min Fare</th>
                          <th>Expires</th>
                          <th>Status</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {promos.map(p => (
                          <tr key={p.id} style={{ borderColor: 'var(--eg-700)' }}>
                            <td className="ps-3 py-2 fw-semibold text-white" style={{ letterSpacing: '0.05em' }}>{p.code}</td>
                            <td className="text-brand fw-bold">
                              {p.type === 'percent' ? `${p.value}%` : `$${p.value}`}
                              {p.description && <span className="text-muted fw-normal ms-1">({p.description})</span>}
                            </td>
                            <td>{p.usesCount}{p.maxUses ? ` / ${p.maxUses}` : ''}</td>
                            <td>{p.minFare ? `$${p.minFare}` : '—'}</td>
                            <td>{p.expiresAt ? new Date(p.expiresAt).toLocaleDateString() : '—'}</td>
                            <td>
                              <button onClick={async () => {
                                const res = await api.patch(`/admin/promos/${p.id}`, { active: !p.active }).catch(() => null)
                                if (res) setPromos(prev => prev.map(x => x.id === p.id ? res.data : x))
                              }} className="btn p-0 border-0" style={{ background: 'transparent' }}>
                                {p.active
                                  ? <span className="badge" style={{ background: 'rgba(34,197,94,0.2)', color: '#4ade80' }}>Active</span>
                                  : <span className="badge" style={{ background: 'rgba(107,114,128,0.2)', color: '#9ca3af' }}>Inactive</span>
                                }
                              </button>
                            </td>
                            <td className="pe-3">
                              <div className="d-flex gap-1">
                                <button onClick={() => { setEditingPromo(p); setPromoForm({ ...p }); setPromoError(null); setShowPromoForm(true) }}
                                  className="btn btn-secondary btn-sm p-1 text-xs"><Eye size={12} /></button>
                                <button onClick={async () => {
                                  if (!confirm(`Delete promo code ${p.code}?`)) return
                                  await api.delete(`/admin/promos/${p.id}`).catch(() => {})
                                  setPromos(prev => prev.filter(x => x.id !== p.id))
                                }} className="btn btn-sm p-1 text-xs" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PRICING */}
          {tab === 'pricing' && (
            <div className="animate-fade-in" style={{ maxWidth: 900 }}>
              <div className="mb-4 pb-3" style={{ borderBottom: '1px solid var(--eg-700)' }}>
                <h1 className="fw-bold mb-1 d-flex align-items-center gap-2" style={{ fontSize: '1.75rem', letterSpacing: '-0.01em' }}>
                  <Zap size={24} style={{ color: '#fbbf24' }} /> Pricing Control
                </h1>
                <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>
                  Separate petrol and diesel prices. Economy &amp; Comfort rides use petrol; SUV &amp; Tow Truck use diesel.
                </p>
              </div>

              {/* Dual fuel cards */}
              <div className="row g-3 mb-4">
                {([
                  { key: 'petrol', title: 'Petrol',  tint: '#fbbf24', input: petrolInput, setInput: setPetrolInput, data: fuelData.petrol, used: 'Economy, Comfort' },
                  { key: 'diesel', title: 'Diesel',  tint: '#60a5fa', input: dieselInput, setInput: setDieselInput, data: fuelData.diesel, used: 'SUV, Tow Truck' },
                ] as const).map(fuel => (
                  <div key={fuel.key} className="col-md-6">
                    <div className="card p-4 h-100">
                      <h3 className="fw-semibold small mb-1 d-flex align-items-center gap-2">
                        <Zap size={15} style={{ color: fuel.tint }} /> {fuel.title}
                      </h3>
                      <p className="text-muted text-xs mb-3">Used by: <span className="text-white">{fuel.used}</span></p>

                      <div className="row g-2 mb-3">
                        <div className="col-4">
                          <div className="rounded-xl p-2 text-center" style={{ background: 'var(--eg-700)' }}>
                            <p className="fw-bold mb-1 small" style={{ color: fuel.tint }}>${fuel.data.price.toFixed(2)}</p>
                            <p className="text-xs text-muted mb-0">Current</p>
                          </div>
                        </div>
                        <div className="col-4">
                          <div className="rounded-xl p-2 text-center" style={{ background: 'var(--eg-700)' }}>
                            <p className="fw-bold mb-1 small text-muted">${fuel.data.base.toFixed(2)}</p>
                            <p className="text-xs text-muted mb-0">Base</p>
                          </div>
                        </div>
                        <div className="col-4">
                          <div className="rounded-xl p-2 text-center" style={{ background: 'var(--eg-700)' }}>
                            <p className="fw-bold mb-1 small" style={{ color: fuel.data.multiplier > 1 ? '#f87171' : fuel.data.multiplier < 1 ? '#4ade80' : '#9ca3af' }}>
                              {fuel.data.multiplier.toFixed(3)}×
                            </p>
                            <p className="text-xs text-muted mb-0">Multiplier</p>
                          </div>
                        </div>
                      </div>

                      <label className="form-label text-xs fw-semibold">New price (USD/litre)</label>
                      <div className="input-group">
                        <span className="input-group-text fw-bold">$</span>
                        <input
                          type="number" step="0.01" min="0.10" max="10"
                          className="form-control"
                          value={fuel.input}
                          onChange={e => { fuel.setInput(e.target.value); setFuelPriceError(null); setFuelPriceSuccess(false) }}
                        />
                        <span className="input-group-text text-muted">/L</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Combined save button */}
              <div className="card p-4 mb-4 d-flex flex-row align-items-center justify-content-between gap-3 flex-wrap">
                <div>
                  <p className="fw-semibold mb-1 small">Apply changes</p>
                  <p className="text-xs text-muted mb-0">Updates both petrol and diesel in one request. Only new ride estimates are affected.</p>
                </div>
                <button
                  className="btn btn-warning fw-semibold text-dark d-flex align-items-center gap-2"
                  disabled={fuelPriceSaving || !petrolInput || !dieselInput || parseFloat(petrolInput) <= 0 || parseFloat(dieselInput) <= 0}
                  onClick={async () => {
                    const petrolVal = parseFloat(petrolInput)
                    const dieselVal = parseFloat(dieselInput)
                    if (!petrolVal || petrolVal <= 0 || !dieselVal || dieselVal <= 0) {
                      setFuelPriceError('Enter valid positive prices for both fuels'); return
                    }
                    setFuelPriceSaving(true); setFuelPriceError(null); setFuelPriceSuccess(false)
                    try {
                      const res = await api.patch('/admin/fuel-price', { petrolPrice: petrolVal, dieselPrice: dieselVal })
                      setFuelData({ petrol: res.data.petrol, diesel: res.data.diesel })
                      setPetrolInput(String(res.data.petrol.price))
                      setDieselInput(String(res.data.diesel.price))
                      setFuelPriceSuccess(true)
                      setTimeout(() => setFuelPriceSuccess(false), 3000)
                    } catch (err) { setFuelPriceError(err instanceof Error ? err.message : 'Failed to update') }
                    finally { setFuelPriceSaving(false) }
                  }}
                >
                  {fuelPriceSaving ? 'Saving…' : fuelPriceSuccess ? '✓ Saved' : 'Update Both Prices'}
                </button>
              </div>
              {fuelPriceError && <p className="text-danger text-xs mt-2 mb-3">{fuelPriceError}</p>}
              {fuelPriceSuccess && <p className="text-brand text-xs mt-2 mb-3">Fuel prices updated — all new fare estimates reflect this change.</p>}

              {/* Fare impact preview */}
              <div className="card p-4">
                <h3 className="fw-semibold small mb-1 d-flex align-items-center gap-2">
                  <TrendingUp size={15} style={{ color: '#60a5fa' }} /> Fare Impact Preview
                </h3>
                <p className="text-muted text-xs mb-3">
                  Example fares for a 5 km / 15 min trip at the new prices:
                </p>
                <div className="table-responsive">
                  <table className="table table-dark table-sm mb-0 text-xs">
                    <thead style={{ background: 'var(--eg-700)' }}>
                      <tr>
                        <th className="ps-3 py-2">Vehicle</th>
                        <th>Fuel</th>
                        <th>Base fare</th>
                        <th>At new price</th>
                        <th>Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(Object.keys(FARE_RATES) as (keyof typeof FARE_RATES)[]).map(cat => {
                        const previewPetrol = parseFloat(petrolInput || String(fuelData.petrol.base)) / fuelData.petrol.base
                        const previewDiesel = parseFloat(dieselInput || String(fuelData.diesel.base)) / fuelData.diesel.base
                        const previewMults = { petrol: previewPetrol, diesel: previewDiesel }
                        const fuelType = (cat === 'SUV' || cat === 'Tow Truck') ? 'diesel' : 'petrol'
                        const baseFare     = calcFare(cat, 5, 15, 1)
                        const adjustedFare = calcFare(cat, 5, 15, previewMults)
                        const diff = adjustedFare - baseFare
                        return (
                          <tr key={cat} style={{ borderColor: 'var(--eg-700)' }}>
                            <td className="ps-3 py-2 fw-semibold">{cat}</td>
                            <td style={{ color: fuelType === 'petrol' ? '#fbbf24' : '#60a5fa' }}>{fuelType}</td>
                            <td className="text-muted">${baseFare.toFixed(2)}</td>
                            <td className="fw-bold" style={{ color: diff > 0.01 ? '#f87171' : diff < -0.01 ? '#4ade80' : '#9ca3af' }}>
                              ${adjustedFare.toFixed(2)}
                            </td>
                            <td style={{ color: diff > 0.01 ? '#f87171' : diff < -0.01 ? '#4ade80' : '#9ca3af' }}>
                              {diff > 0.01 ? '+' : ''}{diff.toFixed(2)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted mt-3 mb-0">
                  Base prices (${fuelData.petrol.base.toFixed(2)}/L petrol · ${fuelData.diesel.base.toFixed(2)}/L diesel) are the calibration baseline.
                  Changes only affect new rides — active rides are unaffected.
                </p>
              </div>

              {/* Commission & wallet config (phase 6) */}
              {commissionCfg && (
                <div className="card p-4 mt-3">
                  <div className="d-flex align-items-center justify-content-between mb-3">
                    <div>
                      <h5 className="fw-bold mb-1 d-flex align-items-center gap-2">
                        <Sliders size={18} style={{ color: '#c084fc' }} /> Commission & wallet
                      </h5>
                      <p className="text-xs text-muted mb-0">Percentage of each ride fare held from the driver wallet.</p>
                    </div>
                    <button onClick={saveCommission} disabled={commissionSaving}
                            className="btn btn-primary btn-sm d-flex align-items-center gap-1">
                      {commissionSaving ? <Loader size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                      Save
                    </button>
                  </div>

                  {/* Default commission slider */}
                  <div className="mb-3">
                    <div className="d-flex align-items-center justify-content-between mb-1">
                      <label className="text-xs text-muted mb-0">Default commission</label>
                      <span className="fw-bold" style={{ color: '#c084fc' }}>
                        {(commissionCfg.default * 100).toFixed(1)}%
                      </span>
                    </div>
                    <input type="range" min="0" max="0.30" step="0.005"
                           value={commissionCfg.default}
                           onChange={e => setCommissionCfg({ ...commissionCfg, default: parseFloat(e.target.value) })}
                           className="form-range" />
                    <div className="d-flex justify-content-between text-xs text-muted">
                      <span>0%</span><span>15%</span><span>30%</span>
                    </div>
                  </div>

                  {/* Min / Max bounds */}
                  <div className="row g-2 mb-3">
                    <div className="col-6">
                      <label className="text-xs text-muted mb-1 d-block">Min (floor)</label>
                      <div className="input-group input-group-sm">
                        <input type="number" step="0.005" min="0" max="0.30"
                               value={commissionCfg.min}
                               onChange={e => setCommissionCfg({ ...commissionCfg, min: parseFloat(e.target.value) })}
                               className="form-control" />
                        <span className="input-group-text" style={{ background: 'var(--eg-700)', color: '#9ca3af' }}>
                          {(commissionCfg.min * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="col-6">
                      <label className="text-xs text-muted mb-1 d-block">Max (ceiling)</label>
                      <div className="input-group input-group-sm">
                        <input type="number" step="0.005" min="0" max="0.30"
                               value={commissionCfg.max}
                               onChange={e => setCommissionCfg({ ...commissionCfg, max: parseFloat(e.target.value) })}
                               className="form-control" />
                        <span className="input-group-text" style={{ background: 'var(--eg-700)', color: '#9ca3af' }}>
                          {(commissionCfg.max * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted mb-1 d-block">Wallet minimum balance to receive bids (USD)</label>
                    <div className="input-group input-group-sm">
                      <span className="input-group-text" style={{ background: 'var(--eg-700)', color: '#9ca3af' }}>$</span>
                      <input type="number" step="0.25" min="0" max="50"
                             value={commissionCfg.walletMinBalance}
                             onChange={e => setCommissionCfg({ ...commissionCfg, walletMinBalance: parseFloat(e.target.value) })}
                             className="form-control" />
                    </div>
                    <p className="text-xs text-muted mt-1 mb-0">
                      Drivers below this balance don't receive bid broadcasts (shown as wallet:locked).
                    </p>
                  </div>

                  {commissionSuccess && (
                    <div className="rounded-xl px-3 py-2 d-flex align-items-start gap-2 mt-3"
                         style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)' }}>
                      <CheckCircle size={14} style={{ color: '#4ade80', flexShrink: 0, marginTop: 2 }} />
                      <p className="text-xs mb-0" style={{ color: '#86efac' }}>Commission config saved.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* REPORTS */}
          {tab === 'reports' && (
            <div className="animate-fade-in" style={{ maxWidth: 900 }}>
              <div className="mb-4 pb-3" style={{ borderBottom: '1px solid var(--eg-700)' }}>
                <h1 className="fw-bold mb-1 d-flex align-items-center gap-2" style={{ fontSize: '1.75rem', letterSpacing: '-0.01em' }}>
                  <TrendingUp size={24} style={{ color: '#60a5fa' }} /> Reports &amp; Analytics
                </h1>
                <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>Revenue breakdown, ride status distribution and operational metrics</p>
              </div>
              <div className="row g-4">
                <div className="col-lg-6">
                  <div className="card p-4 h-100">
                    <h3 className="fw-bold mb-4 d-flex align-items-center gap-2" style={{ fontSize: '1.05rem' }}><DollarSign size={18} className="text-warning" /> Revenue by Payment Method</h3>
                    {(['cash_usd', 'cash_zig', 'ecocash', 'voucher'] as const).map(method => {
                      const rev = rides.filter(r => r.paymentMethod === method && r.status === 'completed').reduce((s, r) => s + (r.fare || 0), 0)
                      const pct = totalRevenue ? Math.round((rev / totalRevenue) * 100) : 0
                      const colors: Record<string, string> = { cash_usd: 'bg-success', cash_zig: 'bg-warning', ecocash: 'bg-primary', voucher: 'bg-purple' }
                      const labels: Record<string, string> = { cash_usd: 'Cash (USD)', cash_zig: 'Cash (ZiG)', ecocash: 'EcoCash', voucher: 'Voucher' }
                      return (
                        <div key={method} className="mb-3">
                          <div className="d-flex justify-content-between small mb-1">
                            <span className="fw-medium">{labels[method]}</span>
                            <span>${rev.toFixed(2)} <span className="text-muted">({pct}%)</span></span>
                          </div>
                          <div className="progress" style={{ height: 10, background: 'var(--eg-700)' }}>
                            <div className={`progress-bar ${colors[method]}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                    <div className="d-flex justify-content-between fw-bold small pt-3 mt-2 border-top" style={{ borderColor: 'var(--eg-600)' }}>
                      <span>Total Revenue</span><span className="text-warning">${totalRevenue.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                <div className="col-lg-6">
                  <div className="card p-4 h-100">
                    <h3 className="fw-bold mb-4 d-flex align-items-center gap-2" style={{ fontSize: '1.05rem' }}><Navigation size={18} className="text-brand" /> Ride Status Breakdown</h3>
                    {(['completed', 'inprogress', 'searching', 'cancelled'] as const).map(status => {
                      const count = rides.filter(r => r.status === status).length
                      const pct = rides.length ? Math.round((count / rides.length) * 100) : 0
                      const colors: Record<string, string> = { completed: 'bg-success', inprogress: 'bg-primary', searching: 'bg-warning', cancelled: 'bg-danger' }
                      const labels: Record<string, string> = { completed: 'Completed', inprogress: 'In Progress', searching: 'Searching', cancelled: 'Cancelled' }
                      return (
                        <div key={status} className="mb-3">
                          <div className="d-flex justify-content-between small mb-1">
                            <span>{labels[status]}</span><span>{count} <span className="text-muted">({pct}%)</span></span>
                          </div>
                          <div className="progress" style={{ height: 10, background: 'var(--eg-700)' }}>
                            <div className={`progress-bar ${colors[status]}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="col-12">
                  <div className="card p-3">
                    <h3 className="fw-semibold small mb-3 d-flex align-items-center gap-2"><TrendingUp size={15} style={{ color: '#60a5fa' }} /> Platform Summary</h3>
                    <div className="row g-3">
                      {[
                        { label: 'Total Registered Users', value: users.length },
                        { label: 'Total Rides', value: rides.length },
                        { label: 'Total Vouchers Issued', value: vouchers.length },
                        { label: 'Platform Revenue', value: `$${totalRevenue.toFixed(2)}` },
                        { label: 'Avg Ride Value', value: rides.length ? `$${(totalRevenue / (rides.filter(r => r.status === 'completed').length || 1)).toFixed(2)}` : '$0' },
                        { label: 'Active Accounts', value: activeUsers },
                        { label: 'Frozen Accounts', value: frozenUsers },
                        { label: 'Critical Alerts', value: criticalLogs },
                      ].map(s => (
                        <div key={s.label} className="col-6 col-sm-3">
                          <div className="rounded-xl p-3 text-center bg-700">
                            <p className="fw-bolder text-white mb-1" style={{ fontSize: '1.2rem' }}>{s.value}</p>
                            <p className="text-xs text-muted mb-0">{s.label}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
      </main>

      {/* SOS Alert Modal */}
      {sosAlert && (
        <div className="position-fixed top-0 start-0 end-0 bottom-0 d-flex align-items-center justify-content-center p-4"
          style={{ zIndex: 1080, background: 'rgba(0,0,0,0.85)' }}>
          <div className="card w-100 animate-fade-in text-center" style={{ maxWidth: 420, border: '2px solid #ef4444' }}>
            <div className="card-body p-4">
              <div className="d-flex align-items-center justify-content-center rounded-circle mx-auto mb-3"
                style={{ width: 72, height: 72, background: 'rgba(239,68,68,0.2)', border: '2px solid #ef4444' }}>
                <AlertTriangle size={36} className="text-danger" />
              </div>
              <h3 className="fw-bold text-danger mb-1" style={{ fontSize: '1.25rem', letterSpacing: '0.05em' }}>🚨 SOS EMERGENCY ALERT</h3>
              <p className="text-white fw-semibold mb-1">{sosAlert.userName}</p>
              <p className="text-muted small mb-1">Ride #{sosAlert.rideId.slice(0, 8)}</p>
              <p className="text-muted text-xs mb-4">{new Date(sosAlert.timestamp).toLocaleString()}</p>
              <p className="small mb-4" style={{ color: '#fca5a5' }}>
                This user has triggered an emergency SOS. Contact them immediately and dispatch assistance if required.
              </p>
              <div className="d-flex gap-3">
                <button onClick={() => { setSosAlert(null); setTab('activity') }}
                  className="btn flex-grow-1 fw-semibold" style={{ borderColor: '#ef4444', color: '#f87171', background: 'transparent' }}>
                  View Activity Log
                </button>
                <button onClick={() => setSosAlert(null)}
                  className="btn flex-grow-1 fw-semibold" style={{ background: '#ef4444', border: 'none', color: 'white' }}>
                  Acknowledge
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm modal */}
      {confirmAction && (
        <ConfirmModal action={confirmAction} freezeReason={freezeReason} onFreezeReasonChange={setFreezeReason}
          onConfirm={() => {
            if (confirmAction.type === 'freeze') freezeUser(confirmAction.userId, freezeReason)
            else if (confirmAction.type === 'unfreeze') unfreezeUser(confirmAction.userId)
            else if (confirmAction.type === 'delete') deleteUser(confirmAction.userId)
          }}
          onCancel={() => { setConfirmAction(null); setFreezeReason('') }} />
      )}

      {/* User detail drawer */}
      {selectedUser && confirmAction?.type !== 'freeze' && (
        <UserDetailDrawer user={selectedUser}
          rides={rides.filter(r => r.clientId === selectedUser.id || r.driverId === selectedUser.id)}
          onClose={() => setSelectedUser(null)}
          onFreeze={() => setConfirmAction({ type: 'freeze', userId: selectedUser.id, userName: selectedUser.fullName || selectedUser.name || selectedUser.id })}
          onUnfreeze={() => setConfirmAction({ type: 'unfreeze', userId: selectedUser.id, userName: selectedUser.fullName || selectedUser.name || selectedUser.id })}
          onDelete={() => setConfirmAction({ type: 'delete', userId: selectedUser.id, userName: selectedUser.fullName || selectedUser.name || selectedUser.id })} />
      )}

      {/* Driver wallet detail drawer */}
      {selectedWallet && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-end"
             style={{ zIndex: 1055, background: 'rgba(0,0,0,0.6)' }}
             onClick={() => setSelectedWallet(null)}>
          <div className="bg-800 h-100 overflow-auto p-4 animate-slide-in"
               style={{ width: '100%', maxWidth: 520 }}
               onClick={e => e.stopPropagation()}>
            <div className="d-flex align-items-center justify-content-between mb-3 pb-3"
                 style={{ borderBottom: '1px solid var(--eg-700)' }}>
              <div>
                <h5 className="fw-bold mb-0">{selectedWallet.driverName}</h5>
                <p className="text-xs text-muted mb-0">{selectedWallet.phone} · {selectedWallet.status}</p>
              </div>
              <button onClick={() => setSelectedWallet(null)}
                      className="btn p-0 border-0 text-muted" style={{ background: 'transparent' }}>
                <X size={20} />
              </button>
            </div>

            {/* Balance summary */}
            <div className="row g-2 mb-4">
              <div className="col-4">
                <div className="card p-2 text-center">
                  <p className="text-xs text-muted mb-1">Available</p>
                  <p className="fw-bold mb-0" style={{ color: '#4ade80', fontSize: '1.1rem' }}>
                    ${selectedWallet.balance.toFixed(2)}
                  </p>
                </div>
              </div>
              <div className="col-4">
                <div className="card p-2 text-center">
                  <p className="text-xs text-muted mb-1">Held</p>
                  <p className="fw-bold mb-0" style={{ color: '#fbbf24', fontSize: '1.1rem' }}>
                    ${selectedWallet.heldBalance.toFixed(2)}
                  </p>
                </div>
              </div>
              <div className="col-4">
                <div className="card p-2 text-center">
                  <p className="text-xs text-muted mb-1">Total</p>
                  <p className="fw-bold mb-0" style={{ color: '#60a5fa', fontSize: '1.1rem' }}>
                    ${selectedWallet.total.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            {/* Admin adjust form */}
            <div className="card p-3 mb-4" style={{ borderColor: 'rgba(96,165,250,0.4)' }}>
              <p className="fw-semibold mb-2 d-flex align-items-center gap-1" style={{ fontSize: '0.95rem' }}>
                <Sliders size={14} /> Manual adjustment
              </p>
              <p className="text-xs text-muted mb-2">Positive credits, negative debits. Use for bank-deposit confirmations, refunds, or corrections.</p>
              <div className="row g-2 mb-2">
                <div className="col-5">
                  <label className="text-xs text-muted mb-1 d-block">Amount ($)</label>
                  <input type="number" step="0.01" placeholder="e.g. 50 or -10"
                         value={adjustDelta}
                         onChange={e => { setAdjustDelta(e.target.value); setAdjustError(null) }}
                         className="form-control form-control-sm" />
                </div>
                <div className="col-7">
                  <label className="text-xs text-muted mb-1 d-block">Reason (required)</label>
                  <input type="text" placeholder="e.g. Bank deposit confirmed"
                         value={adjustReason}
                         onChange={e => { setAdjustReason(e.target.value); setAdjustError(null) }}
                         className="form-control form-control-sm" />
                </div>
              </div>
              {adjustError && (
                <p className="text-xs mb-2" style={{ color: '#fca5a5' }}>{adjustError}</p>
              )}
              <button onClick={submitAdjust} disabled={adjustSaving}
                      className="btn btn-primary btn-sm w-100 fw-semibold d-flex align-items-center justify-content-center gap-1">
                {adjustSaving ? <Loader size={12} className="animate-spin" /> :
                  parseFloat(adjustDelta) >= 0 ? <ArrowUpCircle size={12} /> : <ArrowDownCircle size={12} />}
                Apply {parseFloat(adjustDelta || '0') >= 0 ? 'credit' : 'debit'}
              </button>
            </div>

            {/* Ledger */}
            <p className="fw-semibold mb-2 d-flex align-items-center gap-1" style={{ fontSize: '0.95rem' }}>
              <FileText size={14} /> Recent transactions
            </p>
            {selectedWallet.transactions.length === 0 ? (
              <p className="text-muted small">No transactions yet.</p>
            ) : (
              <div className="d-flex flex-column gap-1">
                {selectedWallet.transactions.map(t => (
                  <div key={t.id} className="card p-2 d-flex align-items-center gap-2">
                    <div className="rounded-xl d-flex align-items-center justify-content-center flex-shrink-0"
                         style={{
                           width: 28, height: 28,
                           background: t.amount >= 0 ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.15)',
                         }}>
                      {t.amount >= 0
                        ? <ArrowUpCircle size={14} style={{ color: '#4ade80' }} />
                        : <ArrowDownCircle size={14} style={{ color: '#f87171' }} />}
                    </div>
                    <div className="flex-grow-1 overflow-hidden">
                      <p className="mb-0 text-xs fw-semibold">{t.type}</p>
                      <p className="mb-0 text-xs text-muted text-truncate">
                        {new Date(t.createdAt).toLocaleString()} · {t.reference || '—'}
                      </p>
                    </div>
                    <div className="text-end flex-shrink-0">
                      <p className="mb-0 fw-semibold small" style={{ color: t.amount >= 0 ? '#4ade80' : '#f87171' }}>
                        {t.amount >= 0 ? '+' : ''}${t.amount.toFixed(2)}
                      </p>
                      <p className="mb-0 text-xs text-muted">bal: ${t.balanceAfter.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Verification review modal */}
      {selectedVerifUser && (
        <div className="position-fixed top-0 start-0 end-0 bottom-0 d-flex align-items-center justify-content-center p-4"
          style={{ zIndex: 1060, background: 'rgba(0,0,0,0.8)' }}>
          <div className="card w-100 animate-fade-in d-flex flex-column" style={{ maxWidth: 640, maxHeight: '90vh' }}>
            <div className="card-header d-flex align-items-center justify-content-between flex-shrink-0">
              <div>
                <h3 className="fw-bold mb-0 small">{selectedVerifUser.fullName || selectedVerifUser.name}</h3>
                <p className="text-xs text-muted mb-0 text-capitalize">{selectedVerifUser.role} Application Review</p>
              </div>
              <button onClick={() => { setSelectedVerifUser(null); setRejectReason('') }} className="btn btn-secondary p-2"><X size={18} /></button>
            </div>

            <div className="overflow-auto flex-grow-1 p-4">
              {/* Personal info */}
              <h4 className="small fw-semibold mb-3 d-flex align-items-center gap-2"><User size={15} style={{ color: '#60a5fa' }} /> Personal Details</h4>
              <div className="row g-2 mb-4">
                {([
                  ['Full Name', selectedVerifUser.fullName || selectedVerifUser.name],
                  ['Phone', selectedVerifUser.phone],
                  ['Email', selectedVerifUser.email || ''],
                  ['Role', selectedVerifUser.role],
                  ...(selectedVerifUser.driverDocuments ? [
                    ['National ID', selectedVerifUser.driverDocuments.nationalIdNumber],
                    ['Date of Birth', selectedVerifUser.driverDocuments.dateOfBirth],
                    ['Licence No.', selectedVerifUser.driverDocuments.licenceNumber],
                    ['Licence Class', selectedVerifUser.driverDocuments.licenceClass],
                    ['Licence Expiry', selectedVerifUser.driverDocuments.licenceExpiry],
                    ['Address', selectedVerifUser.driverDocuments.residentialAddress],
                    ['Next of Kin', selectedVerifUser.driverDocuments.nextOfKinName],
                    ['Kin Phone', selectedVerifUser.driverDocuments.nextOfKinPhone],
                  ] : []),
                  ...(selectedVerifUser.corporateProfile ? [
                    ['Company', selectedVerifUser.corporateProfile.companyName],
                    ['Reg Number', selectedVerifUser.corporateProfile.companyRegNumber],
                    ['ZIMRA BP', selectedVerifUser.corporateProfile.zimraBpNumber || ''],
                    ['Contact', selectedVerifUser.corporateProfile.contactPerson],
                    ['Fleet Size', String(selectedVerifUser.corporateProfile.numberOfVehicles ?? '')],
                    ['Bank', selectedVerifUser.corporateProfile.bankName || ''],
                  ] : []),
                ] as string[][]).filter(row => row[1]).map(row => (
                  <div key={row[0]} className="col-6">
                    <div className="rounded-xl p-2 bg-700">
                      <p className="text-xs text-muted mb-0">{row[0]}</p>
                      <p className="fw-medium small mb-0" style={{ wordBreak: 'break-word' }}>{row[1]}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Vehicle details */}
              {selectedVerifUser.vehicleDetails && (
                <>
                  <h4 className="small fw-semibold mb-3 d-flex align-items-center gap-2"><Car size={15} className="text-warning" /> Vehicle Details</h4>
                  <div className="row g-2 mb-4">
                    {([
                      ['Registration', selectedVerifUser.vehicleDetails.registration],
                      ['Make & Model', `${selectedVerifUser.vehicleDetails.make} ${selectedVerifUser.vehicleDetails.model}`],
                      ['Year', selectedVerifUser.vehicleDetails.year],
                      ['Colour', selectedVerifUser.vehicleDetails.colour],
                      ['Category', selectedVerifUser.vehicleDetails.category],
                      ['Seating Cap.', selectedVerifUser.vehicleDetails.seatingCapacity?.toString() ?? ''],
                      ['Insurance Type', selectedVerifUser.vehicleDetails.insuranceType?.replace('_', ' ') ?? ''],
                      ['Insurer', selectedVerifUser.vehicleDetails.insurer],
                      ['Insurance Expiry', selectedVerifUser.vehicleDetails.insuranceExpiry],
                      ['ZINARA Expiry', selectedVerifUser.vehicleDetails.zinaraExpiry],
                      ['CoF Expiry', selectedVerifUser.vehicleDetails.cofExpiry],
                    ] as [string, string][]).filter(([, val]) => val).map(([label, val]) => (
                      <div key={label} className="col-6">
                        <div className="rounded-xl p-2 bg-700">
                          <p className="text-xs text-muted mb-0">{label}</p>
                          <p className="fw-medium small mb-0 text-capitalize">{val}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Document photos */}
              {selectedVerifUser.driverDocuments && (
                <>
                  <h4 className="small fw-semibold mb-3 d-flex align-items-center gap-2"><FileCheck size={15} className="text-brand" /> Uploaded Documents</h4>
                  <div className="row g-2 mb-4">
                    {([
                      ['National ID', selectedVerifUser.driverDocuments.nationalIdPhoto],
                      ['Selfie / Photo', selectedVerifUser.driverDocuments.selfiePhoto],
                      ['Proof of Address', selectedVerifUser.driverDocuments.proofOfResidence],
                      ['Licence Photo', selectedVerifUser.driverDocuments.licencePhoto],
                      ['Def. Driving Cert', selectedVerifUser.driverDocuments.defensiveDrivingCert],
                      ['Police Clearance', selectedVerifUser.driverDocuments.policeClearance],
                      ['Medical Cert', selectedVerifUser.driverDocuments.medicalCert],
                    ] as [string, string | undefined][]).map(([label, src]) => (
                      <div key={label} className="col-4">
                        <div className="rounded-xl p-2 bg-700">
                          <p className="text-xs text-muted mb-2">{label}</p>
                          {src?.startsWith('data:image') ? (
                            <img src={src} alt={label} className="w-100 rounded-3 object-fit-cover" style={{ height: 80 }} />
                          ) : (
                            <div className="w-100 rounded-3 d-flex flex-column align-items-center justify-content-center gap-1"
                              style={{ height: 80, background: src ? 'rgba(34,197,94,0.1)' : 'var(--eg-600)' }}>
                              <FileCheck size={18} style={{ color: src ? '#4ade80' : '#4b5563' }} />
                              <span style={{ fontSize: '0.6rem', color: '#6b7280' }}>{src ? 'Uploaded' : 'Not uploaded'}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Expiry alerts */}
              {(selectedVerifUser.verification?.documentAlerts?.length ?? 0) > 0 && (
                <div className="rounded-xl p-3 mb-4" style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)' }}>
                  <h4 className="small fw-semibold text-warning mb-3 d-flex align-items-center gap-2"><AlertTriangle size={15} /> Document Expiry Warnings</h4>
                  <div className="d-flex flex-column gap-2">
                    {selectedVerifUser.verification!.documentAlerts!.map(alert => (
                      <div key={alert.docType} className="d-flex align-items-center justify-content-between text-xs">
                        <span className="text-capitalize" style={{ color: '#d1d5db' }}>{alert.docType.replace(/([A-Z])/g, ' $1').trim()}</span>
                        <span className="fw-bold" style={{ color: alert.isExpired ? '#f87171' : alert.daysUntilExpiry <= 14 ? '#fb923c' : '#fbbf24' }}>
                          {alert.isExpired ? `EXPIRED (${alert.expiryDate})` : `${alert.daysUntilExpiry}d left · ${alert.expiryDate}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Approve / Reject — pinned footer, always visible */}
            <div className="border-top p-4 flex-shrink-0" style={{ borderColor: 'var(--eg-600)', background: 'var(--eg-800)' }}>
              <label className="form-label">Rejection Reason <span className="text-muted">(required to reject)</span></label>
              <textarea className="form-control mb-3" style={{ resize: 'none', height: 60 }}
                placeholder="e.g. Expired licence, unclear documents, missing vehicle photos..."
                value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
              <div className="d-flex gap-3">
                <button onClick={() => rejectVerification(selectedVerifUser.id)} disabled={!rejectReason.trim()}
                  className="btn flex-grow-1 d-flex align-items-center justify-content-center gap-2 fw-semibold"
                  style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#f87171', background: 'transparent' }}>
                  <XCircle size={15} /> Reject
                </button>
                <button onClick={() => approveVerification(selectedVerifUser.id)}
                  className="btn btn-primary flex-grow-1 d-flex align-items-center justify-content-center gap-2">
                  <CheckCircle size={15} /> Approve
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

interface ConfirmState { type: 'freeze' | 'unfreeze' | 'delete'; userId: string; userName: string }

function ConfirmModal({ action, freezeReason, onFreezeReasonChange, onConfirm, onCancel }: {
  action: ConfirmState; freezeReason: string
  onFreezeReasonChange: (v: string) => void
  onConfirm: () => void; onCancel: () => void
}) {
  const cfg = {
    freeze:   { icon: Lock,    title: 'Freeze Account',   btn: 'Freeze Account',      color: '#fbbf24', bg: 'rgba(234,179,8,0.1)',    border: 'rgba(234,179,8,0.3)',    btnBg: '#eab308' },
    unfreeze: { icon: Unlock,  title: 'Unfreeze Account', btn: 'Unfreeze Account',    color: '#4ade80', bg: 'rgba(34,197,94,0.1)',    border: 'rgba(34,197,94,0.3)',    btnBg: '#22c55e' },
    delete:   { icon: Trash2,  title: 'Delete Account',   btn: 'Permanently Delete',  color: '#f87171', bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.3)',    btnBg: '#ef4444' },
  }[action.type]

  return (
    <div className="position-fixed top-0 start-0 end-0 bottom-0 d-flex align-items-center justify-content-center p-4"
      style={{ zIndex: 1070, background: 'rgba(0,0,0,0.75)' }}>
      <div className="card w-100 animate-fade-in" style={{ maxWidth: 420 }}>
        <div className="card-body p-4">
          <div className="d-flex align-items-center justify-content-center rounded-xl mx-auto mb-4"
            style={{ width: 56, height: 56, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
            <cfg.icon size={28} style={{ color: cfg.color }} />
          </div>
          <h3 className="fw-bold text-center mb-3">{cfg.title}</h3>
          <p className="text-muted small text-center mb-4">
            {action.type === 'delete'
              ? <><span style={{ color: '#f87171' }} className="fw-semibold">permanently delete</span> <strong>{action.userName}</strong>'s account. This cannot be undone.</>
              : action.type === 'freeze'
              ? <>This will temporarily block <strong>{action.userName}</strong> from accessing EasyRide.</>
              : <>This will restore access for <strong>{action.userName}</strong>.</>
            }
          </p>
          {action.type === 'freeze' && (
            <div className="mb-4">
              <label className="form-label">Reason for freezing <span className="text-danger">*</span></label>
              <textarea className="form-control" style={{ resize: 'none', height: 80 }}
                placeholder="e.g. Suspicious activity detected, multiple complaints received..."
                value={freezeReason} onChange={e => onFreezeReasonChange(e.target.value)} />
            </div>
          )}
          <div className="d-flex gap-3">
            <button onClick={onCancel} className="btn btn-secondary flex-grow-1">Cancel</button>
            <button onClick={onConfirm}
              disabled={action.type === 'freeze' && !freezeReason.trim()}
              className="btn flex-grow-1 fw-semibold text-white"
              style={{ background: cfg.btnBg, border: 'none' }}>
              {cfg.btn}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function UserCard({ user: u, onView, onFreeze, onUnfreeze, onDelete }: {
  user: UserType; onView: () => void; onFreeze: () => void; onUnfreeze: () => void; onDelete: () => void
}) {
  const status = (u.accountStatus || 'active') as AccountStatus
  const roleIcons: Record<string, React.ElementType> = { rider: User, corporate: Building2, driver: Car }
  const RoleIcon = roleIcons[u.role] || User
  const displayName = u.fullName || u.name || '?'

  return (
    <div className="card p-3 d-flex flex-column flex-sm-row gap-3"
      style={{ borderColor: status === 'frozen' ? 'rgba(234,179,8,0.3)' : status === 'deleted' ? 'rgba(239,68,68,0.2)' : 'var(--eg-600)', opacity: status === 'deleted' ? 0.6 : 1, background: status === 'frozen' ? 'rgba(234,179,8,0.05)' : 'var(--eg-800)' }}>
      <div className="d-flex align-items-start gap-3 flex-grow-1 overflow-hidden">
        <div className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0 fw-bold"
          style={{ width: 48, height: 48, background: status === 'frozen' ? 'rgba(234,179,8,0.2)' : status === 'deleted' ? 'rgba(239,68,68,0.2)' : 'var(--eg-700)', color: status === 'frozen' ? '#fbbf24' : status === 'deleted' ? '#f87171' : '#4ade80', fontSize: '1.1rem' }}>
          {displayName[0]}
        </div>
        <div className="flex-grow-1 overflow-hidden">
          <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
            <p className="fw-semibold mb-0">{displayName}</p>
            <span className={status === 'frozen' ? 'badge-warn' : status === 'deleted' ? 'badge-danger-soft' : 'badge-brand'}>
              {status === 'active' ? '● Active' : status === 'frozen' ? '🔒 Frozen' : '✗ Deleted'}
            </span>
            <span className="badge-info-soft d-flex align-items-center gap-1 text-capitalize"><RoleIcon size={11} />{u.role === 'rider' ? 'private' : u.role}</span>
          </div>
          <div className="row g-0 text-xs text-muted">
            {u.email && <div className="col-sm-4">{u.email}</div>}
            {u.phone && <div className="col-sm-4">{u.phone}</div>}
            {u.role === 'corporate' && (u.corporateProfile?.companyName || u.companyName) && <div className="col-sm-4">🏢 {u.corporateProfile?.companyName || u.companyName}</div>}
            {u.role === 'driver' && (u.vehicleDetails?.registration || u.vehicleReg) && <div className="col-sm-4">🚗 {u.vehicleDetails?.registration || u.vehicleReg}</div>}
            {u.rating && <div className="col-sm-4">⭐ {u.rating} rating</div>}
            {u.createdAt && <div className="col-sm-4">Joined {new Date(u.createdAt).toLocaleDateString()}</div>}
          </div>
          {status === 'frozen' && u.frozenReason && (
            <div className="d-flex align-items-start gap-1 text-xs text-warning mt-2">
              <AlertTriangle size={12} className="flex-shrink-0 mt-1" />
              <span>Frozen: {u.frozenReason}</span>
            </div>
          )}
        </div>
      </div>
      {status !== 'deleted' && (
        <div className="d-flex flex-sm-column gap-2 flex-shrink-0" style={{ minWidth: 120 }}>
          <button onClick={onView} className="btn btn-secondary btn-sm d-flex align-items-center justify-content-center gap-1 flex-grow-1 flex-sm-grow-0">
            <Eye size={13} /> View
          </button>
          {status === 'active'
            ? <button onClick={onFreeze} className="btn btn-sm flex-grow-1 flex-sm-grow-0 d-flex align-items-center justify-content-center gap-1"
                style={{ borderColor: 'rgba(234,179,8,0.4)', color: '#fbbf24', background: 'transparent' }}>
                <Lock size={13} /> Freeze
              </button>
            : status === 'frozen'
            ? <button onClick={onUnfreeze} className="btn btn-sm flex-grow-1 flex-sm-grow-0 d-flex align-items-center justify-content-center gap-1"
                style={{ borderColor: 'rgba(34,197,94,0.4)', color: '#4ade80', background: 'transparent' }}>
                <Unlock size={13} /> Unfreeze
              </button>
            : null
          }
          <button onClick={onDelete} className="btn btn-sm flex-grow-1 flex-sm-grow-0 d-flex align-items-center justify-content-center gap-1"
            style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#f87171', background: 'transparent' }}>
            <Trash2 size={13} /> Delete
          </button>
        </div>
      )}
    </div>
  )
}

function UserDetailDrawer({ user: u, rides, onClose, onFreeze, onUnfreeze, onDelete }: {
  user: UserType; rides: Ride[]
  onClose: () => void; onFreeze: () => void; onUnfreeze: () => void; onDelete: () => void
}) {
  const status = (u.accountStatus || 'active') as AccountStatus
  const totalSpend = rides.filter(r => r.status === 'completed').reduce((s, r) => s + (r.fare || 0), 0)
  const displayName = u.fullName || u.name || '?'

  return (
    <div className="position-fixed top-0 start-0 end-0 bottom-0 d-flex align-items-center justify-content-end"
      style={{ zIndex: 1050, background: 'rgba(0,0,0,0.6)' }}>
      <div className="h-100 overflow-auto animate-fade-in" style={{ width: '100%', maxWidth: 400, background: 'var(--eg-800)', borderLeft: '1px solid var(--eg-600)' }}>
        <div className="d-flex align-items-center justify-content-between px-4 py-3 sticky-top" style={{ background: 'var(--eg-800)', borderBottom: '1px solid var(--eg-600)', zIndex: 10 }}>
          <h3 className="fw-bold mb-0 small">User Details</h3>
          <button onClick={onClose} className="btn btn-secondary p-2"><X size={18} /></button>
        </div>
        <div className="p-4">
          <div className="text-center mb-4">
            <div className="d-flex align-items-center justify-content-center rounded-circle mx-auto mb-3 fw-bold"
              style={{ width: 80, height: 80, fontSize: '2rem', background: status === 'frozen' ? 'rgba(234,179,8,0.2)' : 'rgba(34,197,94,0.2)', color: status === 'frozen' ? '#fbbf24' : '#4ade80' }}>
              {displayName[0]}
            </div>
            <h4 className="fw-bold mb-1">{displayName}</h4>
            <span className={`${status === 'frozen' ? 'badge-warn' : status === 'deleted' ? 'badge-danger-soft' : 'badge-brand'} d-inline-flex`}>
              {status === 'active' ? '● Active' : status === 'frozen' ? '🔒 Frozen' : '✗ Deleted'}
            </span>
          </div>
          <div className="row g-2 mb-4">
            {[
              ['Email', u.email], ['Phone', u.phone], ['Role', u.role === 'rider' ? 'private' : u.role],
              ['Rating', u.rating ? `${u.rating} ★` : 'N/A'],
              ['Joined', u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'],
              ['Last Seen', u.lastSeen ? new Date(u.lastSeen).toLocaleDateString() : 'N/A'],
              ...((u.corporateProfile?.companyName || u.companyName) ? [['Company', u.corporateProfile?.companyName || u.companyName]] : []),
              ...((u.vehicleDetails?.registration || u.vehicleReg) ? [['Vehicle', u.vehicleDetails ? `${u.vehicleDetails.registration} · ${u.vehicleDetails.make} ${u.vehicleDetails.model}` : `${u.vehicleReg} · ${u.vehicleModel}`]] : []),
            ].map(([label, val]) => (
              <div key={label} className="col-6">
                <div className="rounded-xl p-2 bg-700">
                  <p className="text-xs text-muted mb-0">{label}</p>
                  <p className="small fw-medium mb-0 text-capitalize">{val}</p>
                </div>
              </div>
            ))}
          </div>

          {status === 'frozen' && u.frozenReason && (
            <div className="rounded-xl p-3 mb-4" style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)' }}>
              <p className="text-xs text-warning fw-semibold mb-1 d-flex align-items-center gap-1"><Lock size={11} /> Freeze Reason</p>
              <p className="small mb-1" style={{ color: '#fde68a' }}>{u.frozenReason}</p>
              {u.frozenAt && <p className="text-xs mb-0" style={{ color: 'rgba(251,191,36,0.6)' }}>Frozen {new Date(u.frozenAt).toLocaleString()}</p>}
            </div>
          )}

          <div className="row g-3 mb-4">
            {[
              { label: 'Total Rides', value: rides.length, color: '#4ade80' },
              { label: 'Total Spent', value: `$${totalSpend.toFixed(2)}`, color: '#fbbf24' },
              { label: 'Completed', value: rides.filter(r => r.status === 'completed').length, color: '#60a5fa' },
            ].map(s => (
              <div key={s.label} className="col-4">
                <div className="card p-2 text-center">
                  <p className="fw-bold mb-0" style={{ fontSize: '1.2rem', color: s.color }}>{s.value}</p>
                  <p className="text-xs text-muted mb-0">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {rides.length > 0 && (
            <div className="mb-4">
              <h4 className="fw-semibold small mb-2">Recent Rides</h4>
              <div className="d-flex flex-column gap-2">
                {rides.slice(0, 4).map(r => (
                  <div key={r.id} className="rounded-xl px-3 py-2 d-flex justify-content-between bg-700 text-xs">
                    <div>
                      <p className="fw-medium mb-0">{r.pickupAddress} → {r.dropoffAddress}</p>
                      <p className="text-muted mb-0">{new Date(r.createdAt).toLocaleDateString()} · {r.paymentMethod}</p>
                    </div>
                    <p className="fw-bold text-brand mb-0">{r.fare ? `$${r.fare.toFixed(2)}` : '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {status !== 'deleted' && (
            <div className="d-flex flex-column gap-2">
              {status === 'active'
                ? <button onClick={onFreeze} className="btn fw-semibold d-flex align-items-center justify-content-center gap-2"
                    style={{ borderColor: 'rgba(234,179,8,0.4)', color: '#fbbf24', background: 'transparent' }}>
                    <Lock size={16} /> Freeze Account
                  </button>
                : <button onClick={onUnfreeze} className="btn btn-primary d-flex align-items-center justify-content-center gap-2">
                    <Unlock size={16} /> Unfreeze Account
                  </button>
              }
              <button onClick={onDelete} className="btn fw-semibold d-flex align-items-center justify-content-center gap-2"
                style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#f87171', background: 'transparent' }}>
                <Trash2 size={16} /> Delete Account
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function RideTable({ rides, users, compact }: { rides: Ride[]; users: UserType[]; compact?: boolean }) {
  const getName = (id?: string) => { const u = users.find(u => u.id === id); return u ? (u.fullName || u.name || id?.slice(0, 8) || '—') : (id?.slice(0, 8) || '—') }
  return (
    <table className="table table-hover small mb-0" style={{ minWidth: 600 }}>
      <thead><tr>{['Date', 'Client', 'Driver', 'Route', 'Payment', 'Fare', 'Status'].map(h => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>
        {rides.map(r => (
          <tr key={r.id}>
            <td className="text-muted text-nowrap">{new Date(r.createdAt).toLocaleDateString()}</td>
            <td className="fw-medium">{getName(r.clientId)}</td>
            <td className="text-muted">{r.driverId ? getName(r.driverId) : '—'}</td>
            <td className="text-muted text-truncate" style={{ maxWidth: 180 }}>{r.pickupAddress} → {r.dropoffAddress}</td>
            <td className="text-capitalize">{r.paymentMethod}</td>
            <td className="fw-bold text-brand">{r.fare ? `$${r.fare.toFixed(2)}` : '—'}</td>
            <td>
              <span className="text-xs px-2 py-1 rounded-pill fw-medium" style={{
                background: r.status === 'completed' ? 'rgba(34,197,94,0.2)' : r.status === 'cancelled' ? 'rgba(239,68,68,0.2)' : 'rgba(234,179,8,0.2)',
                color: r.status === 'completed' ? '#4ade80' : r.status === 'cancelled' ? '#f87171' : '#fbbf24',
              }}>{r.status}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function LogRow({ log, compact }: { log: ActivityLog; compact?: boolean }) {
  const sev = {
    info:     { color: '#60a5fa', bg: 'rgba(59,130,246,0.12)', icon: Info },
    warning:  { color: '#fbbf24', bg: 'rgba(234,179,8,0.12)',  icon: AlertTriangle },
    critical: { color: '#f87171', bg: 'rgba(239,68,68,0.12)',  icon: Zap },
  }[log.severity]
  const Icon = sev.icon

  return (
    <div className={`d-flex align-items-start gap-3 ${compact ? 'px-2 py-2' : 'px-3 py-3 border-bottom'}`} style={{ borderColor: 'rgba(55,65,81,0.4)' }}>
      <div className="d-flex align-items-center justify-content-center rounded-3 flex-shrink-0"
        style={{ width: compact ? 32 : 38, height: compact ? 32 : 38, background: sev.bg, border: `1px solid ${sev.color}33` }}>
        <Icon size={compact ? 14 : 17} style={{ color: sev.color }} />
      </div>
      <div className="flex-grow-1 overflow-hidden">
        <p className="mb-1" style={{ color: '#f3f4f6', fontSize: compact ? '0.85rem' : '0.95rem', lineHeight: 1.4 }}>
          {log.description}
        </p>
        <div className="d-flex align-items-center gap-2 flex-wrap" style={{ fontSize: '0.75rem' }}>
          <span className="text-capitalize fw-semibold px-2 py-1 rounded-pill" style={{ background: sev.bg, color: sev.color, fontSize: '0.65rem', letterSpacing: '0.03em' }}>
            {log.severity}
          </span>
          <span className="text-muted">{new Date(log.timestamp).toLocaleString()}</span>
          {log.userName && <>
            <span className="text-muted">·</span>
            <span className="text-muted">{log.userName}</span>
          </>}
          <span className="text-muted text-capitalize ms-auto" style={{ fontSize: '0.7rem' }}>{log.type}</span>
        </div>
      </div>
    </div>
  )
}

