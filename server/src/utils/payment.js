const Paynow = require('paynow')

function getPaynow() {
  return new Paynow(
    process.env.PAYNOW_INTEGRATION_ID  || '',
    process.env.PAYNOW_INTEGRATION_KEY || '',
  )
}

/**
 * Initiate a Paynow EcoCash payment.
 * Returns { success, pollUrl, instructions } or throws.
 */
async function initiateMobilePayment({ rideId, amount, phone, email }) {
  const paynow = getPaynow()
  paynow.resultUrl  = `${process.env.BASE_URL || 'http://localhost:3000'}/api/payments/paynow/result`
  paynow.returnUrl  = `${process.env.BASE_URL || 'http://localhost:3000'}/api/payments/paynow/return`

  const payment = paynow.createPayment(`Ride-${rideId}`, email || 'client@easyride.co.zw')
  payment.add(`EasyRide ride ${rideId}`, amount)

  const response = await paynow.sendMobile(payment, phone, 'ecocash')
  if (!response.success) throw new Error(response.error || 'Paynow initiation failed')

  return { pollUrl: response.pollUrl, instructions: response.instructions }
}

async function pollStatus(pollUrl) {
  const paynow = getPaynow()
  const status = await paynow.pollTransaction(pollUrl)
  return { paid: status.paid, status: status.status }
}

module.exports = { initiateMobilePayment, pollStatus }
