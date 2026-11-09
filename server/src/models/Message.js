const mongoose = require('mongoose')

const messageSchema = new mongoose.Schema({
  id:         { type: String, required: true, unique: true },
  senderId:   String,
  receiverId: String,
  rideId:     String,
  text:       String,
  type:       { type: String, default: 'text' },
  timestamp:  { type: String, default: () => new Date().toISOString() },
}, { versionKey: false })

module.exports = mongoose.model('Message', messageSchema)
