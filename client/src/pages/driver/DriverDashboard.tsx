import React, { useState, useEffect, useRef } from 'react'
import {
  Home, Navigation, MessageSquare, DollarSign, Clock,
  MapPin, Phone, CheckCircle, XCircle, Play, Flag,
  ToggleLeft, ToggleRight, Star, TrendingUp, Loader, ArrowLeft,
  Clock3, FileCheck, AlertTriangle, Upload, Camera,
  User, LogOut, Bell, BellOff, ChevronRight, Layers,
  RotateCcw, Send, Package, Wallet, Lock,
} from 'lucide-react'
import api from '../../services/api'
import Navbar from '../../components/Navbar'
import BottomNav from '../../components/BottomNav'
import PageHeader, { useSwipeBack } from '../../components/PageHeader'
import MapView, { RouteInfo } from '../../components/MapView'
import ChatPanel from '../../components/ChatPanel'
import CallModal from '../../components/CallModal'
import IncomingBidCard from '../../components/IncomingBidCard'
import WalletTopUpModal from '../../components/WalletTopUpModal'
import { useAuth } from '../../context/AuthContext'
import { useSocket } from '../../context/SocketContext'
import { useGeolocation } from '../../hooks/useGeolocation'
import { Ride, Payout, LostItem, Bid } from '../../types'
import { useBackButton } from '../../hooks/useBackButton'

const NAV = [
  { id: 'home',     label: 'Dashboard',   icon: Home },
  { id: 'active',   label: 'Active Ride', icon: Navigation },
  { id: 'earnings', label: 'Earnings',    icon: DollarSign },
  { id: 'history',  label: 'History',     icon: Clock },
  { id: 'chat',     label: 'Messages',    icon: MessageSquare },
  { id: 'kyc',      label: 'My Documents', icon: FileCheck },
]

const BOTTOM_TABS = [
  { id: 'home',     label: 'Home',     icon: Home },
  { id: 'active',   label: 'Active',   icon: Navigation },
  { id: 'earnings', label: 'Earnings', icon: DollarSign },
  { id: 'chat',     label: 'Messages', icon: MessageSquare },
  { id: 'account',  label: 'Account',  icon: User },
]

export default function DriverDashboard() {
  const { user, updateUser, logout } = useAuth()
  const { socket, activeRide, setActiveRide, acceptRide, updateRideStatus, shareLocation, driverLocation } = useSocket()
  const { coords } = useGeolocation()

  const [tab, setTab]           = useState('home')
  const [tabStack, setTabStack] = useState<string[]>([])

  function navigateTo(id: string) {
    if (id === tab) return
    setTabStack(prev => [...prev, tab])
    setTab(id)
  }
  function goBack() {
    setTabStack(prev => {
      if (prev.length === 0) return prev
      const next = [...prev]
      const prev_ = next.pop()!
      setTab(prev_)
      return next
    })
  }

  useBackButton(() => {
    if (tabStack.length > 0) { goBack(); return true }
    return false
  })

  // Swipe right from the left edge → go back (iOS-style gesture)
  useSwipeBack(tabStack.length > 0, goBack)

  // Reset scroll on tab change
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }) }, [tab])

  const [isOnline, setIsOnline]       = useState(false)
  const [pendingRide, setPendingRide] = useState<Ride | null>(null)
  const [acceptLoading, setAcceptLoading] = useState(false)
  const [counterMode,    setCounterMode]    = useState(false)
  const [counterFareIn,  setCounterFareIn]  = useState('')
  const [counterSent,    setCounterSent]    = useState(false)
  const [counterLoading, setCounterLoading] = useState(false)

  // Bidding (InDrive-style)
  const [incomingBid,  setIncomingBid]  = useState<Bid | null>(null)
  const [wallet,       setWallet]       = useState<{ balance: number; heldBalance: number; total: number } | null>(null)
  const [walletLocked, setWalletLocked] = useState<{ required: number; balance: number } | null>(null)
  const [showTopUp,    setShowTopUp]    = useState(false)
  const [history, setHistory]         = useState<Ride[]>([])
  const [showChat, setShowChat]       = useState(false)
  const [callState, setCallState]     = useState<{ open: boolean; type: 'audio' | 'video' }>({ open: false, type: 'audio' })
  const [routeInfo, setRouteInfo]     = useState<RouteInfo | null>(null)

  // KYC — initialized empty so it works when user loads asynchronously from /auth/me
  const [kycForm, setKycForm] = useState({
    licenceNumber: '', licenceClass: 'Class 4', licenceExpiry: '',
    nationalIdNumber: '', vehicleReg: '', vehicleMake: '', vehicleModel: '',
    vehicleYear: '', vehicleColour: '', insuranceExpiry: '', zinaraExpiry: '',
  })
  useEffect(() => {
    if (!user) return
    setKycForm({
      licenceNumber:    user.driverDocuments?.licenceNumber    || '',
      licenceClass:     user.driverDocuments?.licenceClass     || 'Class 4',
      licenceExpiry:    user.driverDocuments?.licenceExpiry    || '',
      nationalIdNumber: user.driverDocuments?.nationalIdNumber || '',
      vehicleReg:       user.vehicleDetails?.registration      || '',
      vehicleMake:      user.vehicleDetails?.make              || '',
      vehicleModel:     user.vehicleDetails?.model             || '',
      vehicleYear:      user.vehicleDetails?.year              || '',
      vehicleColour:    user.vehicleDetails?.colour            || '',
      insuranceExpiry:  user.vehicleDetails?.insuranceExpiry   || '',
      zinaraExpiry:     user.vehicleDetails?.zinaraExpiry      || '',
    })
  }, [user?.id])
  const [kycSaving, setKycSaving]   = useState(false)
  const [kycSuccess, setKycSuccess] = useState(false)
  const [kycError, setKycError]     = useState('')

  const [notificationsOn, setNotificationsOn] = useState(() => localStorage.getItem('easyride_notifs') !== 'off')
  function toggleNotifications() {
    const next = !notificationsOn
    setNotificationsOn(next)
    localStorage.setItem('easyride_notifs', next ? 'on' : 'off')
  }

  // ── Selfie verification ────────────────────────────────────────────────────
  const selfieInputRef = useRef<HTMLInputElement>(null)
  const [showSelfieCheck, setShowSelfieCheck] = useState(false)
  const [selfieDataUrl,   setSelfieDataUrl]   = useState<string | null>(null)
  const [selfieUploading, setSelfieUploading] = useState(false)
  const [selfieError,     setSelfieError]     = useState('')

  // ── Heat map ───────────────────────────────────────────────────────────────
  type HeatPoint = { lat: number; lng: number; weight: number }
  const [heatmapData,  setHeatmapData]  = useState<HeatPoint[]>([])
  const [showHeatmap,  setShowHeatmap]  = useState(false)

  async function fetchHeatmap() {
    try {
      const res = await api.get('/drivers/heatmap')
      setHeatmapData(res.data)
    } catch { /* silently ignore */ }
  }

  useEffect(() => {
    if (!isOnline || !showHeatmap) return
    fetchHeatmap()
    const id = setInterval(fetchHeatmap, 60_000)
    return () => clearInterval(id)
  }, [isOnline, showHeatmap])

  // ── Cashouts ──────────────────────────────────────────────────────────────
  const [payouts,       setPayouts]       = useState<Payout[]>([])
  const [showCashout,   setShowCashout]   = useState(false)
  const [cashoutForm,   setCashoutForm]   = useState<{ amount: string; method: 'ecocash' | 'bank'; phone: string }>({ amount: '', method: 'ecocash', phone: '' })
  const [cashoutSaving, setCashoutSaving] = useState(false)
  const [cashoutError,  setCashoutError]  = useState('')

  useEffect(() => {
    api.get('/drivers/cashouts').then(r => setPayouts(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!socket) return
    const handler = (p: Payout) => setPayouts(prev => prev.map(x => x.id === p.id ? p : x))
    socket.on('cashout:updated', handler)
    return () => { socket.off('cashout:updated', handler) }
  }, [socket])

  const totalPaidOut = payouts.filter(p => ['approved', 'paid'].includes(p.status)).reduce((s, p) => s + p.amount, 0)

  async function requestCashout(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(cashoutForm.amount)
    if (!amount || amount <= 0) { setCashoutError('Enter a valid amount'); return }
    setCashoutSaving(true); setCashoutError('')
    try {
      const res = await api.post('/drivers/cashout', {
        amount, method: cashoutForm.method, phone: cashoutForm.phone,
      })
      setPayouts(prev => [res.data, ...prev])
      setShowCashout(false)
      setCashoutForm({ amount: '', method: 'ecocash', phone: user?.phone || '' })
    } catch (err: unknown) {
      setCashoutError(err instanceof Error ? err.message : 'Request failed')
    } finally { setCashoutSaving(false) }
  }

  // ── Return-trip bids ───────────────────────────────────────────────────────
  const [returnBidRide, setReturnBidRide] = useState<Ride | null>(null)
  const [returnBidFare, setReturnBidFare] = useState('')
  const [returnBidSent, setReturnBidSent] = useState(false)

  useEffect(() => {
    if (!socket) return
    const handler = (ride: Ride) => {
      setReturnBidRide(null); setReturnBidSent(false)
      setActiveRide(ride); navigateTo('active')
    }
    socket.on('returnBid:confirmed', handler)
    return () => { socket.off('returnBid:confirmed', handler) }
  }, [socket])

  // ── Lost & Found ───────────────────────────────────────────────────────────
  const [lostItems,       setLostItems]       = useState<LostItem[]>([])
  const [activeLostItem,  setActiveLostItem]  = useState<LostItem | null>(null)
  const [lostReplyText,   setLostReplyText]   = useState('')
  const [sendingLostReply, setSendingLostReply] = useState(false)
  const lostThreadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.get('/lost-items').then(r => setLostItems(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!socket) return
    const onNew = (item: LostItem) => setLostItems(prev => [item, ...prev])
    const onMsg = (item: LostItem) => {
      setLostItems(prev => prev.map(x => x.id === item.id ? item : x))
      setActiveLostItem(prev => prev?.id === item.id ? item : prev)
    }
    const onUpdated = (item: LostItem) => {
      setLostItems(prev => prev.map(x => x.id === item.id ? item : x))
      setActiveLostItem(prev => prev?.id === item.id ? item : prev)
    }
    socket.on('lostItem:new',     onNew)
    socket.on('lostItem:message', onMsg)
    socket.on('lostItem:updated', onUpdated)
    return () => {
      socket.off('lostItem:new',     onNew)
      socket.off('lostItem:message', onMsg)
      socket.off('lostItem:updated', onUpdated)
    }
  }, [socket])

  useEffect(() => {
    if (lostThreadRef.current) {
      lostThreadRef.current.scrollTop = lostThreadRef.current.scrollHeight
    }
  }, [activeLostItem?.messages.length])

  async function sendLostReply() {
    if (!activeLostItem || !lostReplyText.trim()) return
    setSendingLostReply(true)
    try {
      const res = await api.post(`/lost-items/${activeLostItem.id}/message`, { text: lostReplyText.trim() })
      setActiveLostItem(res.data)
      setLostItems(prev => prev.map(x => x.id === res.data.id ? res.data : x))
      setLostReplyText('')
    } catch { /* noop */ } finally { setSendingLostReply(false) }
  }

  function compressSelfie(dataUrl: string): Promise<string> {
    return new Promise(resolve => {
      const img = new Image()
      img.onload = () => {
        const MAX = 400
        const scale = Math.min(MAX / img.width, MAX / img.height, 1)
        const canvas = document.createElement('canvas')
        canvas.width  = Math.round(img.width  * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.65))
      }
      img.src = dataUrl
    })
  }

  function requestGoOnline() {
    if (user?.verification?.status !== 'approved') { navigateTo('kyc'); return }
    // Skip selfie check if it was done within the last 12 hours
    if (user?.lastSelfieAt) {
      const hoursSince = (Date.now() - new Date(user.lastSelfieAt).getTime()) / 3_600_000
      if (hoursSince < 12) { setIsOnline(true); return }
    }
    setSelfieDataUrl(null); setSelfieError(''); setShowSelfieCheck(true)
  }

  async function confirmSelfie() {
    if (!selfieDataUrl) return
    setSelfieUploading(true); setSelfieError('')
    try {
      const compressed = await compressSelfie(selfieDataUrl)
      const res = await api.post('/drivers/selfie', { selfieBase64: compressed })
      updateUser({ lastSelfieAt: res.data.verifiedAt })
      setShowSelfieCheck(false); setSelfieDataUrl(null)
      setIsOnline(true)
    } catch (err: unknown) {
      setSelfieError(err instanceof Error ? err.message : 'Upload failed. Try again.')
    } finally { setSelfieUploading(false) }
  }

  function toggleDriverOnline() {
    if (isOnline) { setIsOnline(false); return }
    requestGoOnline()
  }

  // Clear pending popup when any ride becomes active (normal accept OR counter accepted)
  useEffect(() => {
    if (!activeRide) return
    setPendingRide(null); setCounterMode(false); setCounterSent(false); setCounterFareIn('')
    navigateTo('active')
  }, [activeRide?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Broadcast live GPS position on every update
  const activeRideId = activeRide?.id
  useEffect(() => {
    if (!isOnline || !activeRideId || !coords) return
    shareLocation(activeRideId, coords)
  }, [coords, isOnline, activeRideId])

  useEffect(() => {
    api.get('/rides/history').then(r => setHistory(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!isOnline) setPendingRide(null)
  }, [isOnline])

  // Listen for incoming ride requests and surface them as a popup
  useEffect(() => {
    if (!socket) return
    const handleRideNew = (ride: Ride) => {
      if (isOnline) setPendingRide(ride)
    }
    socket.on('ride:new', handleRideNew)
    return () => { socket.off('ride:new', handleRideNew) }
  }, [socket, isOnline])

  // Bidding listeners — bid:new surfaces the full-screen card, wallet:locked
  // shows a banner so the driver knows why bids are being skipped.
  useEffect(() => {
    if (!socket) return
    const onBidNew = (bid: Bid) => {
      if (!isOnline) return
      if (activeRide) return
      if (incomingBid) return
      setIncomingBid(bid)
    }
    const onWalletLocked = ({ required, balance }: { required: number; balance: number }) => {
      setWalletLocked({ required, balance })
    }
    socket.on('bid:new', onBidNew)
    socket.on('wallet:locked', onWalletLocked)
    return () => { socket.off('bid:new', onBidNew); socket.off('wallet:locked', onWalletLocked) }
  }, [socket, isOnline, activeRide, incomingBid])

  // Load wallet on mount + whenever the driver goes online / a ride completes
  // (commission is deducted on acceptance so balance may change).
  useEffect(() => {
    if (user?.role !== 'driver') return
    api.get('/bids/_wallet/me')
      .then(r => setWallet({ balance: r.data.balance, heldBalance: r.data.heldBalance, total: r.data.total }))
      .catch(() => { /* no wallet yet — treated as 0 on server */ })
  }, [user?.id, isOnline, activeRide?.id])

  async function handleAccept() {
    if (!pendingRide) return
    setAcceptLoading(true)
    try {
      acceptRide(pendingRide.id)
      setActiveRide({ ...pendingRide, status: 'accepted', driverId: user!.id })
      setPendingRide(null)
      navigateTo('active')
    } catch (err) {
      console.error('Failed to accept ride:', err)
    } finally { setAcceptLoading(false) }
  }

  async function updateStatus(status: Ride['status']) {
    if (!activeRide) return
    const extra = status === 'completed' && activeRide.fare
      ? { fare: activeRide.fare, distance: activeRide.distance, duration: activeRide.duration }
      : undefined
    updateRideStatus(activeRide.id, status, extra)
    setActiveRide({ ...activeRide, status })
    if (status === 'completed') {
      setHistory(prev => [{ ...activeRide, status: 'completed' }, ...prev])
      const completedRide = { ...activeRide, status: 'completed' as const }
      setReturnBidRide(completedRide)
      setReturnBidFare(completedRide.fare ? completedRide.fare.toFixed(2) : '')
      setReturnBidSent(false)
      const t = setTimeout(() => { setActiveRide(null); navigateTo('home') }, 2000)
      return () => clearTimeout(t)
    }
  }

  const todayEarnings = history
    .filter(r => new Date(r.createdAt).toDateString() === new Date().toDateString())
    .reduce((s, r) => s + (r.fare || 0), 0)
  const totalEarnings = history.reduce((s, r) => s + (r.fare || 0), 0)
  const availableBalance = +(totalEarnings - totalPaidOut).toFixed(2)

  const BackBtn = () => tabStack.length > 0 ? (
    <button onClick={goBack} className="btn btn-secondary d-inline-flex align-items-center gap-2 mb-3 text-xs">
      <ArrowLeft size={14} /> Back
    </button>
  ) : null

  return (
    <div className="min-vh-100 d-flex bg-900">
      <Navbar items={NAV} active={tab} onNav={navigateTo} onBack={goBack} canGoBack={tabStack.length > 0} />

      <main className="eg-main flex-grow-1 px-3 px-lg-4 overflow-x-hidden">

        {/* ─── HOME ─── */}
        {tab === 'home' && (
          <div className="animate-fade-in" style={{ maxWidth: 900 }}>
            <PageHeader
              title="Driver Dashboard"
              subtitle={`${user?.vehicleModel || 'Vehicle'} · ${user?.vehicleReg || '—'}`}
              icon={Home}
              iconColor="#4ade80"
              canGoBack={tabStack.length > 0}
              onBack={goBack}
              action={
                <div className="d-flex align-items-center gap-2">
                  <span className={`fw-semibold ${isOnline ? 'text-brand' : 'text-muted'}`} style={{ fontSize: '0.9rem' }}>
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                  <button
                    onClick={toggleDriverOnline}
                    className="btn p-0 border-0" style={{ color: isOnline ? '#4ade80' : '#6b7280', background: 'transparent' }}>
                    {isOnline ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                  </button>
                </div>
              }
            />

            {/* Wallet locked banner — appears when driver missed a bid because wallet too low */}
            {walletLocked && (
              <div className="card p-3 mb-3 d-flex align-items-start gap-3"
                   style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}>
                <div className="rounded-xl d-flex align-items-center justify-content-center flex-shrink-0"
                     style={{ width: 40, height: 40, background: 'rgba(239,68,68,0.15)' }}>
                  <Lock size={20} style={{ color: '#f87171' }} />
                </div>
                <div className="flex-grow-1">
                  <p className="fw-semibold mb-1" style={{ color: '#fca5a5' }}>Wallet balance too low</p>
                  <p className="text-xs text-muted mb-2">
                    You need ${walletLocked.required.toFixed(2)} in your wallet to receive this bid
                    (current: ${walletLocked.balance.toFixed(2)}).
                  </p>
                  <button onClick={() => setShowTopUp(true)}
                          className="btn btn-primary btn-sm fw-semibold d-inline-flex align-items-center gap-1">
                    <Wallet size={14} /> Top up now
                  </button>
                </div>
                <button onClick={() => setWalletLocked(null)}
                        className="btn btn-link text-muted p-0 flex-shrink-0" aria-label="Dismiss">
                  <XCircle size={18} />
                </button>
              </div>
            )}

            {/* Wallet tile — balance + held, with top-up CTA */}
            {wallet && (
              <div className="card p-3 mb-3 d-flex align-items-center gap-3"
                   style={{ borderColor: wallet.balance < 1 ? 'rgba(239,68,68,0.4)' : 'var(--eg-600)' }}>
                <div className="rounded-xl d-flex align-items-center justify-content-center flex-shrink-0"
                     style={{ width: 44, height: 44, background: 'rgba(96,165,250,0.15)' }}>
                  <Wallet size={22} style={{ color: '#60a5fa' }} />
                </div>
                <div className="flex-grow-1">
                  <p className="text-xs text-muted mb-1">Driver wallet</p>
                  <p className="fw-bold mb-0" style={{ fontSize: '1.3rem' }}>
                    ${wallet.balance.toFixed(2)}
                    {wallet.heldBalance > 0 && (
                      <span className="text-xs text-muted fw-normal ms-2">
                        · ${wallet.heldBalance.toFixed(2)} held
                      </span>
                    )}
                  </p>
                </div>
                {wallet.balance < 1 && (
                  <span className="badge rounded-pill me-2" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                    Low
                  </span>
                )}
                <button onClick={() => setShowTopUp(true)}
                        className="btn btn-primary btn-sm fw-semibold flex-shrink-0">
                  Top up
                </button>
              </div>
            )}

            {/* Stats */}
            <div className="row g-3 mb-4">
              {[
                { label: "Today's Earnings", value: `$${todayEarnings.toFixed(2)}`, icon: DollarSign, color: '#4ade80' },
                { label: 'Total Earnings',   value: `$${totalEarnings.toFixed(2)}`,  icon: TrendingUp,  color: '#60a5fa' },
                { label: 'Rides Today',      value: history.filter(r => new Date(r.createdAt).toDateString() === new Date().toDateString()).length, icon: Navigation, color: '#c084fc' },
                { label: 'Rating',           value: user?.rating ? `${user.rating.toFixed(1)} ★` : '—', icon: Star, color: '#fbbf24' },
              ].map(s => (
                <div key={s.label} className="col-6 col-sm-3">
                  <div className="card p-3">
                    <s.icon size={22} style={{ color: s.color }} className="mb-2" />
                    <p className="fs-5 fw-bold mb-0" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-xs text-muted mt-1 mb-0">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Offline prompt */}
            {!isOnline && (
              <div className="card p-5 text-center mb-4" style={{ border: '2px dashed var(--eg-600)' }}>
                <ToggleLeft size={48} className="text-muted mx-auto mb-3" />
                <h5 className="fw-semibold mb-2">You're offline</h5>
                <p className="text-muted small mb-4">Toggle online to start receiving ride requests</p>
                <button onClick={requestGoOnline} className="btn btn-primary px-4">Go Online</button>
              </div>
            )}

            {/* Waiting pulse */}
            {isOnline && !activeRide && !pendingRide && (
              <div className="card p-4 text-center mb-4" style={{ borderColor: 'rgba(34,197,94,0.2)', background: 'rgba(34,197,94,0.04)' }}>
                <div className="position-relative mx-auto mb-3" style={{ width: 64, height: 64 }}>
                  <div className="position-absolute top-0 start-0 w-100 h-100 rounded-circle ping-ring" style={{ background: 'rgba(34,197,94,0.25)' }} />
                  <div className="position-relative w-100 h-100 rounded-circle d-flex align-items-center justify-content-center" style={{ background: 'rgba(34,197,94,0.15)' }}>
                    <Navigation size={28} className="text-brand" />
                  </div>
                </div>
                <p className="fw-semibold text-brand mb-1">Waiting for rides...</p>
                <p className="text-muted small mb-0">Your location is being shared with nearby clients</p>
              </div>
            )}

            {/* Active ride summary */}
            {activeRide && activeRide.status !== 'completed' && (
              <div className="card p-4 mb-4" style={{ borderColor: 'rgba(34,197,94,0.4)', background: 'rgba(34,197,94,0.04)' }}>
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <div>
                    <span className="fw-semibold text-brand d-block">Active Ride</span>
                    {activeRide.fare
                      ? <span className="fw-bold text-white" style={{ fontSize: '1.1rem' }}>${activeRide.fare.toFixed(2)} <span className="text-muted fw-normal text-xs">USD</span></span>
                      : <span className="text-xs text-muted">Calculating fare…</span>
                    }
                  </div>
                  <div className="d-flex gap-2">
                    <button onClick={() => setCallState({ open: true, type: 'audio' })}
                      className="btn btn-secondary p-2"><Phone size={14} /></button>
                    <button onClick={() => setShowChat(true)}
                      className="btn btn-secondary p-2"><MessageSquare size={14} /></button>
                  </div>
                </div>
                <div className="d-flex flex-column gap-2 small mb-3">
                  <div className="d-flex align-items-center gap-2">
                    <MapPin size={14} className="text-brand flex-shrink-0" />
                    <span>{activeRide.pickupAddress}</span>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <MapPin size={14} className="text-danger flex-shrink-0" />
                    <span>{activeRide.dropoffAddress}</span>
                  </div>
                </div>
                <div className="d-flex gap-2">
                  {activeRide.status === 'accepted' && (
                    <button onClick={() => updateStatus('pickup')} className="btn btn-primary flex-grow-1 d-flex align-items-center justify-content-center gap-2">
                      <Play size={14} /> Arrived at Pickup
                    </button>
                  )}
                  {activeRide.status === 'pickup' && (
                    <button onClick={() => updateStatus('inprogress')} className="btn btn-primary flex-grow-1 d-flex align-items-center justify-content-center gap-2">
                      <Play size={14} /> Start Ride
                    </button>
                  )}
                  {activeRide.status === 'inprogress' && (
                    <button onClick={() => updateStatus('completed')} className="btn flex-grow-1 d-flex align-items-center justify-content-center gap-2 fw-semibold text-white" style={{ background: '#16a34a' }}>
                      <Flag size={14} /> Complete Ride
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Return-trip bid card */}
            {returnBidRide && !returnBidSent && (
              <div className="card p-4 mb-4" style={{ borderColor: 'rgba(250,204,21,0.35)', background: 'rgba(250,204,21,0.04)' }}>
                <div className="d-flex align-items-center gap-2 mb-2">
                  <RotateCcw size={16} style={{ color: '#facc15' }} />
                  <span className="fw-semibold small">Offer Return Trip?</span>
                </div>
                <p className="text-muted text-xs mb-3">
                  Offer to take your passenger back to <strong className="text-white">{returnBidRide.pickupAddress}</strong>
                </p>
                <div className="input-group mb-3">
                  <span className="input-group-text bg-700 border-600 text-muted">$</span>
                  <input
                    type="number" min="0" step="0.50"
                    className="form-control"
                    placeholder="Proposed fare"
                    value={returnBidFare}
                    onChange={e => setReturnBidFare(e.target.value)}
                  />
                </div>
                <div className="d-flex gap-2">
                  <button
                    onClick={() => {
                      const fare = parseFloat(returnBidFare)
                      if (!fare || fare <= 0) return
                      socket?.emit('returnBid:offer', { rideId: returnBidRide.id, proposedFare: fare })
                      setReturnBidSent(true)
                    }}
                    disabled={!returnBidFare || parseFloat(returnBidFare) <= 0}
                    className="btn btn-primary flex-grow-1 d-flex align-items-center justify-content-center gap-2"
                  >
                    <Send size={14} /> Send Offer
                  </button>
                  <button onClick={() => setReturnBidRide(null)} className="btn btn-secondary px-3">
                    <XCircle size={14} />
                  </button>
                </div>
              </div>
            )}

            {returnBidSent && (
              <div className="card p-4 mb-4 text-center" style={{ borderColor: 'rgba(250,204,21,0.35)' }}>
                <Loader size={24} style={{ color: '#facc15' }} className="mx-auto mb-2 animate-spin" />
                <p className="fw-semibold small mb-1">Offer sent!</p>
                <p className="text-muted text-xs mb-3">Waiting for passenger to accept…</p>
                <button onClick={() => { setReturnBidSent(false); setReturnBidRide(null) }}
                  className="btn btn-secondary btn-sm">Cancel</button>
              </div>
            )}

            {/* Lost & Found requests */}
            {lostItems.filter(li => li.status === 'open').length > 0 && (
              <div className="card p-4 mb-4" style={{ borderColor: 'rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.03)' }}>
                <div className="d-flex align-items-center gap-2 mb-3">
                  <Package size={16} style={{ color: '#fbbf24' }} />
                  <span className="fw-semibold small">Lost &amp; Found</span>
                  <span className="ms-auto badge" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '1rem', padding: '0.15rem 0.5rem', fontSize: '0.7rem' }}>
                    {lostItems.filter(li => li.status === 'open').length} open
                  </span>
                </div>
                <div className="d-flex flex-column gap-2">
                  {lostItems.filter(li => li.status === 'open').slice(0, 3).map(li => (
                    <button
                      key={li.id}
                      onClick={() => { setActiveLostItem(li); setLostReplyText('') }}
                      className="d-flex align-items-center gap-3 p-2 rounded-xl text-start w-100 border-0"
                      style={{ background: 'var(--eg-700)', cursor: 'pointer', color: 'inherit' }}
                    >
                      <Package size={14} style={{ color: '#fbbf24', flexShrink: 0 }} />
                      <div className="flex-grow-1 overflow-hidden">
                        <p className="text-xs fw-medium mb-0 text-truncate">{li.description}</p>
                        <p className="text-xs text-muted mb-0">
                          {li.messages.length} message{li.messages.length !== 1 ? 's' : ''} ·
                          expires {new Date(li.expiresAt).toLocaleDateString()}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="d-flex align-items-center justify-content-between mb-2">
              <p className="text-xs text-muted mb-0">Live Map</p>
              {isOnline && (
                <button
                  onClick={() => setShowHeatmap(h => !h)}
                  className={`btn d-flex align-items-center gap-1 py-1 px-2 text-xs ${showHeatmap ? 'btn-primary' : 'btn-secondary'}`}
                >
                  <Layers size={12} /> {showHeatmap ? 'Demand On' : 'Demand Off'}
                </button>
              )}
            </div>
            <MapView
              driverLocation={coords || undefined}
              heatmapPoints={showHeatmap && heatmapData.length > 0 ? heatmapData : undefined}
              className="h-64 rounded-3"
            />
          </div>
        )}

        {/* ─── ACTIVE RIDE ─── */}
        {tab === 'active' && (
          <div className="animate-fade-in" style={{ maxWidth: 680 }}>
            <PageHeader
              title="Active Ride"
              subtitle={activeRide ? `Status: ${activeRide.status}` : 'No ride in progress'}
              icon={Navigation}
              iconColor="#4ade80"
              canGoBack={tabStack.length > 0}
              onBack={goBack}
            />
            {!activeRide ? (
              <div className="card p-5 text-center text-muted">
                <Navigation size={48} className="mx-auto mb-3 opacity-50" />
                <p className="mb-0">No active ride</p>
              </div>
            ) : (
              <div className="d-flex flex-column gap-3">
                <div style={{ height: 300 }}>
                  <MapView
                    driverLocation={coords || undefined}
                    pickupLocation={activeRide.pickupCoords}
                    dropoffLocation={activeRide.status === 'inprogress' ? activeRide.dropoffCoords : undefined}
                    routeFrom={
                      activeRide.status === 'pickup'
                        ? activeRide.pickupCoords
                        : coords || undefined
                    }
                    routeTo={
                      activeRide.status === 'inprogress'
                        ? activeRide.dropoffCoords
                        : activeRide.pickupCoords
                    }
                    routeColor={activeRide.status === 'inprogress' ? '#22c55e' : '#60a5fa'}
                    followDriver={activeRide.status !== 'pickup'}
                    onRouteInfo={setRouteInfo}
                    className="rounded-3 h-100"
                  />
                </div>

                {/* ETA / distance panel */}
                {routeInfo && (
                  <div className="d-flex gap-3">
                    <div className="card flex-grow-1 p-3 text-center">
                      <p className="text-xs text-muted mb-1">Distance</p>
                      <p className="fw-bold text-brand mb-0">{routeInfo.distance} km</p>
                    </div>
                    <div className="card flex-grow-1 p-3 text-center">
                      <p className="text-xs text-muted mb-1">ETA</p>
                      <p className="fw-bold mb-0 d-flex align-items-center justify-content-center gap-1">
                        <Clock3 size={13} className="text-brand" />
                        ~{routeInfo.duration} min
                      </p>
                    </div>
                    <div className="card flex-grow-1 p-3 text-center">
                      <p className="text-xs text-muted mb-1">Heading to</p>
                      <p className="fw-bold mb-0 text-xs">
                        {activeRide.status === 'inprogress' ? 'Dropoff' : 'Pickup'}
                      </p>
                    </div>
                  </div>
                )}
                <div className="card p-4">
                  <div className="d-flex align-items-center justify-content-between mb-3">
                    <h6 className="fw-semibold mb-0">Ride Details</h6>
                    <span className={activeRide.status === 'inprogress' ? 'badge-brand' : 'badge-warn'}>
                      {({ accepted: 'Accepted', pickup: 'En Route', inprogress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled', searching: 'Searching', scheduled: 'Scheduled' } as Record<string, string>)[activeRide.status] || activeRide.status}
                    </span>
                  </div>
                  <div className="d-flex flex-column gap-2 small mb-3">
                    <div className="d-flex align-items-center gap-2">
                      <MapPin size={14} className="text-brand flex-shrink-0" />
                      <span>{activeRide.pickupAddress}</span>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <MapPin size={14} className="text-danger flex-shrink-0" />
                      <span>{activeRide.dropoffAddress}</span>
                    </div>
                  </div>
                  <div className="d-flex align-items-center gap-3 p-3 rounded-3 mb-3" style={{ background: 'var(--eg-700)' }}>
                    <div className="rounded-circle d-flex align-items-center justify-content-center fw-bold flex-shrink-0"
                      style={{ width: 36, height: 36, background: 'rgba(96,165,250,0.15)', color: '#60a5fa', fontSize: '0.85rem' }}>C</div>
                    <div className="flex-grow-1">
                      <p className="fw-medium small mb-0">Client</p>
                      <p className="text-xs text-muted mb-0">Payment: <span className="text-capitalize">{activeRide.paymentMethod?.replace('_', ' ')}</span></p>
                    </div>
                    <div className="d-flex gap-2">
                      <button onClick={() => setCallState({ open: true, type: 'audio' })} className="btn btn-secondary p-2"><Phone size={14} /></button>
                      <button onClick={() => setShowChat(true)} className="btn btn-secondary p-2"><MessageSquare size={14} /></button>
                    </div>
                  </div>
                  <div className="d-flex gap-2">
                    {activeRide.status === 'accepted' && (
                      <button onClick={() => updateStatus('pickup')} className="btn btn-primary flex-grow-1 d-flex align-items-center justify-content-center gap-2">
                        <CheckCircle size={14} /> Arrived at Pickup
                      </button>
                    )}
                    {activeRide.status === 'pickup' && (
                      <button onClick={() => updateStatus('inprogress')} className="btn btn-primary flex-grow-1 d-flex align-items-center justify-content-center gap-2">
                        <Play size={14} /> Start Ride
                      </button>
                    )}
                    {activeRide.status === 'inprogress' && (
                      <button onClick={() => updateStatus('completed')} className="btn flex-grow-1 fw-semibold text-white d-flex align-items-center justify-content-center gap-2" style={{ background: '#16a34a' }}>
                        <Flag size={14} /> Complete Ride
                      </button>
                    )}
                    {['accepted', 'pickup'].includes(activeRide.status) && (
                      <button onClick={() => updateStatus('cancelled')} className="btn p-2 rounded-3" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                        <XCircle size={18} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── EARNINGS ─── */}
        {tab === 'earnings' && (() => {
          const now = new Date()
          const thisWeek = history
            .filter(r => (now.getTime() - new Date(r.createdAt).getTime()) < 7 * 86400000)
            .reduce((s, r) => s + (r.fare || 0), 0)
          const lastWeek = history
            .filter(r => {
              const diff = (now.getTime() - new Date(r.createdAt).getTime()) / 86400000
              return diff >= 7 && diff < 14
            })
            .reduce((s, r) => s + (r.fare || 0), 0)
          const weekPct = lastWeek > 0 ? ((thisWeek - lastWeek) / lastWeek * 100) : null
          return (
          <div className="animate-fade-in" style={{ maxWidth: 800 }}>
            <PageHeader
              title="Earnings"
              subtitle={`$${totalEarnings.toFixed(2)} total · $${todayEarnings.toFixed(2)} today`}
              icon={DollarSign}
              iconColor="#fbbf24"
              canGoBack={tabStack.length > 0}
              onBack={goBack}
            />
            <div className="row g-3 mb-4">
              {[
                { label: 'Today',     value: `$${todayEarnings.toFixed(2)}`, color: '#4ade80', sub: null },
                { label: 'This Week', value: `$${thisWeek.toFixed(2)}`,      color: '#60a5fa',
                  sub: weekPct !== null
                    ? <span style={{ fontSize: '0.7rem', color: weekPct >= 0 ? '#4ade80' : '#f87171' }}>
                        {weekPct >= 0 ? '↑' : '↓'}{Math.abs(weekPct).toFixed(0)}% vs last week
                      </span>
                    : null },
                { label: 'Total',     value: `$${totalEarnings.toFixed(2)}`, color: '#c084fc', sub: null },
              ].map(e => (
                <div key={e.label} className="col-4">
                  <div className="card p-4 text-center">
                    <p className="fs-4 fw-bold mb-0" style={{ color: e.color }}>{e.value}</p>
                    <p className="text-muted small mt-1 mb-0">{e.label}</p>
                    {e.sub && <div className="mt-1">{e.sub}</div>}
                  </div>
                </div>
              ))}
            </div>

            <div className="card p-4 mb-4">
              <h6 className="fw-semibold mb-3">Last 7 Days</h6>
              <EarningsChart rides={history} />
            </div>

            <div className="card p-4 mb-4">
              <h6 className="fw-semibold mb-3">Payment Breakdown</h6>
              {['cash_usd', 'cash_zig', 'ecocash', 'voucher', 'cash'].map(m => {
                const byMethod = history.filter(r => r.paymentMethod === m)
                const earned = byMethod.reduce((s, r) => s + (r.fare || 0), 0)
                if (!byMethod.length) return null
                const lbl = m === 'ecocash' ? 'EcoCash' : m === 'cash_usd' ? 'Cash USD' : m === 'cash_zig' ? 'Cash ZiG' : m === 'voucher' ? 'Voucher' : 'Cash'
                return (
                  <div key={m} className="d-flex align-items-center justify-content-between py-2 border-bottom border-700">
                    <span className="small fw-medium">{lbl}</span>
                    <div className="text-end">
                      <p className="fw-bold text-brand mb-0">${earned.toFixed(2)}</p>
                      <p className="text-xs text-muted mb-0">{byMethod.length} ride{byMethod.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ── Cashout card ── */}
            <div className="card p-4 mb-4" style={{ borderColor: 'rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.04)' }}>
              <div className="d-flex align-items-center justify-content-between mb-3">
                <div>
                  <h6 className="fw-semibold mb-0">Available Balance</h6>
                  <p className="text-xs text-muted mb-0">Earnings minus processed payouts</p>
                </div>
                <p className="fs-4 fw-bold mb-0" style={{ color: '#60a5fa' }}>${availableBalance.toFixed(2)}</p>
              </div>
              {payouts.some(p => p.status === 'pending') ? (
                <div className="d-flex align-items-center gap-2 p-2 rounded-xl text-xs"
                  style={{ background: 'rgba(245,158,11,0.1)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)' }}>
                  <Loader size={13} className="animate-spin" />
                  Cashout pending — admin is processing your request.
                </div>
              ) : (
                <button
                  onClick={() => { setCashoutForm(f => ({ ...f, phone: user?.phone || '' })); setShowCashout(true); setCashoutError('') }}
                  disabled={availableBalance <= 0}
                  className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2"
                >
                  <DollarSign size={15} /> Request Cashout
                </button>
              )}
            </div>

            {/* ── Payout history ── */}
            {payouts.length > 0 && (
              <div className="card p-4">
                <h6 className="fw-semibold mb-3">Payout History</h6>
                <div className="d-flex flex-column gap-2">
                  {payouts.map(p => {
                    const colors: Record<string, string> = { pending: '#fbbf24', approved: '#4ade80', paid: '#4ade80', rejected: '#f87171' }
                    const labels: Record<string, string> = { pending: 'Pending', approved: 'Approved', paid: 'Paid', rejected: 'Rejected' }
                    return (
                      <div key={p.id} className="d-flex align-items-center justify-content-between py-2 border-bottom border-700">
                        <div>
                          <p className="small fw-medium mb-0">{p.method === 'ecocash' ? 'EcoCash' : 'Bank'} · {p.phone}</p>
                          <p className="text-xs text-muted mb-0">{new Date(p.requestedAt).toLocaleDateString()}</p>
                          {p.rejectionReason && <p className="text-xs mb-0" style={{ color: '#f87171' }}>{p.rejectionReason}</p>}
                        </div>
                        <div className="text-end">
                          <p className="fw-bold mb-0" style={{ color: '#60a5fa' }}>${p.amount.toFixed(2)}</p>
                          <p className="text-xs mb-0" style={{ color: colors[p.status] }}>{labels[p.status]}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
          )
        })()}

        {/* ─── HISTORY ─── */}
        {tab === 'history' && (
          <div className="animate-fade-in" style={{ maxWidth: 680 }}>
            <PageHeader
              title="Ride History"
              subtitle={`${history.length} completed trip${history.length !== 1 ? 's' : ''}`}
              icon={Clock}
              iconColor="#60a5fa"
              canGoBack={tabStack.length > 0}
              onBack={goBack}
            />
            <div className="d-flex flex-column gap-3">
              {history.map(r => (
                <div key={r.id} className="card p-3 d-flex flex-row align-items-start gap-3">
                  <div className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                    style={{ width: 36, height: 36, background: 'var(--eg-brand-dim)' }}>
                    <CheckCircle size={16} className="text-brand" />
                  </div>
                  <div className="flex-grow-1 overflow-hidden">
                    <p className="fw-medium small text-truncate mb-0">{r.pickupAddress} → {r.dropoffAddress}</p>
                    <p className="text-xs text-muted mt-1 mb-0">
                      {new Date(r.createdAt).toLocaleDateString()} · {r.paymentMethod?.replace('_', ' ')}
                      {r.distance ? ` · ${r.distance} km` : ''}
                    </p>
                  </div>
                  <span className="fw-bold text-brand flex-shrink-0">${(r.fare || 0).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── CHAT ─── */}
        {tab === 'chat' && (
          <div className="animate-fade-in" style={{ maxWidth: 560, height: 600 }}>
            <PageHeader
              title="Messages"
              subtitle={activeRide ? 'Chat with your current passenger' : 'No active ride to chat on'}
              icon={MessageSquare}
              iconColor="#60a5fa"
              canGoBack={tabStack.length > 0}
              onBack={goBack}
            />
            {activeRide ? (
              <ChatPanel
                rideId={activeRide.id}
                peerId={activeRide.clientId}
                peerName="Client"
                onCall={type => setCallState({ open: true, type })}
              />
            ) : (
              <div className="card p-5 text-center text-muted">
                <MessageSquare size={48} className="mx-auto mb-3 opacity-50" />
                <p className="mb-0">No active ride. Accept a ride to chat with your client.</p>
              </div>
            )}
          </div>
        )}

        {/* ─── KYC ─── */}
        {tab === 'kyc' && (
          <div className="animate-fade-in" style={{ maxWidth: 680 }}>
            <PageHeader
              title="My Documents"
              subtitle="Keep your documents up to date to remain active on the platform."
              icon={FileCheck}
              iconColor="#fbbf24"
              canGoBack={tabStack.length > 0}
              onBack={goBack}
            />

            {/* Verification status */}
            {(() => {
              const st = user?.verification?.status
              const cfg: Record<string, { bg: string; color: string; icon: React.ReactNode; msg: string }> = {
                approved:  { bg: 'rgba(34,197,94,0.1)',  color: '#4ade80', icon: <CheckCircle size={16} />, msg: 'Verified — you can go online and accept rides.' },
                pending:   { bg: 'rgba(245,158,11,0.1)', color: '#fbbf24', icon: <AlertTriangle size={16} />, msg: 'Documents under review — you will be notified once approved.' },
                rejected:  { bg: 'rgba(239,68,68,0.1)',  color: '#f87171', icon: <XCircle size={16} />, msg: `Rejected: ${user?.verification?.rejectionReason || 'Contact support'}. Update your documents and resubmit.` },
              }
              const c = cfg[st || ''] || { bg: 'rgba(107,114,128,0.1)', color: '#9ca3af', icon: <Upload size={16} />, msg: 'Submit your documents to get started.' }
              return (
                <div className="d-flex align-items-center gap-3 p-3 rounded-xl mb-4" style={{ background: c.bg, border: `1px solid ${c.color}33` }}>
                  <span style={{ color: c.color, flexShrink: 0 }}>{c.icon}</span>
                  <p className="text-xs mb-0" style={{ color: c.color }}>{c.msg}</p>
                </div>
              )
            })()}

            <form onSubmit={async e => {
              e.preventDefault()
              setKycSaving(true); setKycSuccess(false); setKycError('')
              try {
                const res = await api.patch('/users/me/kyc', {
                  driverDocuments: {
                    ...(user?.driverDocuments || {}),
                    licenceNumber: kycForm.licenceNumber,
                    licenceClass:  kycForm.licenceClass,
                    licenceExpiry: kycForm.licenceExpiry,
                    nationalIdNumber: kycForm.nationalIdNumber,
                  },
                  vehicleDetails: {
                    ...(user?.vehicleDetails || {}),
                    registration: kycForm.vehicleReg,
                    make:         kycForm.vehicleMake,
                    model:        kycForm.vehicleModel,
                    year:         kycForm.vehicleYear,
                    colour:       kycForm.vehicleColour,
                    insuranceExpiry: kycForm.insuranceExpiry,
                    zinaraExpiry:    kycForm.zinaraExpiry,
                  },
                })
                updateUser(res.data)
                setKycSuccess(true)
              } catch (err: unknown) {
                setKycError(err instanceof Error ? err.message : 'Failed to submit documents. Check your connection and try again.')
              }
              finally { setKycSaving(false) }
            }} className="d-flex flex-column gap-4">

              {/* Licence */}
              <div className="card p-4">
                <h6 className="fw-semibold mb-3 text-xs text-muted" style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>Driver's Licence</h6>
                <div className="row g-3">
                  {[
                    { label: 'Licence Number', key: 'licenceNumber', type: 'text' },
                    { label: 'National ID', key: 'nationalIdNumber', type: 'text' },
                    { label: 'Expiry Date', key: 'licenceExpiry', type: 'date' },
                  ].map(f => (
                    <div key={f.key} className="col-12 col-sm-4">
                      <label className="form-label text-xs">{f.label}</label>
                      <input className="form-control" type={f.type}
                        value={kycForm[f.key as keyof typeof kycForm]}
                        onChange={e => setKycForm(k => ({ ...k, [f.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <div className="col-12 col-sm-4">
                    <label className="form-label text-xs">Licence Class</label>
                    <select className="form-select" value={kycForm.licenceClass}
                      onChange={e => setKycForm(k => ({ ...k, licenceClass: e.target.value as import('../../types').LicenceClass }))}>
                      {['Class 2','Class 3','Class 4','Class 5'].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Vehicle */}
              <div className="card p-4">
                <h6 className="fw-semibold mb-3 text-xs text-muted" style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>Vehicle Details</h6>
                <div className="row g-3">
                  {[
                    { label: 'Registration', key: 'vehicleReg',    type: 'text' },
                    { label: 'Make',         key: 'vehicleMake',   type: 'text' },
                    { label: 'Model',        key: 'vehicleModel',  type: 'text' },
                    { label: 'Year',         key: 'vehicleYear',   type: 'text' },
                    { label: 'Colour',       key: 'vehicleColour', type: 'text' },
                    { label: 'Insurance Expiry', key: 'insuranceExpiry', type: 'date' },
                    { label: 'ZINARA Expiry',    key: 'zinaraExpiry',    type: 'date' },
                  ].map(f => (
                    <div key={f.key} className="col-12 col-sm-4">
                      <label className="form-label text-xs">{f.label}</label>
                      <input className="form-control" type={f.type}
                        value={kycForm[f.key as keyof typeof kycForm]}
                        onChange={e => setKycForm(k => ({ ...k, [f.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {kycError && (
                <div className="d-flex align-items-center gap-2 p-3 rounded-xl text-xs"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
                  <XCircle size={14} /> {kycError}
                </div>
              )}
              {kycSuccess && (
                <div className="d-flex align-items-center gap-2 p-3 rounded-xl text-xs"
                  style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' }}>
                  <CheckCircle size={14} /> Documents submitted for review. An admin will verify them shortly.
                </div>
              )}

              <button type="submit" disabled={kycSaving}
                className="btn btn-primary d-flex align-items-center justify-content-center gap-2">
                {kycSaving ? <Loader size={15} className="animate-spin" /> : <Upload size={15} />}
                Submit Documents
              </button>
            </form>
          </div>
        )}

        {/* ══════════════════════════════ ACCOUNT ══════════════════════════════ */}
        {tab === 'account' && (
          <div className="animate-fade-in" style={{ maxWidth: 520 }}>
            <PageHeader
              title="Account"
              subtitle={user?.fullName || user?.name || 'Driver account'}
              icon={User}
              iconColor="#4ade80"
              canGoBack={tabStack.length > 0}
              onBack={goBack}
            />

            {/* Profile */}
            <div className="card p-4 mb-3">
              <div className="d-flex align-items-center gap-3">
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4ade80', fontWeight: 700, fontSize: '1.3rem', flexShrink: 0 }}>
                  {(user?.fullName || user?.name || '?')[0].toUpperCase()}
                </div>
                <div className="overflow-hidden">
                  <p className="fw-bold mb-0">{user?.fullName || user?.name}</p>
                  {user?.phone && <p className="text-xs text-muted mb-1">{user.phone}</p>}
                  <span className="badge-warn">Driver</span>
                </div>
              </div>
            </div>

            {/* Driver online toggle */}
            <div className="card mb-3" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid var(--eg-600)' }}>
                <p style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Driver Mode</p>
              </div>
              <button onPointerDown={(e) => { e.preventDefault(); toggleDriverOnline() }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', width: '100%', background: 'transparent', border: 'none', color: '#f9fafb', cursor: 'pointer', touchAction: 'manipulation' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: isOnline ? '#22c55e' : '#6b7280', flexShrink: 0 }} />
                <div style={{ flexGrow: 1, textAlign: 'left' }}>
                  <p style={{ fontWeight: 500, fontSize: '0.85rem', margin: 0 }}>{isOnline ? 'Online' : 'Offline'}</p>
                  <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>{isOnline ? 'Receiving ride requests' : 'Not accepting rides'}</p>
                </div>
                <div style={{ width: 40, height: 22, borderRadius: 11, padding: 2, background: isOnline ? '#22c55e' : '#374151', transition: 'background 0.2s', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', transform: isOnline ? 'translateX(18px)' : 'translateX(0)', transition: 'transform 0.2s' }} />
                </div>
              </button>
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
                { id: 'history', label: 'Ride History',  icon: Clock },
                { id: 'kyc',     label: 'My Documents',  icon: FileCheck },
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

      {/* ─── Incoming ride popup ─── */}
      {pendingRide && (
        <div className="position-fixed bottom-0 end-0 m-3 card p-4 shadow-lg animate-fade-in"
          style={{ width: 340, zIndex: 1060, borderColor: counterSent ? 'rgba(250,204,21,0.5)' : 'rgba(34,197,94,0.5)' }}>

          {counterSent ? (
            /* ── Waiting for client response ── */
            <>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Loader size={14} style={{ color: '#facc15' }} className="animate-spin flex-shrink-0" />
                <span className="fw-semibold small" style={{ color: '#facc15' }}>Counter sent — awaiting client…</span>
              </div>
              <p className="text-muted text-xs mb-3">
                You offered <strong className="text-white">${parseFloat(counterFareIn).toFixed(2)}</strong> for this trip.
              </p>
              <button
                onClick={() => { setCounterSent(false); setCounterMode(false); setCounterFareIn(''); setPendingRide(null) }}
                className="btn w-100 btn-secondary small">Withdraw Offer</button>
            </>
          ) : (
            /* ── Normal / counter-input view ── */
            <>
              <div className="d-flex align-items-center gap-2 mb-3">
                <span className="rounded-circle flex-shrink-0" style={{ width: 8, height: 8, background: '#4ade80', display: 'inline-block' }} />
                <span className="fw-semibold text-brand small">New Ride Request!</span>
                {pendingRide.isShared && (
                  <span className="ms-auto text-xs rounded-pill px-2 py-0"
                    style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
                    👥 Shared
                  </span>
                )}
              </div>
              <div className="d-flex flex-column gap-2 small mb-3">
                <div className="d-flex align-items-center gap-2">
                  <MapPin size={14} className="text-brand flex-shrink-0" />{pendingRide.pickupAddress}
                </div>
                <div className="d-flex align-items-center gap-2">
                  <MapPin size={14} className="text-danger flex-shrink-0" />{pendingRide.dropoffAddress}
                </div>
                <div className="d-flex gap-4 mt-1 flex-wrap">
                  <span className="text-muted">Est: <span className="text-white fw-semibold">{pendingRide.fare ? `$${pendingRide.fare.toFixed(2)}` : 'TBD'}</span></span>
                  <span className="text-muted">Pay: <span className="text-white fw-semibold text-capitalize">{pendingRide.paymentMethod?.replace('_', ' ')}</span></span>
                  {(pendingRide.coRiders?.length ?? 0) > 0 && (
                    <span className="text-muted">Riders: <span className="text-white fw-semibold">{(pendingRide.coRiders?.length ?? 0) + 1}</span></span>
                  )}
                </div>
              </div>

              {counterMode && (
                <div className="mb-3">
                  <label className="form-label text-xs text-muted mb-1">Your counter fare (USD)</label>
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-700 border-600 text-muted">$</span>
                    <input
                      type="number" min="0.50" step="0.50" autoFocus
                      className="form-control"
                      placeholder={pendingRide.fare ? pendingRide.fare.toFixed(2) : '0.00'}
                      value={counterFareIn}
                      onChange={e => setCounterFareIn(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className={`d-flex gap-2 ${counterMode ? 'flex-column' : ''}`}>
                {counterMode ? (
                  <>
                    <button
                      disabled={counterLoading || !counterFareIn || parseFloat(counterFareIn) <= 0}
                      onClick={async () => {
                        const fare = parseFloat(counterFareIn)
                        if (!fare || fare <= 0) return
                        setCounterLoading(true)
                        try {
                          await api.patch(`/rides/${pendingRide.id}/counter`, { counterFare: fare })
                          setCounterSent(true); setCounterMode(false)
                        } catch { /* noop */ } finally { setCounterLoading(false) }
                      }}
                      className="btn btn-primary w-100 small d-flex align-items-center justify-content-center gap-1">
                      {counterLoading ? <Loader size={13} className="animate-spin" /> : <Send size={13} />} Send Counter
                    </button>
                    <button onClick={() => { setCounterMode(false); setCounterFareIn('') }}
                      className="btn btn-secondary w-100 small">Cancel</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setPendingRide(null)}
                      className="btn small fw-semibold d-flex align-items-center justify-content-center gap-1 px-2"
                      style={{ border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', background: 'transparent' }}>
                      <XCircle size={13} /> Decline
                    </button>
                    <button
                      onClick={() => { setCounterFareIn(pendingRide.fare ? pendingRide.fare.toFixed(2) : ''); setCounterMode(true) }}
                      className="btn small fw-semibold d-flex align-items-center justify-content-center gap-1 flex-grow-1"
                      style={{ border: '1px solid rgba(250,204,21,0.4)', color: '#facc15', background: 'rgba(250,204,21,0.07)' }}>
                      <RotateCcw size={13} /> Counter
                    </button>
                    <button onClick={handleAccept} disabled={acceptLoading}
                      className="btn btn-primary small d-flex align-items-center justify-content-center gap-1 flex-grow-1">
                      {acceptLoading ? <Loader size={13} className="animate-spin" /> : <CheckCircle size={13} />} Accept
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Chat drawer */}
      {showChat && activeRide && (
        <div className="position-fixed bottom-0 end-0 m-3" style={{ width: 380, height: 500, zIndex: 1060 }}>
          <ChatPanel
            rideId={activeRide.id}
            peerId={activeRide.clientId}
            peerName="Client"
            onClose={() => setShowChat(false)}
            onCall={type => { setShowChat(false); setCallState({ open: true, type }) }}
          />
        </div>
      )}

      {callState.open && activeRide && (
        <CallModal
          peerId={activeRide.clientId}
          peerName="Client"
          callType={callState.type}
          onEnd={() => setCallState({ open: false, type: 'audio' })}
        />
      )}

      {/* ── Incoming bid takeover ──────────────────────────────────────── */}
      {incomingBid && (
        <IncomingBidCard
          bid={incomingBid}
          onWon={ride => {
            setIncomingBid(null)
            setActiveRide(ride)
            navigateTo('active')
          }}
          onDismiss={() => setIncomingBid(null)}
        />
      )}

      {/* ── Wallet top-up modal ────────────────────────────────────────── */}
      {showTopUp && (
        <WalletTopUpModal
          defaultPhone={user?.phone}
          onClose={() => setShowTopUp(false)}
          onFunded={fresh => {
            setWallet(fresh)
            setWalletLocked(null)
          }}
        />
      )}

      <BottomNav
        items={BOTTOM_TABS.map(t => ({ ...t, badge: t.id === 'chat' ? 0 : undefined }))}
        active={['history', 'kyc'].includes(tab) ? 'account' : tab}
        onNav={navigateTo}
      />

      {/* ── Cashout modal ───────────────────────────────────────────────── */}
      {showCashout && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
          style={{ zIndex: 1070, background: 'rgba(0,0,0,0.85)' }}>
          <div className="card p-4 shadow animate-fade-in" style={{ maxWidth: 400, width: '100%' }}>
            <div className="d-flex align-items-center justify-content-between mb-4">
              <h5 className="fw-bold mb-0">Request Cashout</h5>
              <button onClick={() => setShowCashout(false)} className="btn p-0 border-0 text-muted" style={{ background: 'transparent' }}>
                <XCircle size={20} />
              </button>
            </div>

            <div className="p-3 rounded-xl mb-4 text-center" style={{ background: 'var(--eg-700)' }}>
              <p className="text-xs text-muted mb-1">Available Balance</p>
              <p className="fs-4 fw-bold mb-0" style={{ color: '#60a5fa' }}>${availableBalance.toFixed(2)}</p>
            </div>

            <form onSubmit={requestCashout} className="d-flex flex-column gap-3">
              <div>
                <label className="form-label text-xs">Amount (USD)</label>
                <div className="input-group">
                  <span className="input-group-text bg-700 border-600 text-muted">$</span>
                  <input
                    type="number" min="1" max={availableBalance} step="0.01"
                    className="form-control" placeholder="0.00"
                    value={cashoutForm.amount}
                    onChange={e => setCashoutForm(f => ({ ...f, amount: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="form-label text-xs">Payout Method</label>
                <div className="d-flex gap-2">
                  {(['ecocash', 'bank'] as const).map(m => (
                    <button
                      key={m} type="button"
                      onClick={() => setCashoutForm(f => ({ ...f, method: m }))}
                      className={`btn flex-grow-1 ${cashoutForm.method === m ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '0.8rem' }}
                    >
                      {m === 'ecocash' ? '📱 EcoCash' : '🏦 Bank'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="form-label text-xs">
                  {cashoutForm.method === 'ecocash' ? 'EcoCash Number' : 'Bank Account / Reference'}
                </label>
                <input
                  type="text" className="form-control"
                  placeholder={cashoutForm.method === 'ecocash' ? '+263 7X XXX XXXX' : 'Account number'}
                  value={cashoutForm.phone}
                  onChange={e => setCashoutForm(f => ({ ...f, phone: e.target.value }))}
                  required
                />
              </div>

              {cashoutError && (
                <p className="text-xs mb-0" style={{ color: '#f87171' }}>{cashoutError}</p>
              )}

              <button type="submit" disabled={cashoutSaving}
                className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2">
                {cashoutSaving ? <><Loader size={14} className="animate-spin" /> Processing…</> : <><DollarSign size={14} /> Submit Request</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Lost & Found reply modal ───────────────────────────────────── */}
      {activeLostItem && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
          style={{ zIndex: 1070, background: 'rgba(0,0,0,0.85)' }}>
          <div className="card shadow animate-fade-in d-flex flex-column" style={{ maxWidth: 440, width: '100%', maxHeight: 'min(85vh, calc(100vh - 2rem))' }}>
            <div className="d-flex align-items-center gap-3 p-4 border-bottom border-700 flex-shrink-0">
              <Package size={18} style={{ color: '#fbbf24' }} />
              <div className="flex-grow-1 overflow-hidden">
                <h6 className="fw-bold mb-0 text-truncate">Lost Item Report</h6>
                <p className="text-xs text-muted mb-0 text-truncate">{activeLostItem.description}</p>
              </div>
              <div className="d-flex align-items-center gap-2 flex-shrink-0">
                {activeLostItem.status === 'open' && (
                  <button
                    onClick={async () => {
                      try {
                        const res = await api.patch(`/lost-items/${activeLostItem.id}`, { status: 'resolved' })
                        setActiveLostItem(res.data)
                        setLostItems(prev => prev.map(x => x.id === res.data.id ? res.data : x))
                      } catch { /* noop */ }
                    }}
                    className="btn btn-sm text-xs"
                    style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }}
                  >
                    Mark Resolved
                  </button>
                )}
                <button onClick={() => setActiveLostItem(null)} className="btn p-0 border-0 text-muted" style={{ background: 'transparent' }}>
                  <XCircle size={18} />
                </button>
              </div>
            </div>

            <div className="p-3 flex-shrink-0" style={{ background: 'var(--eg-700)', borderBottom: '1px solid var(--eg-600)' }}>
              <div className="d-flex gap-4 text-xs">
                <span className="text-muted">Status: <span style={{ color: activeLostItem.status === 'open' ? '#fbbf24' : activeLostItem.status === 'resolved' ? '#4ade80' : '#9ca3af' }} className="fw-semibold text-capitalize">{activeLostItem.status}</span></span>
                <span className="text-muted">Expires: <span className="text-white">{new Date(activeLostItem.expiresAt).toLocaleDateString()}</span></span>
              </div>
            </div>

            <div ref={lostThreadRef} className="flex-grow-1 overflow-y-auto p-3 d-flex flex-column gap-2" style={{ minHeight: 0 }}>
              {activeLostItem.messages.length === 0 ? (
                <p className="text-xs text-muted text-center my-3">No messages yet. Reply to connect with the passenger.</p>
              ) : (
                activeLostItem.messages.map(m => {
                  const isMe = m.senderId === user?.id
                  return (
                    <div key={m.id} className={`d-flex ${isMe ? 'justify-content-end' : 'justify-content-start'}`}>
                      <div className="px-3 py-2 rounded-xl text-xs" style={{
                        maxWidth: '78%',
                        background: isMe ? 'rgba(34,197,94,0.15)' : 'var(--eg-700)',
                        color: isMe ? '#4ade80' : '#f9fafb',
                        border: `1px solid ${isMe ? 'rgba(34,197,94,0.25)' : 'var(--eg-600)'}`,
                      }}>
                        <p className="mb-0">{m.text}</p>
                        <p className="mb-0 mt-1 opacity-50" style={{ fontSize: '0.65rem' }}>
                          {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {activeLostItem.status === 'open' && (
              <div className="p-3 border-top border-700 flex-shrink-0">
                <div className="d-flex gap-2">
                  <input
                    type="text"
                    className="form-control text-xs"
                    placeholder="Type a message…"
                    value={lostReplyText}
                    onChange={e => setLostReplyText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendLostReply() } }}
                    disabled={sendingLostReply}
                  />
                  <button
                    onClick={sendLostReply}
                    disabled={sendingLostReply || !lostReplyText.trim()}
                    className="btn btn-primary px-3 d-flex align-items-center justify-content-center"
                  >
                    {sendingLostReply ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Hidden camera input ──────────────────────────────────────────── */}
      <input
        ref={selfieInputRef}
        type="file"
        accept="image/*"
        capture="user"
        style={{ display: 'none' }}
        onChange={async e => {
          const file = e.target.files?.[0]
          if (!file) return
          const reader = new FileReader()
          reader.onload = ev => setSelfieDataUrl(ev.target?.result as string)
          reader.readAsDataURL(file)
          e.target.value = ''   // reset so same file can be re-selected
        }}
      />

      {/* ── Selfie verification modal ────────────────────────────────────── */}
      {showSelfieCheck && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
          style={{ zIndex: 1070, background: 'rgba(0,0,0,0.85)' }}
        >
          <div className="card p-4 text-center shadow" style={{ maxWidth: 360, width: '100%' }}>
            <div
              className="rounded-circle mx-auto mb-3 d-flex align-items-center justify-content-center"
              style={{ width: 64, height: 64, background: 'rgba(34,197,94,0.15)' }}
            >
              <Camera size={30} className="text-brand" />
            </div>

            <h2 className="fw-bold fs-5 mb-1">Daily Identity Check</h2>
            <p className="text-muted text-xs mb-4">
              Take a quick selfie each shift so EasyRide can confirm you're behind the wheel.
              Your photo is stored securely and reviewed by our safety team.
            </p>

            {selfieDataUrl ? (
              <img
                src={selfieDataUrl}
                alt="Selfie preview"
                style={{
                  width: 160, height: 160, borderRadius: '50%', objectFit: 'cover',
                  border: '3px solid #22c55e', margin: '0 auto 1rem',
                  display: 'block',
                }}
              />
            ) : (
              <div
                className="rounded-circle mx-auto mb-4 d-flex align-items-center justify-content-center"
                style={{ width: 160, height: 160, background: 'var(--eg-700)', border: '2px dashed var(--eg-600)' }}
              >
                <Camera size={48} style={{ color: '#374151' }} />
              </div>
            )}

            {selfieError && <p className="text-danger text-xs mb-3">{selfieError}</p>}

            {!selfieDataUrl ? (
              <button
                onClick={() => selfieInputRef.current?.click()}
                className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2 mb-2"
              >
                <Camera size={16} /> Take Selfie
              </button>
            ) : (
              <div className="d-flex flex-column gap-2 mb-2">
                <button
                  onClick={confirmSelfie}
                  disabled={selfieUploading}
                  className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2"
                >
                  {selfieUploading
                    ? <><Loader size={15} className="animate-spin" /> Verifying…</>
                    : <><CheckCircle size={15} /> Confirm &amp; Go Online</>
                  }
                </button>
                <button
                  onClick={() => { setSelfieDataUrl(null); selfieInputRef.current?.click() }}
                  disabled={selfieUploading}
                  className="btn btn-secondary w-100"
                >
                  Retake Photo
                </button>
              </div>
            )}

            <button
              onClick={() => { setShowSelfieCheck(false); setSelfieDataUrl(null); setSelfieError('') }}
              className="btn p-0 border-0 text-muted text-xs w-100"
              style={{ background: 'transparent' }}
            >
              Cancel — stay offline
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function EarningsChart({ rides }: { rides: Ride[] }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const dayRides = rides.filter(r => new Date(r.createdAt).toDateString() === d.toDateString())
    return {
      label: d.toLocaleDateString('en', { weekday: 'short' }),
      earnings: dayRides.reduce((s, r) => s + (r.fare || 0), 0),
      count: dayRides.length,
      isToday: d.toDateString() === new Date().toDateString(),
    }
  })
  const max = Math.max(...days.map(d => d.earnings), 1)
  const weekTotal = days.reduce((s, d) => s + d.earnings, 0)
  const weekRides = days.reduce((s, d) => s + d.count, 0)
  const BAR_W = 32

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <span className="fw-bold text-brand">${weekTotal.toFixed(2)}</span>
        <span className="text-xs text-muted">{weekRides} ride{weekRides !== 1 ? 's' : ''} this week</span>
      </div>
      <svg
        viewBox="0 0 265 130"
        style={{ width: '100%', overflow: 'visible' }}
        role="img"
        aria-label="Weekly earnings chart"
      >
        {/* Grid lines */}
        <line x1="0" y1="6"  x2="265" y2="6"  stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        <line x1="0" y1="52" x2="265" y2="52" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        <line x1="0" y1="97" x2="265" y2="97" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

        {days.map((d, i) => {
          const barH = Math.max((d.earnings / max) * 90, d.earnings > 0 ? 5 : 0)
          const x = 3 + i * (BAR_W + 5)
          const y = 97 - barH
          return (
            <g key={i}>
              {/* Bar */}
              <rect x={x} y={y} width={BAR_W} height={barH || 1} rx={5}
                fill={d.isToday ? '#22c55e' : 'rgba(34,197,94,0.28)'}
              />
              {/* Rides count above bar */}
              {d.count > 0 && (
                <text x={x + BAR_W / 2} y={y - 13} textAnchor="middle" fill="#4b5563" fontSize="7">
                  {d.count}r
                </text>
              )}
              {/* Earnings amount */}
              {d.earnings > 0 && (
                <text x={x + BAR_W / 2} y={y - 4} textAnchor="middle"
                  fill={d.isToday ? '#4ade80' : '#6b7280'}
                  fontSize="8" fontWeight={d.isToday ? '700' : '400'}
                >
                  ${d.earnings.toFixed(0)}
                </text>
              )}
              {/* Day label */}
              <text x={x + BAR_W / 2} y={112} textAnchor="middle"
                fill={d.isToday ? '#e5e7eb' : '#6b7280'}
                fontSize="9" fontWeight={d.isToday ? '600' : '400'}
              >
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
    </>
  )
}

