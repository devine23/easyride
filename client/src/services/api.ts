import axios from 'axios'

// In Capacitor (native app), relative URLs don't work — need an absolute server URL.
// Set VITE_SERVER_URL in .env.local for dev, or .env.android for APK builds.
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || ''

const api = axios.create({
  baseURL: SERVER_URL ? `${SERVER_URL}/api` : '/api',
  timeout: 15000,
})

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401 && window.location.pathname !== '/login') {
      localStorage.removeItem('eg_token')
      localStorage.removeItem('eg_user')
      window.location.href = '/login'
    }
    return Promise.reject(new Error(err.response?.data?.message || err.response?.data?.error || err.message || 'Network error — check your connection'))
  }
)

export default api
