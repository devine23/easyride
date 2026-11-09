const mongoose = require('mongoose')

/**
 * Append-only ledger. Every balance change writes a transaction.
 * To audit a wallet's integrity: sum all txn amounts for a driverId; it must
 * equal (balance - heldBalance_adjustments). Each txn also carries
 * `balanceAfter` / `heldAfter` snapshots so you can detect drift without
 * replaying history.
 */
const TXN_TYPES = ['TOPUP', 'HOLD', 'COMMISSION', 'REFUND', 'ADMIN_ADJUST', 'CASHOUT']

const txnSchema = new mongoose.Schema({
  id:         { type: String, required: true, unique: true },
  driverId:   { type: String, required: true },
  rideId:     String,                        // null for TOPUP / ADMIN_ADJUST / CASHOUT
  type:       { type: String, required: true, enum: TXN_TYPES },
  amount:     { type: Number, required: true }, // Positive = credit, negative = debit
  balanceAfter: Number,                      // Snapshot of wallet.balance after this txn
  heldAfter:    Number,                      // Snapshot of wallet.heldBalance after
  reference:  String,                        // Paynow pollUrl, bank ref, admin note
  method:     String,                        // 'ecocash' | 'bank' | 'system' | 'admin'
  status:     { type: String, default: 'posted', enum: ['posted', 'reversed'] },
  reversesTxnId: String,                     // Links REFUND → the HOLD it undoes
  metadata:   mongoose.Schema.Types.Mixed,
  createdAt:  { type: String, default: () => new Date().toISOString() },
}, { versionKey: false })

txnSchema.index({ driverId: 1, createdAt: -1 })
txnSchema.index({ rideId: 1, type: 1 })
txnSchema.index({ type: 1, status: 1 })

module.exports = mongoose.model('WalletTransaction', txnSchema)
module.exports.TXN_TYPES = TXN_TYPES
