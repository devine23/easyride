const mongoose = require('mongoose')

const promoSchema = new mongoose.Schema({
  id:          { type: String, required: true, unique: true },
  code:        { type: String, required: true, unique: true },
  type:        { type: String, enum: ['percent', 'fixed'], default: 'percent' },
  value:       { type: Number, required: true },
  maxUses:     { type: Number, default: null },
  usesCount:   { type: Number, default: 0 },
  minFare:     { type: Number, default: 0 },
  expiresAt:   { type: String, default: null },
  active:      { type: Boolean, default: true },
  description: { type: String, default: '' },
  createdAt:   { type: String, default: () => new Date().toISOString() },
}, { versionKey: false })

module.exports = mongoose.model('PromoCode', promoSchema)
