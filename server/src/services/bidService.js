'use strict'
const { v4: uuid } = require('uuid')
const Bid        = require('../models/Bid')
const Ride       = require('../models/Ride')
const AppConfig  = require('../models/AppConfig')
const User       = require('../models/User')
const DriverWallet = require('../models/DriverWallet')
const walletService = require('./walletService')
const fareEngine    = require('../utils/fareEngine')

class BidError extends Error {
  constructor(code, message, extra = {}) {
    super(message || code); this.code = code; Object.assign(this, extra)
  }
}

const COUNTER_MAX_MULT = 3    // Driver can't counter more than 3x the passenger offer

async function getConfig() {
  const c = await AppConfig.findOne()
  // Fall back to schema defaults when there's no config doc yet
  return (c && c.toObject) ? c.toObject() : (c || {})
}

/**
 * Open a new bid session.
 *   @param {Object} args
 *   @param {string} args.clientId
 *   @param {Object} args.pickup       { lat, lng }
 *   @param {Object} args.dropoff      { lat, lng }
 *   @param {string} args.pickupAddress
 *   @param {string} args.dropoffAddress
 *   @param {string} args.category     'Economy' | 'Comfort' | 'SUV' | 'Tow Truck'
 *   @param {number} args.offer        Passenger's opening bid in USD
 *   @param {Map}    args.driverCoords Live map of driverId -> coords (from index.js)
 */
async function createBid({
  clientId, pickup, dropoff, pickupAddress, dropoffAddress,
  category = 'Economy', offer, driverCoords,
}) {
  if (!clientId)                 throw new BidError('INVALID_CLIENT')
  if (!pickup || !dropoff)       throw new BidError('MISSING_COORDS')
  if (!(offer > 0))              throw new BidError('INVALID_OFFER')

  const config = await getConfig()

  // Rate-limit: max 1 open bid per client at a time
  const existing = await Bid.findOne({ clientId, status: 'open' })
  if (existing) throw new BidError('BID_ALREADY_OPEN', 'You already have an open bid', { bidId: existing.id })

  // Compute envelope (distance, duration, estimate, floor, surge)
  const envelope = await fareEngine.estimateFare({
    pickup, dropoff, config, driverCoordsMap: driverCoords,
  })

  if (offer < envelope.floor) {
    throw new BidError('OFFER_BELOW_FLOOR', `Minimum offer is $${envelope.floor.toFixed(2)}`, {
      floor: envelope.floor, suggested: envelope.estimate,
    })
  }

  const bidId = uuid()
  const windowSec = config.bidCounterWindowSec || 90
  const expiresAt = new Date(Date.now() + windowSec * 1000)

  const bid = await Bid.create({
    id: bidId, clientId,
    pickupCoords: pickup, dropoffCoords: dropoff,
    pickupAddress, dropoffAddress,
    category,
    distKm: envelope.distKm, durMin: envelope.durMin,
    estimate: envelope.estimate, floor: envelope.floor,
    passengerOffer: +offer.toFixed(2),
    status: 'open', expiresAt,
  })

  return { bid: bid.toObject(), envelope }
}

/**
 * Compute the commission (USD) this driver would owe if they win this bid.
 */
function commissionForCounter(counterAmount, config) {
  return fareEngine.computeCommission(
    counterAmount,
    config.commissionPctDefault,
    config,
  )
}

/**
 * Determine which online drivers are eligible to receive this bid broadcast.
 * Hard-lock: wallet.balance >= max(walletMinBalanceUsd, estimated commission).
 * Haversine: within 15 km of pickup.
 */
async function filterEligibleDrivers({ bid, driverSockets, driverCoords }) {
  const config = await getConfig()
  // Pessimistic commission estimate (use the floor to be conservative on required balance)
  const commission = commissionForCounter(bid.floor, config)
  const required   = Math.max(config.walletMinBalanceUsd || 1, commission)

  const online = Array.from(driverSockets.keys())
  if (!online.length) return { eligible: [], lockedOut: [], required }

  const wallets = await DriverWallet.find({ driverId: { $in: online } }).lean()
  const balanceById = new Map(wallets.map(w => [w.driverId, w.balance]))

  const eligible  = []
  const lockedOut = []
  for (const driverId of online) {
    const bal = balanceById.get(driverId) ?? 0
    const coords = driverCoords.get(driverId)
    const inRange = !bid.pickupCoords || !coords
                  || fareEngine.haversineKm(bid.pickupCoords.lat, bid.pickupCoords.lng, coords.lat, coords.lng) <= 15
    if (!inRange) continue
    if (bal >= required) eligible.push(driverId)
    else                 lockedOut.push({ driverId, balance: bal, required })
  }
  return { eligible, lockedOut, required }
}

/**
 * Driver submits a counter-offer.
 */
async function addCounter({ bidId, driverId, amount, etaMin }) {
  if (!(amount > 0)) throw new BidError('INVALID_AMOUNT')

  const bid = await Bid.findOne({ id: bidId })
  if (!bid)                     throw new BidError('BID_NOT_FOUND')
  if (bid.status !== 'open')    throw new BidError('BID_NOT_OPEN', `Bid is ${bid.status}`)
  if (bid.expiresAt < new Date()) throw new BidError('BID_EXPIRED')

  // Cap counter at 3x the passenger's opening offer (anti-fraud)
  if (amount > bid.passengerOffer * COUNTER_MAX_MULT) {
    throw new BidError('COUNTER_TOO_HIGH', `Counter cannot exceed ${COUNTER_MAX_MULT}× the passenger's offer`)
  }

  // Verify wallet eligibility
  const config = await getConfig()
  const commission = commissionForCounter(amount, config)
  const required = Math.max(config.walletMinBalanceUsd || 1, commission)
  const eligible = await walletService.isEligible(driverId, required)
  if (!eligible) throw new BidError('WALLET_LOCKED', `Top up your wallet to at least $${required.toFixed(2)} to bid`, { required })

  const driver = await User.findOne({ id: driverId })
  const counter = {
    id: uuid(),
    driverId,
    driverName: driver?.fullName || driver?.name || 'Driver',
    amount: +amount.toFixed(2),
    etaMin: etaMin != null ? +etaMin.toFixed(1) : null,
    rating: driver?.rating || null,
    at: new Date().toISOString(),
  }

  const updated = await Bid.findOneAndUpdate(
    { id: bidId, status: 'open' },
    { $push: { counters: counter } },
    { new: true },
  )
  if (!updated) throw new BidError('BID_NOT_OPEN')

  return { counter, bid: updated.toObject() }
}

/**
 * Passenger accepts a counter.
 * Creates the Ride document, computes commission, marks bid as accepted.
 */
async function acceptBid({ bidId, clientId, counterId }) {
  const bid = await Bid.findOne({ id: bidId })
  if (!bid)                       throw new BidError('BID_NOT_FOUND')
  if (bid.clientId !== clientId)  throw new BidError('NOT_YOUR_BID')
  if (bid.status !== 'open')      throw new BidError('BID_NOT_OPEN')
  if (bid.expiresAt < new Date()) throw new BidError('BID_EXPIRED')

  const counter = bid.counters.find(c => c.id === counterId)
  if (!counter) throw new BidError('COUNTER_NOT_FOUND')

  const config = await getConfig()
  const commissionAmount = commissionForCounter(counter.amount, config)
  const rideId = uuid()

  const ride = await Ride.create({
    id: rideId,
    bidId: bid.id,
    clientId:        bid.clientId,
    driverId:        counter.driverId,
    pickupAddress:   bid.pickupAddress,
    dropoffAddress:  bid.dropoffAddress,
    pickupCoords:    bid.pickupCoords,
    dropoffCoords:   bid.dropoffCoords,
    vehicleCategory: bid.category,
    passengerOffer:  bid.passengerOffer,
    finalFare:       counter.amount,
    fare:            counter.amount,          // Legacy field kept in sync
    distance:        bid.distKm,
    duration:        bid.durMin,
    status:          'accepted',
    acceptedAt:      new Date().toISOString(),
    commissionPct:   config.commissionPctDefault,
    commissionAmount,
    commissionStatus:'none',
  })

  // Mark bid as accepted + link rideId
  await Bid.updateOne(
    { id: bidId },
    { status: 'accepted', acceptedCounterId: counterId, rideId },
  )

  return { ride: ride.toObject(), counter }
}

/**
 * Passenger cancels an open bid.
 */
async function cancelBid({ bidId, clientId }) {
  const bid = await Bid.findOne({ id: bidId })
  if (!bid)                       throw new BidError('BID_NOT_FOUND')
  if (bid.clientId !== clientId)  throw new BidError('NOT_YOUR_BID')
  if (bid.status !== 'open')      return { bid: bid.toObject(), noop: true }

  await Bid.updateOne({ id: bidId }, { status: 'cancelled' })
  return { bid: { ...bid.toObject(), status: 'cancelled' } }
}

/**
 * Sweep: expire bids past their expiresAt (TTL covers deletion, but we want
 * status transition for in-flight listeners / UI).
 */
async function expireStaleBids() {
  const now = new Date()
  const stale = await Bid.find({ status: 'open', expiresAt: { $lt: now } })
  if (!stale.length) return []
  const ids = stale.map(b => b.id)
  await Bid.updateMany({ id: { $in: ids } }, { status: 'expired' })
  return stale.map(b => b.toObject())
}

module.exports = {
  BidError,
  createBid,
  addCounter,
  acceptBid,
  cancelBid,
  filterEligibleDrivers,
  commissionForCounter,
  expireStaleBids,
}
