importScripts('https://www.gstatic.com/firebasejs/10.11.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.11.0/firebase-messaging-compat.js')

// Firebase web config. Public identifiers (safe to commit) — security is
// enforced by Firebase project rules, not by hiding these values.
// Service workers can't read import.meta.env, so these must be hardcoded.
const firebaseConfig = {
  apiKey:            'AIzaSyD8ThJ_zSrYgvHY0Dr1l_I1Z3ooTneR-WE',
  authDomain:        'easyride-61fce.firebaseapp.com',
  projectId:         'easyride-61fce',
  storageBucket:     'easyride-61fce.firebasestorage.app',
  messagingSenderId: '190475796426',
  appId:             '1:190475796426:web:5b3b03094cd62493a21933',
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
