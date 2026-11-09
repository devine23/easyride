const router = require('express').Router()
const { v4: uuid } = require('uuid')
const bidService    = require('../services/bidService')
const walletService = require('../services/walletService')
const Bid           = require('../models/Bid')
const User          = require('../models/User')
const { auth }      = require('../middleware/auth')
const { initiateWalletTopUp, pollStatus } = require('../utils/payment')

// In-memory map of topUpId → { driverId, amount, pollUrl, method, status }
// Small, short-lived state. On process restart, in-flight top-ups fall back to
// poll endpoint using the pollUrl the client already has.
const pendingTopUps = new Map()

/**
 * Bidding REST surface — the server also emits/receives Socket.io events for
 * real-time push (see index.js wiring). REST exists for lifecycle/CRUD; sockets
 * exist for notification. Clients can use either.
 *
 * Live state (io, driverSockets, driverCoords) is injected via router.locals
 * from index.js so the service stays testable without a live server.
 */
function makeRouter({ io, onlineUsers, driverSockets, driverCoords }) {
  // ─── POST /api/bids ────────────────────────────────────────────────────
  router.post('/', auth, async (req, res) => {
    try {
      const { pickup, dropoff, pickupAddress, dropoffAddress, category, offer } = req.body
      const { bid, envelope } = await bidService.createBid({
        clientId: req.user.id, pickup, dropoff, pickupAddress, dropoffAddress,
        category, offer, driverCoords,
      })

      // Hard-lock-filtered broadcast
      const { eligible, lockedOut, required } = await bidService.filterEligibleDrivers({
        bid, driverSockets, driverCoords,
      })
      for (const driverId of eligible) {
        const sid = driverSockets.get(driverId)
        if (sid) io.to(sid).emit('bid:new', bid)
      }
      for (const { driverId, balance } of lockedOut) {
        const sid = driverSockets.get(driverId)
        if (sid) io.to(sid).emit('wallet:locked', { required, balance, bidId: bid.id })
      }

      res.json({ bid, envelope, broadcast: eligible.length, lockedOut: lockedOut.length })
    } catch (err) {
      if (err.code) return res.status(err.code === 'BID_ALREADY_OPEN' ? 409 : 400).json(err)
      res.status(500).json({ error: err.message })
    }
  })

  // ─── GET /api/bids/:id ─────────────────────────────────────────────────
  router.get('/:id', auth, async (req, res) => {
    const bid = await Bid.findOne({ id: req.params.id })
    if (!bid) return res.status(404).json({ error: 'NOT_FOUND' })
    // Only the owning rider or any driver (who may see the broadcast) can read
    const isOwner = bid.clientId === req.user.id
    const isDriver = req.user.role === 'driver'
    if (!isOwner && !isDriver && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'FORBIDDEN' })
    }
    res.json(bid.toObject())
  })

  // ─── POST /api/bids/:id/counter (driver) ───────────────────────────────
  router.post('/:id/counter', auth, async (req, res) => {
    if (req.user.role !== 'driver') return res.status(403).json({ error: 'DRIVER_ONLY' })
    try {
      const { amount, etaMin } = req.body
      const { counter, bid } = await bidService.addCounter({
        bidId: req.params.id, driverId: req.user.id, amount, etaMin,
      })

      // Notify the passenger
      const passengerSocket = onlineUsers.get(bid.clientId)
      if (passengerSocket) io.to(passengerSocket).emit('bid:counter', { bidId: bid.id, counter })

      res.json({ counter })
    } catch (err) {
      if (err.code) return res.status(400).json(err)
      res.status(500).json({ error: err.message })
    }
  })

  // ─── POST /api/bids/:id/accept (rider) ─────────────────────────────────
  router.post('/:id/accept', auth, async (req, res) => {
    try {
      const { counterId } = req.body
      const { ride, counter } = await bidService.acceptBid({
        bidId: req.params.id, clientId: req.user.id, counterId,
      })

      // Notify the winning driver
      const driverSocket = driverSockets.get(counter.driverId)
      if (driverSocket) io.to(driverSocket).emit('bid:accepted', { bidId: req.params.id, ride })

      // Notify the passenger's own tabs (if multiple)
      io.to(`user:${req.user.id}`).emit('ride:accepted', ride)

      // Notify other drivers whose counters lost
      const bid = await Bid.findOne({ id: req.params.id })
      if (bid) {
        for (const c of bid.counters) {
          if (c.driverId === counter.driverId) continue
          const sid = driverSockets.get(c.driverId)
          if (sid) io.to(sid).emit('bid:lost', { bidId: bid.id })
        }
      }

      res.json({ ride })
    } catch (err) {
      if (err.code) return res.status(400).json(err)
      res.status(500).json({ error: err.message })
    }
  })

  // ─── DELETE /api/bids/:id (rider) ──────────────────────────────────────
  router.delete('/:id', auth, async (req, res) => {
    try {
      const { bid } = await bidService.cancelBid({ bidId: req.params.id, clientId: req.user.id })
      // Tell any drivers who had the card open
      io.to('drivers').emit('bid:cancelled', { bidId: bid.id })
      res.sendStatus(204)
    } catch (err) {
      if (err.code) return res.status(400).json(err)
      res.status(500).json({ error: err.message })
    }
  })

  // ─── Driver wallet summary — needed by Bid UI ──────────────────────────
  router.get('/_wallet/me', auth, async (req, res) => {
    if (req.user.role !== 'driver') return res.status(403).json({ error: 'DRIVER_ONLY' })
    try {
      const [balance, recent] = await Promise.all([
        walletService.getBalance(req.user.id),
        walletService.listRecentTxns(req.user.id, 10),
      ])
      res.json({ ...balance, recent })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  // ─── Driver wallet top-up initiate ─────────────────────────────────────
  // Body: { amount, method: 'ecocash' | 'paynow_web', phone? }
  router.post('/_wallet/topup', auth, async (req, res) => {
    if (req.user.role !== 'driver') return res.status(403).json({ error: 'DRIVER_ONLY' })
    try {
      const amount = parseFloat(req.body.amount)
      const method = req.body.method || 'ecocash'
      const phone  = (req.body.phone || '').trim()

      if (!Number.isFinite(amount) || amount < 1)
        return res.status(400).json({ error: 'Minimum top-up is $1.00' })
      if (amount > 500)
        return res.status(400).json({ error: 'Maximum top-up is $500' })
      if (!['ecocash', 'paynow_web'].includes(method))
        return res.status(400).json({ error: 'Invalid method' })
      if (method === 'ecocash' && !phone)
        return res.status(400).json({ error: 'Phone number required for EcoCash' })

      const topUpId = uuid()
      const user = await User.findOne({ id: req.user.id })

      const result = await initiateWalletTopUp({
        topUpId, amount, method,
        phone: phone || user?.phone,
        email: user?.email,
      })

      pendingTopUps.set(topUpId, {
        driverId: req.user.id, amount, method,
        pollUrl: result.pollUrl, status: 'pending',
        createdAt: Date.now(),
      })

      res.json({ topUpId, ...result })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // ─── Poll top-up status — credit wallet on first 'paid' response ───────
  router.post('/_wallet/topup/:topUpId/poll', auth, async (req, res) => {
    if (req.user.role !== 'driver') return res.status(403).json({ error: 'DRIVER_ONLY' })
    try {
      const entry = pendingTopUps.get(req.params.topUpId)
      if (!entry || entry.driverId !== req.user.id)
        return res.status(404).json({ error: 'TOPUP_NOT_FOUND' })

      if (entry.status === 'credited') {
        const bal = await walletService.getBalance(req.user.id)
        return res.json({ paid: true, status: 'Paid', wallet: bal })
      }

      const { paid, status } = await pollStatus(entry.pollUrl)
      if (paid && entry.status !== 'credited') {
        entry.status = 'credited'
        await walletService.credit(req.user.id, entry.amount, {
          type: 'TOPUP',
          reference: `TopUp-${req.params.topUpId}`,
          method: entry.method,
        })
        const bal = await walletService.getBalance(req.user.id)
        return res.json({ paid: true, status, wallet: bal })
      }
      res.json({ paid: false, status })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  return router
}

module.exports = makeRouter
// Exported for payments callback to credit wallet when Paynow server-to-server
// calls /paynow/result for a Wallet-<topUpId> reference.
module.exports.pendingTopUps = pendingTopUps
module.exports.walletService = walletService
