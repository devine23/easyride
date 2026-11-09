const axios = require('axios')

const AT_WA_URL = 'https://chat.africastalking.com/whatsapp/v1/messages'

async function sendWA(to, message) {
  const phone = to.startsWith('+') ? to : `+${to}`

  if (!process.env.AT_API_KEY || !process.env.AT_WA_NUMBER) {
    console.log(`[WA sandbox] ➜ ${phone}\n${message}\n${'─'.repeat(40)}`)
    return
  }

  try {
    await axios.post(
      AT_WA_URL,
      {
        productName: process.env.AT_WA_PRODUCT || 'EasyRide',
        channel:     'whatsapp',
        from:        process.env.AT_WA_NUMBER,
        to:          phone,
        message,
      },
      {
        headers: {
          apiKey:           process.env.AT_API_KEY,
          username:         process.env.AT_USERNAME || 'sandbox',
          'Content-Type':   'application/json',
          Accept:           'application/json',
        },
        timeout: 8000,
      }
    )
  } catch (err) {
    console.error('[WA send error]', err.response?.data || err.message)
  }
}

module.exports = { sendWA }
