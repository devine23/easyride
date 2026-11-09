import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Ride, User, Payout } from '../types'

const BRAND = '#22c55e'
const DARK  = '#111827'
const GREY  = '#6b7280'

function pageHeader(doc: jsPDF, title: string, sub: string) {
  const w = doc.internal.pageSize.getWidth()
  doc.setFillColor(DARK)
  doc.rect(0, 0, w, 22, 'F')
  doc.setTextColor('#ffffff')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('EasyRide Zimbabwe', 10, 10)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(BRAND)
  doc.text(title, 10, 17)
  doc.setTextColor('#9ca3af')
  doc.setFontSize(8)
  doc.text(sub, w - 10, 10, { align: 'right' })
  doc.text(new Date().toLocaleString('en-ZW'), w - 10, 17, { align: 'right' })
  doc.setTextColor(DARK)
}

function pageFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages()
  const w = doc.internal.pageSize.getWidth()
  const h = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(GREY)
    doc.text(`Page ${i} of ${pageCount}`, w / 2, h - 6, { align: 'center' })
    doc.text('CONFIDENTIAL — EasyRide Admin Report', 10, h - 6)
  }
}

function fmtDate(iso?: string) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-ZW') } catch { return iso }
}

function fmtDateTime(iso?: string) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('en-ZW') } catch { return iso }
}

// ─── Full operational PDF report ─────────────────────────────────────────
export function exportAdminFullReportPdf(opts: {
  users:    User[]
  rides:    Ride[]
  payouts?: Payout[]
}) {
  const { users, rides, payouts = [] } = opts
  const drivers   = users.filter(u => u.role === 'driver')
  const riders    = users.filter(u => u.role === 'rider')
  const completed = rides.filter(r => r.status === 'completed')
  const totalRevenue = completed.reduce((s, r) => s + (r.fare || 0), 0)
  const userMap  = Object.fromEntries(users.map(u => [u.id, u.fullName || u.name || u.id]))
  const phoneMap = Object.fromEntries(users.map(u => [u.id, u.phone || '—']))

  const doc = new jsPDF('l', 'mm', 'a4')  // landscape — wide tables fit better

  // ─── Page 1: Executive Summary ─────────────────────────────────────────
  pageHeader(doc, 'Full Operational Report', 'Executive Summary')
  autoTable(doc, {
    startY: 30,
    head: [['Metric', 'Value']],
    body: [
      ['Total Drivers',           String(drivers.length)],
      ['Verified Drivers',        String(drivers.filter(d => d.verification?.status === 'approved').length)],
      ['Active Drivers',          String(drivers.filter(d => d.accountStatus === 'active').length)],
      ['Total Riders',            String(riders.length)],
      ['Total Rides',             String(rides.length)],
      ['Completed Rides',         String(completed.length)],
      ['Cancelled Rides',         String(rides.filter(r => r.status === 'cancelled').length)],
      ['Total Revenue (USD)',     `$${totalRevenue.toFixed(2)}`],
      ['Average Fare (USD)',      completed.length ? `$${(totalRevenue / completed.length).toFixed(2)}` : '$0.00'],
      ['Total Payouts (USD)',     `$${payouts.filter(p => ['approved', 'paid'].includes(p.status)).reduce((s, p) => s + p.amount, 0).toFixed(2)}`],
      ['Pending Payouts (USD)',   `$${payouts.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0).toFixed(2)}`],
    ],
    theme: 'grid',
    headStyles: { fillColor: BRAND, textColor: '#ffffff', fontStyle: 'bold' },
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 }, 1: { halign: 'right' } },
  })

  // ─── Page 2: Drivers ───────────────────────────────────────────────────
  doc.addPage('a4', 'l')
  pageHeader(doc, 'Drivers Directory', `${drivers.length} drivers · contact details and earnings`)
  autoTable(doc, {
    startY: 30,
    head: [['Name', 'Phone', 'Vehicle', 'Reg', 'Status', 'Rides', 'Earnings', 'Paid Out', 'Balance']],
    body: drivers.map(d => {
      const driverRides = rides.filter(r => r.driverId === d.id && r.status === 'completed')
      const earnings    = driverRides.reduce((s, r) => s + (r.fare || 0), 0)
      const paidOut     = payouts.filter(p => p.driverId === d.id && ['approved', 'paid'].includes(p.status))
                                 .reduce((s, p) => s + p.amount, 0)
      return [
        d.fullName || d.name || '—',
        d.phone || '—',
        d.vehicleDetails ? `${d.vehicleDetails.make} ${d.vehicleDetails.model}` : (d.vehicleModel || '—'),
        d.vehicleDetails?.registration || d.vehicleReg || '—',
        d.verification?.status || '—',
        String(driverRides.length),
        `$${earnings.toFixed(2)}`,
        `$${paidOut.toFixed(2)}`,
        `$${(earnings - paidOut).toFixed(2)}`,
      ]
    }),
    theme: 'striped',
    headStyles: { fillColor: BRAND, textColor: '#ffffff' },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      5: { halign: 'right' }, 6: { halign: 'right' },
      7: { halign: 'right' }, 8: { halign: 'right', fontStyle: 'bold' },
    },
  })

  // ─── Page 3+: All Transactions (Rides) ─────────────────────────────────
  doc.addPage('a4', 'l')
  pageHeader(doc, 'All Transactions', `${rides.length} rides across all statuses`)
  autoTable(doc, {
    startY: 30,
    head: [['Date', 'Ref', 'Status', 'Rider', 'Driver', 'From', 'To', 'Payment', 'Fare']],
    body: rides.map(r => [
      fmtDateTime(r.createdAt),
      r.id.slice(0, 8).toUpperCase(),
      r.status,
      userMap[r.clientId] || '—',
      r.driverId ? (userMap[r.driverId] || '—') : '—',
      r.pickupAddress || '—',
      r.dropoffAddress || '—',
      r.paymentMethod || '—',
      r.fare != null ? `$${r.fare.toFixed(2)}` : '—',
    ]),
    theme: 'striped',
    headStyles: { fillColor: BRAND, textColor: '#ffffff' },
    styles: { fontSize: 7, cellPadding: 1.5 },
    columnStyles: { 8: { halign: 'right', fontStyle: 'bold' } },
  })

  // ─── Last page: Revenue by Driver ──────────────────────────────────────
  doc.addPage('a4', 'l')
  pageHeader(doc, 'Revenue by Driver', 'Sorted by gross earnings')
  const revenueRows = drivers.map(d => {
    const dr = rides.filter(r => r.driverId === d.id && r.status === 'completed')
    const gross = dr.reduce((s, r) => s + (r.fare || 0), 0)
    const dist  = dr.reduce((s, r) => s + (r.distance || 0), 0)
    return { name: d.fullName || d.name || '—', phone: d.phone || '—', rides: dr.length, gross, dist }
  }).sort((a, b) => b.gross - a.gross)

  autoTable(doc, {
    startY: 30,
    head: [['Driver', 'Phone', 'Rides', 'Distance (km)', 'Gross (USD)', 'Avg Fare (USD)']],
    body: revenueRows.map(r => [
      r.name, r.phone, String(r.rides), r.dist.toFixed(1),
      `$${r.gross.toFixed(2)}`,
      r.rides ? `$${(r.gross / r.rides).toFixed(2)}` : '—',
    ]),
    theme: 'striped',
    headStyles: { fillColor: BRAND, textColor: '#ffffff' },
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      2: { halign: 'right' }, 3: { halign: 'right' },
      4: { halign: 'right', fontStyle: 'bold' }, 5: { halign: 'right' },
    },
  })

  pageFooter(doc)
  const today = new Date().toISOString().slice(0, 10)
  doc.save(`EasyRide_FullReport_${today}.pdf`)
}

// ─── Rides-only PDF (quick export from Rides tab) ────────────────────────
export function exportRidesPdf(rides: Ride[], users: User[]) {
  const userMap = Object.fromEntries(users.map(u => [u.id, u.fullName || u.name || u.id]))
  const doc = new jsPDF('l', 'mm', 'a4')
  pageHeader(doc, 'All Rides', `${rides.length} total · $${rides.filter(r => r.status === 'completed').reduce((s, r) => s + (r.fare || 0), 0).toFixed(2)} revenue`)
  autoTable(doc, {
    startY: 30,
    head: [['Date', 'Ref', 'Status', 'Rider', 'Driver', 'From', 'To', 'Vehicle', 'Payment', 'Fare']],
    body: rides.map(r => [
      fmtDateTime(r.createdAt),
      r.id.slice(0, 8).toUpperCase(),
      r.status,
      userMap[r.clientId] || '—',
      r.driverId ? (userMap[r.driverId] || '—') : '—',
      r.pickupAddress || '—',
      r.dropoffAddress || '—',
      r.vehicleCategory || '—',
      r.paymentMethod || '—',
      r.fare != null ? `$${r.fare.toFixed(2)}` : '—',
    ]),
    theme: 'striped',
    headStyles: { fillColor: BRAND, textColor: '#ffffff' },
    styles: { fontSize: 7, cellPadding: 1.5 },
    columnStyles: { 9: { halign: 'right', fontStyle: 'bold' } },
  })
  pageFooter(doc)
  doc.save(`EasyRide_Rides_${new Date().toISOString().slice(0, 10)}.pdf`)
}
