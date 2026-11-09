const mongoose = require('mongoose')

const voucherSchema = new mongoose.Schema({
  id:            { type: String, required: true, unique: true },
  corporateId:   String,
  voucherNo:     String,
  date:          String,
  pickUpPoint:   String,
  dropOffPoint:  String,
  department:    String,
  costCenter:    String,
  authorisedBy:  String,
  employeeNames: String,
  cabNo:         String,
  driverName:    String,
  pickUpTime:    String,
  dropOffTime:   String,
  openingMileage:Number,
  closingMileage:Number,
  totalMileage:  Number,
  waitingCharge: Number,
  totalValue:    Number,
  status:        { type: String, default: 'pending' },
  createdAt:     { type: String, default: () => new Date().toISOString() },
}, { versionKey: false })

module.exports = mongoose.model('Voucher', voucherSchema)
