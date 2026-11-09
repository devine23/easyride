let admin = null

function getAdmin() {
  if (!admin) {
    admin = require('firebase-admin')
    if (!admin.apps.length) {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT
      if (raw) {
        admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) })
      } else {
        console.warn('[push] FIREBASE_SERVICE_ACCOUNT not set — push notifications disabled')
        admin = null
        return null
      }
    }
  }
  return admin
}

async function sendPush(fcmToken, title, body, data = {}) {
  const a = getAdmin()
  if (!a || !fcmToken) return
  try {
    await a.messaging().send({ token: fcmToken, notification: { title, body }, data })
  } catch (err) {
    console.error('[push] send error:', err.message)
  }
}

module.exports = { sendPush }
