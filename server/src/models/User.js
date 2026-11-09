const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
  id:            { type: String, required: true, unique: true },
  fullName:      String,
  name:          String,
  email:         { type: String, sparse: true },
  phone:         { type: String, sparse: true },
  passwordHash:  String,
  role:          { type: String, enum: ['admin','driver','rider','corporate'], default: 'rider' },
  accountStatus: { type: String, default: 'active' },
  rating:        Number,
  vehicleReg:    String,
  vehicleModel:  String,
  companyName:   String,
  frozenReason:  String,
  frozenAt:      String,
  lastSeen:      String,
  fcmToken:         String,
  lastSelfieAt:     String,
  lastSelfieBase64: String,
  driverDocuments:  mongoose.Schema.Types.Mixed,
  vehicleDetails:   mongoose.Schema.Types.Mixed,
  corporateProfile: mongoose.Schema.Types.Mixed,
  riderProfile:     mongoose.Schema.Types.Mixed,
  driverAgreements: mongoose.Schema.Types.Mixed,
  verification:     mongoose.Schema.Types.Mixed,
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { versionKey: false })

userSchema.index({ phone: 1 })
userSchema.index({ email: 1 })
userSchema.index({ role: 1 })
userSchema.index({ accountStatus: 1 })

module.exports = mongoose.model('User', userSchema)
