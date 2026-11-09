require('dotenv').config()
const express      = require('express')
const http         = require('http')
const { Server }   = require('socket.io')
const cors         = require('cors')
const helmet       = require('helmet')
const bcrypt       = require('bcryptjs')
const jwt          = require('jsonwebtoken')
const { v4: uuid } = require('uuid')
const mongoose     = require('mongoose')
const rateLimit    = require('express-rate-limit')

const User      = require('./models/User')
const Ride      = require('./models/Ride')
const Voucher   = require('./models/Voucher')
const Message   = require('./models/Message')
const Log       = require('./models/Log')
const PromoCode = require('./models/PromoCode')
const OTP       = require('./models/OTP')
const AppConfig = require('./models/AppConfig')
const Payout    = require('./models/Payout')
const LostItem  = require('./models/LostItem')
const DriverWallet      = require('./models/DriverWallet')
const WalletTransaction = require('./models/WalletTransaction')

const { sendPush }        = require('./utils/push')
const { sendOtp, sendSms } = require('./utils/sms')
const { logger, captureException } = require('./utils/logger')
const { handleIncoming, notifyDriverAccepted, notifyRideCompleted } = require('./waBot')
const bidService    = require('./services/bidService')
const walletService = require('./services/walletService')
const paymentRouter = require('./routes/payments')
const makeBidRouter = require('./routes/bids')

const PORT        = process.env.PORT        || 5000
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/easyride'
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET env var is not set. Set it in your .env file.')
  process.exit(1)
}
const JWT_SECRET = process.env.JWT_SECRET

const app    = express()
const server = http.createServer(app)
const io     = new Server(server, {
  cors: { origin: ALLOWED_ORIGIN, methods: ['GET', 'POST', 'PATCH', 'DELETE'] }
})

// ─── MongoDB ───────────────────────────────────────────────────────────────
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected:', MONGODB_URI)
    const isProd = process.env.NODE_ENV === 'production'
    const seedDisabled = process.env.NO_SEED === '1'
    if (isProd || seedDisabled) {
      console.log('[boot] Demo seeding disabled (NODE_ENV=' + (process.env.NODE_ENV || 'unset') + ')')
      return Promise.resolve()
    }
    return ensureSeeded()
  })
  .catch(err => { console.error('FATAL: MongoDB connection failed:', err); process.exit(1) })

mongoose.connection.on('disconnected', () => logger.warn('[MongoDB] disconnected — waiting for reconnect...'))
mongoose.connection.on('reconnected',  () => logger.info('[MongoDB] reconnected'))
mongoose.connection.on('error',        err => logger.error({ err }, '[MongoDB] error'))

// ─── In-memory socket state ────────────────────────────────────────────────
const onlineUsers   = new Map() // userId  -> socketId
const driverSockets = new Map() // driverId -> socketId (drivers only)
const driverCoords  = new Map() // driverId -> { lat, lng }

// ─── Rate limiters ─────────────────────────────────────────────────────────
const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false })
const authLimiter    = rateLimit({ windowMs: 15 * 60 * 1000, max: 30,  standardHeaders: true, legacyHeaders: false, message: { message: 'Too many attempts. Try again in 15 minutes.' } })
const otpLimiter     = rateLimit({ windowMs: 60 * 60 * 1000, max: 5,   standardHeaders: true, legacyHeaders: false, message: { message: 'Too many OTP requests. Try again in 1 hour.' } })
const webhookLimiter = rateLimit({ windowMs: 60 * 1000,      max: 60,  standardHeaders: true, legacyHeaders: false })

// ─── Middleware ────────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false, // managed by client build
}))
app.use(cors({ origin: ALLOWED_ORIGIN }))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))  // Paynow callbacks
app.use('/api', generalLimiter)
app.use('/api/payments', paymentRouter)
// Bidding — passes live socket maps so hard-lock + broadcast work
app.use('/api/bids', (req, res, next) => {
  if (!app.locals._bidRouter) {
    app.locals._bidRouter = makeBidRouter({ io, onlineUsers, driverSockets, driverCoords })
  }
  return app.locals._bidRouter(req, res, next)
})

// ─── Health check ──────────────────────────────────────────────────────────
// Public, unauthenticated — used by uptime monitors and container orchestrators
app.get('/health', (req, res) => {
  const dbUp = mongoose.connection.readyState === 1
  res.status(dbUp ? 200 : 503).json({
    status:  dbUp ? 'ok' : 'degraded',
    uptime:  Math.round(process.uptime()),
    db:      dbUp ? 'connected' : 'disconnected',
    version: process.env.npm_package_version || '1.0.0',
  })
})

// ─── Haversine distance (km) ───────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// Emit ride:new only to drivers within 15 km of pickup (or all if coords unknown)
function emitRideToNearbyDrivers(ride) {
  const pickup = ride.pickupCoords
  for (const [driverId, socketId] of driverSockets) {
    const loc = driverCoords.get(driverId)
    if (!pickup || !loc || haversineKm(pickup.lat, pickup.lng, loc.lat, loc.lng) <= 15) {
      io.to(socketId).emit('ride:new', ride)
    }
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────
const JWT_OPTS = { expiresIn: '30d' }

function makeToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, JWT_OPTS)
}

function safeUser(u) {
  const obj = (u && u.toObject) ? u.toObject() : { ...u }
  delete obj.passwordHash
  delete obj._id
  return obj
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ message: 'No token' })
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET)
    next()
  } catch { res.status(401).json({ message: 'Invalid token' }) }
}

function adminMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' })
    next()
  })
}

async function logActivity(type, severity, description, meta = {}) {
  try {
    await Log.create({ id: uuid(), type, severity, description, timestamp: new Date().toISOString(), ...meta })
  } catch { /* non-fatal */ }
}

function checkDocumentExpiries(user) {
  const alerts = []
  const today  = new Date()
  const check  = (label, dateStr) => {
    if (!dateStr) return
    const days = Math.ceil((new Date(dateStr) - today) / 86400000)
    if (days <= 60) alerts.push({ docType: label, expiryDate: dateStr, daysUntilExpiry: days, isExpired: days < 0 })
  }
  const d = user.driverDocuments || {}
  const v = user.vehicleDetails  || {}
  check("Driver's Licence",       d.licenceExpiry)
  check('Defensive Driving Cert', d.defensiveDrivingExpiry)
  check('Police Clearance',       d.policeClearanceDate)
  check('Medical Cert',           d.medicalCertExpiry)
  check('ZINARA Disc',            v.zinaraExpiry)
  check('Insurance',              v.insuranceExpiry)
  check('Certificate of Fitness', v.cofExpiry)
  return alerts
}

// ─── Seed demo data on first run ───────────────────────────────────────────
// SAFETY: only runs when NODE_ENV !== 'production' AND NO_SEED !== '1'.
// For dev convenience, uses a known password; change DEMO_PASSWORD env to override.
async function ensureSeeded() {
  const count = await User.countDocuments()
  if (count > 0) return
  const demoPw = process.env.DEMO_PASSWORD || 'demo1234'
  console.log('\n' + '═'.repeat(60))
  console.log('  Seeding demo data (dev only)')
  console.log(`  Demo accounts password: ${demoPw}`)
  console.log('  To disable, set NO_SEED=1 or NODE_ENV=production')
  console.log('═'.repeat(60) + '\n')
  const now = new Date().toISOString()
  await User.insertMany([
    {
      id: 'u-admin', fullName: 'Super Admin', name: 'Super Admin',
      email: 'admin@easyride.co.zw', passwordHash: bcrypt.hashSync(demoPw, 8),
      phone: '+263770000001', role: 'admin', accountStatus: 'active', createdAt: '2026-01-01T00:00:00Z',
      verification: { status: 'approved' },
    },
    {
      id: 'u-demo-rider', fullName: 'Takudzwa Nyamukapa', name: 'Takudzwa Nyamukapa',
      email: 'rider@demo.com', passwordHash: bcrypt.hashSync(demoPw, 8),
      phone: '+263771234567', role: 'rider', rating: 4.8, accountStatus: 'active',
      createdAt: '2026-01-15T00:00:00Z', lastSeen: now,
      riderProfile: { emergencyContactName: 'Rudo Nyamukapa', emergencyContactPhone: '+263771111111', preferredPayment: 'ecocash', homeAddress: 'Avondale, Harare' },
      verification: { status: 'approved', submittedAt: '2026-01-15T00:00:00Z', reviewedAt: '2026-01-15T01:00:00Z', reviewedBy: 'Admin' },
    },
    {
      id: 'u-demo-corp', fullName: 'Ngonidzashe Ncube', name: 'Ngonidzashe Ncube',
      email: 'corp@demo.com', passwordHash: bcrypt.hashSync(demoPw, 8),
      phone: '+263772345678', role: 'corporate', companyName: 'CMED Zimbabwe', rating: 4.9,
      accountStatus: 'active', createdAt: '2026-02-01T00:00:00Z',
      corporateProfile: { companyName: 'CMED Zimbabwe', companyRegNumber: '1234/2020', contactPerson: 'Ngonidzashe Ncube', contactEmail: 'corp@demo.com', contactPhone: '+263772345678', numberOfVehicles: 5, bankName: 'CBZ Bank' },
      verification: { status: 'approved', submittedAt: '2026-02-01T00:00:00Z', reviewedAt: '2026-02-02T00:00:00Z', reviewedBy: 'Admin' },
    },
    {
      id: 'u-demo-driver', fullName: 'Daulton Mhere', name: 'Daulton Mhere',
      email: 'driver@demo.com', passwordHash: bcrypt.hashSync(demoPw, 8),
      phone: '+263773456789', role: 'driver', rating: 4.9, accountStatus: 'active',
      createdAt: '2026-01-20T00:00:00Z',
      driverDocuments: { nationalIdNumber: '63-123456A78', dateOfBirth: '1990-05-15', licenceNumber: 'DL123456', licenceClass: 'Class 4', licenceIssueDate: '2018-01-01', licenceExpiry: '2028-01-01', defensiveDrivingExpiry: '2027-06-30', policeClearanceDate: '2026-08-01', nextOfKinName: 'Mary Mhere', nextOfKinPhone: '+263771000000', residentialAddress: 'Mufakose, Harare' },
      vehicleDetails: { registration: 'PLS 171', make: 'Toyota', model: 'Corolla', year: '2019', colour: 'White', seatingCapacity: 5, category: 'Economy', zinaraExpiry: '2027-01-31', insuranceType: 'third_party', insurer: 'FBC Insurance', insuranceExpiry: '2027-03-31', cofExpiry: '2027-02-28' },
      vehicleReg: 'PLS 171', vehicleModel: 'Toyota Corolla 2019',
      verification: { status: 'approved', submittedAt: '2026-01-20T00:00:00Z', reviewedAt: '2026-01-22T00:00:00Z', reviewedBy: 'Admin' },
    },
    {
      id: 'u-pending-driver', fullName: 'Tinashe Moyo', name: 'Tinashe Moyo',
      email: 'tmoyo@demo.com', passwordHash: bcrypt.hashSync(demoPw, 8),
      phone: '+263774000001', role: 'driver', accountStatus: 'active',
      createdAt: '2026-09-22T10:00:00Z',
      driverDocuments: { nationalIdNumber: '63-999999B12', dateOfBirth: '1995-03-20', licenceNumber: 'DL999888', licenceClass: 'Class 4', licenceIssueDate: '2020-01-01', licenceExpiry: '2026-10-15', defensiveDrivingExpiry: '2026-11-30', policeClearanceDate: '2026-09-01', nextOfKinName: 'Ruth Moyo', nextOfKinPhone: '+263774000002', residentialAddress: 'Borrowdale, Harare' },
      vehicleDetails: { registration: 'ACD 5678', make: 'Honda', model: 'Fit', year: '2018', colour: 'Silver', seatingCapacity: 4, category: 'Economy', zinaraExpiry: '2026-12-31', insuranceType: 'third_party', insurer: 'Old Mutual', insuranceExpiry: '2026-11-30', cofExpiry: '2026-10-31' },
      vehicleReg: 'ACD 5678', vehicleModel: 'Honda Fit 2018',
      verification: { status: 'pending', submittedAt: '2026-09-22T10:00:00Z' },
    },
    {
      id: 'u-5', fullName: 'Grace Mupfumi', name: 'Grace Mupfumi',
      email: 'g.mupfumi@corp.co.zw', passwordHash: bcrypt.hashSync(demoPw, 8),
      phone: '+263775678901', role: 'rider', rating: 4.5,
      accountStatus: 'frozen', frozenReason: 'Multiple payment chargebacks detected', frozenAt: '2026-09-18T12:00:00Z',
      createdAt: '2026-04-05T00:00:00Z',
      riderProfile: { emergencyContactName: 'Peter M', emergencyContactPhone: '+263771000001', preferredPayment: 'ecocash' },
      verification: { status: 'approved', submittedAt: '2026-04-05T00:00:00Z', reviewedAt: '2026-04-05T01:00:00Z', reviewedBy: 'Admin' },
    },
  ])

  await Voucher.create({
    id: 'v-001', voucherNo: '0806', corporateId: 'u-demo-corp',
    pickUpTime: '19:30', dropOffTime: '20:09',
    openingMileage: 54025, closingMileage: 54055, totalMileage: 30,
    waitingCharge: 0, totalValue: 5.50, driverName: 'Daulton Mhere',
    authorisedBy: 'Jane Smith', employeeNames: 'John Moyo', cabNo: 'PLS 171',
    status: 'used', createdAt: '2026-09-21T19:30:00Z',
  })

  await Log.insertMany([
    { id: uuid(), type: 'system', severity: 'info', description: 'EasyRide server started', timestamp: new Date().toISOString() },
    { id: uuid(), type: 'account', severity: 'warning', userId: 'u-5', userName: 'Admin', description: 'Account frozen — Multiple payment chargebacks detected', timestamp: '2026-09-18T12:00:00Z' },
    { id: uuid(), type: 'payment', severity: 'critical', userId: 'u-5', userName: 'Grace Mupfumi', description: 'EcoCash payment reversed — possible fraud, 3rd occurrence this week', timestamp: '2026-09-18T11:50:00Z' },
    { id: uuid(), type: 'login', severity: 'warning', userId: 'u-4', userName: 'Tendai Mwari', description: 'Failed login attempt — incorrect password (attempt 3/5)', timestamp: '2026-09-20T09:10:00Z' },
  ])
  console.log('Demo data seeded')
}

// ─── Auth routes ─────────────────────────────────────────────────────────
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const {
      phone, email, password, pin, role, fullName,
      riderProfile, driverDocuments, vehicleDetails, driverAgreements,
      corporateProfile, companyName, phoneVerified, submittedAt,
      vehicleReg, vehicleMake, vehicleModel, vehicleYear, vehicleColour, vehicleCategory, seatingCapacity,
      nationalIdNumber, nationalIdPhoto, dateOfBirth, residentialAddress, proofOfResidence, selfiePhoto,
      nextOfKinName, nextOfKinPhone, licenceNumber, licenceClass, licenceIssueDate, licenceExpiry,
      licencePhoto, defensiveDrivingCert, defensiveDrivingExpiry, policeClearance, policeClearanceDate,
      medicalCert, medicalCertExpiry, regBookPhoto, zinaraExpiry, zinaraPhoto, insuranceType, insurer,
      insuranceExpiry, insurancePhoto, cofExpiry, cofPhoto, operatorPermit,
      photoFront, photoBack, photoLeft, photoRight, photoInterior,
      codeOfConduct, backgroundCheckConsent, commissionAcknowledgement, termsAccepted,
      contactPerson, contactEmail, contactPhone, companyRegNumber, zimraBpNumber, taxClearanceDoc,
      numberOfVehicles, bankName, bankAccountNumber, bankBranch,
      gender, profilePhoto, emergencyContactName, emergencyContactPhone, homeAddress, workAddress, preferredPayment,
    } = req.body

    if (!phone) return res.status(400).json({ message: 'Phone number is required' })
    if (await User.findOne({ phone })) return res.status(400).json({ message: 'This phone number is already registered' })
    if (email && await User.findOne({ email })) return res.status(400).json({ message: 'Email already in use' })

    if (!password && !pin) return res.status(400).json({ message: 'Password or PIN is required' })
    const passHash  = await bcrypt.hash(password || pin, 10)
    const isPending = (role === 'driver' || role === 'corporate')
    const now       = new Date().toISOString()

    const driverDocs = role === 'driver' ? {
      nationalIdNumber, nationalIdPhoto, dateOfBirth, residentialAddress, proofOfResidence, selfiePhoto,
      nextOfKinName, nextOfKinPhone, licenceNumber, licenceClass, licenceIssueDate, licenceExpiry,
      licencePhoto, defensiveDrivingCert, defensiveDrivingExpiry, policeClearance, policeClearanceDate,
      medicalCert, medicalCertExpiry,
    } : driverDocuments

    const vehicleDets = role === 'driver' ? {
      registration: vehicleReg, make: vehicleMake, model: vehicleModel, year: vehicleYear,
      colour: vehicleColour, seatingCapacity: Number(seatingCapacity) || 4, category: vehicleCategory,
      regBookPhoto, zinaraExpiry, zinaraPhoto, insuranceType, insurer, insuranceExpiry, insurancePhoto,
      cofExpiry, cofPhoto, operatorPermit,
      vehiclePhotos: { front: photoFront, back: photoBack, leftSide: photoLeft, rightSide: photoRight, interior: photoInterior },
    } : vehicleDetails

    const corpProfile = role === 'corporate' ? {
      companyName: companyName || req.body.companyName, companyRegNumber, zimraBpNumber, taxClearanceDoc,
      contactPerson, contactEmail, contactPhone: contactPhone || phone,
      numberOfVehicles: Number(numberOfVehicles) || 0, bankName, bankAccountNumber, bankBranch,
    } : corporateProfile

    const riderProf = role === 'rider' ? {
      gender, profilePhoto, emergencyContactName, emergencyContactPhone,
      homeAddress, workAddress, preferredPayment: preferredPayment || 'ecocash',
    } : riderProfile

    const user = await User.create({
      id: uuid(),
      fullName:  fullName || contactPerson,
      name:      fullName || contactPerson,
      phone, email: email || contactEmail,
      passwordHash: passHash, role,
      accountStatus: 'active',
      rating:        role === 'rider' ? 5.0 : undefined,
      createdAt: now, lastSeen: now,
      phoneVerified: !!phoneVerified,
      companyName:   corpProfile?.companyName,
      vehicleReg:    vehicleDets?.registration,
      vehicleModel:  vehicleDets ? `${vehicleDets.make} ${vehicleDets.model} ${vehicleDets.year}` : undefined,
      riderProfile:     riderProf,
      driverDocuments:  driverDocs,
      vehicleDetails:   vehicleDets,
      driverAgreements: role === 'driver' ? { codeOfConduct, backgroundCheckConsent, commissionAcknowledgement, termsAccepted, termsTimestamp: now } : driverAgreements,
      corporateProfile: corpProfile,
      verification: {
        status: isPending ? 'pending' : 'approved',
        submittedAt: submittedAt || now,
        ...(isPending ? {} : { reviewedAt: now, reviewedBy: 'Auto' }),
      },
    })

    logActivity('verification', isPending ? 'warning' : 'info',
      isPending
        ? `New ${role} application submitted — ${user.fullName} (pending review)`
        : `New rider registered — ${user.fullName}`,
      { userId: user.id, userName: user.fullName, userRole: role }
    )
    res.json({ token: makeToken(user), user: { ...safeUser(user), verificationStatus: user.verification?.status } })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { phone, password } = req.body
    const raw = String(phone || '').trim()
    const candidates = [raw, raw.toLowerCase()]
    const digits = raw.replace(/[^\d]/g, '')
    if (digits.length === 9 && digits.startsWith('7')) candidates.push('+263' + digits)
    if (digits.length === 10 && digits.startsWith('07')) candidates.push('+263' + digits.slice(1))
    if (digits.length === 12 && digits.startsWith('263')) candidates.push('+' + digits)
    const user = await User.findOne({ $or: [{ phone: { $in: candidates } }, { email: { $in: candidates } }] })
    if (!user || !await bcrypt.compare(password, user.passwordHash)) {
      logActivity('login', 'warning', `Failed login attempt for ${phone || 'unknown'}`)
      return res.status(401).json({ message: 'Invalid mobile number or password' })
    }
    if (user.accountStatus === 'frozen')
      return res.status(403).json({ message: `Account frozen: ${user.frozenReason || 'Contact EasyRide support'}` })
    if (user.accountStatus === 'deleted')
      return res.status(403).json({ message: 'Account has been removed. Contact support.' })
    if (user.verification?.status === 'pending')
      return res.status(403).json({ message: 'Your application is still under review. You will receive an SMS once approved.' })
    if (user.verification?.status === 'rejected')
      return res.status(403).json({ message: `Application rejected: ${user.verification.rejectionReason || 'Contact support'}` })

    user.lastSeen = new Date().toISOString()
    await user.save()

    const documentAlerts = user.role === 'driver' ? checkDocumentExpiries(user) : []
    const safe = safeUser(user)
    if (documentAlerts.length && safe.verification) safe.verification.documentAlerts = documentAlerts

    logActivity('login', 'info', `User logged in — ${user.fullName || user.name} (${user.role})`, { userId: user.id, userName: user.fullName || user.name, userRole: user.role })
    res.json({ token: makeToken(user), user: safe })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ id: req.user.id })
    if (!user) return res.status(404).json({ message: 'User not found' })
    res.json(safeUser(user))
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// Update FCM token
app.patch('/api/auth/fcm-token', authMiddleware, async (req, res) => {
  try {
    await User.findOneAndUpdate({ id: req.user.id }, { fcmToken: req.body.fcmToken })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// Driver daily selfie check — store compressed selfie + timestamp
app.post('/api/drivers/selfie', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'driver') return res.status(403).json({ message: 'Drivers only' })
    const { selfieBase64 } = req.body
    if (!selfieBase64 || !selfieBase64.startsWith('data:image/'))
      return res.status(400).json({ message: 'Invalid selfie data' })
    const verifiedAt = new Date().toISOString()
    await User.findOneAndUpdate(
      { id: req.user.id },
      { lastSelfieAt: verifiedAt, lastSelfieBase64: selfieBase64 }
    )
    logActivity('system', 'info', `Driver selfie check passed — ${req.user.id.slice(0, 8)}`, { userId: req.user.id })
    res.json({ ok: true, verifiedAt })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// Update rider profile fields (emergency contact, home/work address, preferred payment)
app.patch('/api/users/me/profile', authMiddleware, async (req, res) => {
  try {
    const ALLOWED = ['emergencyContactName', 'emergencyContactPhone', 'homeAddress', 'workAddress', 'preferredPayment', 'gender']
    const user = await User.findOne({ id: req.user.id })
    if (!user) return res.status(404).json({ message: 'User not found' })
    const profile = user.riderProfile || {}
    ALLOWED.forEach(f => { if (req.body[f] !== undefined) profile[f] = req.body[f] })
    user.riderProfile = profile
    user.markModified('riderProfile')
    await user.save()
    res.json(safeUser(user))
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── OTP routes ───────────────────────────────────────────────────────────
app.post('/api/auth/otp/send', otpLimiter, async (req, res) => {
  try {
    const { phone } = req.body
    if (!phone) return res.status(400).json({ message: 'Phone required' })
    const code      = String(Math.floor(100000 + Math.random() * 900000))
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)
    await OTP.create({ phone, code, expiresAt })
    await sendOtp(phone, code)
    const devMode = !process.env.AT_API_KEY
    res.json({ ok: true, ...(devMode && { devCode: code }) })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

app.post('/api/auth/otp/verify', otpLimiter, async (req, res) => {
  try {
    const { phone, code } = req.body
    const otp = await OTP.findOne({ phone, code, used: false, expiresAt: { $gt: new Date() } })
    if (!otp) return res.status(400).json({ message: 'Invalid or expired OTP' })
    otp.used = true
    await otp.save()
    const user = await User.findOne({ phone })
    if (!user) return res.status(404).json({ message: 'User not found' })
    res.json({ token: makeToken(user), user: safeUser(user) })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
  try {
    const { phone, code, newPassword } = req.body
    if (!phone || !code || !newPassword) return res.status(400).json({ message: 'Phone, code and new password are required' })
    if (newPassword.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' })
    const otp = await OTP.findOne({ phone, code, used: false, expiresAt: { $gt: new Date() } })
    if (!otp) return res.status(400).json({ message: 'Invalid or expired OTP. Please request a new one.' })
    const user = await User.findOne({ phone })
    if (!user) return res.status(404).json({ message: 'No account found with this number' })
    otp.used = true
    await otp.save()
    user.passwordHash = await bcrypt.hash(newPassword, 12)
    await user.save()
    logActivity('account', 'info', `Password reset via OTP — ${phone}`, { userId: user.id })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── Rides routes ─────────────────────────────────────────────────────────
app.post('/api/rides/request', authMiddleware, async (req, res) => {
  try {
    const { promoCode: code, scheduledFor, ...rideData } = req.body
    let discountAmount = 0
    if (code) {
      const promo = await PromoCode.findOne({ code: code.toUpperCase(), active: true })
      if (promo && (!promo.expiresAt || new Date(promo.expiresAt) >= new Date()) && (!promo.maxUses || promo.usesCount < promo.maxUses)) {
        if (promo.type === 'fixed') discountAmount = promo.value
        await PromoCode.findOneAndUpdate({ id: promo.id }, { $inc: { usesCount: 1 } })
      }
    }
    const status = scheduledFor ? 'scheduled' : 'searching'
    const ride = await Ride.create({
      id: uuid(), clientId: req.user.id, status,
      ...(code ? { promoCode: code.toUpperCase() } : {}),
      ...(discountAmount ? { discountAmount } : {}),
      ...(scheduledFor ? { scheduledFor } : {}),
      ...rideData,
    })
    if (status === 'searching') emitRideToNearbyDrivers(ride.toObject())
    io.to('admins').emit('admin:ride_update', ride.toObject())
    logActivity('ride', 'info', `New ride ${status === 'scheduled' ? 'scheduled' : 'requested'} — ${ride.pickupAddress} → ${ride.dropoffAddress}`, { userId: ride.clientId })
    res.json(ride)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

app.get('/api/rides/history', authMiddleware, async (req, res) => {
  try {
    const rides = await Ride.find({ $or: [{ clientId: req.user.id }, { driverId: req.user.id }] }).sort({ createdAt: -1 })
    res.json(rides)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

app.patch('/api/rides/:id', authMiddleware, async (req, res) => {
  try {
    const existing = await Ride.findOne({ id: req.params.id })
    if (!existing) return res.status(404).json({ message: 'Ride not found' })
    const isOwner = existing.clientId === req.user.id || existing.driverId === req.user.id
    if (!isOwner && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Not authorized to update this ride' })
    // Whitelist updatable fields to prevent arbitrary overwrites
    const ALLOWED = ['status', 'fare', 'distance', 'duration', 'cancelReason', 'paymentMethod',
                     'driverId', 'pickupCoords', 'dropoffCoords', 'completedAt', 'clientRating', 'clientComment']
    const update = Object.fromEntries(Object.entries(req.body).filter(([k]) => ALLOWED.includes(k)))
    const ride = await Ride.findOneAndUpdate({ id: req.params.id }, update, { new: true })
    // Notify driver of any status or fare change
    if (ride.driverId) {
      const driverSocket = onlineUsers.get(ride.driverId)
      if (driverSocket) io.to(driverSocket).emit('ride:status', ride.toObject())
      if (req.body.status === 'cancelled') {
        const driver = await User.findOne({ id: ride.driverId })
        if (driver?.fcmToken) sendPush(driver.fcmToken, 'Ride cancelled', 'The client has cancelled this ride.')
      }
      if (req.body.fare) {
        const driver = await User.findOne({ id: ride.driverId })
        if (driver?.fcmToken) sendPush(driver.fcmToken, 'Fare updated', `Ride fare: $${req.body.fare}`)
      }
    }
    // Notify client of any driver-initiated status change
    if (ride.clientId) {
      const clientSocket = onlineUsers.get(ride.clientId)
      if (clientSocket) io.to(clientSocket).emit('ride:status', ride.toObject())
    }
    io.to('admins').emit('admin:ride_update', ride.toObject())
    res.json(ride)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

app.get('/api/users/:id/public', authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ id: req.params.id })
    if (!user) return res.status(404).json({ message: 'User not found' })
    res.json({
      name:    user.fullName || user.name,
      rating:  user.rating   || 4.8,
      vehicle: user.vehicleDetails
        ? `${user.vehicleDetails.make} ${user.vehicleDetails.model} ${user.vehicleDetails.year}`.trim()
        : (user.vehicleModel || 'Vehicle'),
      plate: user.vehicleDetails?.registration || user.vehicleReg || 'N/A',
    })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

app.post('/api/rides/:id/rate', authMiddleware, async (req, res) => {
  try {
    const { rating, comment } = req.body
    const ride = await Ride.findOneAndUpdate({ id: req.params.id }, { clientRating: rating, clientComment: comment }, { new: true })
    if (!ride) return res.status(404).json({ message: 'Ride not found' })
    if (ride.driverId) {
      const ratedRides = await Ride.find({ driverId: ride.driverId, clientRating: { $exists: true } })
      const avg = ratedRides.reduce((s, r) => s + (r.clientRating || 0), 0) / ratedRides.length
      await User.findOneAndUpdate({ id: ride.driverId }, { rating: Math.round(avg * 10) / 10 })
    }
    logActivity('ride', 'info', `Ride rated ${rating}/5 by client — ride #${req.params.id.slice(0, 8)}`, { userId: req.user.id })
    res.json({ message: 'Rating submitted' })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

app.get('/api/rides/shared-nearby', authMiddleware, async (req, res) => {
  try {
    const { lat, lng } = req.query
    let rides = await Ride.find({ status: 'searching', isShared: true, clientId: { $ne: req.user.id } })
    if (lat && lng) {
      rides = rides.filter(r => {
        if (!r.pickupCoords?.lat) return true
        return haversineKm(+lat, +lng, r.pickupCoords.lat, r.pickupCoords.lng) <= 5
      })
    }
    res.json(rides)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/rides/:id/join-shared', authMiddleware, async (req, res) => {
  try {
    const { pickupAddress, pickupCoords } = req.body
    const ride = await Ride.findOne({ id: req.params.id, status: 'searching', isShared: true })
    if (!ride) return res.status(404).json({ message: 'Shared ride not available' })
    if (ride.clientId === req.user.id) return res.status(400).json({ message: 'Cannot join your own ride' })
    const maxPass = ride.maxPassengers || 2
    if ((ride.coRiders?.length || 0) >= maxPass - 1) return res.status(400).json({ message: 'Ride is full' })
    const totalRiders = (ride.coRiders?.length || 0) + 2
    const fareShare = +(ride.fare / totalRiders).toFixed(2)
    const updated = await Ride.findOneAndUpdate(
      { id: req.params.id },
      { $push: { coRiders: { userId: req.user.id, pickupAddress, pickupCoords, fareShare } }, fareShare },
      { new: true }
    )
    const originalSocketId = onlineUsers.get(ride.clientId)
    if (originalSocketId) io.to(originalSocketId).emit('ride:sharedJoin', { rideId: ride.id, fareShare, coRiderCount: updated.coRiders.length })
    io.to('admins').emit('admin:ride_update', updated.toObject())
    logActivity('ride', 'info', `Shared ride joined — ${ride.pickupAddress} → ${ride.dropoffAddress}`, { userId: req.user.id })
    res.json(updated)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.patch('/api/rides/:id/counter', authMiddleware, async (req, res) => {
  if (req.user.role !== 'driver') return res.status(403).json({ message: 'Drivers only' })
  const { counterFare } = req.body
  if (!counterFare || counterFare <= 0) return res.status(400).json({ message: 'Invalid fare' })
  try {
    const ride = await Ride.findOneAndUpdate(
      { id: req.params.id, status: 'searching' },
      { counterFare, counterByDriverId: req.user.id },
      { new: true }
    )
    if (!ride) return res.status(404).json({ message: 'Ride not available' })
    const driver = await User.findOne({ id: req.user.id })
    const clientSocketId = onlineUsers.get(ride.clientId)
    if (clientSocketId) {
      io.to(clientSocketId).emit('ride:counterOffer', {
        rideId:         ride.id,
        counterFare,
        driverId:       req.user.id,
        driverName:     driver?.fullName || driver?.name || 'A driver',
        originalFare:   ride.fare,
        pickupAddress:  ride.pickupAddress,
        dropoffAddress: ride.dropoffAddress,
        paymentMethod:  ride.paymentMethod,
      })
    }
    res.json({ message: 'Counter offer sent' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/rides/:id/accept-counter', authMiddleware, async (req, res) => {
  const { driverId } = req.body
  try {
    const ride = await Ride.findOne({ id: req.params.id, clientId: req.user.id, status: 'searching' })
    if (!ride) return res.status(404).json({ message: 'Ride not found' })
    if (!ride.counterFare || ride.counterByDriverId !== driverId) return res.status(400).json({ message: 'No matching counter offer' })
    const updated = await Ride.findOneAndUpdate(
      { id: req.params.id },
      { driverId, status: 'accepted', fare: ride.counterFare, acceptedAt: new Date().toISOString() },
      { new: true }
    )
    const driverSocketId = onlineUsers.get(driverId)
    if (driverSocketId) io.to(driverSocketId).emit('ride:accepted', updated.toObject())
    const clientSocketId = onlineUsers.get(req.user.id)
    if (clientSocketId) io.to(clientSocketId).emit('ride:accepted', updated.toObject())
    io.to('admins').emit('admin:ride_update', updated.toObject())
    logActivity('ride', 'info', `Counter-offer accepted — fare $${updated.fare}`, { userId: req.user.id })
    res.json(updated)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/rides/return-accept', authMiddleware, async (req, res) => {
  try {
    const { originalRideId, proposedFare, driverId, pickupAddress, dropoffAddress, pickupCoords, dropoffCoords, paymentMethod } = req.body
    const clientId = req.user.id
    const original = await Ride.findOne({ id: originalRideId, clientId })
    if (!original) return res.status(404).json({ message: 'Original ride not found' })
    const returnRide = {
      id: uuid(), clientId, driverId,
      pickupAddress, dropoffAddress, pickupCoords, dropoffCoords,
      status: 'accepted',
      paymentMethod: paymentMethod || original.paymentMethod,
      fare: proposedFare,
      createdAt: new Date().toISOString(),
      acceptedAt: new Date().toISOString(),
    }
    await Ride.create(returnRide)
    const driverSocketId = onlineUsers.get(driverId)
    if (driverSocketId) io.to(driverSocketId).emit('returnBid:confirmed', returnRide)
    io.to('admins').emit('admin:ride_update', returnRide)
    logActivity('ride', 'info', `Return trip accepted — ${pickupAddress} → ${dropoffAddress}`, { userId: clientId })
    res.json(returnRide)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/rides/:id/sos', authMiddleware, async (req, res) => {
  try {
    const ride = await Ride.findOne({ id: req.params.id })
    if (!ride) return res.status(404).json({ message: 'Ride not found' })
    if (ride.clientId !== req.user.id && ride.driverId !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Not authorized' })

    const user  = await User.findOne({ id: req.user.id })
    const name  = user?.fullName || user?.name || req.user.id
    const phone = user?.phone || ''

    // Notify admin dashboard via socket
    logActivity('system', 'critical', `SOS ALERT — ${name} triggered emergency during ride #${req.params.id.slice(0, 8)}`, { userId: req.user.id, userName: name })
    io.to('admins').emit('sos:alert', { rideId: req.params.id, userId: req.user.id, userName: name, timestamp: new Date().toISOString() })

    // SMS trusted contact (riders → emergencyContact; drivers → nextOfKin)
    const emergencyPhone = user?.riderProfile?.emergencyContactPhone || user?.driverDocuments?.nextOfKinPhone
    const emergencyName  = user?.riderProfile?.emergencyContactName  || user?.driverDocuments?.nextOfKinName
    if (emergencyPhone) {
      const trackUrl = `${process.env.CLIENT_URL || 'https://easyride.co.zw'}/track/${req.params.id}`
      const msg = `EMERGENCY ALERT - EasyRide\n${name} triggered an SOS.\nTrip: ${ride.pickupAddress} to ${ride.dropoffAddress}\nTrack location: ${trackUrl}\nCall ${name}: ${phone}`
      sendSms(emergencyPhone, msg).catch(e => console.error('SOS SMS failed:', e.message))
    }

    res.json({
      message: 'SOS alert dispatched',
      notifiedContact: emergencyPhone ? (emergencyName || emergencyPhone) : null,
    })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── Voucher routes ───────────────────────────────────────────────────────
app.get('/api/vouchers', authMiddleware, async (req, res) => {
  try {
    const vouchers = await Voucher.find({ corporateId: req.user.id })
    res.json(vouchers)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

app.post('/api/vouchers', authMiddleware, async (req, res) => {
  if (req.user.role !== 'corporate' && req.user.role !== 'admin')
    return res.status(403).json({ message: 'Only corporate accounts can create vouchers' })
  try {
    const voucher = await Voucher.create({ id: uuid(), corporateId: req.user.id, status: 'pending', ...req.body })
    res.json(voucher)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

app.patch('/api/vouchers/:id', authMiddleware, async (req, res) => {
  try {
    const voucher = await Voucher.findOne({ id: req.params.id })
    if (!voucher) return res.status(404).json({ message: 'Voucher not found' })
    if (voucher.corporateId !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Not authorized to update this voucher' })
    const updated = await Voucher.findOneAndUpdate({ id: req.params.id }, req.body, { new: true })
    res.json(updated)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── Message routes ───────────────────────────────────────────────────────
app.get('/api/messages/:rideId', authMiddleware, async (req, res) => {
  try {
    const ride = await Ride.findOne({ id: req.params.rideId })
    if (!ride) return res.status(404).json({ message: 'Ride not found' })
    if (ride.clientId !== req.user.id && ride.driverId !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Not authorized to read these messages' })
    const msgs = await Message.find({ rideId: req.params.rideId }).sort({ timestamp: 1 })
    res.json(msgs)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── Admin routes ──────────────────────────────────────────────────────────
app.get('/api/admin/users', adminMiddleware, async (req, res) => {
  try {
    const users = await User.find({}, '-passwordHash').sort({ createdAt: -1 })
    res.json(users.map(u => {
      const safe = u.toObject()
      if (u.role === 'driver') {
        const alerts = checkDocumentExpiries(u)
        if (alerts.length && safe.verification) safe.verification.documentAlerts = alerts
      }
      return safe
    }))
  } catch (err) { res.status(500).json({ message: err.message }) }
})

app.get('/api/admin/verifications', adminMiddleware, async (req, res) => {
  try {
    const pending = await User.find({ 'verification.status': 'pending' }, '-passwordHash')
    res.json(pending.map(u => {
      const safe = u.toObject()
      if (u.role === 'driver') safe.verification.documentAlerts = checkDocumentExpiries(u)
      return safe
    }))
  } catch (err) { res.status(500).json({ message: err.message }) }
})

app.post('/api/admin/verifications/:id', adminMiddleware, async (req, res) => {
  try {
    const { action, rejectionReason } = req.body
    const status = action === 'approve' ? 'approved' : 'rejected'
    const user   = await User.findOneAndUpdate(
      { id: req.params.id },
      { $set: {
        'verification.status': status,
        'verification.reviewedAt': new Date().toISOString(),
        'verification.reviewedBy': 'Admin',
        ...(action === 'reject' ? { 'verification.rejectionReason': rejectionReason } : {}),
      }},
      { new: true }
    )
    if (!user) return res.status(404).json({ message: 'User not found' })
    logActivity('verification', action === 'approve' ? 'info' : 'warning',
      `${user.role} application ${status} — ${user.fullName || user.name}${rejectionReason ? ` (${rejectionReason})` : ''}`,
      { userId: req.params.id, userName: 'Admin' }
    )
    const socketId = onlineUsers.get(req.params.id)
    if (socketId) io.to(socketId).emit('verification:update', { status, rejectionReason })
    res.json(safeUser(user))
  } catch (err) { res.status(500).json({ message: err.message }) }
})

app.patch('/api/admin/users/:id', adminMiddleware, async (req, res) => {
  try {
    const { accountStatus, frozenReason } = req.body
    const update = {
      ...req.body,
      ...(accountStatus === 'frozen' ? { frozenAt: new Date().toISOString() } : {}),
      ...(accountStatus === 'active'  ? { frozenReason: null, frozenAt: null } : {}),
    }
    const user = await User.findOneAndUpdate({ id: req.params.id }, update, { new: true })
    if (!user) return res.status(404).json({ message: 'User not found' })
    const action = accountStatus === 'frozen' ? 'frozen' : accountStatus === 'active' ? 'unfrozen' : 'updated'
    logActivity('account',
      accountStatus === 'frozen' ? 'warning' : accountStatus === 'deleted' ? 'critical' : 'info',
      `Account ${action} by admin — ${user.name}${frozenReason ? ` (${frozenReason})` : ''}`,
      { userId: req.params.id, userName: 'Admin' }
    )
    if (accountStatus === 'frozen' || accountStatus === 'deleted') {
      const socketId = onlineUsers.get(req.params.id)
      if (socketId) io.to(socketId).emit('account:suspended', { reason: frozenReason || 'Account action taken' })
    }
    res.json(safeUser(user))
  } catch (err) { res.status(500).json({ message: err.message }) }
})

app.delete('/api/admin/users/:id', adminMiddleware, async (req, res) => {
  try {
    const user = await User.findOneAndUpdate({ id: req.params.id }, { accountStatus: 'deleted' })
    if (!user) return res.status(404).json({ message: 'User not found' })
    logActivity('account', 'critical', `Account permanently deleted by admin — ${user.name}`, { userName: 'Admin' })
    res.json({ message: 'Account deleted' })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

app.get('/api/admin/rides', adminMiddleware, async (req, res) => {
  try {
    const rides = await Ride.find().sort({ createdAt: -1 }).limit(200)
    res.json(rides)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

app.get('/api/admin/vouchers', adminMiddleware, async (req, res) => {
  try {
    res.json(await Voucher.find().sort({ createdAt: -1 }))
  } catch (err) { res.status(500).json({ message: err.message }) }
})

app.patch('/api/admin/vouchers/:id', adminMiddleware, async (req, res) => {
  try {
    const v = await Voucher.findOneAndUpdate({ id: req.params.id }, req.body, { new: true })
    if (!v) return res.status(404).json({ message: 'Voucher not found' })
    logActivity('voucher', 'info', `Voucher #${v.voucherNo} ${req.body.status} by admin`, { userName: 'Admin' })
    res.json(v)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

app.get('/api/admin/logs', adminMiddleware, async (req, res) => {
  try {
    const logs = await Log.find().sort({ timestamp: -1 }).limit(500)
    res.json(logs)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

app.get('/api/admin/stats', adminMiddleware, async (req, res) => {
  try {
    const [totalUsers, activeUsers, frozenUsers, totalRides, activeRides, totalVouchers, criticalLogs, completed] = await Promise.all([
      User.countDocuments({ accountStatus: { $ne: 'deleted' } }),
      User.countDocuments({ accountStatus: 'active' }),
      User.countDocuments({ accountStatus: 'frozen' }),
      Ride.countDocuments(),
      Ride.countDocuments({ status: { $nin: ['completed', 'cancelled'] } }),
      Voucher.countDocuments(),
      Log.countDocuments({ severity: 'critical' }),
      Ride.find({ status: 'completed' }, 'fare'),
    ])
    const totalRevenue = completed.reduce((s, r) => s + (r.fare || 0), 0)
    res.json({ totalUsers, activeUsers, frozenUsers, totalRides, activeRides, totalVouchers, criticalLogs, totalRevenue: +totalRevenue.toFixed(2) })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── Public ride tracking (no auth) ──────────────────────────────────────
app.get('/api/rides/:id/public', async (req, res) => {
  try {
    const ride = await Ride.findOne({ id: req.params.id })
    if (!ride) return res.status(404).json({ message: 'Ride not found' })
    const data = {
      id: ride.id, status: ride.status,
      pickupAddress: ride.pickupAddress, dropoffAddress: ride.dropoffAddress,
      pickupCoords: ride.pickupCoords, dropoffCoords: ride.dropoffCoords,
      vehicleCategory: ride.vehicleCategory, fare: ride.fare,
    }
    if (ride.driverId) {
      const driver = await User.findOne({ id: ride.driverId })
      if (driver) data.driver = {
        name: driver.fullName || driver.name,
        rating: driver.rating || 4.8,
        vehicle: driver.vehicleDetails
          ? `${driver.vehicleDetails.make} ${driver.vehicleDetails.model}`
          : (driver.vehicleModel || 'Vehicle'),
        plate: driver.vehicleDetails?.registration || driver.vehicleReg || 'N/A',
      }
    }
    res.json(data)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── Promo code validation (public) ──────────────────────────────────────
app.get('/api/promos/validate/:code', async (req, res) => {
  try {
    const promo = await PromoCode.findOne({ code: req.params.code.toUpperCase(), active: true })
    if (!promo) return res.status(404).json({ message: 'Invalid promo code' })
    if (promo.expiresAt && new Date(promo.expiresAt) < new Date())
      return res.status(400).json({ message: 'Promo code has expired' })
    if (promo.maxUses && promo.usesCount >= promo.maxUses)
      return res.status(400).json({ message: 'Promo code usage limit reached' })
    res.json({ id: promo.id, code: promo.code, type: promo.type, value: promo.value, minFare: promo.minFare, description: promo.description })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── Driver KYC ───────────────────────────────────────────────────────────
app.patch('/api/users/me/kyc', authMiddleware, async (req, res) => {
  try {
    const { driverDocuments, vehicleDetails } = req.body
    const updateFields = {
      'verification.status': 'pending',
      'verification.submittedAt': new Date().toISOString(),
    }
    if (driverDocuments) updateFields.driverDocuments = driverDocuments
    if (vehicleDetails) {
      updateFields.vehicleDetails = vehicleDetails
      if (vehicleDetails.registration) updateFields.vehicleReg = vehicleDetails.registration
      if (vehicleDetails.make && vehicleDetails.model)
        updateFields.vehicleModel = `${vehicleDetails.make} ${vehicleDetails.model} ${vehicleDetails.year || ''}`.trim()
    }
    const user = await User.findOneAndUpdate({ id: req.user.id }, { $set: updateFields }, { new: true })
    if (!user) return res.status(404).json({ message: 'User not found' })
    logActivity('verification', 'info', `KYC documents submitted — ${user.fullName}`, { userId: user.id, userName: user.fullName })
    io.to('admins').emit('admin:kyc_submitted', { userId: user.id, name: user.fullName })
    res.json(safeUser(user))
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── Admin promo CRUD ─────────────────────────────────────────────────────
app.get('/api/admin/promos', adminMiddleware, async (req, res) => {
  try { res.json(await PromoCode.find().sort({ createdAt: -1 })) }
  catch (err) { res.status(500).json({ message: err.message }) }
})

app.post('/api/admin/promos', adminMiddleware, async (req, res) => {
  try {
    const promo = await PromoCode.create({ id: uuid(), ...req.body, code: (req.body.code || '').toUpperCase() })
    logActivity('system', 'info', `Promo code created — ${promo.code}`, { userName: 'Admin' })
    res.json(promo)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

app.patch('/api/admin/promos/:id', adminMiddleware, async (req, res) => {
  try {
    // Prevent accidental overwrite of read-only fields
    const { usesCount, id: _id, createdAt, ...allowedUpdates } = req.body
    const promo = await PromoCode.findOneAndUpdate({ id: req.params.id }, allowedUpdates, { new: true })
    if (!promo) return res.status(404).json({ message: 'Promo not found' })
    res.json(promo)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

app.delete('/api/admin/promos/:id', adminMiddleware, async (req, res) => {
  try {
    await PromoCode.findOneAndDelete({ id: req.params.id })
    res.json({ message: 'Promo deleted' })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── Driver heat map ──────────────────────────────────────────────────────
// Returns aggregated pickup demand grid for the last 24 hours
app.get('/api/drivers/heatmap', authMiddleware, async (req, res) => {
  try {
    const hoursBack = parseInt(req.query.hours) || 24
    const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString()
    const rides = await Ride.find(
      { createdAt: { $gte: cutoff }, 'pickupCoords.lat': { $exists: true } },
      'pickupCoords'
    )
    // Aggregate into ~500m grid cells (3 decimal places ≈ 111m, 2 dp ≈ 1.1 km)
    const grid = {}
    for (const ride of rides) {
      const { lat, lng } = ride.pickupCoords || {}
      if (!lat || !lng) continue
      const key = `${(+lat).toFixed(2)},${(+lng).toFixed(2)}`
      if (!grid[key]) grid[key] = { lat: +parseFloat(lat).toFixed(2), lng: +parseFloat(lng).toFixed(2), weight: 0 }
      grid[key].weight++
    }
    res.json(Object.values(grid))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ─── Lost & Found endpoints ───────────────────────────────────────────────
app.post('/api/lost-items', authMiddleware, async (req, res) => {
  const { rideId, description } = req.body
  if (!description?.trim()) return res.status(400).json({ message: 'Description required' })
  try {
    const ride = await Ride.findOne({ id: rideId, clientId: req.user.id, status: 'completed' })
    if (!ride) return res.status(404).json({ message: 'Completed ride not found' })
    if (!ride.driverId) return res.status(400).json({ message: 'No driver on this ride' })
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    const item = await LostItem.create({
      id: uuid(), rideId, clientId: req.user.id, driverId: ride.driverId,
      description: description.trim(), status: 'open', expiresAt,
    })
    const driverSocketId = onlineUsers.get(ride.driverId)
    if (driverSocketId) io.to(driverSocketId).emit('lostItem:new', item.toObject())
    const driver = await User.findOne({ id: ride.driverId })
    if (driver?.fcmToken) sendPush(driver.fcmToken, 'Lost Item Report', `A passenger reported a lost item: ${description.slice(0, 60)}`)
    logActivity('system', 'info', `Lost item reported — Ride #${rideId.slice(0, 8)}: ${description.slice(0, 60)}`, { userId: req.user.id })
    res.json(item)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/lost-items', authMiddleware, async (req, res) => {
  try {
    const query = req.user.role === 'admin'
      ? {}
      : { $or: [{ clientId: req.user.id }, { driverId: req.user.id }] }
    const items = await LostItem.find(query).sort({ createdAt: -1 })
    res.json(items)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.patch('/api/lost-items/:id', authMiddleware, async (req, res) => {
  const { status } = req.body
  try {
    const item = await LostItem.findOne({ id: req.params.id })
    if (!item) return res.status(404).json({ message: 'Not found' })
    if (item.clientId !== req.user.id && item.driverId !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Not authorised' })
    const updated = await LostItem.findOneAndUpdate({ id: req.params.id }, { status }, { new: true })
    const otherId = req.user.id === item.clientId ? item.driverId : item.clientId
    const otherSocket = onlineUsers.get(otherId)
    if (otherSocket) io.to(otherSocket).emit('lostItem:updated', updated.toObject())
    res.json(updated)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/lost-items/:id/message', authMiddleware, async (req, res) => {
  const { text } = req.body
  if (!text?.trim()) return res.status(400).json({ message: 'Message required' })
  try {
    const item = await LostItem.findOne({ id: req.params.id })
    if (!item) return res.status(404).json({ message: 'Not found' })
    if (item.clientId !== req.user.id && item.driverId !== req.user.id)
      return res.status(403).json({ message: 'Not authorised' })
    if (item.status === 'closed' || new Date(item.expiresAt) < new Date())
      return res.status(400).json({ message: 'This channel has expired' })
    const msg = { id: uuid(), senderId: req.user.id, text: text.trim(), timestamp: new Date().toISOString() }
    const updated = await LostItem.findOneAndUpdate(
      { id: req.params.id }, { $push: { messages: msg } }, { new: true }
    )
    const otherId = req.user.id === item.clientId ? item.driverId : item.clientId
    const otherSocket = onlineUsers.get(otherId)
    if (otherSocket) io.to(otherSocket).emit('lostItem:message', updated.toObject())
    res.json(updated)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ─── Cashout endpoints ────────────────────────────────────────────────────
app.post('/api/drivers/cashout', authMiddleware, async (req, res) => {
  if (req.user.role !== 'driver') return res.status(403).json({ message: 'Drivers only' })
  const { amount, method, phone } = req.body
  if (!amount || amount <= 0) return res.status(400).json({ message: 'Invalid amount' })
  if (!method || !['ecocash', 'bank'].includes(method)) return res.status(400).json({ message: 'Invalid method' })
  try {
    const driver = await User.findOne({ id: req.user.id })
    const driverRides = await Ride.find({ driverId: req.user.id, status: 'completed' })
    const totalEarnings = driverRides.reduce((s, r) => s + (r.fare || 0), 0)
    const settled = await Payout.find({ driverId: req.user.id, status: { $in: ['approved', 'paid'] } })
    const totalSettled = settled.reduce((s, p) => s + p.amount, 0)
    const available = +(totalEarnings - totalSettled).toFixed(2)
    if (amount > available) return res.status(400).json({ message: `Insufficient balance. Available: $${available.toFixed(2)}` })
    const existing = await Payout.findOne({ driverId: req.user.id, status: 'pending' })
    if (existing) return res.status(400).json({ message: 'You already have a pending cashout request.' })
    const payout = await Payout.create({
      id: uuid(), driverId: req.user.id,
      driverName: driver?.fullName || driver?.name,
      driverPhone: driver?.phone,
      amount, method, phone, status: 'pending',
      requestedAt: new Date().toISOString(),
    })
    io.to('admins').emit('cashout:new', payout.toObject())
    logActivity('payment', 'info', `Cashout request — ${payout.driverName}: $${amount} via ${method}`, { userId: req.user.id })
    res.json(payout)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/drivers/cashouts', authMiddleware, async (req, res) => {
  if (req.user.role !== 'driver') return res.status(403).json({ message: 'Drivers only' })
  try {
    const payouts = await Payout.find({ driverId: req.user.id }).sort({ requestedAt: -1 })
    res.json(payouts)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/admin/cashouts', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' })
  try {
    const payouts = await Payout.find().sort({ requestedAt: -1 })
    res.json(payouts)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.patch('/api/admin/cashouts/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' })
  const { status, rejectionReason, notes } = req.body
  try {
    const payout = await Payout.findOneAndUpdate(
      { id: req.params.id },
      { status, rejectionReason, notes, processedAt: new Date().toISOString(), processedBy: req.user.id },
      { new: true }
    )
    if (!payout) return res.status(404).json({ message: 'Payout not found' })
    const driverSocketId = onlineUsers.get(payout.driverId)
    if (driverSocketId) io.to(driverSocketId).emit('cashout:updated', payout.toObject())
    logActivity('payment', status === 'rejected' ? 'warning' : 'info',
      `Cashout ${status} — ${payout.driverName}: $${payout.amount}`, { userId: req.user.id })
    res.json(payout)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ─── Fuel price endpoints (petrol + diesel) ───────────────────────────────
// Shape:  { petrol: { price, base, multiplier }, diesel: { price, base, multiplier } }
// Legacy fuelPrice/baseFuelPrice fields are also returned for pre-dual-fuel clients.
function fuelResponse(cfg) {
  const petrol = {
    price: cfg.petrolPrice ?? cfg.fuelPrice ?? 1.65,
    base:  cfg.basePetrolPrice ?? cfg.baseFuelPrice ?? 1.65,
  }
  petrol.multiplier = +(petrol.price / petrol.base).toFixed(4)

  const diesel = {
    price: cfg.dieselPrice ?? cfg.fuelPrice ?? 1.85,
    base:  cfg.baseDieselPrice ?? cfg.baseFuelPrice ?? 1.85,
  }
  diesel.multiplier = +(diesel.price / diesel.base).toFixed(4)

  // Legacy fields — defaults to petrol so old clients see petrol prices
  return {
    petrol, diesel,
    fuelPrice: petrol.price,
    baseFuelPrice: petrol.base,
    multiplier: petrol.multiplier,
  }
}

// Public: any authenticated user can read current fuel prices + multipliers
app.get('/api/config/fuel-price', authMiddleware, async (req, res) => {
  try {
    const cfg = (await AppConfig.findOne()) || {}
    res.json(fuelResponse(cfg))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Admin: update petrol and/or diesel prices
// Body: { petrolPrice?, dieselPrice? } — either or both; legacy { fuelPrice } also accepted (treated as petrol)
app.patch('/api/admin/fuel-price', adminMiddleware, async (req, res) => {
  try {
    const b = req.body || {}
    const petrolPrice = b.petrolPrice != null ? parseFloat(b.petrolPrice)
                      : b.fuelPrice    != null ? parseFloat(b.fuelPrice)
                      : null
    const dieselPrice = b.dieselPrice != null ? parseFloat(b.dieselPrice) : null

    if (petrolPrice == null && dieselPrice == null) {
      return res.status(400).json({ message: 'Provide petrolPrice and/or dieselPrice' })
    }
    if (petrolPrice != null && (!Number.isFinite(petrolPrice) || petrolPrice <= 0)) {
      return res.status(400).json({ message: 'petrolPrice must be a positive number' })
    }
    if (dieselPrice != null && (!Number.isFinite(dieselPrice) || dieselPrice <= 0)) {
      return res.status(400).json({ message: 'dieselPrice must be a positive number' })
    }

    const update = { updatedAt: new Date(), updatedBy: req.user.id }
    if (petrolPrice != null) { update.petrolPrice = petrolPrice; update.fuelPrice = petrolPrice }
    if (dieselPrice != null) { update.dieselPrice = dieselPrice }

    const cfg = await AppConfig.findOneAndUpdate({}, update, { new: true, upsert: true })
    const resp = fuelResponse(cfg)

    const changes = [
      petrolPrice != null ? `petrol $${petrolPrice.toFixed(2)}/L (×${resp.petrol.multiplier.toFixed(3)})` : null,
      dieselPrice != null ? `diesel $${dieselPrice.toFixed(2)}/L (×${resp.diesel.multiplier.toFixed(3)})` : null,
    ].filter(Boolean).join(', ')
    logActivity('system', 'info', `Fuel prices updated — ${changes}`, { userName: 'Admin' })
    res.json(resp)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ─── Admin wallet management ──────────────────────────────────────────────
// List all driver wallets with user info + last txn timestamp. For the admin
// Wallets tab — searchable, sortable in the UI.
app.get('/api/admin/wallets', adminMiddleware, async (req, res) => {
  try {
    const wallets = await DriverWallet.find().lean()
    const driverIds = wallets.map(w => w.driverId)
    const users = await User.find({ id: { $in: driverIds } }, { id: 1, fullName: 1, name: 1, phone: 1, email: 1, accountStatus: 1 }).lean()
    const byId = new Map(users.map(u => [u.id, u]))

    const out = wallets.map(w => {
      const u = byId.get(w.driverId) || {}
      return {
        driverId:    w.driverId,
        driverName:  u.fullName || u.name || 'Unknown',
        phone:       u.phone || '',
        email:       u.email || '',
        status:      u.accountStatus || 'unknown',
        balance:     w.balance,
        heldBalance: w.heldBalance,
        total:       w.balance + w.heldBalance,
        lastTopUpAt: w.lastTopUpAt || null,
      }
    }).sort((a, b) => b.balance - a.balance)

    res.json(out)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Single driver wallet with recent transactions
app.get('/api/admin/wallets/:driverId', adminMiddleware, async (req, res) => {
  try {
    const { driverId } = req.params
    const [balance, recent, user] = await Promise.all([
      walletService.getBalance(driverId),
      walletService.listRecentTxns(driverId, 50),
      User.findOne({ id: driverId }, { id: 1, fullName: 1, name: 1, phone: 1, email: 1, accountStatus: 1 }).lean(),
    ])
    if (!user) return res.status(404).json({ error: 'DRIVER_NOT_FOUND' })
    res.json({
      driverId,
      driverName: user.fullName || user.name || 'Unknown',
      phone: user.phone, email: user.email, status: user.accountStatus,
      ...balance,
      transactions: recent,
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Admin manual credit/debit. Positive delta credits, negative debits.
// Reason is required so the ledger is auditable (bank-deposit confirmations,
// refunds for fraud, corrections, etc.).
app.post('/api/admin/wallets/:driverId/adjust', adminMiddleware, async (req, res) => {
  try {
    const { driverId } = req.params
    const delta  = parseFloat(req.body.delta)
    const reason = String(req.body.reason || '').trim()

    if (!Number.isFinite(delta) || delta === 0)
      return res.status(400).json({ error: 'delta must be a non-zero number' })
    if (!reason)
      return res.status(400).json({ error: 'reason is required' })
    if (Math.abs(delta) > 1000)
      return res.status(400).json({ error: 'Single adjustment limited to $1000' })

    const user = await User.findOne({ id: driverId })
    if (!user) return res.status(404).json({ error: 'DRIVER_NOT_FOUND' })

    await walletService.adminAdjust(driverId, delta, {
      reference: `ADMIN-${req.user.id}-${Date.now()}`,
      metadata:  { adminId: req.user.id, adminName: req.user.fullName || req.user.name, reason },
    })

    const fresh = await walletService.getBalance(driverId)
    logActivity('account', 'warning',
      `Wallet adjusted ${delta >= 0 ? '+' : ''}$${delta.toFixed(2)} for ${user.fullName || user.name} — ${reason}`,
      { userId: driverId, userName: user.fullName || user.name })
    res.json({ ...fresh, delta, reason })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Commission config read/write. Pct values are 0..1 (e.g. 0.08 = 8%).
app.get('/api/admin/commission', adminMiddleware, async (req, res) => {
  try {
    const cfg = (await AppConfig.findOne()) || {}
    res.json({
      default: cfg.commissionPctDefault ?? 0.08,
      min:     cfg.commissionPctMin     ?? 0.06,
      max:     cfg.commissionPctMax     ?? 0.12,
      walletMinBalance: cfg.walletMinBalanceUsd ?? 1.00,
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.patch('/api/admin/commission', adminMiddleware, async (req, res) => {
  try {
    const b = req.body || {}
    const update = {}
    const bounded = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi
    if (b.default != null) {
      const n = parseFloat(b.default)
      if (!bounded(n, 0, 0.3)) return res.status(400).json({ error: 'default must be between 0 and 0.30' })
      update.commissionPctDefault = n
    }
    if (b.min != null) {
      const n = parseFloat(b.min)
      if (!bounded(n, 0, 0.3)) return res.status(400).json({ error: 'min must be between 0 and 0.30' })
      update.commissionPctMin = n
    }
    if (b.max != null) {
      const n = parseFloat(b.max)
      if (!bounded(n, 0, 0.3)) return res.status(400).json({ error: 'max must be between 0 and 0.30' })
      update.commissionPctMax = n
    }
    if (b.walletMinBalance != null) {
      const n = parseFloat(b.walletMinBalance)
      if (!bounded(n, 0, 50)) return res.status(400).json({ error: 'walletMinBalance must be between 0 and 50' })
      update.walletMinBalanceUsd = n
    }
    if (Object.keys(update).length === 0)
      return res.status(400).json({ error: 'No valid fields to update' })

    const cfg = await AppConfig.findOneAndUpdate({}, update, { new: true, upsert: true })
    logActivity('system', 'info',
      `Commission config updated — ${Object.entries(update).map(([k, v]) => `${k}=${v}`).join(', ')}`,
      { userName: 'Admin' })
    res.json({
      default: cfg.commissionPctDefault ?? 0.08,
      min:     cfg.commissionPctMin     ?? 0.06,
      max:     cfg.commissionPctMax     ?? 0.12,
      walletMinBalance: cfg.walletMinBalanceUsd ?? 1.00,
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ─── WhatsApp webhook (Africa's Talking) ─────────────────────────────────
app.post('/api/whatsapp/webhook', webhookLimiter, (req, res) => {
  res.sendStatus(200)  // respond immediately — AT expects 200 within 5s
  const { from, text } = req.body || {}
  if (!from || !text) return
  handleIncoming(from, text, io, onlineUsers).catch(err =>
    console.error('[WA webhook]', err.message)
  )
})

// ─── TURN config endpoint (for client) ────────────────────────────────────
app.get('/api/turn-config', authMiddleware, (req, res) => {
  res.json({
    urls:       (process.env.TURN_URLS || 'stun:stun.l.google.com:19302').split(','),
    username:   process.env.TURN_USERNAME   || '',
    credential: process.env.TURN_CREDENTIAL || '',
  })
})

// ─── Socket.io ─────────────────────────────────────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth?.token
  if (!token) return next(new Error('No token'))
  try { socket.user = jwt.verify(token, JWT_SECRET); next() }
  catch { next(new Error('Invalid token')) }
})

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id)

  socket.on('user:online', async () => {
    // Always use JWT-verified identity — never trust client-supplied userId/role
    const userId = socket.user.id
    const role   = socket.user.role
    const u = await User.findOne({ id: userId })
    if (u?.accountStatus === 'frozen') {
      socket.emit('account:suspended', { reason: u.frozenReason || 'Account frozen' }); return
    }
    if (u?.accountStatus === 'deleted') {
      socket.emit('account:suspended', { reason: 'Account deleted' }); return
    }
    onlineUsers.set(userId, socket.id)
    socket.userId = userId
    socket.userRole = role
    socket.join(`user:${userId}`)
    if (role === 'driver') { socket.join('drivers'); driverSockets.set(userId, socket.id) }
    if (role === 'admin')  socket.join('admins')
    io.emit('users:online', Array.from(onlineUsers.keys()))
    io.to('admins').emit('admin:user_online', { userId, role })
  })

  // ride:request via socket is only for corporate dashboard (no REST call).
  // Riders use POST /api/rides/request (REST) which already calls emitRideToNearbyDrivers.
  // We upsert here to avoid duplicate DB records if a ride id already exists.
  socket.on('ride:request', async (ride) => {
    try {
      const existing = await Ride.findOne({ id: ride.id })
      if (existing) { emitRideToNearbyDrivers(existing.toObject()); return }
      // Force clientId from verified socket identity — never trust client payload
      const newRide = await Ride.create({ ...ride, id: ride.id || uuid(), clientId: socket.user.id })
      emitRideToNearbyDrivers(newRide.toObject())
      io.to('admins').emit('admin:ride_update', newRide.toObject())
      logActivity('ride', 'info', `New ride requested — ${ride.pickupAddress} → ${ride.dropoffAddress}`, { userId: socket.user.id })
    } catch (err) { console.error('ride:request error:', err) }
  })

  socket.on('ride:accept', async ({ rideId }) => {
    const driverId = socket.user.id  // enforce server-side identity
    try {
      const ride = await Ride.findOneAndUpdate({ id: rideId }, { driverId, status: 'accepted' }, { new: true })
      if (!ride) return
      const clientSocket = onlineUsers.get(ride.clientId)
      if (clientSocket) io.to(clientSocket).emit('ride:accepted', ride.toObject())
      socket.emit('ride:accepted', ride.toObject())
      io.to('admins').emit('admin:ride_update', ride.toObject())
      // Push + WA notification to client
      const client = await User.findOne({ id: ride.clientId })
      if (client?.fcmToken) {
        const driver = await User.findOne({ id: driverId })
        sendPush(client.fcmToken, 'Driver found!', `${driver?.fullName || 'Your driver'} is on the way`)
      }
      notifyDriverAccepted(rideId).catch(() => {})
    } catch (err) { console.error('ride:accept error:', err) }
  })

  socket.on('ride:update', async ({ rideId, status, fare, distance, duration }) => {
    const driverId = socket.user.id  // enforce server-side identity
    try {
      const update = { status }
      if (fare     != null) update.fare     = fare
      if (distance != null) update.distance = distance
      if (duration != null) update.duration = duration
      if (status === 'completed') update.completedAt = new Date().toISOString()
      const ride = await Ride.findOneAndUpdate({ id: rideId }, update, { new: true })
      if (!ride) return
      const clientSocket = onlineUsers.get(ride.clientId)
      if (clientSocket) io.to(clientSocket).emit('ride:status', ride.toObject())
      socket.emit('ride:status', ride.toObject())
      io.to('admins').emit('admin:ride_update', ride.toObject())
      // Push + WA notification on completion
      if (status === 'completed') {
        const client = await User.findOne({ id: ride.clientId })
        if (client?.fcmToken) sendPush(client.fcmToken, 'Ride completed', `Fare: $${ride.fare || '–'}`)
        notifyRideCompleted(rideId).catch(() => {})
      }
    } catch (err) { console.error('ride:update error:', err) }
  })

  socket.on('message:send', async (msg) => {
    try {
      await Message.create({ id: msg.id || uuid(), ...msg })
      const recipientSocket = onlineUsers.get(msg.receiverId)
      if (recipientSocket) io.to(recipientSocket).emit('message:receive', msg)
    } catch (err) { console.error('message:send error:', err) }
  })

  socket.on('location:share', async ({ rideId, coords }) => {
    const userId = socket.user.id
    if (socket.userRole === 'driver' && coords) driverCoords.set(userId, coords)
    try {
      const ride = await Ride.findOne({ id: rideId })
      if (!ride) return
      const otherUserId  = userId === ride.driverId ? ride.clientId : ride.driverId
      const otherSocket  = onlineUsers.get(otherUserId)
      if (otherSocket) io.to(otherSocket).emit('location:driver', coords)
    } catch { /* non-fatal */ }
  })

  socket.on('call:initiate', ({ to, from, fromName, type }) => {
    const toSocket = onlineUsers.get(to)
    if (toSocket) io.to(toSocket).emit('call:incoming', { from, fromName, type, signal: null })
  })

  socket.on('call:signal', ({ signal, to }) => {
    const toSocket = onlineUsers.get(to)
    if (toSocket) io.to(toSocket).emit('call:signal', { signal })
  })

  socket.on('call:answer', ({ signal, to }) => {
    const toSocket = onlineUsers.get(to)
    if (toSocket) io.to(toSocket).emit('call:answered', { signal })
  })

  socket.on('call:end', ({ userId }) => {
    const socketId = onlineUsers.get(userId)
    if (socketId) io.to(socketId).emit('call:ended')
  })

  socket.on('returnBid:offer', async ({ rideId, proposedFare }) => {
    const driverId = socket.user.id
    try {
      const ride = await Ride.findOne({ id: rideId, driverId, status: 'completed' })
      if (!ride) return
      const clientSocketId = onlineUsers.get(ride.clientId)
      if (!clientSocketId) return
      const driver = await User.findOne({ id: driverId })
      io.to(clientSocketId).emit('returnBid:received', {
        originalRideId: rideId,
        driverId,
        driverName:    driver?.fullName || driver?.name || 'Your driver',
        pickupAddress:  ride.dropoffAddress,
        dropoffAddress: ride.pickupAddress,
        pickupCoords:   ride.dropoffCoords  || null,
        dropoffCoords:  ride.pickupCoords   || null,
        proposedFare,
        paymentMethod:  ride.paymentMethod,
      })
    } catch (err) { console.error('returnBid:offer error:', err) }
  })

  socket.on('disconnect', () => {
    if (socket.userId) {
      onlineUsers.delete(socket.userId)
      driverSockets.delete(socket.userId)
      driverCoords.delete(socket.userId)
      io.emit('users:online', Array.from(onlineUsers.keys()))
    }
    console.log('Socket disconnected:', socket.id)
  })
})

// ─── Scheduled rides dispatcher ───────────────────────────────────────────
setInterval(async () => {
  try {
    const due = await Ride.find({ status: 'scheduled', scheduledFor: { $lte: new Date().toISOString() } })
    for (const ride of due) {
      await Ride.findOneAndUpdate({ id: ride.id }, { status: 'searching' })
      const updated = { ...ride.toObject(), status: 'searching' }
      emitRideToNearbyDrivers(updated)
      const cs = onlineUsers.get(ride.clientId)
      if (cs) io.to(cs).emit('ride:status', updated)
      io.to('admins').emit('admin:ride_update', updated)
      logActivity('ride', 'info', `Scheduled ride dispatched — ${ride.pickupAddress} → ${ride.dropoffAddress}`, { userId: ride.clientId })
    }
  } catch { /* non-fatal */ }
}, 60000)

// ─── Bid expiry sweep ─────────────────────────────────────────────────────
// Mongo TTL deletes expired bids eventually (up to 60s delay). We also run a
// 15 s sweep so passenger/driver UIs get the `bid:expired` push promptly.
setInterval(async () => {
  try {
    const expired = await bidService.expireStaleBids()
    for (const bid of expired) {
      const cs = onlineUsers.get(bid.clientId)
      if (cs) io.to(cs).emit('bid:expired', { bidId: bid.id })
      io.to('drivers').emit('bid:expired', { bidId: bid.id })
    }
  } catch (err) { logger.warn('[bid sweep] ' + err.message) }
}, 15000)

// ─── Serve built frontend (production) ────────────────────────────────────
const path = require('path')
const clientDist = path.join(__dirname, '../../client/dist')
app.use(express.static(clientDist))
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'))
})

// ─── Global crash guards ──────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  captureException(reason instanceof Error ? reason : new Error(String(reason)), { source: 'unhandledRejection' })
})
process.on('uncaughtException', (err) => {
  captureException(err, { source: 'uncaughtException', fatal: true })
  // Give logger time to flush, then exit so the process manager can restart
  setTimeout(() => process.exit(1), 500)
})

// ─── Start ─────────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  logger.info(`EasyRide server running on port ${PORT}`)
})
