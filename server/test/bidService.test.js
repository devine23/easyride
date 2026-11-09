/**
 * bidService tests — mocks all DB models and fareEngine so we only test
 * the service's own business logic (validation, counter rules, state
 * transitions, hard-lock integration).
 */
jest.mock('../src/models/Bid')
jest.mock('../src/models/Ride')
jest.mock('../src/models/AppConfig')
jest.mock('../src/models/User')
jest.mock('../src/models/DriverWallet')
jest.mock('../src/utils/fareEngine')
jest.mock('../src/services/walletService')

const Bid           = require('../src/models/Bid')
const Ride          = require('../src/models/Ride')
const AppConfig     = require('../src/models/AppConfig')
const User          = require('../src/models/User')
const DriverWallet  = require('../src/models/DriverWallet')
const fareEngine    = require('../src/utils/fareEngine')
const walletService = require('../src/services/walletService')
const bidService    = require('../src/services/bidService')

// ─── Shared mock state ────────────────────────────────────────────────────
const state = { bids: new Map(), rides: new Map() }

const DEFAULT_CONFIG = {
  fareBaseRatePerKm:    0.40,
  fareTimeBufferPerMin: 0.05,
  fareFloorAbsoluteUSD: 2.00,
  fareFloorPctOfEstim:  0.70,
  bidCounterWindowSec:  90,
  commissionPctDefault: 0.08,
  commissionPctMin:     0.06,
  commissionPctMax:     0.12,
  walletMinBalanceUsd:  1.00,
}

beforeEach(() => {
  state.bids.clear()
  state.rides.clear()

  AppConfig.findOne = jest.fn(async () => ({
    ...DEFAULT_CONFIG,
    toObject: () => DEFAULT_CONFIG,
  }))

  Bid.findOne = jest.fn(async (filter) => {
    for (const b of state.bids.values()) {
      const match = Object.entries(filter).every(([k, v]) => {
        if (k === 'id')     return b.id === v
        if (k === 'status') return b.status === v
        if (k === 'clientId') return b.clientId === v
        return true
      })
      if (match) return mockBidDoc(b)
    }
    return null
  })

  Bid.create = jest.fn(async (doc) => {
    const bid = { counters: [], status: 'open', createdAt: new Date().toISOString(), ...doc }
    state.bids.set(bid.id, bid)
    return mockBidDoc(bid)
  })

  Bid.findOneAndUpdate = jest.fn(async (filter, update, opts) => {
    const b = state.bids.get(filter.id)
    if (!b) return null
    if (filter.status && b.status !== filter.status) return null
    if (update.$push?.counters) b.counters.push(update.$push.counters)
    if (update.$set) Object.assign(b, update.$set)
    // Also handle direct top-level updates (not wrapped in $set)
    for (const [k, v] of Object.entries(update)) {
      if (k === '$push' || k === '$set' || k === '$inc') continue
      b[k] = v
    }
    return mockBidDoc(b)
  })

  Bid.updateOne = jest.fn(async (filter, update) => {
    const b = state.bids.get(filter.id)
    if (!b) return { modifiedCount: 0 }
    for (const [k, v] of Object.entries(update)) {
      if (k === '$set' || k === '$push' || k === '$inc') continue
      b[k] = v
    }
    if (update.$set) Object.assign(b, update.$set)
    return { modifiedCount: 1 }
  })

  Bid.updateMany = jest.fn(async () => ({ modifiedCount: 0 }))
  Bid.find = jest.fn(async () => [])

  Ride.create = jest.fn(async (doc) => {
    state.rides.set(doc.id, doc)
    return { ...doc, toObject: () => doc }
  })

  User.findOne = jest.fn(async () => ({
    fullName: 'Mock Driver', rating: 4.8, phone: '+263770000000',
  }))

  DriverWallet.find = jest.fn(async () => ({
    lean: async () => [],
  }))

  fareEngine.estimateFare = jest.fn(async () => ({
    distKm: 5, durMin: 15, estimate: 2.75, floor: 2.00, supplyFactor: 1, nearbyDrivers: 3,
  }))
  fareEngine.computeCommission = jest.fn((amount, pct) => +(amount * (pct || 0.08)).toFixed(2))
  fareEngine.haversineKm = jest.fn(() => 2)   // All drivers "in range"

  walletService.isEligible = jest.fn(async () => true)
})

function mockBidDoc(obj) {
  return { ...obj, toObject: () => obj }
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('bidService.createBid', () => {
  const base = {
    clientId: 'cli-1',
    pickup:  { lat: -17.82, lng: 31.03 },
    dropoff: { lat: -17.85, lng: 31.05 },
    pickupAddress: 'Pick', dropoffAddress: 'Drop',
    category: 'Economy',
  }

  test('creates a bid when offer >= floor', async () => {
    const { bid, envelope } = await bidService.createBid({ ...base, offer: 3.00 })
    expect(bid.status).toBe('open')
    expect(bid.passengerOffer).toBe(3.00)
    expect(envelope.floor).toBe(2.00)
    expect(bid.expiresAt).toBeInstanceOf(Date)
  })

  test('rejects when offer is below the floor', async () => {
    await expect(bidService.createBid({ ...base, offer: 1.00 }))
      .rejects.toMatchObject({ code: 'OFFER_BELOW_FLOOR', floor: 2.00 })
  })

  test('rejects when client already has an open bid', async () => {
    await bidService.createBid({ ...base, offer: 3.00 })
    await expect(bidService.createBid({ ...base, offer: 3.00 }))
      .rejects.toMatchObject({ code: 'BID_ALREADY_OPEN' })
  })

  test('rejects missing coords / invalid inputs', async () => {
    await expect(bidService.createBid({ ...base, pickup: null, offer: 3 })).rejects.toMatchObject({ code: 'MISSING_COORDS' })
    await expect(bidService.createBid({ ...base, offer: 0 })).rejects.toMatchObject({ code: 'INVALID_OFFER' })
    await expect(bidService.createBid({ ...base, clientId: '', offer: 3 })).rejects.toMatchObject({ code: 'INVALID_CLIENT' })
  })
})

describe('bidService.addCounter', () => {
  let bidId
  beforeEach(async () => {
    const { bid } = await bidService.createBid({
      clientId: 'cli-1',
      pickup:  { lat: -17.82, lng: 31.03 },
      dropoff: { lat: -17.85, lng: 31.05 },
      pickupAddress: 'Pick', dropoffAddress: 'Drop',
      category: 'Economy', offer: 3.00,
    })
    bidId = bid.id
  })

  test('appends a counter when driver is eligible', async () => {
    const { counter } = await bidService.addCounter({ bidId, driverId: 'drv-1', amount: 3.50, etaMin: 4 })
    expect(counter.driverId).toBe('drv-1')
    expect(counter.amount).toBe(3.50)
    expect(counter.etaMin).toBe(4)
  })

  test('rejects when driver wallet is below required', async () => {
    walletService.isEligible.mockResolvedValueOnce(false)
    await expect(bidService.addCounter({ bidId, driverId: 'drv-poor', amount: 3.50 }))
      .rejects.toMatchObject({ code: 'WALLET_LOCKED' })
  })

  test('rejects counter > 3× passenger offer', async () => {
    await expect(bidService.addCounter({ bidId, driverId: 'drv-1', amount: 100 }))
      .rejects.toMatchObject({ code: 'COUNTER_TOO_HIGH' })
  })

  test('rejects on non-existent bid', async () => {
    await expect(bidService.addCounter({ bidId: 'ghost', driverId: 'drv-1', amount: 3 }))
      .rejects.toMatchObject({ code: 'BID_NOT_FOUND' })
  })

  test('rejects on invalid amount', async () => {
    await expect(bidService.addCounter({ bidId, driverId: 'drv-1', amount: 0 }))
      .rejects.toMatchObject({ code: 'INVALID_AMOUNT' })
  })

  test('rejects on expired bid', async () => {
    // Age the bid past its expiresAt
    const bid = state.bids.get(bidId)
    bid.expiresAt = new Date(Date.now() - 1000)
    await expect(bidService.addCounter({ bidId, driverId: 'drv-1', amount: 3.50 }))
      .rejects.toMatchObject({ code: 'BID_EXPIRED' })
  })
})

describe('bidService.acceptBid', () => {
  let bidId, counterId
  beforeEach(async () => {
    const { bid } = await bidService.createBid({
      clientId: 'cli-1',
      pickup:  { lat: -17.82, lng: 31.03 },
      dropoff: { lat: -17.85, lng: 31.05 },
      pickupAddress: 'Pick', dropoffAddress: 'Drop',
      category: 'Economy', offer: 3.00,
    })
    bidId = bid.id
    const { counter } = await bidService.addCounter({ bidId, driverId: 'drv-1', amount: 3.50, etaMin: 4 })
    counterId = counter.id
  })

  test('creates a Ride and transitions bid to accepted', async () => {
    const { ride, counter } = await bidService.acceptBid({ bidId, clientId: 'cli-1', counterId })
    expect(ride.driverId).toBe('drv-1')
    expect(ride.finalFare).toBe(3.50)
    expect(ride.commissionAmount).toBe(+(3.50 * 0.08).toFixed(2))
    expect(ride.commissionStatus).toBe('none')
    expect(ride.status).toBe('accepted')
    expect(counter.id).toBe(counterId)

    const after = state.bids.get(bidId)
    expect(after.status).toBe('accepted')
    expect(after.acceptedCounterId).toBe(counterId)
    expect(after.rideId).toBe(ride.id)
  })

  test('rejects when a different client tries to accept', async () => {
    await expect(bidService.acceptBid({ bidId, clientId: 'cli-stranger', counterId }))
      .rejects.toMatchObject({ code: 'NOT_YOUR_BID' })
  })

  test('rejects on invalid counterId', async () => {
    await expect(bidService.acceptBid({ bidId, clientId: 'cli-1', counterId: 'ghost' }))
      .rejects.toMatchObject({ code: 'COUNTER_NOT_FOUND' })
  })

  test('rejects on expired bid', async () => {
    const b = state.bids.get(bidId); b.expiresAt = new Date(Date.now() - 1000)
    await expect(bidService.acceptBid({ bidId, clientId: 'cli-1', counterId }))
      .rejects.toMatchObject({ code: 'BID_EXPIRED' })
  })
})

describe('bidService.cancelBid', () => {
  test('cancels an open bid', async () => {
    const { bid } = await bidService.createBid({
      clientId: 'cli-1',
      pickup:  { lat: -17.82, lng: 31.03 },
      dropoff: { lat: -17.85, lng: 31.05 },
      pickupAddress: '', dropoffAddress: '',
      category: 'Economy', offer: 3.00,
    })
    const { bid: cancelled } = await bidService.cancelBid({ bidId: bid.id, clientId: 'cli-1' })
    expect(cancelled.status).toBe('cancelled')
  })

  test('rejects when a different client tries to cancel', async () => {
    const { bid } = await bidService.createBid({
      clientId: 'cli-1',
      pickup:  { lat: -17.82, lng: 31.03 },
      dropoff: { lat: -17.85, lng: 31.05 },
      pickupAddress: '', dropoffAddress: '',
      category: 'Economy', offer: 3.00,
    })
    await expect(bidService.cancelBid({ bidId: bid.id, clientId: 'cli-stranger' }))
      .rejects.toMatchObject({ code: 'NOT_YOUR_BID' })
  })

  test('is a no-op if the bid is already not open', async () => {
    const { bid } = await bidService.createBid({
      clientId: 'cli-1',
      pickup:  { lat: -17.82, lng: 31.03 },
      dropoff: { lat: -17.85, lng: 31.05 },
      pickupAddress: '', dropoffAddress: '',
      category: 'Economy', offer: 3.00,
    })
    // Simulate the bid already being expired
    state.bids.get(bid.id).status = 'expired'
    const { noop } = await bidService.cancelBid({ bidId: bid.id, clientId: 'cli-1' })
    expect(noop).toBe(true)
  })
})

describe('bidService.filterEligibleDrivers (hard-lock)', () => {
  test('splits drivers into eligible vs lockedOut based on wallet balance', async () => {
    DriverWallet.find = jest.fn(() => ({
      lean: async () => [
        { driverId: 'rich',    balance: 10 },
        { driverId: 'barely',  balance: 2 },
        { driverId: 'poor',    balance: 0.10 },
      ],
    }))

    const bid = {
      pickupCoords: { lat: -17.82, lng: 31.03 },
      floor: 10,   // → commission 0.80, required = max(1, 0.80) = 1
    }
    const driverSockets = new Map([
      ['rich',   'sock-rich'],
      ['barely', 'sock-barely'],
      ['poor',   'sock-poor'],
    ])
    const driverCoords = new Map([
      ['rich',   { lat: -17.82, lng: 31.03 }],
      ['barely', { lat: -17.82, lng: 31.03 }],
      ['poor',   { lat: -17.82, lng: 31.03 }],
    ])

    const { eligible, lockedOut, required } = await bidService.filterEligibleDrivers({ bid, driverSockets, driverCoords })
    expect(eligible.sort()).toEqual(['barely', 'rich'])
    expect(lockedOut.map(l => l.driverId)).toEqual(['poor'])
    expect(required).toBeGreaterThanOrEqual(1)
  })

  test('returns empty arrays when no drivers are online', async () => {
    const result = await bidService.filterEligibleDrivers({
      bid: { pickupCoords: { lat: 0, lng: 0 }, floor: 5 },
      driverSockets: new Map(),
      driverCoords:  new Map(),
    })
    expect(result.eligible).toEqual([])
    expect(result.lockedOut).toEqual([])
  })
})
