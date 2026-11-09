const mongoose = require('mongoose')

const waSessionSchema = new mongoose.Schema({
  phone:     { type: String, required: true, unique: true },
  userId:    String,
  step:      { type: String, default: 'idle' },
  data:      { type: mongoose.Schema.Types.Mixed, default: {} },
  rideId:    String,
  updatedAt: { type: Date, default: Date.now },
}, { versionKey: false })

module.exports = mongoose.model('WaSession', waSessionSchema)
