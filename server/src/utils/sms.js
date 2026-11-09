const AfricasTalking = require('africastalking')

let smsClient = null

function getSms() {
  if (!smsClient) {
    const at = AfricasTalking({
      username: process.env.AT_USERNAME || 'sandbox',
      apiKey:   process.env.AT_API_KEY   || '',
    })
    smsClient = at.SMS
  }
  return smsClient
}

async function sendOtp(phone, code) {
  const message = `Your EasyRide verification code is: ${code}. Valid for 10 minutes.`
  if (!process.env.AT_API_KEY) {
    console.log(`[SMS sandbox] ${phone}: ${message}`)
    return
  }
  await getSms().send({ to: [phone], message, from: 'EasyRide' })
}

async function sendSms(to, message) {
  const recipients = Array.isArray(to) ? to : [to]
  if (!process.env.AT_API_KEY) {
    console.log(`[SMS sandbox] To: ${recipients.join(', ')}\n${message}`)
    return
  }
  await getSms().send({ to: recipients, message, from: 'EasyRide' })
}

module.exports = { sendOtp, sendSms }
