const mongoose = require('mongoose')

const payoutSchema = new mongoose.Schema({
  id:              { type: String, required: true, unique: true },
  driverId:        String,
  driverName:      String,
  driverPhone:     String,
  amount:          Number,
  method:          { type: String, enum: ['ecocash', 'bank'] },
  phone:           String,
  status:          { type: String, enum: ['pending', 'approved', 'rejected', 'paid'], default: 'pending' },
  requestedAt:     { type: String, default: () => new Date().toISOString() },
  processedAt:     String,
  processedBy:     String,
  rejectionReason: String,
  notes:           String,
}, { versionKey: false })

module.exports = mongoose.model('Payout', payoutSchema)
