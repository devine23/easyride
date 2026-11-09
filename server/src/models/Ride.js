const mongoose = require('mongoose')

const coordSchema = { lat: Number, lng: Number }

const rideSchema = new mongoose.Schema({
  id:             { type: String, required: true, unique: true },
  clientId:       String,
  driverId:       String,
  pickupAddress:  String,
  dropoffAddress: String,
  pickupCoords:   coordSchema,
  dropoffCoords:  coordSchema,
  status:         { type: String, default: 'searching' },
  paymentMethod:  String,
  vehicleCategory:String,
  fare:           Number,
  distance:       Number,
  duration:       Number,
  waitingCharge:  Number,
  cancelReason:   String,
  clientRating:   Number,
  clientComment:  String,
  employeeName:   String,
  departmentCode: String,
  costCenter:     String,
  voucherId:      String,
  completedAt:    String,
  paymentStatus:  { type: String, default: 'pending' },
  paynowRef:      String,
  scheduledFor:   String,
  promoCode:          String,
  discountAmount:     Number,
  counterFare:        Number,
  counterByDriverId:  String,
  acceptedAt:         String,
  openingMileage:     Number,
  closingMileage:     Number,
  isShared:           { type: Boolean, default: false },
  fareShare:          Number,
  maxPassengers:      { type: Number, default: 2 },
  coRiders:           [{ userId: String, pickupAddress: String, pickupCoords: coordSchema, fareShare: Number }],

  // ─── Bidding + commission ──────────────────────────────────────────────
  bidId:             String,                      // Links back to the Bid document
  passengerOffer:    Number,                      // The passenger's original bid
  finalFare:         Number,                      // Winning counter (overrides `fare` semantically)
  commissionPct:     Number,                      // % used for this ride (snapshot of config at accept time)
  commissionAmount:  Number,                      // USD computed at accept
  commissionTxnId:   String,                      // WalletTransaction.id for the HOLD
  commissionStatus:  { type: String, default: 'none', enum: ['none', 'held', 'collected', 'refunded'] },

  createdAt:          { type: String, default: () => new Date().toISOString() },
}, { versionKey: false })

rideSchema.index({ clientId: 1 })
rideSchema.index({ driverId: 1 })
rideSchema.index({ status: 1 })
rideSchema.index({ createdAt: -1 })

module.exports = mongoose.model('Ride', rideSchema)
