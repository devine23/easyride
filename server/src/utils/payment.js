const Paynow = require('paynow')

function getPaynow() {
  return new Paynow(
    process.env.PAYNOW_INTEGRATION_ID  || '',
    process.env.PAYNOW_INTEGRATION_KEY || '',
  )
}

/**
 * Initiate a Paynow EcoCash (mobile money push) payment for a ride.
 */
async function initiateMobilePayment({ rideId, amount, phone, email }) {
  const paynow = getPaynow()
  paynow.resultUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/api/payments/paynow/result`
  paynow.returnUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/api/payments/paynow/return`

  const payment = paynow.createPayment(`Ride-${rideId}`, email || 'client@easyride.co.zw')
  payment.add(`EasyRide ride ${rideId}`, amount)

  const response = await paynow.sendMobile(payment, phone, 'ecocash')
  if (!response.success) throw new Error(response.error || 'Paynow initiation failed')

  return { pollUrl: response.pollUrl, instructions: response.instructions }
}

/**
 * Initiate a driver wallet top-up via Paynow. Supports two methods:
 *  - 'ecocash': mobile money push (phone required, user approves on handset)
 *  - 'paynow_web': hosted web checkout (returns redirectUrl; opens in browser)
 *
 * Reference format: `Wallet-<topUpId>` — distinguishes from ride payments in
 * the shared /paynow/result callback.
 */
async function initiateWalletTopUp({ topUpId, amount, method, phone, email }) {
  const paynow = getPaynow()
  paynow.resultUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/api/payments/paynow/result`
  paynow.returnUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/wallet?topUpId=${topUpId}`

  const payment = paynow.createPayment(`Wallet-${topUpId}`, email || 'driver@easyride.co.zw')
  payment.add(`EasyRide wallet top-up`, amount)

  if (method === 'ecocash') {
    if (!phone) throw new Error('phone required for EcoCash top-up')
    const response = await paynow.sendMobile(payment, phone, 'ecocash')
    if (!response.success) throw new Error(response.error || 'Paynow initiation failed')
    return { method: 'ecocash', pollUrl: response.pollUrl, instructions: response.instructions }
  }

  // paynow_web — full hosted checkout flow
  const response = await paynow.send(payment)
  if (!response.success) throw new Error(response.error || 'Paynow initiation failed')
  return { method: 'paynow_web', pollUrl: response.pollUrl, redirectUrl: response.redirectUrl }
}

async function pollStatus(pollUrl) {
  const paynow = getPaynow()
  const status = await paynow.pollTransaction(pollUrl)
  return { paid: status.paid, status: status.status }
}

module.exports = { initiateMobilePayment, initiateWalletTopUp, pollStatus }
