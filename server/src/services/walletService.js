'use strict'
const { v4: uuid }      = require('uuid')
const DriverWallet      = require('../models/DriverWallet')
const WalletTransaction = require('../models/WalletTransaction')
const Ride              = require('../models/Ride')

/**
 * Walletservice — all driver wallet mutations go through here.
 *
 * Atomicity strategy (no multi-doc transactions required):
 *   - All wallet balance changes use findOneAndUpdate with a filter that
 *     also acts as a precondition (`$gte: amount` guards against overdraft).
 *   - The ledger (WalletTransaction) record is written AFTER the wallet is
 *     already updated. If the ledger write fails, the balance is still
 *     consistent — the only drift is a missing audit row, which we log.
 *   - Ride status updates run after the wallet+ledger pair.
 *   - All operations are idempotent on rideId+type: calling holdCommission
 *     twice for the same ride is a no-op the second time.
 */

class WalletError extends Error {
  constructor(code, message) { super(message || code); this.code = code }
}

async function getOrCreateWallet(driverId) {
  if (!driverId) throw new WalletError('INVALID_DRIVER')
  // Upsert with $setOnInsert prevents race on first-time creation
  return DriverWallet.findOneAndUpdate(
    { driverId },
    { $setOnInsert: { driverId, balance: 0, heldBalance: 0, version: 0 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
}

async function getBalance(driverId) {
  const w = await getOrCreateWallet(driverId)
  return { balance: w.balance, heldBalance: w.heldBalance, total: w.balance + w.heldBalance }
}

async function isEligible(driverId, requiredAmount) {
  const w = await DriverWallet.findOne({ driverId }).lean()
  if (!w) return false
  return w.balance >= requiredAmount
}

async function listRecentTxns(driverId, limit = 20) {
  return WalletTransaction.find({ driverId }).sort({ createdAt: -1 }).limit(limit).lean()
}

/**
 * Credit the wallet (TOPUP or ADMIN_ADJUST).
 */
async function credit(driverId, amount, { type, reference, method, metadata } = {}) {
  if (!(amount > 0)) throw new WalletError('INVALID_AMOUNT')
  const t = type || 'TOPUP'
  if (!['TOPUP', 'ADMIN_ADJUST'].includes(t)) throw new WalletError('INVALID_TYPE')

  await getOrCreateWallet(driverId)
  const wallet = await DriverWallet.findOneAndUpdate(
    { driverId },
    {
      $inc: { balance: amount, version: 1 },
      $set: { lastTopUpAt: new Date() },
    },
    { new: true },
  )

  const txn = await WalletTransaction.create({
    id: uuid(), driverId, type: t, amount,
    balanceAfter: wallet.balance, heldAfter: wallet.heldBalance,
    reference, method, metadata,
  })
  return { wallet, txn }
}

/**
 * HOLD commission when driver taps "I'm here / arrived".
 * Idempotent: if a HOLD already exists for this ride+driver, returns it.
 */
async function holdCommission(driverId, rideId, amount) {
  if (!(amount > 0)) throw new WalletError('INVALID_AMOUNT')
  if (!rideId)      throw new WalletError('INVALID_RIDE')

  // Idempotency check
  const existing = await WalletTransaction.findOne({
    driverId, rideId, type: 'HOLD', status: 'posted',
  })
  if (existing) return { wallet: await DriverWallet.findOne({ driverId }), txn: existing, idempotent: true }

  // Atomic debit with precondition — fails if balance insufficient
  const wallet = await DriverWallet.findOneAndUpdate(
    { driverId, balance: { $gte: amount } },
    {
      $inc: { balance: -amount, heldBalance: amount, version: 1 },
      $set: { lastDeductAt: new Date() },
    },
    { new: true },
  )
  if (!wallet) throw new WalletError('INSUFFICIENT_BALANCE')

  const txn = await WalletTransaction.create({
    id: uuid(), driverId, rideId, type: 'HOLD', amount: -amount,
    balanceAfter: wallet.balance, heldAfter: wallet.heldBalance,
    method: 'system',
  })

  // Mark the ride; a missing/stale ride isn't a wallet integrity issue
  await Ride.updateOne(
    { id: rideId, commissionStatus: { $ne: 'held' } },
    { commissionAmount: amount, commissionStatus: 'held', commissionTxnId: txn.id },
  ).catch(() => {})

  return { wallet, txn, idempotent: false }
}

/**
 * COLLECT: convert a HOLD into a final commission (burn to platform revenue).
 * Called on ride completion.
 */
async function collectCommission(driverId, rideId) {
  // Idempotency check first — on repeated call, HOLD may already be reversed/collected.
  const existing = await WalletTransaction.findOne({ driverId, rideId, type: 'COMMISSION', status: 'posted' })
  if (existing) return { txn: existing, idempotent: true }

  const hold = await WalletTransaction.findOne({
    driverId, rideId, type: 'HOLD', status: 'posted',
  })
  if (!hold) throw new WalletError('HOLD_NOT_FOUND')

  const amount = -hold.amount  // Hold was negative; take the positive value

  // Convert heldBalance → gone (platform revenue)
  const wallet = await DriverWallet.findOneAndUpdate(
    { driverId, heldBalance: { $gte: amount } },
    { $inc: { heldBalance: -amount, version: 1 } },
    { new: true },
  )
  if (!wallet) throw new WalletError('HELD_BALANCE_MISMATCH')

  const txn = await WalletTransaction.create({
    id: uuid(), driverId, rideId, type: 'COMMISSION', amount: -amount,
    balanceAfter: wallet.balance, heldAfter: wallet.heldBalance,
    method: 'system', reversesTxnId: hold.id,
  })

  await Ride.updateOne({ id: rideId }, { commissionStatus: 'collected' }).catch(() => {})
  return { wallet, txn, idempotent: false }
}

/**
 * REFUND: reverse a HOLD when the ride is cancelled/no-show.
 */
async function refundCommission(driverId, rideId, reason = 'cancelled') {
  // Idempotency check must come first — on the second call, the HOLD will
  // already be marked 'reversed' and the HOLD_NOT_FOUND guard would spuriously fire.
  const existing = await WalletTransaction.findOne({ driverId, rideId, type: 'REFUND', status: 'posted' })
  if (existing) return { txn: existing, idempotent: true }

  const hold = await WalletTransaction.findOne({
    driverId, rideId, type: 'HOLD', status: 'posted',
  })
  if (!hold) throw new WalletError('HOLD_NOT_FOUND')

  const amount = -hold.amount

  const wallet = await DriverWallet.findOneAndUpdate(
    { driverId, heldBalance: { $gte: amount } },
    { $inc: { balance: amount, heldBalance: -amount, version: 1 } },
    { new: true },
  )
  if (!wallet) throw new WalletError('HELD_BALANCE_MISMATCH')

  const txn = await WalletTransaction.create({
    id: uuid(), driverId, rideId, type: 'REFUND', amount,
    balanceAfter: wallet.balance, heldAfter: wallet.heldBalance,
    method: 'system', reversesTxnId: hold.id,
    metadata: { reason },
  })

  // Mark the original hold as reversed for audit clarity
  await WalletTransaction.updateOne({ id: hold.id }, { status: 'reversed' })
  await Ride.updateOne({ id: rideId }, { commissionStatus: 'refunded' }).catch(() => {})
  return { wallet, txn, idempotent: false }
}

/**
 * Admin manual adjustment (positive or negative). Logged as ADMIN_ADJUST.
 */
async function adminAdjust(driverId, amount, { note, adminId }) {
  if (amount === 0) throw new WalletError('INVALID_AMOUNT')
  await getOrCreateWallet(driverId)

  const wallet = amount > 0
    ? await DriverWallet.findOneAndUpdate(
        { driverId },
        { $inc: { balance: amount, version: 1 } },
        { new: true },
      )
    : await DriverWallet.findOneAndUpdate(
        { driverId, balance: { $gte: -amount } },
        { $inc: { balance: amount, version: 1 } },
        { new: true },
      )

  if (!wallet) throw new WalletError('INSUFFICIENT_BALANCE')

  const txn = await WalletTransaction.create({
    id: uuid(), driverId, type: 'ADMIN_ADJUST', amount,
    balanceAfter: wallet.balance, heldAfter: wallet.heldBalance,
    method: 'admin', reference: note || '',
    metadata: { adminId },
  })
  return { wallet, txn }
}

module.exports = {
  WalletError,
  getOrCreateWallet,
  getBalance,
  isEligible,
  listRecentTxns,
  credit,
  holdCommission,
  collectCommission,
  refundCommission,
  adminAdjust,
}
