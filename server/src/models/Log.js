const mongoose = require('mongoose')

const logSchema = new mongoose.Schema({
  id:          { type: String, required: true, unique: true },
  type:        String,
  severity:    { type: String, enum: ['info','warning','critical'], default: 'info' },
  description: String,
  userId:      String,
  userName:    String,
  timestamp:   { type: String, default: () => new Date().toISOString() },
}, { versionKey: false })

module.exports = mongoose.model('Log', logSchema)
