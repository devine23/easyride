import * as XLSX from 'xlsx'
import { Ride, User, Voucher, Payout } from '../types'

function saveWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename)
}

function fmt(isoDate?: string) {
  if (!isoDate) return '—'
  return new Date(isoDate).toLocaleString('en-ZW', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtDate(isoDate?: string) {
  if (!isoDate) return '—'
  return new Date(isoDate).toLocaleDateString('en-ZW', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ── Admin: full ride report ────────────────────────────────────────────────────
export function exportAdminRides(rides: Ride[], users: User[]) {
  const userMap = Object.fromEntries(users.map(u => [u.id, u.fullName || u.name || u.id]))

  const rows = rides.map(r => ({
    'Ride ID':          r.id.slice(0, 8).toUpperCase(),
    'Date & Time':      fmt(r.createdAt),
    'Client':           userMap[r.clientId] || r.clientId,
    'Driver':           r.driverId ? (userMap[r.driverId] || r.driverId) : '—',
    'Pickup Address':   r.pickupAddress,
    'Dropoff Address':  r.dropoffAddress,
    'Vehicle Category': r.vehicleCategory || '—',
    'Payment Method':   r.paymentMethod,
    'Fare (USD)':       r.fare ?? '—',
    'Distance (km)':    r.distance ?? '—',
    'Duration (min)':   r.duration ?? '—',
    'Status':           r.status,
    'Employee':         r.employeeName || '—',
    'Department':       r.departmentCode || '—',
    'Cost Center':      r.costCenter || '—',
    'Voucher No.':      r.voucherId || '—',
    'Waiting Charge':   r.waitingCharge ?? '—',
    'Cancel Reason':    r.cancelReason || '—',
    'Completed At':     r.completedAt ? fmt(r.completedAt) : '—',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)

  // Column widths
  ws['!cols'] = [
    { wch: 12 }, { wch: 20 }, { wch: 22 }, { wch: 22 },
    { wch: 28 }, { wch: 28 }, { wch: 16 }, { wch: 15 },
    { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
    { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 20 }, { wch: 20 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Rides')

  // Summary sheet
  const completed = rides.filter(r => r.status === 'completed')
  const totalRevenue = completed.reduce((s, r) => s + (r.fare || 0), 0)
  const summary = [
    { Metric: 'Export Date',        Value: new Date().toLocaleString('en-ZW') },
    { Metric: 'Total Rides',        Value: rides.length },
    { Metric: 'Completed',          Value: completed.length },
    { Metric: 'Cancelled',          Value: rides.filter(r => r.status === 'cancelled').length },
    { Metric: 'In Progress',        Value: rides.filter(r => !['completed', 'cancelled'].includes(r.status)).length },
    { Metric: 'Total Revenue (USD)', Value: totalRevenue.toFixed(2) },
    { Metric: 'Voucher Rides',      Value: rides.filter(r => r.paymentMethod === 'voucher').length },
    { Metric: 'EcoCash Rides',      Value: rides.filter(r => r.paymentMethod === 'ecocash').length },
    { Metric: 'Cash Rides',         Value: rides.filter(r => ['cash', 'cash_usd', 'cash_zig'].includes(r.paymentMethod)).length },
  ]
  const wsSummary = XLSX.utils.json_to_sheet(summary)
  wsSummary['!cols'] = [{ wch: 24 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')

  const today = new Date().toISOString().slice(0, 10)
  saveWorkbook(wb, `EasyRide_Rides_${today}.xlsx`)
}

// ── Admin: full operational report (drivers, revenue, vehicles, routes, contacts) ──
export function exportAdminFullReport(opts: {
  users:    User[]
  rides:    Ride[]
  payouts?: Payout[]
}) {
  const { users, rides, payouts = [] } = opts
  const drivers = users.filter(u => u.role === 'driver')
  const riders  = users.filter(u => u.role === 'rider')
  const completed = rides.filter(r => r.status === 'completed')
  const totalRevenue = completed.reduce((s, r) => s + (r.fare || 0), 0)

  const wb = XLSX.utils.book_new()

  // ─── Sheet 1: Drivers (contact + account) ────────────────────────────
  const driverRows = drivers.map(d => {
    const driverRides = rides.filter(r => r.driverId === d.id && r.status === 'completed')
    const earnings    = driverRides.reduce((s, r) => s + (r.fare || 0), 0)
    const paidOut     = payouts.filter(p => p.driverId === d.id && ['approved', 'paid'].includes(p.status))
                               .reduce((s, p) => s + p.amount, 0)
    return {
      'Driver ID':         d.id.slice(0, 8).toUpperCase(),
      'Full Name':         d.fullName || d.name || '',
      'Phone':             d.phone || '',
      'Email':             d.email || '—',
      'National ID':       d.driverDocuments?.nationalIdNumber || '—',
      'Date of Birth':     d.driverDocuments?.dateOfBirth || '—',
      'Address':           d.driverDocuments?.residentialAddress || '—',
      'Next of Kin':       d.driverDocuments?.nextOfKinName || '—',
      'Next of Kin Phone': d.driverDocuments?.nextOfKinPhone || '—',
      'Licence Number':    d.driverDocuments?.licenceNumber || '—',
      'Licence Class':     d.driverDocuments?.licenceClass || '—',
      'Licence Expiry':    fmtDate(d.driverDocuments?.licenceExpiry),
      'Verification':      d.verification?.status || '—',
      'Account Status':    d.accountStatus,
      'Rating':            d.rating ?? '—',
      'Rides Completed':   driverRides.length,
      'Total Earnings':    +earnings.toFixed(2),
      'Paid Out':          +paidOut.toFixed(2),
      'Pending Balance':   +(earnings - paidOut).toFixed(2),
      'Joined':            fmtDate(d.createdAt),
      'Last Seen':         fmt(d.lastSeen),
    }
  })
  const wsDrivers = XLSX.utils.json_to_sheet(driverRows)
  wsDrivers['!cols'] = [
    { wch: 12 }, { wch: 24 }, { wch: 16 }, { wch: 24 }, { wch: 16 },
    { wch: 12 }, { wch: 28 }, { wch: 20 }, { wch: 16 }, { wch: 14 },
    { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 8 },
    { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 18 },
  ]
  XLSX.utils.book_append_sheet(wb, wsDrivers, 'Drivers')

  // ─── Sheet 2: Vehicles ───────────────────────────────────────────────
  const vehicleRows = drivers
    .filter(d => d.vehicleDetails?.registration)
    .map(d => {
      const v = d.vehicleDetails!
      return {
        'Driver':             d.fullName || d.name || '',
        'Driver Phone':       d.phone || '',
        'Registration':       v.registration,
        'Make':               v.make,
        'Model':              v.model,
        'Year':               v.year,
        'Colour':             v.colour,
        'Category':           v.category,
        'Fuel Type':          v.fuelType || ((v.category === 'SUV' || v.category === 'Tow Truck') ? 'diesel' : 'petrol'),
        'Seating Capacity':   v.seatingCapacity,
        'Insurance Type':     v.insuranceType,
        'Insurer':            v.insurer,
        'Insurance Expiry':   fmtDate(v.insuranceExpiry),
        'ZINARA Expiry':      fmtDate(v.zinaraExpiry),
        'COF Expiry':         fmtDate(v.cofExpiry),
      }
    })
  const wsVehicles = XLSX.utils.json_to_sheet(vehicleRows)
  wsVehicles['!cols'] = [
    { wch: 24 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
    { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
  ]
  XLSX.utils.book_append_sheet(wb, wsVehicles, 'Vehicles')

  // ─── Sheet 3: Revenue per driver ─────────────────────────────────────
  const revenueRows = drivers.map(d => {
    const driverRides = rides.filter(r => r.driverId === d.id && r.status === 'completed')
    const gross = driverRides.reduce((s, r) => s + (r.fare || 0), 0)
    const avg   = driverRides.length ? gross / driverRides.length : 0
    return {
      'Driver':           d.fullName || d.name || '',
      'Phone':            d.phone || '',
      'Registration':     d.vehicleDetails?.registration || '—',
      'Rides':            driverRides.length,
      'Gross (USD)':      +gross.toFixed(2),
      'Avg Fare (USD)':   +avg.toFixed(2),
      'Distance (km)':    +driverRides.reduce((s, r) => s + (r.distance || 0), 0).toFixed(1),
      'Driving Time (min)': +driverRides.reduce((s, r) => s + (r.duration || 0), 0).toFixed(0),
    }
  }).sort((a, b) => (b['Gross (USD)'] as number) - (a['Gross (USD)'] as number))
  const wsRevenue = XLSX.utils.json_to_sheet(revenueRows)
  wsRevenue['!cols'] = [
    { wch: 24 }, { wch: 16 }, { wch: 14 }, { wch: 8 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 },
  ]
  XLSX.utils.book_append_sheet(wb, wsRevenue, 'Revenue by Driver')

  // ─── Sheet 4: Routes / recent rides ──────────────────────────────────
  const userMap = Object.fromEntries(users.map(u => [u.id, u.fullName || u.name || u.id]))
  const phoneMap = Object.fromEntries(users.map(u => [u.id, u.phone || '']))
  const routeRows = rides.map(r => ({
    'Date & Time':      fmt(r.createdAt),
    'Ride ID':          r.id.slice(0, 8).toUpperCase(),
    'Status':           r.status,
    'Rider':            userMap[r.clientId] || r.clientId,
    'Rider Phone':      phoneMap[r.clientId] || '—',
    'Driver':           r.driverId ? (userMap[r.driverId] || r.driverId) : '—',
    'Driver Phone':     r.driverId ? (phoneMap[r.driverId] || '—') : '—',
    'Pickup':           r.pickupAddress,
    'Pickup Lat':       r.pickupCoords?.lat ?? '—',
    'Pickup Lng':       r.pickupCoords?.lng ?? '—',
    'Dropoff':          r.dropoffAddress,
    'Dropoff Lat':      r.dropoffCoords?.lat ?? '—',
    'Dropoff Lng':      r.dropoffCoords?.lng ?? '—',
    'Vehicle Category': r.vehicleCategory || '—',
    'Payment':          r.paymentMethod,
    'Distance (km)':    r.distance ?? '—',
    'Duration (min)':   r.duration ?? '—',
    'Fare (USD)':       r.fare ?? '—',
  }))
  const wsRoutes = XLSX.utils.json_to_sheet(routeRows)
  wsRoutes['!cols'] = [
    { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 16 },
    { wch: 20 }, { wch: 16 }, { wch: 32 }, { wch: 12 }, { wch: 12 },
    { wch: 32 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 },
  ]
  XLSX.utils.book_append_sheet(wb, wsRoutes, 'Routes')

  // ─── Sheet 5: Riders (contact directory) ─────────────────────────────
  const riderRows = riders.map(r => {
    const rCount = rides.filter(x => x.clientId === r.id).length
    return {
      'Full Name':      r.fullName || r.name || '',
      'Phone':          r.phone || '',
      'Email':          r.email || '—',
      'Emergency Name': r.riderProfile?.emergencyContactName || '—',
      'Emergency Phone':r.riderProfile?.emergencyContactPhone || '—',
      'Payment Pref':   r.riderProfile?.preferredPayment || '—',
      'Home Address':   r.riderProfile?.homeAddress || '—',
      'Account Status': r.accountStatus,
      'Total Rides':    rCount,
      'Joined':         fmtDate(r.createdAt),
    }
  })
  const wsRiders = XLSX.utils.json_to_sheet(riderRows)
  wsRiders['!cols'] = [
    { wch: 24 }, { wch: 16 }, { wch: 24 }, { wch: 20 }, { wch: 16 },
    { wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 14 },
  ]
  XLSX.utils.book_append_sheet(wb, wsRiders, 'Riders')

  // ─── Sheet 6: Summary ────────────────────────────────────────────────
  const summary = [
    { Metric: 'Export Date',             Value: new Date().toLocaleString('en-ZW') },
    { Metric: 'Total Drivers',           Value: drivers.length },
    { Metric: 'Verified Drivers',        Value: drivers.filter(d => d.verification?.status === 'approved').length },
    { Metric: 'Active Drivers',          Value: drivers.filter(d => d.accountStatus === 'active').length },
    { Metric: 'Total Riders',            Value: riders.length },
    { Metric: 'Total Rides',             Value: rides.length },
    { Metric: 'Completed Rides',         Value: completed.length },
    { Metric: 'Cancelled Rides',         Value: rides.filter(r => r.status === 'cancelled').length },
    { Metric: 'Total Revenue (USD)',     Value: +totalRevenue.toFixed(2) },
    { Metric: 'Avg Fare (USD)',          Value: completed.length ? +(totalRevenue / completed.length).toFixed(2) : 0 },
    { Metric: 'Total Payouts (USD)',     Value: +payouts.filter(p => ['approved', 'paid'].includes(p.status)).reduce((s, p) => s + p.amount, 0).toFixed(2) },
    { Metric: 'Pending Payouts (USD)',   Value: +payouts.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0).toFixed(2) },
    { Metric: 'EcoCash Rides',           Value: rides.filter(r => r.paymentMethod === 'ecocash').length },
    { Metric: 'Cash Rides',              Value: rides.filter(r => ['cash', 'cash_usd', 'cash_zig'].includes(r.paymentMethod as string)).length },
    { Metric: 'Voucher Rides',           Value: rides.filter(r => r.paymentMethod === 'voucher').length },
  ]
  const wsSummary = XLSX.utils.json_to_sheet(summary)
  wsSummary['!cols'] = [{ wch: 26 }, { wch: 22 }]
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')

  const today = new Date().toISOString().slice(0, 10)
  saveWorkbook(wb, `EasyRide_FullReport_${today}.xlsx`)
}

// ── Corporate: trip report with voucher columns ────────────────────────────────
export function exportCorporateRides(rides: Ride[], vouchers: Voucher[], companyName: string) {
  const voucherMap = Object.fromEntries(vouchers.map(v => [v.id, v]))

  const rows = rides.map(r => {
    const isVoucher = r.paymentMethod === 'voucher'
    const voucher   = r.voucherId ? voucherMap[r.voucherId] : undefined

    return {
      'Date':             fmtDate(r.createdAt),
      'Time':             r.createdAt ? new Date(r.createdAt).toLocaleTimeString('en-ZW', { hour: '2-digit', minute: '2-digit' }) : '—',
      'Employee Name':    r.employeeName || '—',
      'Department':       r.departmentCode || '—',
      'Cost Center':      r.costCenter || '—',
      'Pickup':           r.pickupAddress,
      'Dropoff':          r.dropoffAddress,
      'Payment Method':   r.paymentMethod,
      'Fare (USD)':       r.fare ?? '—',
      // Voucher-specific columns — empty for non-voucher rides
      'Voucher No.':      isVoucher ? (voucher?.voucherNo || r.voucherId || '—') : '',
      'Voucher Amount (USD)': isVoucher ? (r.fare ?? (voucher?.totalValue ?? '—')) : '',
      'Waiting Charge':   isVoucher ? (voucher?.waitingCharge ?? r.waitingCharge ?? '—') : '',
      'Authorised By':    isVoucher ? (voucher?.authorisedBy || '—') : '',
      'Cab No.':          voucher?.cabNo || '—',
      'Driver':           voucher?.driverName || '—',
      'Opening Mileage':  voucher?.openingMileage ?? '—',
      'Closing Mileage':  voucher?.closingMileage ?? '—',
      'Total Mileage (km)': voucher?.totalMileage ?? '—',
      'Status':           r.status,
    }
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 14 }, { wch: 10 }, { wch: 22 }, { wch: 16 }, { wch: 14 },
    { wch: 28 }, { wch: 28 }, { wch: 16 }, { wch: 12 },
    { wch: 14 }, { wch: 20 }, { wch: 15 }, { wch: 16 },
    { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 18 },
    { wch: 12 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Trip Report')

  // Voucher-only summary sheet
  const voucherRides = rides.filter(r => r.paymentMethod === 'voucher')
  const voucherTotal = voucherRides.reduce((s, r) => s + (r.fare || 0), 0)
  const summary = [
    { Metric: 'Company',             Value: companyName },
    { Metric: 'Export Date',         Value: new Date().toLocaleString('en-ZW') },
    { Metric: 'Total Trips',         Value: rides.length },
    { Metric: 'Completed Trips',     Value: rides.filter(r => r.status === 'completed').length },
    { Metric: 'Total Spend (USD)',    Value: rides.filter(r => r.status === 'completed').reduce((s, r) => s + (r.fare || 0), 0).toFixed(2) },
    { Metric: 'Voucher Trips',       Value: voucherRides.length },
    { Metric: 'Total Voucher Amount', Value: voucherTotal.toFixed(2) },
    { Metric: 'Cash Trips',          Value: rides.filter(r => ['cash', 'cash_usd'].includes(r.paymentMethod)).length },
    { Metric: 'EcoCash Trips',       Value: rides.filter(r => r.paymentMethod === 'ecocash').length },
  ]
  const wsSummary = XLSX.utils.json_to_sheet(summary)
  wsSummary['!cols'] = [{ wch: 26 }, { wch: 22 }]
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')

  const today = new Date().toISOString().slice(0, 10)
  saveWorkbook(wb, `${companyName.replace(/\s+/g, '_')}_TripReport_${today}.xlsx`)
}
