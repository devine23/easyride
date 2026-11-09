'use strict'
const axios         = require('axios')
const { v4: uuid }  = require('uuid')
const WaSession     = require('./models/WaSession')
const User          = require('./models/User')
const Ride          = require('./models/Ride')
const { sendWA }    = require('./utils/whatsapp')
const { logger, captureException } = require('./utils/logger')
const { calcFare } = require('./utils/fareCalc')

// ─── Geocoding — tries Google Maps first (if configured), falls back to Nominatim ──
async function geocodeGoogle(address) {
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return null
  try {
    const q = encodeURIComponent(address)
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${q}&region=zw&key=${key}`
    const { data } = await axios.get(url, { timeout: 6000 })
    if (data.status !== 'OK' || !data.results?.length) return null
    const r = data.results[0]
    const display = r.formatted_address.split(',').slice(0, 2).join(',').trim()
    return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, display }
  } catch (err) {
    logger.warn({ err: err.message }, '[geocode] google failed, trying fallback')
    return null
  }
}

async function geocodeNominatim(address) {
  try {
    const q = encodeURIComponent(`${address}, Zimbabwe`)
    const { data } = await axios.get(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=zw`,
      { headers: { 'User-Agent': 'EasyRideZim/1.0 (easyride.co.zw)' }, timeout: 8000 }
    )
    if (!data?.length) return null
    const { lat, lon, display_name } = data[0]
    const display = display_name.split(',').slice(0, 2).join(',').trim()
    return { lat: parseFloat(lat), lng: parseFloat(lon), display }
  } catch (err) {
    logger.warn({ err: err.message }, '[geocode] nominatim failed')
    return null
  }
}

async function geocode(address) {
  return (await geocodeGoogle(address)) || (await geocodeNominatim(address))
}

// ─── OSRM route ───────────────────────────────────────────────────────────
async function getRoute(from, to) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`
    const { data } = await axios.get(url, { timeout: 8000 })
    if (data.code !== 'Ok' || !data.routes?.length) return null
    const { distance, duration } = data.routes[0]
    return { distKm: +(distance / 1000).toFixed(2), durMin: +(duration / 60).toFixed(1) }
  } catch { return null }
}

// ─── Session helpers ──────────────────────────────────────────────────────
async function getSession(phone) {
  return WaSession.findOneAndUpdate(
    { phone },
    { $setOnInsert: { phone, step: 'idle', data: {}, updatedAt: new Date() } },
    { upsert: true, new: true }
  )
}

async function persist(session) {
  session.markModified('data')
  session.updatedAt = new Date()
  await session.save()
}

// ─── Find or create guest user from phone ────────────────────────────────
async function resolveUser(phone) {
  let user = await User.findOne({ phone })
  if (!user) {
    user = await User.create({
      id:            uuid(),
      fullName:      `WA User ${phone.slice(-4)}`,
      name:          `WA User ${phone.slice(-4)}`,
      phone,
      role:          'rider',
      accountStatus: 'active',
      createdAt:     new Date().toISOString(),
      verification:  { status: 'approved' },
    })
  }
  return user
}

// ─── Text helpers ─────────────────────────────────────────────────────────
function menuText(firstName = '') {
  const greet = firstName ? `Hi *${firstName}*! ` : 'Hi! '
  return (
    `${greet}Welcome to *EasyRide Zimbabwe* 🚗\n\n` +
    `Reply with a number:\n` +
    `*1* – Book a ride\n` +
    `*2* – Check ride status\n` +
    `*0* – Cancel / Exit`
  )
}

function rideStatusText(ride) {
  const statusMap = {
    searching:   '🔍 Looking for a driver...',
    accepted:    '✅ Driver found and on the way!',
    arrived:     '📍 Driver has arrived at your pickup!',
    in_progress: '🚗 Ride in progress.',
    completed:   `🎉 Ride completed. Fare: *$${ride.fare || '–'}*`,
    cancelled:   '❌ Ride cancelled.',
  }
  const line = statusMap[ride.status] || `Status: ${ride.status}`
  return `*Ride Update*\n${line}\n\nFrom: ${ride.pickupAddress}\nTo:     ${ride.dropoffAddress}`
}

function isGlobalReset(text, step) {
  // "0" and "cancel" in confirm step fall through to the step handler
  if (step === 'confirm') return /^(hi|hello|hey|start|menu|back)$/i.test(text.trim())
  return /^(hi|hello|hey|start|menu|0|back|cancel)$/i.test(text.trim())
}

// ─── Step handlers ────────────────────────────────────────────────────────

async function handleIdle(session, text) {
  const user = session.userId ? await User.findOne({ id: session.userId }) : null
  const firstName = user?.fullName?.split(' ')[0] || user?.name?.split(' ')[0] || ''
  session.step = 'menu'
  await persist(session)
  await sendWA(session.phone, menuText(firstName))
}

async function handleMenu(session, text) {
  const t = text.trim()
  if (t === '1') {
    session.step = 'pickup'
    session.data = {}
    await persist(session)
    await sendWA(session.phone,
      'Please type your *pickup address*\n(e.g. "Corner Jason Moyo & 1st St, Harare"):')
  } else if (t === '2') {
    const ride = session.rideId ? await Ride.findOne({ id: session.rideId }) : null
    if (!ride) {
      await sendWA(session.phone, 'You have no active ride.\n\nReply *1* to book a ride.')
    } else {
      await sendWA(session.phone, rideStatusText(ride))
    }
  } else {
    await sendWA(session.phone, 'Please reply *1* to book, *2* to check status, or *0* to exit.')
  }
}

async function handlePickup(session, text) {
  await sendWA(session.phone, '🔍 Looking up that location...')
  const coords = await geocode(text.trim())
  if (!coords) {
    await sendWA(session.phone,
      '❌ Could not find that address. Please be more specific\n(e.g. "Avondale Shopping Centre, Harare"):')
    return
  }
  session.step = 'dropoff'
  session.data.pickupAddress = text.trim()
  session.data.pickupCoords  = coords
  await persist(session)
  await sendWA(session.phone, `✅ Pickup: *${coords.display}*\n\nNow type your *drop-off address*:`)
}

async function handleDropoff(session, text) {
  await sendWA(session.phone, '🔍 Looking up drop-off location...')
  const coords = await geocode(text.trim())
  if (!coords) {
    await sendWA(session.phone,
      '❌ Could not find that address. Try again\n(e.g. "Borrowdale Brooke, Harare"):')
    return
  }

  session.data.dropoffAddress = text.trim()
  session.data.dropoffCoords  = coords
  session.step = 'vehicle'

  const route = await getRoute(session.data.pickupCoords, coords)
  let fareBlock = ''
  if (route) {
    const { distKm, durMin } = route
    session.data.distKm   = distKm
    session.data.durMin   = durMin
    session.data.fareEco  = calcFare('Economy', distKm, durMin)
    session.data.fareCom  = calcFare('Comfort',  distKm, durMin)
    session.data.fareSuv  = calcFare('SUV',      distKm, durMin)
    fareBlock =
      `\n📍 *${distKm} km · ~${Math.round(durMin)} min*\n\n` +
      `*Choose vehicle:*\n` +
      `*1* – Economy  (~$${session.data.fareEco})\n` +
      `*2* – Comfort   (~$${session.data.fareCom})\n` +
      `*3* – SUV          (~$${session.data.fareSuv})`
  } else {
    fareBlock =
      `\n\n*Choose vehicle:*\n` +
      `*1* – Economy\n` +
      `*2* – Comfort\n` +
      `*3* – SUV`
  }

  await persist(session)
  await sendWA(session.phone, `✅ Drop-off: *${coords.display}*${fareBlock}`)
}

async function handleVehicle(session, text) {
  const map = { '1': 'Economy', '2': 'Comfort', '3': 'SUV' }
  const category = map[text.trim()]
  if (!category) {
    await sendWA(session.phone, 'Please reply *1* for Economy, *2* for Comfort, or *3* for SUV.')
    return
  }
  const { distKm, durMin } = session.data
  const fare = (distKm != null && durMin != null) ? calcFare(category, distKm, durMin) : null
  session.data.vehicleCategory = category
  session.data.estimatedFare   = fare
  session.step = 'payment'
  await persist(session)

  const fareNote = fare ? ` (~$${fare})` : ''
  await sendWA(session.phone,
    `🚗 *${category}*${fareNote} selected.\n\n` +
    `*Payment method:*\n` +
    `*1* – EcoCash\n` +
    `*2* – Cash\n` +
    `*3* – ZIPIT / Bank transfer`)
}

async function handlePayment(session, text) {
  const map = { '1': 'ecocash', '2': 'cash', '3': 'zipit' }
  const method = map[text.trim()]
  if (!method) {
    await sendWA(session.phone,
      'Please reply *1* for EcoCash, *2* for Cash, or *3* for ZIPIT.')
    return
  }
  session.data.paymentMethod = method
  session.step = 'confirm'
  await persist(session)

  const d = session.data
  const methodLabel = { ecocash: 'EcoCash', cash: 'Cash', zipit: 'ZIPIT' }[method]
  const distLine    = d.distKm ? `\n🛣  Dist: ${d.distKm} km` : ''
  const fareLine    = d.estimatedFare ? `\n💰 Est. fare: *$${d.estimatedFare}*` : ''
  await sendWA(session.phone,
    `*Booking Summary*\n\n` +
    `📍 From: ${d.pickupAddress}\n` +
    `🏁 To:     ${d.dropoffAddress}` +
    `${distLine}\n` +
    `🚗 Type: ${d.vehicleCategory}\n` +
    `💳 Pay:  ${methodLabel}` +
    `${fareLine}\n\n` +
    `Reply *YES* to confirm or *NO* to cancel.`)
}

async function handleConfirm(session, text, io) {
  const t = text.trim().toUpperCase()

  if (t === 'NO' || t === '0' || t === 'CANCEL') {
    session.step = 'menu'
    session.data = {}
    await persist(session)
    await sendWA(session.phone, 'Booking cancelled.\n\n' + menuText())
    return
  }
  if (t !== 'YES') {
    await sendWA(session.phone,
      'Please reply *YES* to confirm your booking or *NO* to cancel.')
    return
  }

  const user = await resolveUser(session.phone)
  const d    = session.data
  const rideId = uuid()

  let ride
  try {
    ride = await Ride.create({
      id:              rideId,
      clientId:        user.id,
      pickupAddress:   d.pickupAddress,
      dropoffAddress:  d.dropoffAddress,
      pickupCoords:    d.pickupCoords,
      dropoffCoords:   d.dropoffCoords,
      vehicleCategory: d.vehicleCategory,
      paymentMethod:   d.paymentMethod,
      fare:            d.estimatedFare || 0,
      distance:        d.distKm   || 0,
      duration:        d.durMin   || 0,
      status:          'searching',
      createdAt:       new Date().toISOString(),
    })
  } catch (err) {
    captureException(err, { tag: 'wa.ride_create', phone: session.phone })
    await sendWA(session.phone,
      '❌ Sorry, we could not create your booking. Please try again.')
    return
  }

  session.step   = 'searching'
  session.rideId = rideId
  session.userId = user.id
  session.data   = {}
  await persist(session)

  io.to('drivers').emit('ride:new', ride.toObject())

  await sendWA(session.phone,
    `✅ *Ride Booked!*\n\n` +
    `We're finding you a driver...\n` +
    `Ref: *${rideId.slice(0, 8).toUpperCase()}*\n\n` +
    `Send *STATUS* any time to check, *0* to cancel.`)
}

async function handleSearching(session, text, io) {
  const t = text.trim().toLowerCase()

  if (t === 'status' || t === '2') {
    const ride = session.rideId ? await Ride.findOne({ id: session.rideId }) : null
    if (!ride) {
      session.step = 'menu'; await persist(session)
      await sendWA(session.phone, 'No active ride found. Reply *1* to book.')
    } else if (['completed', 'cancelled'].includes(ride.status)) {
      session.step = 'idle'; session.rideId = null; await persist(session)
      await sendWA(session.phone, rideStatusText(ride) + '\n\nReply *1* to book a new ride.')
    } else {
      await sendWA(session.phone, rideStatusText(ride))
    }
    return
  }

  if (t === '0' || t === 'cancel') {
    const ride = session.rideId ? await Ride.findOne({ id: session.rideId }) : null
    if (ride && ride.status === 'searching') {
      await Ride.findOneAndUpdate(
        { id: session.rideId },
        { status: 'cancelled', cancelReason: 'Cancelled by rider via WhatsApp' }
      )
    }
    session.step = 'menu'; session.rideId = null; await persist(session)
    await sendWA(session.phone, 'Ride cancelled.\n\n' + menuText())
    return
  }

  // Any other message — show current status
  const ride = session.rideId ? await Ride.findOne({ id: session.rideId }) : null
  if (ride) {
    await sendWA(session.phone, rideStatusText(ride) + '\n\nSend *STATUS* to refresh or *0* to cancel.')
  } else {
    session.step = 'menu'; await persist(session)
    await sendWA(session.phone, menuText())
  }
}

async function handleActive(session, text) {
  const ride = session.rideId ? await Ride.findOne({ id: session.rideId }) : null

  if (!ride || ['completed', 'cancelled'].includes(ride.status)) {
    const msg = ride?.status === 'completed'
      ? `🎉 Your ride is complete!\nFare: *$${ride.fare || '–'}*\n\nThank you for riding with EasyRide! 🚗\n\nReply *1* to book again.`
      : 'Your ride has ended.\n\n' + menuText()
    session.step = 'idle'; session.rideId = null; await persist(session)
    await sendWA(session.phone, msg)
    return
  }

  await sendWA(session.phone, rideStatusText(ride) + '\n\nSend *STATUS* to refresh.')
}

// ─── Main entry ───────────────────────────────────────────────────────────
async function handleIncoming(phone, text, io, onlineUsers) {
  try {
    const session = await getSession(phone)

    // Auto-link userId if phone matches a registered account
    if (!session.userId) {
      const user = await User.findOne({ phone })
      if (user) { session.userId = user.id; await session.save() }
    }

    if (isGlobalReset(text, session.step)) {
      session.step = 'idle'; await persist(session)
      return handleIdle(session, text)
    }

    switch (session.step) {
      case 'idle':      return handleIdle(session, text)
      case 'menu':      return handleMenu(session, text)
      case 'pickup':    return handlePickup(session, text)
      case 'dropoff':   return handleDropoff(session, text)
      case 'vehicle':   return handleVehicle(session, text)
      case 'payment':   return handlePayment(session, text)
      case 'confirm':   return handleConfirm(session, text, io)
      case 'searching': return handleSearching(session, text, io)
      case 'active':    return handleActive(session, text)
      default:
        session.step = 'idle'; await persist(session)
        return handleIdle(session, text)
    }
  } catch (err) {
    captureException(err, { tag: 'wa.handleIncoming', phone })
    try {
      await sendWA(phone, '⚠️ Something went wrong on our side. Please send *HI* to start over.')
    } catch { /* swallow — nothing more we can do */ }
  }
}

// ─── Called from index.js after a driver accepts ─────────────────────────
async function notifyDriverAccepted(rideId) {
  try {
    const ride   = await Ride.findOne({ id: rideId })
    if (!ride) return
    const client = await User.findOne({ id: ride.clientId })
    if (!client?.phone) return
    const session = await WaSession.findOne({ phone: client.phone })
    if (!session) return

    const driver      = ride.driverId ? await User.findOne({ id: ride.driverId }) : null
    const driverName  = driver?.fullName || driver?.name || 'Your driver'
    const driverPhone = driver?.phone || ''
    const vehicle     = driver?.vehicleDetails
      ? `${driver.vehicleDetails.make} ${driver.vehicleDetails.model} (${driver.vehicleDetails.registration})`
      : (driver?.vehicleModel || 'Vehicle')

    session.step   = 'active'
    session.rideId = rideId
    await persist(session)

    await sendWA(client.phone,
      `✅ *Driver Found!*\n\n` +
      `👤 ${driverName}\n` +
      `🚗 ${vehicle}` +
      `${driverPhone ? `\n📞 ${driverPhone}` : ''}\n\n` +
      `Your driver is on the way!\nSend *STATUS* for updates.`)
  } catch (err) {
    captureException(err, { tag: 'wa.notifyDriverAccepted', rideId })
  }
}

// ─── Called from index.js when a ride completes ───────────────────────────
async function notifyRideCompleted(rideId) {
  try {
    const ride   = await Ride.findOne({ id: rideId })
    if (!ride) return
    const client = await User.findOne({ id: ride.clientId })
    if (!client?.phone) return
    const session = await WaSession.findOne({ phone: client.phone })
    if (!session) return

    session.step   = 'idle'
    session.rideId = null
    session.data   = {}
    await persist(session)

    const distLine = ride.distance ? `\nDistance: ${ride.distance} km` : ''
    await sendWA(client.phone,
      `🎉 *Ride Completed!*\n\n` +
      `Fare: *$${ride.fare || '–'}*${distLine}\n\n` +
      `Thank you for riding with *EasyRide Zimbabwe*!\n\n` +
      `Reply *1* to book another ride.`)
  } catch (err) {
    captureException(err, { tag: 'wa.notifyRideCompleted', rideId })
  }
}

module.exports = { handleIncoming, notifyDriverAccepted, notifyRideCompleted }
