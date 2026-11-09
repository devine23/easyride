const router  = require('express').Router()
const Ride    = require('../models/Ride')
const User    = require('../models/User')
const { auth } = require('../middleware/auth')
const { initiateMobilePayment, pollStatus } = require('../utils/payment')
const { sendPush } = require('../utils/push')
const { verifyPaynowHash } = require('../utils/paynowHash')

// Paynow sends callbacks as application/x-www-form-urlencoded POST
router.use(require('express').urlencoded({ extended: true }))

// POST /api/payments/initiate  { rideId, phone }
router.post('/initiate', auth, async (req, res) => {
  try {
    const { rideId, phone } = req.body
    const ride = await Ride.findOne({ id: rideId })
    if (!ride) return res.status(404).json({ error: 'Ride not found' })
    if (!ride.fare)  return res.status(400).json({ error: 'Fare not set' })

    const user = await User.findOne({ id: req.user.id })
    const result = await initiateMobilePayment({
      rideId, amount: ride.fare, phone: phone || user.phone, email: user.email,
    })

    await Ride.findOneAndUpdate({ id: rideId }, { paymentStatus: 'pending', paynowRef: result.pollUrl })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/payments/poll  { rideId }
router.post('/poll', auth, async (req, res) => {
  try {
    const ride = await Ride.findOne({ id: req.body.rideId })
    if (!ride?.paynowRef) return res.status(400).json({ error: 'No pending payment' })

    const { paid, status } = await pollStatus(ride.paynowRef)
    if (paid) {
      await Ride.findOneAndUpdate(
        { id: ride.id, paymentStatus: { $ne: 'paid' } },
        { paymentStatus: 'paid' }
      )
      const driver = await User.findOne({ id: ride.driverId })
      if (driver?.fcmToken) sendPush(driver.fcmToken, 'Payment received', `Ride #${ride.id.slice(-6)} paid`)
    }
    res.json({ paid, status })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/payments/paynow/result  (Paynow server-to-server callback)
// Must ACK quickly and verify hash before trusting the payload.
async function handlePaynowCallback(req, res) {
  res.sendStatus(200)  // ACK immediately — Paynow retries on timeout
  try {
    const fields = { ...req.query, ...req.body }
    if (!verifyPaynowHash(fields, process.env.PAYNOW_INTEGRATION_KEY)) {
      console.warn('[Paynow] Rejected callback — hash verification failed', { reference: fields.reference })
      return
    }
    const { reference, paynowreference, status } = fields
    const paidStatuses = new Set(['Paid', 'Awaiting Delivery', 'Delivered'])
    if (!paidStatuses.has(status)) return

    const rideId = String(reference || '').replace(/^Ride-/, '')
    if (!rideId) return

    // Idempotency: only transition from a non-paid state
    const updated = await Ride.findOneAndUpdate(
      { id: rideId, paymentStatus: { $ne: 'paid' } },
      { paymentStatus: 'paid', paynowRef: paynowreference },
      { new: true }
    )
    if (!updated) {
      console.log('[Paynow] Duplicate or unknown ride ignored:', rideId)
      return
    }

    const driver = updated.driverId ? await User.findOne({ id: updated.driverId }) : null
    if (driver?.fcmToken) sendPush(driver.fcmToken, 'Payment received', `Ride #${rideId.slice(-6)} paid`)
  } catch (err) {
    console.error('[Paynow callback]', err.message)
  }
}

// Accept both GET and POST — different Paynow integrations use different methods
router.post('/paynow/result', handlePaynowCallback)
router.get('/paynow/result',  handlePaynowCallback)

module.exports = router
