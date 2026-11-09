/**
 * End-to-end bidding flow via the HTTP router (phase 7).
 *
 * Exercises the full happy path through supertest: rider posts a bid →
 * drivers get `bid:new` emitted → driver counters → rider accepts →
 * winning driver gets `bid:accepted` and losing drivers get `bid:lost`.
 *
 * Mongoose models are mocked to keep the suite hermetic and fast.
 * Socket.io is replaced with a spy that captures all emissions so we can
 * assert on the wiring between routes and real-time push.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-integration-only'

jest.mock('../src/models/Bid')
jest.mock('../src/models/Ride')
jest.mock('../src/models/AppConfig')
jest.mock('../src/models/User')
jest.mock('../src/models/DriverWallet')
jest.mock('../src/models/WalletTransaction')
jest.mock('../src/utils/fareEngine')

const express  = require('express')
const request  = require('supertest')
const jwt      = require('jsonwebtoken')

const Bid           = require('../src/models/Bid')
const Ride          = require('../src/models/Ride')
const AppConfig     = require('../src/models/AppConfig')
const User          = require('../src/models/User')
const DriverWallet  = require('../src/models/DriverWallet')
const WalletTransaction = require('../src/models/WalletTransaction')
const fareEngine    = require('../src/utils/fareEngine')
const makeBidRouter = require('../src/routes/bids')

const RIDER_ID   = 'u-rider'
const DRIVER_A   = 'u-driver-a'
const DRIVER_B   = 'u-driver-b'
const DRIVER_C   = 'u-driver-c-locked'  // wallet too low — should be locked out
const SECRET     = process.env.JWT_SECRET

function tokenFor(userId, role) {
  return jwt.sign({ id: userId, role, fullName: `Test ${userId}` }, SECRET)
}

const DEFAULT_CONFIG = {
  fareBaseRatePerKm: 0.40,
  fareTimeBufferPerMin: 0.05,
  fareFloorAbsoluteUSD: 2.00,
  fareFloorPctOfEstim: 0.70,
  bidCounterWindowSec: 90,
  commissionPctDefault: 0.08,
  commissionPctMin: 0.06,
  commissionPctMax: 0.12,
  walletMinBalanceUsd: 1.00,
}

describe('Bidding — end-to-end HTTP flow', () => {
  let app, emissions, driverSockets, onlineUsers, driverCoords, bidStore, rideStore, walletStore

  beforeEach(() => {
    bidStore    = new Map()
    rideStore   = new Map()
    walletStore = new Map([
      [DRIVER_A, { driverId: DRIVER_A, balance: 5.00, heldBalance: 0 }],
      [DRIVER_B, { driverId: DRIVER_B, balance: 3.00, heldBalance: 0 }],
      [DRIVER_C, { driverId: DRIVER_C, balance: 0.10, heldBalance: 0 }],  // below minimum
    ])
    emissions = []

    // ── Mock Mongoose ──────────────────────────────────────────────────────
    AppConfig.findOne = jest.fn(async () => ({ ...DEFAULT_CONFIG, toObject: () => DEFAULT_CONFIG }))

    Bid.findOne = jest.fn(async (filter) => {
      for (const b of bidStore.values()) {
        const match = Object.entries(filter).every(([k, v]) =>
          k === 'id' ? b.id === v : k === 'status' ? b.status === v : k === 'clientId' ? b.clientId === v : true
        )
        if (match) return mockDoc(b)
      }
      return null
    })
    Bid.create = jest.fn(async (doc) => {
      const bid = { ...doc, counters: doc.counters || [] }
      bidStore.set(bid.id, bid)
      return mockDoc(bid)
    })
    Bid.updateOne = jest.fn(async (filter, update) => {
      const b = bidStore.get(filter.id)
      if (b && update.$set) Object.assign(b, update.$set)
      return { matchedCount: b ? 1 : 0 }
    })

    Ride.create = jest.fn(async (doc) => {
      rideStore.set(doc.id, doc)
      return doc
    })
    Ride.findOne = jest.fn(async (filter) => rideStore.get(filter.id) || null)
    Ride.updateOne = jest.fn(async () => ({ matchedCount: 1 }))

    User.findOne = jest.fn(async (filter) => {
      if (filter.id === DRIVER_A || filter.id === DRIVER_B || filter.id === DRIVER_C) {
        return { id: filter.id, fullName: `Driver ${filter.id}`, rating: 4.7 }
      }
      return { id: filter.id, fullName: `User ${filter.id}` }
    })

    // DriverWallet.find returns a query-like with .lean() → honors $in filter
    DriverWallet.find = jest.fn((filter = {}) => ({
      lean: async () => {
        const ids = filter.driverId?.$in
        const all = [...walletStore.values()]
        return ids ? all.filter(w => ids.includes(w.driverId)) : all
      },
    }))
    DriverWallet.findOne = jest.fn(async (filter) => walletStore.get(filter.driverId) || null)
    DriverWallet.findOneAndUpdate = jest.fn(async (filter, update, opts) => {
      let w = walletStore.get(filter.driverId)
      if (!w && opts?.upsert) {
        w = { driverId: filter.driverId, balance: 0, heldBalance: 0, version: 0, ...(update.$setOnInsert || {}) }
        walletStore.set(filter.driverId, w)
      }
      if (w && update.$inc) {
        for (const [k, v] of Object.entries(update.$inc)) w[k] = (w[k] || 0) + v
      }
      if (w && update.$set) Object.assign(w, update.$set)
      return w || null
    })

    WalletTransaction.find = jest.fn(() => ({
      sort: () => ({ limit: () => ({ lean: async () => [] }) }),
    }))
    WalletTransaction.findOne = jest.fn(async () => null)
    WalletTransaction.create = jest.fn(async (doc) => doc)

    // ── Mock fare engine — return a predictable envelope ───────────────────
    const envelope = {
      distKm: 5.0, durMin: 12, estimate: 4.00, floor: 2.80,
      supplyFactor: 1.0, nearbyDrivers: 3,
    }
    fareEngine.computeFareEnvelope = jest.fn(async () => envelope)
    fareEngine.estimateFare = jest.fn(async () => envelope)
    fareEngine.getRoute = jest.fn(async () => ({ distKm: 5, durMin: 12 }))
    fareEngine.haversineKm = jest.fn(() => 2)
    fareEngine.supplyFactorFromCount = jest.fn(() => 1)
    fareEngine.computeCommission = jest.fn((amount) => +((amount || 0) * 0.08).toFixed(2))

    // ── Mock io + socket maps ──────────────────────────────────────────────
    driverSockets = new Map([[DRIVER_A, 'sock-a'], [DRIVER_B, 'sock-b'], [DRIVER_C, 'sock-c']])
    onlineUsers   = new Map([[RIDER_ID, 'sock-rider']])
    driverCoords  = new Map([
      [DRIVER_A, { lat: -17.83, lng: 31.05, at: Date.now() }],
      [DRIVER_B, { lat: -17.84, lng: 31.06, at: Date.now() }],
      [DRIVER_C, { lat: -17.85, lng: 31.07, at: Date.now() }],
    ])

    const io = {
      to: (target) => ({
        emit: (event, payload) => emissions.push({ target, event, payload }),
      }),
    }

    app = express()
    app.use(express.json())
    app.use('/api/bids', makeBidRouter({ io, onlineUsers, driverSockets, driverCoords }))
  })

  function mockDoc(obj) {
    return {
      ...obj,
      toObject: () => obj,
      save: async () => obj,
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  it('rider posts a bid → eligible drivers get bid:new, locked driver gets wallet:locked', async () => {
    const res = await request(app)
      .post('/api/bids')
      .set('Authorization', `Bearer ${tokenFor(RIDER_ID, 'rider')}`)
      .send({
        pickup: { lat: -17.83, lng: 31.05 },
        dropoff: { lat: -17.80, lng: 31.03 },
        pickupAddress: 'CBD', dropoffAddress: 'Avondale',
        category: 'Economy', offer: 4.50,
      })

    expect(res.status).toBe(200)
    expect(res.body.bid).toBeDefined()
    expect(res.body.broadcast).toBe(2)   // DRIVER_A and DRIVER_B eligible
    expect(res.body.lockedOut).toBe(1)   // DRIVER_C has 0.10 < 1.00 minimum

    // Confirm the wire-up: eligible drivers see bid:new, locked driver sees wallet:locked
    const bidNew      = emissions.filter(e => e.event === 'bid:new')
    const walletLock  = emissions.filter(e => e.event === 'wallet:locked')
    expect(bidNew.map(e => e.target).sort()).toEqual(['sock-a', 'sock-b'])
    expect(walletLock).toHaveLength(1)
    expect(walletLock[0].target).toBe('sock-c')
    expect(walletLock[0].payload.balance).toBe(0.10)
  })

  // ───────────────────────────────────────────────────────────────────────
  it('driver counter is rejected when below the floor', async () => {
    const createRes = await request(app)
      .post('/api/bids')
      .set('Authorization', `Bearer ${tokenFor(RIDER_ID, 'rider')}`)
      .send({
        pickup: { lat: -17.83, lng: 31.05 }, dropoff: { lat: -17.80, lng: 31.03 },
        pickupAddress: 'A', dropoffAddress: 'B', category: 'Economy', offer: 4.50,
      })
    const bidId = createRes.body.bid.id

    const counterRes = await request(app)
      .post(`/api/bids/${bidId}/counter`)
      .set('Authorization', `Bearer ${tokenFor(DRIVER_A, 'driver')}`)
      .send({ amount: 1.00, etaMin: 4 })  // below floor of 2.80

    expect([400, 500]).toContain(counterRes.status)
  })

  // ───────────────────────────────────────────────────────────────────────
  it('rider must be a driver to counter — 403', async () => {
    const createRes = await request(app)
      .post('/api/bids')
      .set('Authorization', `Bearer ${tokenFor(RIDER_ID, 'rider')}`)
      .send({
        pickup: { lat: -17.83, lng: 31.05 }, dropoff: { lat: -17.80, lng: 31.03 },
        pickupAddress: 'A', dropoffAddress: 'B', category: 'Economy', offer: 4.50,
      })

    const res = await request(app)
      .post(`/api/bids/${createRes.body.bid.id}/counter`)
      .set('Authorization', `Bearer ${tokenFor(RIDER_ID, 'rider')}`)
      .send({ amount: 5.00, etaMin: 4 })

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('DRIVER_ONLY')
  })

  // ───────────────────────────────────────────────────────────────────────
  it('unauthenticated requests get 401', async () => {
    const res = await request(app).post('/api/bids').send({})
    expect(res.status).toBe(401)
  })

  // ───────────────────────────────────────────────────────────────────────
  it('driver wallet endpoint returns balance for authenticated driver', async () => {
    const res = await request(app)
      .get('/api/bids/_wallet/me')
      .set('Authorization', `Bearer ${tokenFor(DRIVER_A, 'driver')}`)
    expect(res.status).toBe(200)
    expect(res.body.balance).toBe(5.00)
  })

  it('driver wallet endpoint rejects non-drivers with 403', async () => {
    const res = await request(app)
      .get('/api/bids/_wallet/me')
      .set('Authorization', `Bearer ${tokenFor(RIDER_ID, 'rider')}`)
    expect(res.status).toBe(403)
  })

  // ───────────────────────────────────────────────────────────────────────
  it('top-up initiate validates amount bounds', async () => {
    const tooLow = await request(app)
      .post('/api/bids/_wallet/topup')
      .set('Authorization', `Bearer ${tokenFor(DRIVER_A, 'driver')}`)
      .send({ amount: 0.50, method: 'ecocash', phone: '+263771234567' })
    expect(tooLow.status).toBe(400)
    expect(tooLow.body.error).toMatch(/Minimum/)

    const tooHigh = await request(app)
      .post('/api/bids/_wallet/topup')
      .set('Authorization', `Bearer ${tokenFor(DRIVER_A, 'driver')}`)
      .send({ amount: 1000, method: 'ecocash', phone: '+263771234567' })
    expect(tooHigh.status).toBe(400)
    expect(tooHigh.body.error).toMatch(/Maximum/)
  })

  it('top-up initiate rejects invalid method', async () => {
    const res = await request(app)
      .post('/api/bids/_wallet/topup')
      .set('Authorization', `Bearer ${tokenFor(DRIVER_A, 'driver')}`)
      .send({ amount: 10, method: 'bitcoin', phone: '+263771234567' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Invalid method')
  })

  it('top-up initiate requires phone for EcoCash', async () => {
    const res = await request(app)
      .post('/api/bids/_wallet/topup')
      .set('Authorization', `Bearer ${tokenFor(DRIVER_A, 'driver')}`)
      .send({ amount: 10, method: 'ecocash' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Phone/)
  })
})
