const mongoose = require('mongoose')

/**
 * One wallet per driver. Balance is authoritative; WalletTransaction is the
 * audit trail. `balance` is spendable (available for new HOLDs); `heldBalance`
 * is reserved for in-progress rides. The sum is the driver's total credit.
 *
 * All mutations go through walletService — never update this doc directly.
 */
const walletSchema = new mongoose.Schema({
  driverId:    { type: String, required: true, unique: true },
  balance:     { type: Number, default: 0, min: 0 },
  heldBalance: { type: Number, default: 0, min: 0 },
  currency:    { type: String, default: 'USD' },
  lastTopUpAt: Date,
  lastDeductAt:Date,
  // Optimistic concurrency token — bumped on every write
  version:     { type: Number, default: 0 },
  createdAt:   { type: String, default: () => new Date().toISOString() },
}, { versionKey: false })

walletSchema.index({ driverId: 1 }, { unique: true })

module.exports = mongoose.model('DriverWallet', walletSchema)
