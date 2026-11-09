import React, { useState, useEffect, useRef } from 'react'
import {
  Home, Map, MessageSquare, CreditCard, Clock, Star,
  MapPin, Navigation, Loader, Phone, TrendingUp,
  AlertTriangle, XCircle as XCircleIcon, CheckCircle, Shield, Clock3,
  Tag, Share2, Calendar, User, Users, LogOut, Bell, BellOff, ChevronRight, RotateCcw,
  Package, Send,
} from 'lucide-react'
import Navbar from '../../components/Navbar'
import PageHeader, { useSwipeBack } from '../../components/PageHeader'
import BottomNav from '../../components/BottomNav'
import MapView, { RouteInfo } from '../../components/MapView'
import ChatPanel from '../../components/ChatPanel'
import CallModal from '../../components/CallModal'
import PaymentModal from '../../components/PaymentModal'
import BidPanel from '../../components/BidPanel'
import { useAuth } from '../../context/AuthContext'
import { useSocket } from '../../context/SocketContext'
import { useGeolocation, fetchPosition } from '../../hooks/useGeolocation'
import { Ride, Coordinates, VehicleCategory, PaymentMethod, LostItem } from '../../types'
import api from '../../services/api'
import { calcFare, fareRange } from '../../utils/fareCalc'
import { useSavedPlaces, SavedPlace } from '../../hooks/useSavedPlaces'
import { useBackButton } from '../../hooks/useBackButton'
import { useFuelPrice } from '../../hooks/useFuelPrice'

const NAV = [
  { id: 'home',    label: 'Dashboard',    icon: Home },
  { id: 'book',    label: 'Book Ride',    icon: Navigation },
  { id: 'track',   label: 'Track Ride',   icon: Map },
  { id: 'chat',    label: 'Messages',     icon: MessageSquare },
  { id: 'history', label: 'Trip History', icon: Clock },
  { id: 'payment', label: 'Payments',     icon: CreditCard },
]

const BOTTOM_TABS = [
  { id: 'home',    label: 'Home',     icon: Home },
  { id: 'book',    label: 'Book',     icon: Navigation },
  { id: 'track',   label: 'Track',    icon: Map },
  { id: 'chat',    label: 'Messages', icon: MessageSquare },
  { id: 'account', label: 'Account',  icon: User },
]

const VEHICLE_CATS = [
  { id: 'Economy' as VehicleCategory, icon: '🚗', range: fareRange('Economy'), desc: 'Affordable everyday' },
  { id: 'Comfort' as VehicleCategory, icon: '🚙', range: fareRange('Comfort'), desc: 'Spacious & newer' },
  { id: 'SUV'     as VehicleCategory, icon: '🚐', range: fareRange('SUV'),     desc: 'Groups & luggage' },
]

const CANCEL_REASONS = [
  'Driver taking too long',
  'Booked by mistake',
  'Changed my destination',
  'Found another ride',
  'Other',
]

interface DriverCard {
  name: string; rating: number; vehicle: string; plate: string
}

export default function ClientDashboard() {
  const { user, logout, updateUser } = useAuth()
  const [notificationsOn, setNotificationsOn] = useState(() => localStorage.getItem('easyride_notifs') !== 'off')
  function toggleNotifications() {
    const next = !notificationsOn
    setNotificationsOn(next)
    localStorage.setItem('easyride_notifs', next ? 'on' : 'off')
  }
  const { socket, activeRide, setActiveRide, requestRide, driverLocation, messages } = useSocket()
  const { coords } = useGeolocation()
  const { multipliers: fuelMultipliers } = useFuelPrice()

  // ── Tab state + history stack for back navigation ──────────────────────────
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

  // Reset scroll on tab change
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }) }, [tab])

  // ── Booking & ride state ───────────────────────────────────────────────────
  const [booking, setBooking]   = useState({ pickup: '', dropoff: '' })
  const [category, setCategory] = useState<VehicleCategory>('Economy')
  const [payment, setPayment]   = useState<PaymentMethod>('cash_usd')
  const [bookingLoading, setBookingLoading] = useState(false)
  const [bookingError, setBookingError] = useState('')
  const [locatingPickup, setLocatingPickup] = useState(false)
  const [history, setHistory]   = useState<Ride[]>([])
  const [pickupCoords, setPickupCoords]   = useState<Coordinates | null>(null)
  const [dropoffCoords, setDropoffCoords] = useState<Coordinates | null>(null)

  const [driverCard, setDriverCard] = useState<DriverCard | null>(null)
  const [routeInfo, setRouteInfo]   = useState<RouteInfo | null>(null)

  // ── Modal flags ────────────────────────────────────────────────────────────
  const [showChat,    setShowChat]    = useState(false)
  const [callState,   setCallState]   = useState<{ open: boolean; type: 'audio' | 'video' }>({ open: false, type: 'audio' })
  const [showPayment, setShowPayment] = useState(false)
  const [showSOS,           setShowSOS]           = useState(false)
  const [sosActive,         setSosActive]         = useState(false)
  const [sosNotifiedContact, setSosNotifiedContact] = useState<string | null>(null)
  const [editingEmergency,  setEditingEmergency]  = useState(false)
  const [emergencyInput,    setEmergencyInput]    = useState({ name: '', phone: '' })
  const [emergencySaving,   setEmergencySaving]   = useState(false)
  const [emergencyError,    setEmergencyError]    = useState('')
  const [showCancel,  setShowCancel]  = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [showRating,   setShowRating]   = useState(false)
  const [rideRating,   setRideRating]   = useState(5)
  const [ratingComment, setRatingComment] = useState('')
  const [ratingDone,    setRatingDone]    = useState(false)
  const [completedRide, setCompletedRide] = useState<Ride | null>(null)

  // Counter offer
  type CounterOffer = {
    rideId: string; counterFare: number; driverId: string; driverName: string
    originalFare?: number; pickupAddress: string; dropoffAddress: string; paymentMethod: PaymentMethod
  }
  const [counterOffer,     setCounterOffer]     = useState<CounterOffer | null>(null)
  const [acceptingCounter, setAcceptingCounter] = useState(false)

  // Bidding mode (passenger negotiates fare with drivers)
  const [bidMode,         setBidMode]         = useState(false)
  const [bidOffer,        setBidOffer]        = useState<string>('')
  const [bidLoading,      setBidLoading]      = useState(false)
  const [bidError,        setBidError]        = useState('')
  const [activeBid,       setActiveBid]       = useState<import('../../types').Bid | null>(null)
  const [bidEnvelope,     setBidEnvelope]     = useState<{ estimate: number; floor: number; distKm: number; durMin: number } | null>(null)

  // Return-trip bid
  type ReturnBid = {
    originalRideId: string; driverId: string; driverName: string
    pickupAddress: string; dropoffAddress: string
    pickupCoords?: Coordinates; dropoffCoords?: Coordinates
    proposedFare: number; paymentMethod: PaymentMethod
  }
  const [incomingReturnBid, setIncomingReturnBid] = useState<ReturnBid | null>(null)
  const [acceptingReturn,   setAcceptingReturn]   = useState(false)

  // Fare estimate
  const [fareEstimate, setFareEstimate] = useState<{
    distanceKm: number; durationMin: number
    fares: Record<VehicleCategory, number>
  } | null>(null)
  const [estimating, setEstimating] = useState(false)

  // Promo code
  const [promoInput, setPromoInput] = useState('')
  const [promoApplied, setPromoApplied] = useState<{ code: string; type: 'percent' | 'fixed'; value: number; minFare: number; description: string } | null>(null)
  const [promoError, setPromoError] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)

  // Scheduled ride
  const [isScheduled, setIsScheduled] = useState(false)
  const [scheduledFor, setScheduledFor] = useState('')

  // Shared / carpooling
  const [isShared,        setIsShared]        = useState(false)
  const [nearbyShared,    setNearbyShared]     = useState<Ride[]>([])
  const [loadingShared,   setLoadingShared]    = useState(false)
  const [joiningId,       setJoiningId]        = useState<string | null>(null)
  const [sharedFareNotice, setSharedFareNotice] = useState<{ fareShare: number } | null>(null)

  // Saved places
  const { places, setAddress: setPlaceAddress } = useSavedPlaces()
  const [editingPlace, setEditingPlace] = useState<string | null>(null)
  const [editPlaceInput, setEditPlaceInput] = useState('')
  const [focusedField, setFocusedField] = useState<'pickup' | 'dropoff' | null>(null)

  // Lost & Found
  const [lostItems,     setLostItems]     = useState<LostItem[]>([])
  const [reportRide,    setReportRide]    = useState<Ride | null>(null)
  const [activeLostItem, setActiveLostItem] = useState<LostItem | null>(null)
  const [lostDesc,      setLostDesc]      = useState('')
  const [lostSubmitting, setLostSubmitting] = useState(false)
  const [lostMsg,       setLostMsg]       = useState('')
  const [sendingLostMsg, setSendingLostMsg] = useState(false)
  const lostThreadRef   = useRef<HTMLDivElement>(null)

  const unreadCount = messages.filter(m => m.receiverId === user?.id && activeRide?.id === m.rideId).length

  // Keep a ref so the fare useEffect always reads the latest activeRide without
  // needing it as a dependency (which would cause re-runs every status change)
  const activeRideRef = useRef(activeRide)
  useEffect(() => { activeRideRef.current = activeRide }, [activeRide])

  useEffect(() => { fetchHistory() }, [])

  useEffect(() => {
    if (activeRide?.driverId && !['searching', 'cancelled', 'completed'].includes(activeRide.status)) {
      api.get(`/users/${activeRide.driverId}/public`)
        .then(r => setDriverCard(r.data))
        .catch(() => setDriverCard(null))
    } else if (!activeRide?.driverId) {
      setDriverCard(null)
    }
  }, [activeRide?.driverId, activeRide?.status])

  useEffect(() => {
    if (activeRideRef.current?.status === 'completed' && !completedRide) {
      setCompletedRide(activeRideRef.current)
      const t = setTimeout(() => setShowRating(true), 800)
      return () => clearTimeout(t)
    }
  }, [activeRide?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // Counter-offer listener
  useEffect(() => {
    if (!socket) return
    const handler = (offer: CounterOffer) => setCounterOffer(offer)
    socket.on('ride:counterOffer', handler)
    return () => { socket.off('ride:counterOffer', handler) }
  }, [socket])

  // Shared-join notification (original rider gets notified fare dropped)
  useEffect(() => {
    if (!socket) return
    const handler = ({ fareShare }: { rideId: string; fareShare: number; coRiderCount: number }) => {
      setSharedFareNotice({ fareShare })
      if (activeRideRef.current) setActiveRide({ ...activeRideRef.current, fareShare })
    }
    socket.on('ride:sharedJoin', handler)
    return () => { socket.off('ride:sharedJoin', handler) }
  }, [socket])

  // Lost & Found listeners
  useEffect(() => {
    api.get('/lost-items').then(r => setLostItems(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!socket) return
    const onMsg = ({ itemId, message }: { itemId: string; message: LostItem['messages'][0] }) => {
      setLostItems(prev => prev.map(li => li.id === itemId ? { ...li, messages: [...li.messages, message] } : li))
      setActiveLostItem(prev => prev?.id === itemId ? { ...prev, messages: [...prev.messages, message] } : prev)
      setTimeout(() => lostThreadRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }), 50)
    }
    const onUpdated = (item: LostItem) => {
      setLostItems(prev => prev.map(li => li.id === item.id ? item : li))
      setActiveLostItem(prev => prev?.id === item.id ? item : prev)
    }
    socket.on('lostItem:message', onMsg)
    socket.on('lostItem:updated', onUpdated)
    return () => { socket.off('lostItem:message', onMsg); socket.off('lostItem:updated', onUpdated) }
  }, [socket])

  function openLostModal(ride: Ride) {
    setReportRide(ride)
    const existing = lostItems.find(li => li.rideId === ride.id)
    setActiveLostItem(existing ?? null)
    setLostDesc('')
  }

  async function submitLostReport(e: React.FormEvent) {
    e.preventDefault()
    if (!reportRide || !lostDesc.trim()) return
    setLostSubmitting(true)
    try {
      const res = await api.post('/lost-items', { rideId: reportRide.id, description: lostDesc.trim() })
      setLostItems(prev => [res.data, ...prev])
      setActiveLostItem(res.data)
      setLostDesc('')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to submit report')
    } finally { setLostSubmitting(false) }
  }

  async function sendLostMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!activeLostItem || !lostMsg.trim()) return
    setSendingLostMsg(true)
    try {
      const res = await api.post(`/lost-items/${activeLostItem.id}/message`, { text: lostMsg.trim() })
      setActiveLostItem(res.data)
      setLostItems(prev => prev.map(li => li.id === res.data.id ? res.data : li))
      setLostMsg('')
      setTimeout(() => lostThreadRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }), 50)
    } catch { /* noop */ } finally { setSendingLostMsg(false) }
  }

  async function findSharedRides() {
    setLoadingShared(true)
    try {
      const params = coords ? `?lat=${coords.lat}&lng=${coords.lng}` : ''
      const res = await api.get(`/rides/shared-nearby${params}`)
      setNearbyShared(res.data)
    } catch { /* noop */ } finally { setLoadingShared(false) }
  }

  async function joinSharedRide(rideId: string) {
    setJoiningId(rideId)
    try {
      const res = await api.post(`/rides/${rideId}/join-shared`, {
        pickupAddress: booking.pickup,
        pickupCoords:  pickupCoords,
      })
      setActiveRide(res.data)
      setIsShared(false); setNearbyShared([])
      setBooking({ pickup: '', dropoff: '' })
      navigateTo('track')
    } catch (err: unknown) {
      setBookingError(err instanceof Error ? err.message : 'Failed to join ride')
    } finally { setJoiningId(null) }
  }

  // Return-trip bid listener
  useEffect(() => {
    if (!socket) return
    const handler = (bid: ReturnBid) => setIncomingReturnBid(bid)
    socket.on('returnBid:received', handler)
    return () => { socket.off('returnBid:received', handler) }
  }, [socket])

  // Clear fare estimate when addresses change
  useEffect(() => { setFareEstimate(null) }, [booking.pickup, booking.dropoff])

  // Lock in fare once pickup→dropoff coords are available (runs once per ride).
  // Uses activeRideRef + AbortController to avoid stale closures and race conditions.
  useEffect(() => {
    const ride = activeRideRef.current
    if (!ride || ride.fare) return
    const pkUp  = ride.pickupCoords
    const drOff = ride.dropoffCoords
    if (!pkUp || !drOff) return

    const controller = new AbortController()
    fetch(
      `https://router.project-osrm.org/route/v1/driving/${pkUp.lng},${pkUp.lat};${drOff.lng},${drOff.lat}?overview=false`,
      { signal: controller.signal }
    )
      .then(r => r.json())
      .then(data => {
        if (!data.routes?.[0]) return
        const distKm = +(data.routes[0].distance / 1000).toFixed(1)
        const durMin = +(data.routes[0].duration / 60).toFixed(0)
        const fare   = calcFare(ride.vehicleCategory || 'Economy', distKm, +durMin, fuelMultipliers)
        const cur = activeRideRef.current
        if (cur) setActiveRide({ ...cur, fare, distance: distKm, duration: +durMin })
        api.patch(`/rides/${ride.id}`, { fare, distance: distKm, duration: +durMin }).catch(() => {})
      })
      .catch(() => {})
    return () => controller.abort()
  }, [activeRide?.id])

  async function fetchHistory() {
    try {
      const res = await api.get('/rides/history')
      setHistory(res.data)
    } catch { setHistory([]) }
  }

  // Harare metropolitan viewbox (left,top,right,bottom). We bias search here
  // because Nominatim otherwise matches ambiguous names like "NSSA" to a
  // random Zimbabwean town. Pattern: longitude_min,latitude_max,longitude_max,latitude_min.
  const HARARE_VIEWBOX = '30.80,-17.60,31.30,-18.00'

  async function geocode(address: string): Promise<Coordinates | null> {
    try {
      // Pass 1: bounded to Harare — gets us the correct result in 95% of cases
      const bounded = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=zw&viewbox=${HARARE_VIEWBOX}&bounded=1&limit=1`
      let res = await fetch(bounded, { headers: { 'Accept-Language': 'en' } })
      let data = await res.json()
      if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }

      // Pass 2: biased (not bounded) — fall back to Zim-wide if nothing in Harare
      const biased = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=zw&viewbox=${HARARE_VIEWBOX}&limit=1`
      res = await fetch(biased, { headers: { 'Accept-Language': 'en' } })
      data = await res.json()
      if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    } catch {}
    return null
  }

  async function reverseGeocode(lat: number, lng: number): Promise<string> {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    )
    const data = await res.json()
    if (!data.address) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
    const a = data.address
    const parts = [
      a.road || a.pedestrian || a.footway || a.path,
      a.suburb || a.neighbourhood || a.quarter || a.residential,
      a.city || a.town || a.village || a.county,
    ].filter(Boolean)
    return parts.length ? parts.join(', ') : data.display_name
  }

  async function fillPickupFromGPS() {
    setLocatingPickup(true)
    setBookingError('')
    try {
      const position = await fetchPosition()
      const address  = await reverseGeocode(position.lat, position.lng)
      setBooking(b => ({ ...b, pickup: address }))
      setPickupCoords(position)
    } catch (err: unknown) {
      setBookingError(err instanceof Error ? err.message : 'Could not get your location')
    } finally {
      setLocatingPickup(false)
    }
  }

  // Auto-fill pickup with the rider's current location.
  // Strategy: useGeolocation() runs on mount and populates `coords` reactively.
  // The moment coords becomes available (and pickup is still blank), we
  // reverse-geocode it into a readable address. This fires on BOTH home and
  // book tabs — no need to click Book first — and doesn't re-prompt Chrome
  // for permission on every tab switch.
  const autoPickupTried = useRef(false)
  useEffect(() => {
    if (autoPickupTried.current) return
    if (!coords)                 return                 // waiting for GPS
    if (booking.pickup.trim())   return                 // user already set pickup
    autoPickupTried.current = true

    // We already have coords — just reverse-geocode (no permission prompt).
    setLocatingPickup(true)
    reverseGeocode(coords.lat, coords.lng)
      .then(address => {
        setBooking(b => (b.pickup.trim() ? b : { ...b, pickup: address }))
        setPickupCoords(coords)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Could not resolve your location'
        setBookingError(`Auto-pickup failed: ${msg}. Tap the 📍 button to retry.`)
      })
      .finally(() => setLocatingPickup(false))
  // Fire whenever coords becomes available
  }, [coords, booking.pickup])

  async function applyPromo() {
    if (!promoInput.trim()) return
    setPromoLoading(true); setPromoError('')
    try {
      const res = await api.get(`/promos/validate/${promoInput.trim()}`)
      const promo = res.data
      // Check minFare against current estimate if available
      if (promo.minFare > 0 && fareEstimate) {
        const currentFare = fareEstimate.fares[category]
        if (currentFare < promo.minFare) {
          setPromoError(`This code requires a minimum fare of $${promo.minFare.toFixed(2)}`)
          setPromoLoading(false)
          return
        }
      }
      setPromoApplied(promo)
      setPromoInput('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid promo code'
      setPromoError(msg)
    } finally { setPromoLoading(false) }
  }

  function discountedFare(fare: number) {
    if (!promoApplied) return fare
    if (promoApplied.type === 'percent') return Math.max(0, fare * (1 - promoApplied.value / 100))
    return Math.max(0, fare - promoApplied.value)
  }

  // ── Bidding: open a new bid session ─────────────────────────────────────
  async function submitBid(e: React.FormEvent) {
    e.preventDefault()
    if (!booking.pickup || !booking.dropoff) return
    const offer = parseFloat(bidOffer)
    if (!(offer > 0)) { setBidError('Enter a valid offer in USD'); return }
    setBidLoading(true); setBidError('')
    try {
      // Reuse existing geocoding helper
      let pCoords = pickupCoords
      let dCoords = dropoffCoords
      if (!pCoords) pCoords = await geocode(booking.pickup)
      if (!dCoords) dCoords = await geocode(booking.dropoff)
      if (!pCoords || !dCoords) throw new Error('Could not find one of those addresses')

      const res = await api.post('/bids', {
        pickup: pCoords, dropoff: dCoords,
        pickupAddress: booking.pickup, dropoffAddress: booking.dropoff,
        category, offer,
      })
      setActiveBid(res.data.bid)
      setBidEnvelope(res.data.envelope)
    } catch (err: unknown) {
      const anyErr = err as { response?: { data?: { message?: string; floor?: number; suggested?: number } }; message?: string }
      const floor = anyErr.response?.data?.floor
      if (floor != null) {
        setBidError(`Offer too low — minimum is $${floor.toFixed(2)}`)
      } else {
        setBidError(anyErr.response?.data?.message || anyErr.message || 'Could not submit bid')
      }
    } finally { setBidLoading(false) }
  }

  async function handleBook(e: React.FormEvent) {
    e.preventDefault()
    if (!booking.pickup || !booking.dropoff) return
    if (isScheduled && !scheduledFor) return
    if (promoApplied?.minFare && fareEstimate) {
      if (fareEstimate.fares[category] < promoApplied.minFare) {
        setPromoError(`Promo requires a minimum fare of $${promoApplied.minFare.toFixed(2)}. Please select a longer route.`)
        setPromoApplied(null)
        return
      }
    }
    setBookingLoading(true); setBookingError('')
    try {
      const [pCoords, dCoords] = await Promise.all([
        geocode(booking.pickup),
        geocode(booking.dropoff),
      ])
      const pFinal = pCoords || coords
      const dFinal = dCoords
      if (!pFinal) throw new Error('Could not find pickup location. Try a more specific address or enable location access.')
      if (!dFinal) throw new Error('Could not find dropoff location. Try a more specific address.')
      setPickupCoords(pFinal)
      setDropoffCoords(dFinal)

      const res = await api.post('/rides/request', {
        pickupAddress: booking.pickup, dropoffAddress: booking.dropoff,
        paymentMethod: payment, vehicleCategory: category,
        pickupCoords: pFinal, dropoffCoords: dFinal,
        ...(isShared ? { isShared: true } : {}),
        ...(promoApplied ? { promoCode: promoApplied.code } : {}),
        ...(isScheduled && scheduledFor ? { scheduledFor: new Date(scheduledFor).toISOString() } : {}),
      })
      setActiveRide(res.data)
      setBooking({ pickup: '', dropoff: '' })
      setPromoApplied(null); setPromoInput(''); setPromoError('')
      setIsScheduled(false); setScheduledFor('')
      setIsShared(false); setNearbyShared([])
      setFareEstimate(null)
      navigateTo('track')
    } catch (err: unknown) {
      setBookingError(err instanceof Error ? err.message : 'Failed to book ride. Please try again.')
    } finally { setBookingLoading(false) }
  }

  async function estimateFare() {
    if (!booking.pickup || !booking.dropoff) return
    setEstimating(true)
    try {
      const [pCoords, dCoords] = await Promise.all([
        geocode(booking.pickup),
        geocode(booking.dropoff),
      ])
      const p = pCoords || coords || { lat: -17.8292, lng: 31.0522 }
      const d = dCoords || { lat: -17.8500, lng: 31.0300 }
      const res = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${p.lng},${p.lat};${d.lng},${d.lat}?overview=false`
      )
      const data = await res.json()
      if (data.routes?.[0]) {
        const distKm = +(data.routes[0].distance / 1000).toFixed(1)
        const durMin = +(data.routes[0].duration / 60).toFixed(0)
        setFareEstimate({
          distanceKm: distKm,
          durationMin: durMin,
          fares: {
            Economy:     calcFare('Economy', distKm, durMin, fuelMultipliers),
            Comfort:     calcFare('Comfort', distKm, durMin, fuelMultipliers),
            SUV:         calcFare('SUV',     distKm, durMin, fuelMultipliers),
            'Tow Truck': calcFare('Tow Truck', distKm, durMin, fuelMultipliers),
          },
        })
      }
    } catch { /* silently fail */ }
    finally { setEstimating(false) }
  }

  function fillFromPlace(place: SavedPlace) {
    if (!place.address) {
      setEditingPlace(place.id)
      setEditPlaceInput('')
      return
    }
    if (focusedField === 'dropoff' || (booking.pickup && !booking.dropoff)) {
      setBooking(b => ({ ...b, dropoff: place.address }))
    } else {
      setBooking(b => ({ ...b, pickup: place.address }))
    }
  }

  async function handlePayRide(method: Ride['paymentMethod']) {
    if (!activeRide) return
    try {
      await api.patch(`/rides/${activeRide.id}`, { status: 'completed', paymentMethod: method })
    } catch { /* driver-side completion already updates via socket */ }
    setActiveRide({ ...activeRide, status: 'completed' })
    setShowPayment(false)
  }

  async function handleSOS() {
    if (!activeRide?.id) return
    try {
      const res = await api.post(`/rides/${activeRide.id}/sos`)
      setSosNotifiedContact(res.data?.notifiedContact || null)
    } catch { /* always activate UI so user knows to seek help */ }
    finally { setSosActive(true) }
  }

  async function saveEmergencyContact() {
    if (!emergencyInput.phone.trim()) { setEmergencyError('Phone number is required'); return }
    setEmergencySaving(true); setEmergencyError('')
    try {
      const res = await api.patch('/users/me/profile', {
        emergencyContactName:  emergencyInput.name.trim(),
        emergencyContactPhone: emergencyInput.phone.trim(),
      })
      updateUser(res.data)
      setEditingEmergency(false)
    } catch (err: unknown) {
      setEmergencyError(err instanceof Error ? err.message : 'Failed to save')
    } finally { setEmergencySaving(false) }
  }

  async function handleCancel() {
    if (!activeRide || !cancelReason) return
    try {
      await api.patch(`/rides/${activeRide.id}`, { status: 'cancelled', cancelReason })
      setActiveRide({ ...activeRide, status: 'cancelled' })
      setShowCancel(false)
      setCancelReason('')
    } catch { /* silently fail — user can try again */ }
  }

  async function handleRating() {
    try {
      await api.post(`/rides/${completedRide?.id}/rate`, { rating: rideRating, comment: ratingComment })
    } catch { /* non-fatal — rating is best-effort */ }
    setRatingDone(true)
    setTimeout(() => {
      setShowRating(false); setCompletedRide(null)
      setRatingDone(false); setRideRating(5); setRatingComment('')
    }, 1500)
  }

  const displayName = (user?.fullName || user?.name || 'Rider').split(' ')[0]

  // ── Shared back button ─────────────────────────────────────────────────────
  const BackButton = () =>
    tabStack.length > 0 ? (
      <button
        onClick={goBack}
        className="btn btn-secondary d-inline-flex align-items-center gap-2 mb-3 text-xs"
        style={{ fontSize: '0.82rem' }}
      >
        ← Back
      </button>
    ) : null

  return (
    <div className="min-vh-100 d-flex bg-900">
      <Navbar items={NAV} active={tab} onNav={navigateTo} onBack={goBack} canGoBack={tabStack.length > 0} />

      <main className="eg-main flex-grow-1 px-3 px-lg-4 overflow-x-hidden">

        {/* ══════════════════════════════ HOME ══════════════════════════════ */}
        {tab === 'home' && (
          <div className="animate-fade-in" style={{ maxWidth: 800 }}>
            <PageHeader
              title={`Welcome back, ${displayName}`}
              subtitle="Where are you heading today?"
              icon={Home}
              iconColor="#4ade80"
              canGoBack={tabStack.length > 0}
              onBack={goBack}
            />

            {/* Quick book card */}
            <div className="card p-4 mb-4">
              <h2 className="fw-semibold d-flex align-items-center gap-2 mb-3" style={{ fontSize: '1rem' }}>
                <Navigation size={16} className="text-brand" /> Quick Book
              </h2>
              <form onSubmit={handleBook} className="d-flex flex-column gap-3">
                {/* Saved places chips */}
                <div className="d-flex flex-wrap gap-2">
                  {places.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => fillFromPlace(p)}
                      className="d-flex align-items-center gap-1 btn"
                      style={{
                        borderRadius: 999, fontSize: '0.72rem', fontWeight: 600,
                        padding: '0.25rem 0.75rem',
                        background: p.address ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)',
                        border: `1px ${p.address ? 'solid' : 'dashed'} ${p.address ? 'rgba(34,197,94,0.4)' : '#374151'}`,
                        color: p.address ? '#4ade80' : '#6b7280',
                      }}
                    >
                      {p.icon} {p.name}
                      {!p.address && <span style={{ opacity: 0.6, fontSize: '0.6rem' }}> · add</span>}
                    </button>
                  ))}
                </div>

                <div className="input-group">
                  <span className="input-group-text"><MapPin size={15} className="text-brand" /></span>
                  <input
                    className="form-control"
                    placeholder="Pickup location"
                    value={booking.pickup}
                    onFocus={() => setFocusedField('pickup')}
                    onChange={e => setBooking(b => ({ ...b, pickup: e.target.value }))}
                  />
                  <button
                    type="button"
                    onPointerDown={async (e) => { e.preventDefault(); await fillPickupFromGPS() }}
                    disabled={locatingPickup}
                    title="Use my current location"
                    style={{
                      background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.3)',
                      color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)',
                      borderLeft: 'none', borderRadius: '0 0.5rem 0.5rem 0',
                      padding: '0 0.65rem', cursor: 'pointer', touchAction: 'manipulation',
                    }}
                  >
                    {locatingPickup ? <Loader size={14} className="animate-spin" /> : <Navigation size={14} />}
                  </button>
                </div>
                <div className="input-group">
                  <span className="input-group-text"><MapPin size={15} className="text-danger" /></span>
                  <input
                    className="form-control"
                    placeholder="Drop-off location"
                    value={booking.dropoff}
                    onFocus={() => setFocusedField('dropoff')}
                    onChange={e => setBooking(b => ({ ...b, dropoff: e.target.value }))}
                  />
                </div>

                {/* Vehicle category selector */}
                <div className="d-flex gap-2">
                  {VEHICLE_CATS.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      className={`flex-grow-1 py-2 rounded-xl border text-center text-xs fw-semibold transition-all ${
                        category === cat.id
                          ? 'border-brand'
                          : 'border-secondary'
                      }`}
                      style={{
                        background: category === cat.id ? 'rgba(34,197,94,0.1)' : 'transparent',
                        color: category === cat.id ? '#4ade80' : '#9ca3af',
                        borderColor: category === cat.id ? '#22c55e' : 'var(--eg-600)',
                      }}
                    >
                      <span className="d-block mb-1" style={{ fontSize: '1.1rem' }}>{cat.icon}</span>
                      {cat.id}
                    </button>
                  ))}
                </div>

                {/* ── Bid your price toggle ─────────────────────────── */}
                <div className="d-flex gap-2 mb-3">
                  <button type="button" onClick={() => setBidMode(false)}
                    className="btn btn-sm fw-semibold flex-grow-1"
                    style={{
                      background: !bidMode ? 'rgba(34,197,94,0.12)' : 'transparent',
                      color:      !bidMode ? '#4ade80' : '#9ca3af',
                      border: `1px solid ${!bidMode ? 'rgba(34,197,94,0.3)' : 'var(--eg-600)'}`,
                      borderRadius: '0.65rem',
                    }}>
                    Fixed Fare
                  </button>
                  <button type="button" onClick={() => {
                      setBidMode(true)
                      if (!bidOffer && fareEstimate) setBidOffer(String(fareEstimate.fares[category].toFixed(2)))
                    }}
                    className="btn btn-sm fw-semibold flex-grow-1"
                    style={{
                      background: bidMode ? 'rgba(251,191,36,0.12)' : 'transparent',
                      color:      bidMode ? '#fbbf24' : '#9ca3af',
                      border: `1px solid ${bidMode ? 'rgba(251,191,36,0.3)' : 'var(--eg-600)'}`,
                      borderRadius: '0.65rem',
                    }}>
                    Bid Your Price
                  </button>
                </div>

                {/* ── Bid offer input (shown only in bid mode) ──────── */}
                {bidMode && (
                  <div className="card p-3 mb-3" style={{ borderColor: 'rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.05)' }}>
                    <p className="text-xs text-muted mb-2">
                      Your offer in USD — drivers can accept, decline or counter.
                      {fareEstimate && <> Estimate: <span className="text-white fw-semibold">${fareEstimate.fares[category].toFixed(2)}</span></>}
                    </p>
                    <div className="input-group">
                      <span className="input-group-text fw-bold">$</span>
                      <input
                        type="number" step="0.50" min="1"
                        className="form-control"
                        placeholder="e.g. 4.50"
                        value={bidOffer}
                        onChange={e => { setBidOffer(e.target.value); setBidError('') }}
                      />
                      <span className="input-group-text text-muted">USD</span>
                    </div>
                    {bidError && <p className="text-xs mt-2 mb-0" style={{ color: '#fca5a5' }}>{bidError}</p>}
                  </div>
                )}

                <button
                  type={bidMode ? 'button' : 'submit'}
                  onClick={bidMode ? submitBid : undefined}
                  disabled={bidMode ? (bidLoading || !booking.pickup || !booking.dropoff || !bidOffer)
                                     : (bookingLoading || !booking.pickup || !booking.dropoff)}
                  className={`btn w-100 d-flex align-items-center justify-content-center gap-2 ${bidMode ? 'btn-warning text-dark fw-semibold' : 'btn-primary'}`}
                >
                  {(bidMode ? bidLoading : bookingLoading) && <Loader size={15} className="animate-spin" />}
                  {bidMode ? 'Submit Bid' : 'Book Now'}
                </button>
                {bookingError && <p className="text-danger text-xs text-center mt-1 mb-0">{bookingError}</p>}
              </form>
            </div>

            {/* Stats row */}
            <div className="row g-3 mb-4">
              {[
                { label: 'Total Rides',  value: history.length,                                                                               icon: Navigation,  color: 'text-brand' },
                { label: 'This Month',   value: history.filter(r => new Date(r.createdAt).getMonth() === new Date().getMonth()).length,        icon: TrendingUp,  color: 'text-primary' },
                { label: 'Avg Rating',   value: user?.rating ? `${user.rating.toFixed(1)} ★` : '—',                                        icon: Star,        color: 'text-warning' },
                { label: 'Total Spent',  value: `$${history.reduce((s, r) => s + (r.fare || 0), 0).toFixed(2)}`,                             icon: CreditCard,  color: 'text-info' },
              ].map(s => (
                <div key={s.label} className="col-6 col-sm-3">
                  <div className="card text-center py-3 px-2">
                    <s.icon size={22} className={`mx-auto mb-2 ${s.color}`} />
                    <p className="fw-bold fs-5 mb-0">{s.value}</p>
                    <p className="text-xs text-muted mb-0 mt-1">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Active ride banner */}
            {activeRide && !['completed', 'cancelled'].includes(activeRide.status) && (
              <div
                className="card p-3 mb-4 d-flex flex-row align-items-center justify-content-between gap-3"
                style={{ borderColor: 'rgba(34,197,94,0.4)', background: 'rgba(34,197,94,0.05)' }}
              >
                <div className="overflow-hidden">
                  <p className="text-brand text-xs fw-semibold mb-1">Active Ride</p>
                  <p className="fw-semibold mb-1 text-truncate">
                    {activeRide.pickupAddress} → {activeRide.dropoffAddress}
                  </p>
                  <StatusBadge status={activeRide.status} />
                </div>
                <button
                  onClick={() => navigateTo('track')}
                  className="btn btn-primary btn-sm flex-shrink-0"
                >
                  Track
                </button>
              </div>
            )}

            {/* Recent trips */}
            <div className="card p-4">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h2 className="fw-semibold mb-0" style={{ fontSize: '1rem' }}>Recent Trips</h2>
                <button
                  onClick={() => navigateTo('history')}
                  className="btn btn-link p-0 text-brand text-xs"
                  style={{ textDecoration: 'none' }}
                >
                  View all
                </button>
              </div>
              {history.length === 0
                ? <p className="text-muted text-xs text-center py-4 mb-0">No trips yet. Book your first ride!</p>
                : history.slice(0, 3).map(ride => <RideRow key={ride.id} ride={ride} />)
              }
            </div>
          </div>
        )}

        {/* ══════════════════════════════ BOOK ══════════════════════════════ */}
        {tab === 'book' && (
          <div className="animate-fade-in" style={{ maxWidth: 680 }}>
            <PageHeader
              title="Book a Ride"
              subtitle="Enter pickup and drop-off locations"
              icon={Navigation}
              iconColor="#4ade80"
              canGoBack={tabStack.length > 0}
              onBack={goBack}
            />

            <div className="card p-4 mb-4">
              <form onSubmit={handleBook} className="d-flex flex-column gap-4">

                {/* Saved places chips */}
                <div className="d-flex flex-wrap gap-2">
                  {places.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => fillFromPlace(p)}
                      className="d-flex align-items-center gap-1 btn"
                      style={{
                        borderRadius: 999, fontSize: '0.72rem', fontWeight: 600,
                        padding: '0.25rem 0.75rem',
                        background: p.address ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)',
                        border: `1px ${p.address ? 'solid' : 'dashed'} ${p.address ? 'rgba(34,197,94,0.4)' : '#374151'}`,
                        color: p.address ? '#4ade80' : '#6b7280',
                      }}
                    >
                      {p.icon} {p.name}
                      {!p.address && <span style={{ opacity: 0.6, fontSize: '0.6rem' }}> · add</span>}
                    </button>
                  ))}
                </div>

                {/* Locations */}
                <div className="d-flex flex-column gap-3">
                  <div>
                    <label className="form-label">Pickup Location</label>
                    <div className="input-group">
                      <span className="input-group-text"><MapPin size={15} className="text-brand" /></span>
                      <input
                        className="form-control"
                        placeholder="Enter pickup address"
                        value={booking.pickup}
                        onFocus={() => setFocusedField('pickup')}
                        onChange={e => setBooking(b => ({ ...b, pickup: e.target.value }))}
                        required
                      />
                      <button
                        type="button"
                        onPointerDown={async (e) => { e.preventDefault(); await fillPickupFromGPS() }}
                        disabled={locatingPickup}
                        title="Use my current location"
                        style={{
                          background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.3)',
                          color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)',
                          borderLeft: 'none', borderRadius: '0 0.5rem 0.5rem 0',
                          padding: '0 0.65rem', cursor: 'pointer', touchAction: 'manipulation',
                        }}
                      >
                        {locatingPickup ? <Loader size={14} className="animate-spin" /> : <Navigation size={14} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Drop-off Location</label>
                    <div className="input-group">
                      <span className="input-group-text"><MapPin size={15} className="text-danger" /></span>
                      <input
                        className="form-control"
                        placeholder="Enter drop-off address"
                        value={booking.dropoff}
                        onFocus={() => setFocusedField('dropoff')}
                        onChange={e => setBooking(b => ({ ...b, dropoff: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Vehicle category */}
                <div>
                  <label className="form-label">Vehicle Type</label>
                  <div className="row g-2">
                    {VEHICLE_CATS.map(cat => (
                      <div key={cat.id} className="col-4">
                        <button
                          type="button"
                          onClick={() => setCategory(cat.id)}
                          className="w-100 p-3 rounded-xl border text-start"
                          style={{
                            background:   category === cat.id ? 'rgba(34,197,94,0.1)' : 'transparent',
                            borderColor:  category === cat.id ? '#22c55e' : 'var(--eg-600)',
                            color:        'inherit',
                            transition:   'all 0.15s',
                          }}
                        >
                          <span style={{ fontSize: '1.5rem' }}>{cat.icon}</span>
                          <p className="fw-semibold text-xs mb-0 mt-1">{cat.id}</p>
                          <p className="text-brand text-xs fw-bold mb-0">{cat.range}</p>
                          <p className="text-muted text-xs mb-0 mt-1">{cat.desc}</p>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Payment method */}
                <div>
                  <label className="form-label">Payment Method</label>
                  <div className="row g-2">
                    {([
                      { id: 'cash_usd' as PaymentMethod, label: 'Cash USD', icon: '💵' },
                      { id: 'cash_zig' as PaymentMethod, label: 'Cash ZiG', icon: '💴' },
                      { id: 'ecocash'  as PaymentMethod, label: 'EcoCash',  icon: '📱' },
                    ]).map(pm => (
                      <div key={pm.id} className="col-4">
                        <button
                          type="button"
                          onClick={() => setPayment(pm.id)}
                          className="w-100 p-3 rounded-xl border d-flex flex-column align-items-center gap-1"
                          style={{
                            background:  payment === pm.id ? 'rgba(34,197,94,0.1)' : 'transparent',
                            borderColor: payment === pm.id ? '#22c55e' : 'var(--eg-600)',
                            color:       'inherit',
                            transition:  'all 0.15s',
                          }}
                        >
                          <span style={{ fontSize: '1.3rem' }}>{pm.icon}</span>
                          <span className="text-xs fw-semibold">{pm.label}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Fare estimate */}
                {fareEstimate ? (
                  <div className="rounded-xl p-3 bg-700">
                    {fareEstimate.distanceKm > 60 && (
                      <div className="rounded px-2 py-2 mb-2 d-flex align-items-start gap-2"
                           style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)' }}>
                        <AlertTriangle size={13} style={{ color: '#fbbf24', flexShrink: 0, marginTop: 2 }} />
                        <p className="text-xs mb-0" style={{ color: '#fde68a' }}>
                          This route is <strong>{fareEstimate.distanceKm} km</strong> — much longer than a typical Harare trip.
                          Double-check the addresses are specific (e.g. "NSSA House, Harare CBD" rather than just "NSSA").
                        </p>
                      </div>
                    )}
                    <p className="text-xs text-muted mb-2 d-flex align-items-center gap-1">
                      <Navigation size={11} />
                      ~{fareEstimate.distanceKm} km · ~{fareEstimate.durationMin} min
                      {(fuelMultipliers.petrol !== 1 || fuelMultipliers.diesel !== 1) && (
                        <span className="ms-auto d-flex align-items-center gap-1 text-xs" style={{ color: '#fbbf24' }}>
                          ⛽ Petrol {fuelMultipliers.petrol > 1 ? '+' : ''}{((fuelMultipliers.petrol - 1) * 100).toFixed(0)}%
                          <span className="text-muted">·</span>
                          Diesel {fuelMultipliers.diesel > 1 ? '+' : ''}{((fuelMultipliers.diesel - 1) * 100).toFixed(0)}%
                        </span>
                      )}
                    </p>
                    <div className="d-flex gap-2">
                      {(['Economy', 'Comfort', 'SUV'] as VehicleCategory[]).map(cat => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setCategory(cat)}
                          className="flex-grow-1 rounded-xl p-2 border text-center"
                          style={{
                            background:  category === cat ? 'rgba(34,197,94,0.12)' : 'transparent',
                            borderColor: category === cat ? '#22c55e' : 'var(--eg-600)',
                            color:       category === cat ? '#4ade80' : '#9ca3af',
                            transition:  'all 0.15s',
                          }}
                        >
                          {promoApplied ? (
                            <>
                              <p className="fw-bold text-brand mb-0" style={{ fontSize: '0.9rem' }}>
                                ${discountedFare(fareEstimate.fares[cat as VehicleCategory]).toFixed(2)}
                              </p>
                              <p className="text-muted mb-0" style={{ fontSize: '0.65rem', textDecoration: 'line-through' }}>
                                ${fareEstimate.fares[cat as VehicleCategory].toFixed(2)}
                              </p>
                            </>
                          ) : (
                            <p className="fw-bold text-brand mb-0" style={{ fontSize: '0.9rem' }}>
                              ${fareEstimate.fares[cat as VehicleCategory].toFixed(2)}
                            </p>
                          )}
                          <p className="mb-0" style={{ fontSize: '0.68rem' }}>{cat}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={estimateFare}
                    disabled={estimating || !booking.pickup || !booking.dropoff}
                    className="btn btn-secondary w-100 d-flex align-items-center justify-content-center gap-2"
                    style={{ fontSize: '0.85rem' }}
                  >
                    {estimating
                      ? <><Loader size={14} className="animate-spin" /> Calculating fare…</>
                      : <><TrendingUp size={14} /> Estimate Fare</>
                    }
                  </button>
                )}

                {/* Promo code */}
                <div>
                  {promoApplied ? (
                    <div className="d-flex align-items-center gap-2 p-2 rounded-xl"
                      style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}>
                      <Tag size={14} className="text-brand flex-shrink-0" />
                      <div className="flex-grow-1 text-xs">
                        <span className="fw-semibold text-brand">{promoApplied.code}</span>
                        {' — '}
                        {promoApplied.type === 'percent' ? `${promoApplied.value}% off` : `$${promoApplied.value} off`}
                        {promoApplied.description && <span className="text-muted ms-1">({promoApplied.description})</span>}
                      </div>
                      <button type="button" onClick={() => setPromoApplied(null)}
                        className="btn p-0 border-0 text-muted" style={{ lineHeight: 1 }}>
                        <XCircleIcon size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="d-flex gap-2">
                      <div className="input-group flex-grow-1">
                        <span className="input-group-text"><Tag size={14} /></span>
                        <input className="form-control text-xs" placeholder="Promo code (optional)"
                          value={promoInput} onChange={e => { setPromoInput(e.target.value.toUpperCase()); setPromoError('') }}
                          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), applyPromo())}
                          style={{ textTransform: 'uppercase' }}
                        />
                      </div>
                      <button type="button" onClick={applyPromo} disabled={promoLoading || !promoInput.trim()}
                        className="btn btn-secondary text-xs flex-shrink-0">
                        {promoLoading ? <Loader size={13} className="animate-spin" /> : 'Apply'}
                      </button>
                    </div>
                  )}
                  {promoError && <p className="text-danger text-xs mt-1 mb-0">{promoError}</p>}
                </div>

                {/* Shared / carpool */}
                <div>
                  <button type="button"
                    onClick={() => { setIsShared(s => !s); setNearbyShared([]) }}
                    className="d-flex align-items-center gap-2 btn w-100 text-start p-2 rounded-xl text-xs"
                    style={{
                      background: isShared ? 'rgba(96,165,250,0.1)' : 'rgba(255,255,255,0.03)',
                      border: `1px ${isShared ? 'solid rgba(96,165,250,0.4)' : 'dashed #374151'}`,
                      color: isShared ? '#60a5fa' : '#6b7280',
                    }}>
                    <Users size={14} />
                    {isShared ? '👥 Shared ride — fare split equally' : 'Share this ride to split costs'}
                  </button>

                  {isShared && (
                    <div className="mt-2">
                      <p className="text-xs text-muted mb-2">
                        Book a shared ride and let others join — or find an existing shared ride to join below.
                      </p>
                      <button type="button"
                        onClick={findSharedRides} disabled={loadingShared}
                        className="btn btn-secondary btn-sm w-100 d-flex align-items-center justify-content-center gap-2 mb-2">
                        {loadingShared
                          ? <Loader size={12} className="animate-spin" />
                          : <Users size={12} />}
                        Find Rides to Join
                      </button>

                      {nearbyShared.length > 0 && (
                        <div className="d-flex flex-column gap-2">
                          {nearbyShared.map(r => {
                            const perPerson = +((r.fare || 0) / ((r.coRiders?.length || 0) + 2)).toFixed(2)
                            return (
                              <div key={r.id} className="rounded-xl p-3 d-flex align-items-start gap-2"
                                style={{ background: 'var(--eg-700)', border: '1px solid var(--eg-600)' }}>
                                <div className="flex-grow-1 overflow-hidden">
                                  <p className="small fw-medium text-truncate mb-0">{r.dropoffAddress}</p>
                                  <p className="text-xs text-muted mb-0">
                                    From: {r.pickupAddress?.slice(0, 40) || '…'}
                                  </p>
                                  <p className="text-xs mt-1 mb-0" style={{ color: '#60a5fa' }}>
                                    Your share: <strong>${perPerson.toFixed(2)}</strong>
                                    {r.coRiders?.length ? ` · ${r.coRiders.length + 1} riders` : ''}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => joinSharedRide(r.id)}
                                  disabled={joiningId === r.id || !booking.pickup}
                                  className="btn btn-primary btn-sm flex-shrink-0 d-flex align-items-center gap-1"
                                  style={{ fontSize: '0.75rem' }}
                                >
                                  {joiningId === r.id ? <Loader size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                                  Join
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {nearbyShared.length === 0 && !loadingShared && (
                        <p className="text-xs text-muted text-center mb-0">
                          No shared rides nearby yet — book as shared and others may join.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Scheduled ride */}
                <div>
                  <button type="button"
                    onClick={() => setIsScheduled(s => !s)}
                    className="d-flex align-items-center gap-2 btn w-100 text-start p-2 rounded-xl text-xs"
                    style={{
                      background: isScheduled ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.03)',
                      border: `1px ${isScheduled ? 'solid rgba(139,92,246,0.4)' : 'dashed #374151'}`,
                      color: isScheduled ? '#c084fc' : '#6b7280',
                    }}>
                    <Calendar size={14} />
                    {isScheduled ? 'Scheduled ride' : 'Book for later (optional)'}
                  </button>
                  {isScheduled && (
                    <input type="datetime-local" className="form-control mt-2 text-xs"
                      value={scheduledFor} onChange={e => setScheduledFor(e.target.value)}
                      min={new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16)}
                      required={isScheduled}
                    />
                  )}
                </div>

                <button
                  type="submit"
                  disabled={bookingLoading || !booking.pickup || !booking.dropoff || (isScheduled && !scheduledFor)}
                  className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2"
                >
                  {bookingLoading
                    ? <Loader size={15} className="animate-spin" />
                    : isScheduled ? <Calendar size={15} /> : <Navigation size={15} />
                  }
                  {isScheduled ? 'Schedule Ride' : 'Request Ride'}
                </button>
                {bookingError && <p className="text-danger text-xs text-center mt-1 mb-0">{bookingError}</p>}
              </form>
            </div>

            <MapView clientLocation={coords || undefined} className="h-64" />
          </div>
        )}

        {/* ══════════════════════════════ TRACK ══════════════════════════════ */}
        {tab === 'track' && (
          <div className="animate-fade-in" style={{ maxWidth: 680 }}>
            <PageHeader
              title="Track Ride"
              subtitle={activeRide ? `Status: ${activeRide.status}` : 'No active ride'}
              icon={MapPin}
              iconColor="#60a5fa"
              canGoBack={tabStack.length > 0}
              onBack={goBack}
            />
            <div className="d-flex align-items-center justify-content-end mb-4">
              <div className="d-flex gap-2">
                {activeRide && !['completed', 'cancelled', 'scheduled'].includes(activeRide.status) && (
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/track/${activeRide.id}`
                      const text = `Track my EasyRide: ${url}`
                      if (navigator.share) { navigator.share({ title: 'Track my ride', url }) }
                      else if (navigator.clipboard) { navigator.clipboard.writeText(url); alert('Tracking link copied!') }
                      else { window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank') }
                    }}
                    className="btn d-flex align-items-center gap-2 text-xs fw-bold"
                    style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.4)', color: '#93c5fd', borderRadius: '0.75rem', padding: '0.5rem 0.8rem' }}
                  >
                    <Share2 size={14} /> Share
                  </button>
                )}
                {activeRide && !['completed', 'cancelled', 'scheduled'].includes(activeRide.status) && (
                  <button
                    onClick={() => setShowSOS(true)}
                    className="btn d-flex align-items-center gap-2 text-xs fw-bold"
                    style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', borderRadius: '0.75rem', padding: '0.5rem 1rem' }}
                  >
                    <Shield size={15} /> SOS
                  </button>
                )}
              </div>
            </div>

            {!activeRide ? (
              <div className="card text-center py-5 px-4">
                <Map size={44} className="mx-auto mb-3 text-muted" />
                <p className="text-muted mb-0">
                  No active ride.{' '}
                  <button
                    onClick={() => navigateTo('book')}
                    className="btn btn-link p-0 text-brand"
                    style={{ textDecoration: 'none' }}
                  >
                    Book one now
                  </button>
                </p>
              </div>
            ) : (
              <div className="d-flex flex-column gap-3">
                {(() => {
                  const pkUp  = pickupCoords  || activeRide.pickupCoords  || undefined
                  const drOff = dropoffCoords || activeRide.dropoffCoords || undefined
                  const hasDriver = !!driverLocation && !['searching', 'completed', 'cancelled'].includes(activeRide.status)
                  const inProgress = activeRide.status === 'inprogress'

                  // Route: driver→pickup when approaching, driver→dropoff when riding
                  const rFrom = hasDriver ? driverLocation! : pkUp
                  const rTo   = inProgress ? drOff : pkUp
                  const rColor = inProgress ? '#22c55e' : '#60a5fa'

                  return (
                    <MapView
                      driverLocation={driverLocation || undefined}
                      clientLocation={coords || undefined}
                      pickupLocation={pkUp}
                      dropoffLocation={drOff}
                      routeFrom={rFrom}
                      routeTo={rTo}
                      routeColor={rColor}
                      followDriver={hasDriver}
                      onRouteInfo={setRouteInfo}
                      className="h-64"
                    />
                  )
                })()}

                {/* Shared-ride banner */}
                {activeRide.isShared && (
                  <div className="d-flex align-items-center gap-2 p-3 rounded-xl"
                    style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.25)' }}>
                    <Users size={15} style={{ color: '#60a5fa', flexShrink: 0 }} />
                    <span className="text-xs" style={{ color: '#93c5fd' }}>
                      Shared ride · Your fare:{' '}
                      <strong>${((activeRide.fareShare ?? activeRide.fare) || 0).toFixed(2)}</strong>
                      {(activeRide.coRiders?.length ?? 0) > 0 && ` · ${(activeRide.coRiders?.length ?? 0) + 1} riders`}
                    </span>
                  </div>
                )}

                {/* ETA / distance strip */}
                {routeInfo && driverLocation && !['searching', 'completed', 'cancelled'].includes(activeRide.status) && (
                  <div className="card p-3 d-flex flex-row align-items-center gap-3"
                    style={{ borderColor: 'rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.05)' }}>
                    <Clock3 size={18} style={{ color: '#60a5fa', flexShrink: 0 }} />
                    <div>
                      <p className="fw-semibold mb-0" style={{ fontSize: '0.85rem' }}>
                        {activeRide.status === 'inprogress'
                          ? `~${routeInfo.duration} min to destination`
                          : `Driver ~${routeInfo.duration} min away`}
                      </p>
                      <p className="text-xs text-muted mb-0">{routeInfo.distance} km</p>
                    </div>
                  </div>
                )}

                {/* Driver card */}
                {driverCard && !['searching', 'completed', 'cancelled'].includes(activeRide.status) && (
                  <div className="card p-3" style={{ borderColor: 'rgba(34,197,94,0.3)' }}>
                    <div className="d-flex align-items-center gap-3">
                      <div
                        className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0 fw-bold text-brand"
                        style={{ width: 48, height: 48, background: 'rgba(34,197,94,0.15)', fontSize: '1.1rem' }}
                      >
                        {driverCard.name[0]}
                      </div>
                      <div className="flex-grow-1 overflow-hidden">
                        <p className="fw-semibold mb-0">{driverCard.name}</p>
                        <div className="d-flex align-items-center gap-2 flex-wrap text-xs text-muted mt-1">
                          <span className="text-warning">★ {driverCard.rating}</span>
                          <span>·</span>
                          <span>{driverCard.vehicle}</span>
                          <span>·</span>
                          <span className="text-white fw-semibold" style={{ letterSpacing: '0.05em' }}>
                            {driverCard.plate}
                          </span>
                        </div>
                      </div>
                      <div className="d-flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => setCallState({ open: true, type: 'audio' })}
                          className="btn btn-secondary p-2 rounded-3"
                        >
                          <Phone size={15} />
                        </button>
                        <button
                          onClick={() => setShowChat(true)}
                          className="btn btn-secondary p-2 rounded-3 position-relative"
                        >
                          <MessageSquare size={15} />
                          {unreadCount > 0 && (
                            <span
                              className="position-absolute top-0 end-0 rounded-circle d-flex align-items-center justify-content-center"
                              style={{
                                width: 16, height: 16, fontSize: 10,
                                background: '#ef4444', color: '#fff',
                                transform: 'translate(30%, -30%)',
                              }}
                            >
                              {unreadCount}
                            </span>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Status + actions */}
                <div className="card p-4 d-flex flex-column gap-3">
                  <div className="d-flex align-items-center justify-content-between">
                    <div>
                      <p className="text-xs text-muted mb-1">Status</p>
                      <StatusBadge status={activeRide.status} />
                    </div>
                    <div className="text-end">
                      <p className="text-xs text-muted mb-1">Fare (USD)</p>
                      {activeRide.fare
                        ? <p className="fw-bold text-brand fs-5 mb-0">${activeRide.fare.toFixed(2)}</p>
                        : <p className="text-xs text-muted mb-0">{fareRange(activeRide.vehicleCategory || 'Economy')}</p>
                      }
                    </div>
                  </div>

                  <div className="d-flex flex-column gap-2 text-xs">
                    <p className="d-flex align-items-center gap-2 mb-0">
                      <MapPin size={14} className="text-brand flex-shrink-0" />
                      {activeRide.pickupAddress}
                    </p>
                    <div style={{ width: 2, height: 12, background: 'var(--eg-600)', marginLeft: 6 }} />
                    <p className="d-flex align-items-center gap-2 mb-0">
                      <MapPin size={14} className="text-danger flex-shrink-0" />
                      {activeRide.dropoffAddress}
                    </p>
                  </div>

                  <div className="d-flex gap-2">
                    {activeRide.status === 'inprogress' && (
                      <button
                        onClick={() => setShowPayment(true)}
                        className="btn btn-primary flex-grow-1 d-flex align-items-center justify-content-center gap-2"
                      >
                        <CheckCircle size={15} /> Complete & Pay
                      </button>
                    )}
                    {['scheduled', 'searching', 'accepted'].includes(activeRide.status) && (
                      <button
                        onClick={() => setShowCancel(true)}
                        className="btn flex-grow-1 d-flex align-items-center justify-content-center gap-2 fw-semibold text-xs"
                        style={{
                          border: '1px solid rgba(239,68,68,0.4)',
                          color: '#f87171',
                          background: 'transparent',
                          borderRadius: '0.75rem',
                        }}
                      >
                        <XCircleIcon size={15} /> Cancel Ride
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Floating chat panel */}
            {showChat && activeRide && (
              <div
                className="position-fixed"
                style={{
                  inset: '1rem',
                  zIndex: 50,
                  // desktop override handled inline
                }}
              >
                <div
                  className="position-absolute bottom-0 end-0"
                  style={{ width: 'min(100%, 384px)', height: 500 }}
                >
                  <ChatPanel
                    rideId={activeRide.id}
                    peerId={activeRide.driverId || ''}
                    peerName={driverCard?.name || 'Your Driver'}
                    onClose={() => setShowChat(false)}
                    onCall={type => { setShowChat(false); setCallState({ open: true, type }) }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════ CHAT ══════════════════════════════ */}
        {tab === 'chat' && (
          <div className="animate-fade-in" style={{ maxWidth: 520 }}>
            <PageHeader
              title="Messages"
              subtitle={activeRide && !['completed', 'cancelled'].includes(activeRide.status) ? 'Chat with your driver' : 'No active ride'}
              icon={MessageSquare}
              iconColor="#60a5fa"
              canGoBack={tabStack.length > 0}
              onBack={goBack}
            />
            {activeRide && !['completed', 'cancelled'].includes(activeRide.status) ? (
              <div style={{ height: 560 }}>
                <ChatPanel
                  rideId={activeRide.id}
                  peerId={activeRide.driverId || ''}
                  peerName={driverCard?.name || 'Your Driver'}
                  onCall={type => setCallState({ open: true, type })}
                />
              </div>
            ) : (
              <div className="card text-center py-5 px-4">
                <MessageSquare size={44} className="mx-auto mb-3 text-muted" />
                <p className="text-muted mb-0">No active ride. Book a ride to chat with your driver.</p>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════ HISTORY ══════════════════════════ */}
        {tab === 'history' && (
          <div className="animate-fade-in" style={{ maxWidth: 680 }}>
            <PageHeader
              title="Trip History"
              subtitle={`${history.length} trip${history.length !== 1 ? 's' : ''}`}
              icon={Clock}
              iconColor="#60a5fa"
              canGoBack={tabStack.length > 0}
              onBack={goBack}
            />
            {history.length === 0 ? (
              <div className="card text-center py-5 px-4 text-muted">No trips yet</div>
            ) : (
              <div className="card px-3 pt-1">
                {history.map(ride => (
                  <RideRow
                    key={ride.id}
                    ride={ride}
                    detailed
                    onReport={
                      ride.status === 'completed' &&
                      (Date.now() - new Date(ride.completedAt || ride.createdAt).getTime()) < 172_800_000
                        ? () => openLostModal(ride)
                        : undefined
                    }
                    hasReport={lostItems.some(li => li.rideId === ride.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════ ACCOUNT ══════════════════════════ */}
        {tab === 'account' && (
          <div className="animate-fade-in" style={{ maxWidth: 520 }}>
            <PageHeader
              title="Account"
              subtitle={user?.fullName || user?.name || 'Your account'}
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
                  {user?.email && <p className="text-xs text-muted mb-1 text-truncate">{user.email}</p>}
                  <span className="badge-brand">Rider</span>
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

            {/* Emergency Contact */}
            <div className="card mb-3" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid var(--eg-600)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Emergency Contact</p>
                {!editingEmergency && (
                  <button
                    onPointerDown={(e) => {
                      e.preventDefault()
                      setEmergencyInput({
                        name:  user?.riderProfile?.emergencyContactName  || '',
                        phone: user?.riderProfile?.emergencyContactPhone || '',
                      })
                      setEmergencyError('')
                      setEditingEmergency(true)
                    }}
                    style={{ background: 'transparent', border: 'none', color: '#22c55e', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', touchAction: 'manipulation' }}
                  >
                    {user?.riderProfile?.emergencyContactPhone ? 'Edit' : '+ Add'}
                  </button>
                )}
              </div>
              {editingEmergency ? (
                <div style={{ padding: '0.85rem 1rem' }}>
                  <input
                    className="form-control form-control-sm mb-2"
                    placeholder="Contact name (e.g. Rudo Nyamukapa)"
                    value={emergencyInput.name}
                    onChange={e => setEmergencyInput(i => ({ ...i, name: e.target.value }))}
                  />
                  <input
                    className="form-control form-control-sm mb-2"
                    placeholder="Phone (+263771234567)"
                    type="tel"
                    value={emergencyInput.phone}
                    onChange={e => setEmergencyInput(i => ({ ...i, phone: e.target.value }))}
                  />
                  {emergencyError && <p className="text-danger text-xs mb-2">{emergencyError}</p>}
                  <div className="d-flex gap-2">
                    <button onPointerDown={(e) => { e.preventDefault(); saveEmergencyContact() }}
                      disabled={emergencySaving}
                      className="btn btn-primary btn-sm flex-grow-1" style={{ touchAction: 'manipulation' }}>
                      {emergencySaving ? 'Saving…' : 'Save'}
                    </button>
                    <button onPointerDown={(e) => { e.preventDefault(); setEditingEmergency(false) }}
                      className="btn btn-secondary btn-sm flex-grow-1" style={{ touchAction: 'manipulation' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : user?.riderProfile?.emergencyContactPhone ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem' }}>
                  <Phone size={18} style={{ color: '#22c55e', flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: '0.85rem', fontWeight: 500, margin: 0 }}>{user.riderProfile.emergencyContactName || 'Emergency Contact'}</p>
                    <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>{user.riderProfile.emergencyContactPhone}</p>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '0.85rem 1rem' }}>
                  <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>
                    No emergency contact set.{' '}
                    <span style={{ color: '#f87171' }}>Add one — they'll be notified by SMS if you trigger SOS.</span>
                  </p>
                </div>
              )}
            </div>

            {/* More links */}
            <div className="card mb-3" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid var(--eg-600)' }}>
                <p style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>More</p>
              </div>
              {([
                { id: 'history', label: 'Trip History',    icon: Clock },
                { id: 'payment', label: 'Payment Methods', icon: CreditCard },
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

        {/* ══════════════════════════════ PAYMENT ══════════════════════════ */}
        {tab === 'payment' && (
          <div className="animate-fade-in" style={{ maxWidth: 680 }}>
            <PageHeader
              title="Payment Methods"
              subtitle="How you pay for rides"
              icon={CreditCard}
              iconColor="#fbbf24"
              canGoBack={tabStack.length > 0}
              onBack={goBack}
            />

            <div className="d-flex flex-column gap-3 mb-4">
              {[
                { icon: '💵', name: 'Cash USD', desc: 'Pay driver directly in US dollars' },
                { icon: '💴', name: 'Cash ZiG', desc: 'Pay driver in Zimbabwe Gold (ZiG)' },
                { icon: '📱', name: 'EcoCash',  desc: '+263 77X XXX XXX' },
              ].map(m => (
                <div key={m.name} className="card p-3 d-flex flex-row align-items-center gap-3">
                  <span style={{ fontSize: '1.75rem' }}>{m.icon}</span>
                  <div className="flex-grow-1">
                    <p className="fw-semibold mb-0">{m.name}</p>
                    <p className="text-xs text-muted mb-0">{m.desc}</p>
                  </div>
                  <span className="badge-brand">Active</span>
                </div>
              ))}
            </div>

            <div className="card p-4">
              <h2 className="fw-semibold mb-3" style={{ fontSize: '1rem' }}>Payment History</h2>
              {history.filter(r => r.status === 'completed').map(r => (
                <div
                  key={r.id}
                  className="d-flex align-items-center justify-content-between py-3"
                  style={{ borderBottom: '1px solid var(--eg-600)' }}
                >
                  <div className="overflow-hidden me-3">
                    <p className="fw-semibold text-xs mb-0 text-truncate">
                      {r.pickupAddress} → {r.dropoffAddress}
                    </p>
                    <p className="text-xs text-muted mb-0 mt-1">
                      {new Date(r.createdAt).toLocaleDateString()} · {r.paymentMethod?.replace('_', ' ')}
                    </p>
                  </div>
                  <p className="fw-bold text-brand text-xs mb-0 flex-shrink-0">
                    ${(r.fare || 0).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ══════════════════════ MODALS ══════════════════════════════════════ */}

      {/* Bid-in-progress full-screen panel */}
      {activeBid && (
        <BidPanel
          initialBid={activeBid}
          envelope={bidEnvelope || undefined}
          onAccepted={(ride) => {
            setActiveBid(null); setBidEnvelope(null); setBidOffer(''); setBidMode(false)
            setActiveRide(ride)
            navigateTo('track')
          }}
          onClose={() => { setActiveBid(null); setBidEnvelope(null) }}
        />
      )}

      {/* Lost & Found modal */}
      {reportRide && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-end align-items-sm-center justify-content-center p-0 p-sm-3"
          style={{ zIndex: 1072, background: 'rgba(0,0,0,0.85)' }}>
          <div className="card shadow animate-fade-in w-100" style={{ maxWidth: 480, maxHeight: '90vh', display: 'flex', flexDirection: 'column', borderRadius: '1rem 1rem 0 0', borderTopLeftRadius: '1rem', borderTopRightRadius: '1rem' }}>
            {/* Header */}
            <div className="d-flex align-items-center gap-3 p-4 border-bottom border-700 flex-shrink-0">
              <div className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                style={{ width: 40, height: 40, background: 'rgba(251,191,36,0.15)' }}>
                <Package size={18} style={{ color: '#fbbf24' }} />
              </div>
              <div className="flex-grow-1 overflow-hidden">
                <h6 className="fw-bold mb-0">Lost &amp; Found</h6>
                <p className="text-xs text-muted text-truncate mb-0">
                  {reportRide.pickupAddress} → {reportRide.dropoffAddress}
                </p>
              </div>
              {activeLostItem && (
                <span className={`badge rounded-pill text-xs ${activeLostItem.status === 'resolved' ? 'badge-brand' : activeLostItem.status === 'closed' ? 'badge-warn' : 'text-warning'}`}
                  style={activeLostItem.status === 'open' ? { background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' } : {}}>
                  {activeLostItem.status}
                </span>
              )}
              <button onClick={() => { setReportRide(null); setActiveLostItem(null) }}
                className="btn p-0 border-0 text-muted flex-shrink-0" style={{ background: 'transparent' }}>
                <XCircleIcon size={20} />
              </button>
            </div>

            {/* Body — scrolls when the report form overflows on small viewports */}
            <div className="flex-grow-1 overflow-y-auto d-flex flex-column" style={{ minHeight: 0 }}>
              {!activeLostItem ? (
                /* ── Report form ── */
                <form onSubmit={submitLostReport} className="p-4 d-flex flex-column gap-3">
                  <p className="text-muted text-xs mb-0">
                    Describe what you left behind. The driver will be notified immediately and you can message each other for 48 hours.
                  </p>
                  <textarea
                    className="form-control" rows={4}
                    placeholder="e.g. Black leather wallet, left on back seat…"
                    value={lostDesc}
                    onChange={e => setLostDesc(e.target.value)}
                    required
                    style={{ resize: 'none' }}
                  />
                  <button type="submit" disabled={lostSubmitting || !lostDesc.trim()}
                    className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2">
                    {lostSubmitting ? <Loader size={14} className="animate-spin" /> : <Package size={14} />}
                    Report Lost Item
                  </button>
                </form>
              ) : (
                /* ── Message thread ── */
                <div className="d-flex flex-column h-100">
                  <div className="px-4 py-2 flex-shrink-0" style={{ background: 'rgba(251,191,36,0.06)', borderBottom: '1px solid var(--eg-700)' }}>
                    <p className="text-xs mb-0">
                      <span className="text-muted">You reported: </span>
                      <span style={{ color: '#fde68a' }}>{activeLostItem.description}</span>
                    </p>
                    {activeLostItem.status === 'open' && (
                      <p className="text-xs text-muted mb-0">
                        Channel open until {new Date(activeLostItem.expiresAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div ref={lostThreadRef} className="flex-grow-1 overflow-y-auto p-3 d-flex flex-column gap-2" style={{ minHeight: 0 }}>
                    {activeLostItem.messages.length === 0 && (
                      <p className="text-xs text-muted text-center my-3">No messages yet — the driver will reply here.</p>
                    )}
                    {activeLostItem.messages.map(m => {
                      const isMine = m.senderId === user?.id
                      return (
                        <div key={m.id} className={`d-flex ${isMine ? 'justify-content-end' : 'justify-content-start'}`}>
                          <div className="px-3 py-2 rounded-xl text-xs" style={{
                            maxWidth: '75%',
                            background: isMine ? 'rgba(34,197,94,0.2)' : 'var(--eg-700)',
                            color: isMine ? '#d1fae5' : '#e5e7eb',
                          }}>
                            <p className="mb-0">{m.text}</p>
                            <p className="mb-0 mt-1 text-muted" style={{ fontSize: '0.65rem' }}>
                              {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {activeLostItem.status === 'open' ? (
                    <form onSubmit={sendLostMessage} className="d-flex gap-2 p-3 border-top border-700 flex-shrink-0">
                      <input className="form-control form-control-sm" placeholder="Type a message…"
                        value={lostMsg} onChange={e => setLostMsg(e.target.value)} />
                      <button type="submit" disabled={sendingLostMsg || !lostMsg.trim()}
                        className="btn btn-primary btn-sm px-3 flex-shrink-0">
                        {sendingLostMsg ? <Loader size={12} className="animate-spin" /> : <Send size={12} />}
                      </button>
                    </form>
                  ) : (
                    <p className="text-xs text-muted text-center py-3 flex-shrink-0">
                      {activeLostItem.status === 'resolved' ? '✅ Marked as resolved' : 'Channel closed'}
                    </p>
                  )}
                  {activeLostItem.status === 'open' && (
                    <div className="px-3 pb-3 flex-shrink-0">
                      <button
                        onClick={async () => {
                          const res = await api.patch(`/lost-items/${activeLostItem.id}`, { status: 'resolved' }).catch(() => null)
                          if (res) { setActiveLostItem(res.data); setLostItems(prev => prev.map(li => li.id === res.data.id ? res.data : li)) }
                        }}
                        className="btn btn-secondary btn-sm w-100">
                        ✅ Mark as Resolved — item was returned
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Shared-join notification toast */}
      {sharedFareNotice && (
        <div className="position-fixed top-0 start-0 w-100 p-3" style={{ zIndex: 1080 }}>
          <div className="card p-3 d-flex flex-row align-items-center gap-3 shadow-lg animate-fade-in"
            style={{ maxWidth: 400, margin: '0 auto', borderColor: 'rgba(96,165,250,0.4)' }}>
            <Users size={18} style={{ color: '#60a5fa', flexShrink: 0 }} />
            <p className="small mb-0 flex-grow-1">
              Someone joined your ride! 🎉 Your fare is now{' '}
              <strong style={{ color: '#60a5fa' }}>${sharedFareNotice.fareShare.toFixed(2)}</strong>
            </p>
            <button onClick={() => setSharedFareNotice(null)}
              className="btn p-0 border-0 text-muted flex-shrink-0" style={{ background: 'transparent' }}>
              <XCircleIcon size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Counter-offer modal */}
      {counterOffer && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
          style={{ zIndex: 1075, background: 'rgba(0,0,0,0.85)' }}>
          <div className="card p-4 shadow animate-fade-in" style={{ maxWidth: 380, width: '100%', borderColor: 'rgba(250,204,21,0.4)' }}>
            <div className="d-flex align-items-center gap-3 mb-3">
              <div className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                style={{ width: 44, height: 44, background: 'rgba(250,204,21,0.15)' }}>
                <RotateCcw size={20} style={{ color: '#facc15' }} />
              </div>
              <div>
                <h6 className="fw-bold mb-0">Driver Counter-Offer</h6>
                <p className="text-xs text-muted mb-0">{counterOffer.driverName}</p>
              </div>
            </div>

            <div className="d-flex flex-column gap-2 small mb-3">
              <div className="d-flex align-items-center gap-2">
                <MapPin size={14} className="text-brand flex-shrink-0" />
                <span>{counterOffer.pickupAddress}</span>
              </div>
              <div className="d-flex align-items-center gap-2">
                <MapPin size={14} className="text-danger flex-shrink-0" />
                <span>{counterOffer.dropoffAddress}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl mb-4" style={{ background: 'var(--eg-700)' }}>
              <div className="d-flex align-items-center justify-content-between">
                <div className="text-center flex-grow-1">
                  <p className="text-xs text-muted mb-1">Your estimate</p>
                  <p className="fw-semibold mb-0 text-muted" style={{ textDecoration: 'line-through' }}>
                    {counterOffer.originalFare ? `$${counterOffer.originalFare.toFixed(2)}` : '—'}
                  </p>
                </div>
                <div style={{ width: 1, background: 'var(--eg-600)', alignSelf: 'stretch' }} />
                <div className="text-center flex-grow-1">
                  <p className="text-xs text-muted mb-1">Driver asks</p>
                  <p className="fs-5 fw-bold mb-0" style={{ color: '#facc15' }}>${counterOffer.counterFare.toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div className="d-flex gap-2">
              <button
                onClick={() => setCounterOffer(null)}
                className="btn flex-grow-1 fw-semibold"
                style={{ border: '1px solid rgba(107,114,128,0.4)', color: '#9ca3af', background: 'transparent' }}
              >
                Decline
              </button>
              <button
                disabled={acceptingCounter}
                onClick={async () => {
                  setAcceptingCounter(true)
                  try {
                    const res = await api.post(`/rides/${counterOffer.rideId}/accept-counter`, { driverId: counterOffer.driverId })
                    setActiveRide(res.data)
                    setCounterOffer(null)
                    navigateTo('track')
                  } catch { /* noop */ } finally { setAcceptingCounter(false) }
                }}
                className="btn btn-primary flex-grow-1 d-flex align-items-center justify-content-center gap-2"
              >
                {acceptingCounter ? <Loader size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Accept ${counterOffer.counterFare.toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return-trip bid modal */}
      {incomingReturnBid && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
          style={{ zIndex: 1070, background: 'rgba(0,0,0,0.85)' }}>
          <div className="card p-4 shadow animate-fade-in" style={{ maxWidth: 380, width: '100%' }}>
            <div className="d-flex align-items-center gap-3 mb-3">
              <div className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                style={{ width: 44, height: 44, background: 'rgba(250,204,21,0.15)' }}>
                <RotateCcw size={20} style={{ color: '#facc15' }} />
              </div>
              <div>
                <h6 className="fw-bold mb-0">Return Trip Offer</h6>
                <p className="text-xs text-muted mb-0">{incomingReturnBid.driverName}</p>
              </div>
            </div>
            <div className="d-flex flex-column gap-2 small mb-3">
              <div className="d-flex align-items-center gap-2">
                <MapPin size={14} className="text-brand flex-shrink-0" />
                <span>{incomingReturnBid.pickupAddress}</span>
              </div>
              <div className="d-flex align-items-center gap-2">
                <MapPin size={14} className="text-danger flex-shrink-0" />
                <span>{incomingReturnBid.dropoffAddress}</span>
              </div>
            </div>
            <div className="p-3 rounded-xl mb-4 text-center" style={{ background: 'var(--eg-700)' }}>
              <p className="text-xs text-muted mb-1">Proposed fare</p>
              <p className="fs-4 fw-bold mb-0" style={{ color: '#facc15' }}>${incomingReturnBid.proposedFare.toFixed(2)}</p>
            </div>
            <div className="d-flex gap-2">
              <button
                onClick={() => setIncomingReturnBid(null)}
                className="btn flex-grow-1 fw-semibold"
                style={{ border: '1px solid rgba(107,114,128,0.4)', color: '#9ca3af', background: 'transparent' }}
              >
                Decline
              </button>
              <button
                onClick={async () => {
                  setAcceptingReturn(true)
                  try {
                    const res = await api.post('/rides/return-accept', {
                      originalRideId:  incomingReturnBid.originalRideId,
                      proposedFare:    incomingReturnBid.proposedFare,
                      driverId:        incomingReturnBid.driverId,
                      pickupAddress:   incomingReturnBid.pickupAddress,
                      dropoffAddress:  incomingReturnBid.dropoffAddress,
                      pickupCoords:    incomingReturnBid.pickupCoords,
                      dropoffCoords:   incomingReturnBid.dropoffCoords,
                      paymentMethod:   incomingReturnBid.paymentMethod,
                    })
                    setActiveRide(res.data)
                    setIncomingReturnBid(null)
                    navigateTo('track')
                  } catch { /* silently ignore */ } finally { setAcceptingReturn(false) }
                }}
                disabled={acceptingReturn}
                className="btn btn-primary flex-grow-1 d-flex align-items-center justify-content-center gap-2"
              >
                {acceptingReturn ? <Loader size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SOS Modal */}
      {showSOS && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
          style={{ zIndex: 1060, background: 'rgba(0,0,0,0.8)' }}
        >
          <div
            className="card p-4 text-center shadow"
            style={{ maxWidth: 360, width: '100%', borderColor: 'rgba(239,68,68,0.5)' }}
          >
            <div
              className={`rounded-circle mx-auto mb-4 d-flex align-items-center justify-content-center${sosActive ? '' : ''}`}
              style={{
                width: 80, height: 80,
                background: sosActive ? '#dc2626' : 'rgba(239,68,68,0.15)',
                animation: sosActive ? 'pingRing 1.5s cubic-bezier(0,0,0.2,1) infinite' : undefined,
              }}
            >
              <AlertTriangle size={40} className="text-danger" />
            </div>
            <h2 className="fw-bold fs-5 mb-2">
              {sosActive ? 'SOS Alert Sent!' : 'Emergency SOS'}
            </h2>
            <p className="text-muted text-xs mb-4">
              {sosActive
                ? <>
                    The EasyRide safety team has been notified.
                    {sosNotifiedContact && <>{' '}An SMS alert was sent to <strong className="text-white">{sosNotifiedContact}</strong>.</>}
                    {' '}Stay on the line.
                  </>
                : <>
                    This will immediately alert the EasyRide safety team.
                    {user?.riderProfile?.emergencyContactPhone
                      ? <>{' '}An SMS with your live location will also be sent to <strong className="text-white">{user.riderProfile.emergencyContactName || user.riderProfile.emergencyContactPhone}</strong>.</>
                      : <>{' '}<span style={{ color: '#fbbf24' }}>No emergency contact set — add one in Account for SMS alerts.</span></>
                    }
                  </>
              }
            </p>
            {!sosActive ? (
              <div className="d-flex gap-2">
                <button onClick={() => setShowSOS(false)} className="btn btn-secondary flex-grow-1">
                  Cancel
                </button>
                <button
                  onClick={handleSOS}
                  className="btn flex-grow-1 fw-bold"
                  style={{ background: '#dc2626', borderColor: '#dc2626', color: '#fff', borderRadius: '0.75rem' }}
                >
                  Send SOS Alert
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setShowSOS(false); setSosActive(false); setSosNotifiedContact(null) }}
                className="btn btn-primary w-100"
              >
                Close
              </button>
            )}
          </div>
        </div>
      )}

      {/* Cancel Ride Modal */}
      {showCancel && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
          style={{ zIndex: 1060, background: 'rgba(0,0,0,0.8)' }}
        >
          <div
            className="card p-4 shadow"
            style={{ maxWidth: 360, width: '100%' }}
          >
            <h2 className="fw-bold fs-5 mb-1">Cancel Ride</h2>
            <p className="text-xs text-muted mb-3">Why are you cancelling?</p>

            <div className="d-flex flex-column gap-2 mb-4">
              {CANCEL_REASONS.map(reason => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setCancelReason(reason)}
                  className="w-100 text-start px-3 py-2 rounded-xl border text-xs fw-medium"
                  style={{
                    background:   cancelReason === reason ? 'rgba(34,197,94,0.1)' : 'transparent',
                    borderColor:  cancelReason === reason ? '#22c55e' : 'var(--eg-600)',
                    color:        cancelReason === reason ? '#fff' : '#9ca3af',
                    transition:   'all 0.15s',
                  }}
                >
                  {reason}
                </button>
              ))}
            </div>

            <div className="d-flex gap-2">
              <button
                onClick={() => { setShowCancel(false); setCancelReason('') }}
                className="btn btn-secondary flex-grow-1"
              >
                Go Back
              </button>
              <button
                onClick={handleCancel}
                disabled={!cancelReason}
                className="btn flex-grow-1 fw-semibold text-xs"
                style={{
                  background: '#dc2626', borderColor: '#dc2626', color: '#fff',
                  borderRadius: '0.75rem', opacity: !cancelReason ? 0.4 : 1,
                }}
              >
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post-ride Rating Modal */}
      {showRating && completedRide && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
          style={{ zIndex: 1060, background: 'rgba(0,0,0,0.8)' }}
        >
          <div
            className="card p-4 shadow"
            style={{ maxWidth: 360, width: '100%' }}
          >
            {!ratingDone ? (
              <>
                <div className="text-center mb-4">
                  <div
                    className="rounded-circle mx-auto mb-3 d-flex align-items-center justify-content-center"
                    style={{ width: 64, height: 64, background: 'rgba(34,197,94,0.15)', fontSize: '1.75rem' }}
                  >
                    🎉
                  </div>
                  <h2 className="fw-bold fs-5 mb-1">Ride Complete!</h2>
                  <p className="text-xs text-muted mb-1 text-truncate">
                    {completedRide.pickupAddress} → {completedRide.dropoffAddress}
                  </p>
                  {completedRide.fare && (
                    <p className="fw-bold text-brand fs-5 mb-0">${completedRide.fare.toFixed(2)}</p>
                  )}
                </div>

                <p className="text-center text-xs text-muted mb-2">How was your ride?</p>
                <div className="d-flex justify-content-center gap-1 mb-3">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRideRating(n)}
                      className="btn p-0"
                      style={{
                        fontSize: '1.75rem',
                        color: n <= rideRating ? '#fbbf24' : '#4b5563',
                        lineHeight: 1,
                        transition: 'transform 0.1s',
                        background: 'transparent',
                        border: 'none',
                      }}
                    >
                      ★
                    </button>
                  ))}
                </div>

                {driverCard && (
                  <p className="text-xs text-center text-muted mb-3">
                    {driverCard.name} · {driverCard.vehicle}
                  </p>
                )}

                <textarea
                  className="form-control text-xs mb-3"
                  rows={2}
                  placeholder="Leave a comment (optional)"
                  value={ratingComment}
                  onChange={e => setRatingComment(e.target.value)}
                  style={{ resize: 'none' }}
                />

                <div className="d-flex gap-2">
                  <button
                    onClick={() => { setShowRating(false); setCompletedRide(null) }}
                    className="btn btn-secondary flex-grow-1"
                  >
                    Skip
                  </button>
                  <button onClick={handleRating} className="btn btn-primary flex-grow-1">
                    Submit
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-5">
                <div style={{ fontSize: '3rem' }} className="mb-3">✅</div>
                <h3 className="fw-bold fs-4">Thank you!</h3>
                <p className="text-muted text-xs mb-0">Your rating helps keep EasyRide great.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Call Modal */}
      {callState.open && activeRide && (
        <CallModal
          peerId={activeRide.driverId || ''}
          peerName={driverCard?.name || 'Your Driver'}
          callType={callState.type}
          onEnd={() => setCallState({ open: false, type: 'audio' })}
        />
      )}

      {/* Payment Modal */}
      {showPayment && activeRide && (
        <PaymentModal
          fare={activeRide.fare || 5.50}
          rideId={activeRide.id}
          onPay={handlePayRide}
          onClose={() => setShowPayment(false)}
        />
      )}

      {/* Bottom navigation (mobile only) */}
      <BottomNav
        items={BOTTOM_TABS.map(t => ({ ...t, badge: t.id === 'chat' ? unreadCount : undefined }))}
        active={['history', 'payment'].includes(tab) ? 'account' : tab}
        onNav={navigateTo}
      />

      {/* Save place modal */}
      {editingPlace && (() => {
        const place = places.find(p => p.id === editingPlace)
        if (!place) return null
        return (
          <div
            className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-end align-items-sm-center justify-content-center p-3"
            style={{ zIndex: 1070, background: 'rgba(0,0,0,0.75)' }}
            onClick={() => setEditingPlace(null)}
          >
            <div className="card p-4 w-100 animate-fade-in" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
              <h6 className="fw-semibold mb-1">{place.icon} {place.address ? `Update ${place.name}` : `Set ${place.name} address`}</h6>
              <p className="text-xs text-muted mb-3">This will be saved for quick booking</p>
              <input
                className="form-control mb-3"
                placeholder={`e.g. 123 Samora Machel Ave, Harare`}
                value={editPlaceInput}
                onChange={e => setEditPlaceInput(e.target.value)}
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter' && editPlaceInput.trim()) {
                    setPlaceAddress(editingPlace, editPlaceInput.trim())
                    setEditingPlace(null)
                  }
                }}
              />
              <div className="d-flex gap-2">
                <button onClick={() => setEditingPlace(null)} className="btn btn-secondary flex-grow-1">Cancel</button>
                <button
                  onClick={() => { setPlaceAddress(editingPlace, editPlaceInput.trim()); setEditingPlace(null) }}
                  disabled={!editPlaceInput.trim()}
                  className="btn btn-primary flex-grow-1"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Ride['status'] }) {
  const badgeClass: Record<string, string> = {
    scheduled:  'badge-info-soft',
    searching:  'badge-warn',
    accepted:   'badge-info-soft',
    pickup:     'badge-info-soft',
    inprogress: 'badge-brand',
    completed:  'badge-brand',
    cancelled:  'badge-danger-soft',
  }
  const labels: Record<string, string> = {
    scheduled:  'Scheduled',
    searching:  'Finding driver...',
    accepted:   'Driver on the way',
    pickup:     'Arriving at pickup',
    inprogress: 'In progress',
    completed:  'Completed',
    cancelled:  'Cancelled',
  }
  return (
    <span className={`${badgeClass[status] || 'badge-warn'} mt-1`}>
      {labels[status] || status}
    </span>
  )
}

function RideRow({ ride, detailed, onReport, hasReport }: { ride: Ride; detailed?: boolean; onReport?: () => void; hasReport?: boolean }) {
  return (
    <div
      className="py-3"
      style={{ borderBottom: '1px solid var(--eg-600)' }}
    >
      <div className="d-flex align-items-start gap-3">
        <div
          className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0 bg-700"
          style={{ width: 36, height: 36 }}
        >
          <Navigation size={14} className="text-brand" />
        </div>
        <div className="flex-grow-1 overflow-hidden">
          <p className="fw-semibold text-xs mb-0 text-truncate">
            {ride.pickupAddress} → {ride.dropoffAddress}
          </p>
          <p className="text-xs text-muted mb-0 mt-1">
            {new Date(ride.createdAt).toLocaleDateString()} · {ride.paymentMethod?.replace('_', ' ')}
            {detailed && ride.fare && ` · $${ride.fare.toFixed(2)}`}
          </p>
        </div>
        {ride.fare && (
          <p className="text-xs fw-bold text-brand flex-shrink-0 mb-0">
            ${ride.fare.toFixed(2)}
          </p>
        )}
      </div>
      {(onReport || hasReport) && (
        <div className="mt-2 ms-5 ps-1">
          {hasReport ? (
            <span className="badge text-xs" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>
              Lost item reported
            </span>
          ) : onReport ? (
            <button
              onClick={onReport}
              className="btn btn-link p-0 text-xs text-muted"
              style={{ textDecoration: 'underline' }}
            >
              Lost something?
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}

