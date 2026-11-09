const mongoose = require('mongoose')

const msgSchema = new mongoose.Schema({
  id:        String,
  senderId:  String,
  text:      String,
  timestamp: String,
}, { _id: false })

const lostItemSchema = new mongoose.Schema({
  id:          { type: String, required: true, unique: true },
  rideId:      String,
  clientId:    String,
  driverId:    String,
  description: String,
  status:      { type: String, enum: ['open', 'resolved', 'closed'], default: 'open' },
  createdAt:   { type: String, default: () => new Date().toISOString() },
  expiresAt:   String,
  messages:    [msgSchema],
}, { versionKey: false })

module.exports = mongoose.model('LostItem', lostItemSchema)
