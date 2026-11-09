const mongoose = require('mongoose')

const coordSchema = { lat: Number, lng: Number }

/**
 * A bidding session. One per passenger ride request.
 * Short-lived: MongoDB TTL index on `expiresAt` auto-deletes expired bids.
 * Lives separately from Ride — a Bid becomes a Ride only when accepted.
 */
const bidSchema = new mongoose.Schema({
  id:            { type: String, required: true, unique: true },
  rideId:        String,                     // Set once a counter is accepted
  clientId:      { type: String, required: true },
  pickupAddress: String,
  dropoffAddress:String,
  pickupCoords:  coordSchema,
  dropoffCoords: coordSchema,
  category:      String,                     // Economy | Comfort | SUV | Tow Truck
  distKm:        Number,
  durMin:        Number,

  // Server-computed envelope
  estimate:      Number,                     // Formula fare
  floor:         Number,                     // Hard minimum passenger can offer

  // Passenger's opening bid
  passengerOffer: { type: Number, required: true },

  // Driver counter-offers (array; latest wins)
  counters: [{
    id:         String,
    driverId:   String,
    driverName: String,
    amount:     Number,
    etaMin:     Number,
    rating:     Number,
    at:         String,
  }],

  acceptedCounterId: String,
  status: {
    type: String,
    default: 'open',
    enum: ['open', 'accepted', 'expired', 'cancelled'],
  },

  createdAt:  { type: String, default: () => new Date().toISOString() },
  expiresAt:  { type: Date, required: true },     // TTL
}, { versionKey: false })

bidSchema.index({ clientId: 1, status: 1 })
bidSchema.index({ rideId: 1 })
// TTL — Mongo deletes documents whose expiresAt has passed
bidSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

module.exports = mongoose.model('Bid', bidSchema)
