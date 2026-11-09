const mongoose = require('mongoose')

const schema = new mongoose.Schema({
  // Petrol pricing (used for Economy & Comfort vehicles)
  petrolPrice:     { type: Number, default: 1.65 },  // current USD/litre
  basePetrolPrice: { type: Number, default: 1.65 },  // calibration baseline

  // Diesel pricing (used for SUV / 4x4 vehicles)
  dieselPrice:     { type: Number, default: 1.85 },
  baseDieselPrice: { type: Number, default: 1.85 },

  // Legacy single-fuel fields — kept so pre-migration deploys still read something
  fuelPrice:     { type: Number, default: 1.65 },
  baseFuelPrice: { type: Number, default: 1.65 },

  // ─── Bidding / fare envelope ────────────────────────────────────────────
  // Target per-km base rate (admin can tune within 0.30 – 0.50 USD)
  fareBaseRatePerKm:    { type: Number, default: 0.40 },
  // Per-minute time-buffer rate
  fareTimeBufferPerMin: { type: Number, default: 0.05 },
  // Absolute minimum fare — no bid can go below this
  fareFloorAbsoluteUSD: { type: Number, default: 2.00 },
  // Floor can't go below this fraction of the formula estimate
  fareFloorPctOfEstim:  { type: Number, default: 0.70 },
  // How long drivers have to counter-offer before the bid expires
  bidCounterWindowSec:  { type: Number, default: 90 },

  // ─── Commission (service fee) ───────────────────────────────────────────
  commissionPctDefault: { type: Number, default: 0.08 },  // 8%
  commissionPctMin:     { type: Number, default: 0.06 },
  commissionPctMax:     { type: Number, default: 0.12 },

  // ─── Wallet / hard-lock ─────────────────────────────────────────────────
  walletMinBalanceUsd:  { type: Number, default: 1.00 },

  updatedAt: { type: Date,   default: Date.now },
  updatedBy: { type: String, default: 'system' },
})

module.exports = mongoose.model('AppConfig', schema)
