import { initializeApp, getApps, FirebaseApp } from 'firebase/app'
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging'
import api from '../services/api'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || '',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || '',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || '',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || '',
}

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || ''

let app: FirebaseApp | null   = null
let messaging: Messaging | null = null

function isConfigured(): boolean {
  return !!(firebaseConfig.projectId && firebaseConfig.apiKey)
}

function init() {
  if (!isConfigured()) return
  if (!app) app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
  try { messaging = getMessaging(app) } catch { /* service worker may be unavailable */ }
}

export async function registerFcmToken(): Promise<void> {
  init()
  if (!messaging || !VAPID_KEY) return
  try {
    const sw = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: sw })
    if (token) await api.patch('/auth/fcm-token', { fcmToken: token })
  } catch { /* non-critical — push will just not work */ }
}

export function listenForMessages(onNotification: (title: string, body: string) => void) {
  init()
  if (!messaging) return () => {}
  const unsub = onMessage(messaging, (payload) => {
    const title = payload.notification?.title || 'EasyRide'
    const body  = payload.notification?.body  || ''
    onNotification(title, body)
  })
  return unsub
}
