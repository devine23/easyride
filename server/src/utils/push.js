let admin = null
let messaging = null

function getMessaging() {
  if (messaging) return messaging
  if (!admin) {
    admin = require('firebase-admin')
    if (!admin.getApps().length) {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT
      if (!raw) {
        console.warn('[push] FIREBASE_SERVICE_ACCOUNT not set — push notifications disabled')
        admin = null
        return null
      }
      // firebase-admin v14: cert is top-level (was admin.credential.cert in v11)
      const cert = admin.cert || (admin.credential && admin.credential.cert)
      admin.initializeApp({ credential: cert(JSON.parse(raw)) })
    }
  }
  const { getMessaging: getMsg } = require('firebase-admin/messaging')
  messaging = getMsg()
  return messaging
}

async function sendPush(fcmToken, title, body, data = {}) {
  const m = getMessaging()
  if (!m || !fcmToken) return
  try {
    await m.send({ token: fcmToken, notification: { title, body }, data })
  } catch (err) {
    console.error('[push] send error:', err.message)
  }
}

module.exports = { sendPush }
