import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { User, AuthState } from '../types'
import api from '../services/api'
import { registerFcmToken } from '../utils/firebase'

interface AuthContextType extends AuthState {
  login: (phone: string, password: string) => Promise<void>;
  register: (data: Record<string, unknown>) => Promise<void>;
  logout: () => void;
  updateUser: (u: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null)

function extractMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const axiosMsg = (err as { response?: { data?: { message?: string } } }).response?.data?.message
    if (axiosMsg) return axiosMsg
    const msg = (err as { message?: string }).message
    if (msg) return msg
  }
  return fallback
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null, token: null, isAuthenticated: false, isLoading: true
  })

  useEffect(() => {
    const token = localStorage.getItem('eg_token')
    if (!token) { setState(s => ({ ...s, isLoading: false })); return }
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    api.get('/auth/me')
      .then(res => {
        const user = res.data
        localStorage.setItem('eg_user', JSON.stringify(user))
        setState({ user, token, isAuthenticated: true, isLoading: false })
      })
      .catch(() => {
        localStorage.removeItem('eg_token')
        localStorage.removeItem('eg_user')
        delete api.defaults.headers.common['Authorization']
        setState({ user: null, token: null, isAuthenticated: false, isLoading: false })
      })
  }, [])

  async function login(phone: string, password: string) {
    try {
      const res = await api.post('/auth/login', { phone, password })
      const { token, user } = res.data
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      localStorage.setItem('eg_token', token)
      localStorage.setItem('eg_user', JSON.stringify(user))
      setState({ user, token, isAuthenticated: true, isLoading: false })
      registerFcmToken().catch(() => {})
    } catch (err) {
      throw new Error(extractMessage(err, 'Invalid credentials. Please try again.'))
    }
  }

  async function register(data: Record<string, unknown>) {
    try {
      const res = await api.post('/auth/register', data)
      const { token, user } = res.data
      if (user.verificationStatus === 'pending') return
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      localStorage.setItem('eg_token', token)
      localStorage.setItem('eg_user', JSON.stringify(user))
      setState({ user, token, isAuthenticated: true, isLoading: false })
      registerFcmToken().catch(() => {})
    } catch (err) {
      throw new Error(extractMessage(err, 'Registration failed. Please try again.'))
    }
  }

  function logout() {
    localStorage.removeItem('eg_token')
    localStorage.removeItem('eg_user')
    delete api.defaults.headers.common['Authorization']
    setState({ user: null, token: null, isAuthenticated: false, isLoading: false })
  }

  function updateUser(updates: Partial<User>) {
    setState(s => {
      if (!s.user) return s
      const user = { ...s.user, ...updates }
      localStorage.setItem('eg_user', JSON.stringify(user))
      return { ...s, user }
    })
  }

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
