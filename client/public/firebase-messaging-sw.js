importScripts('https://www.gstatic.com/firebasejs/10.11.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.11.0/firebase-messaging-compat.js')

// Populated at build time via VITE env or set manually here
const firebaseConfig = {
  apiKey:            self.VITE_FIREBASE_API_KEY             || '',
  authDomain:        self.VITE_FIREBASE_AUTH_DOMAIN         || '',
  projectId:         self.VITE_FIREBASE_PROJECT_ID          || '',
  storageBucket:     self.VITE_FIREBASE_STORAGE_BUCKET      || '',
  messagingSenderId: self.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId:             self.VITE_FIREBASE_APP_ID              || '',
}

if (firebaseConfig.projectId) {
  firebase.initializeApp(firebaseConfig)
  const messaging = firebase.messaging()
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || 'EasyRide'
    const body  = payload.notification?.body  || ''
    self.registration.showNotification(title, { body, icon: '/favicon.svg' })
  })
}
