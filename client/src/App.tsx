import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { SocketProvider } from './context/SocketContext'
import ErrorBoundary from './components/ErrorBoundary'
import Landing from './pages/Landing'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import ClientDashboard from './pages/private/ClientDashboard'
import CorporateDashboard from './pages/corporate/CorporateDashboard'
import DriverDashboard from './pages/driver/DriverDashboard'
import AdminDashboard from './pages/admin/AdminDashboard'
import TrackRide from './pages/public/TrackRide'

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { isAuthenticated, isLoading, user } = useAuth()
  if (isLoading) return (
    <div className="min-vh-100 bg-900 d-flex align-items-center justify-content-center">
      <div className="d-flex flex-column align-items-center gap-3">
        <div className="spinner-border text-brand" role="status" style={{ width: '3rem', height: '3rem' }}>
          <span className="visually-hidden">Loading…</span>
        </div>
        <p className="text-muted mb-0">Loading EasyRide…</p>
      </div>
    </div>
  )
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (roles && user && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function DashboardRouter() {
  const { user } = useAuth()
  if (user?.role === 'admin')     return <AdminDashboard />
  if (user?.role === 'corporate') return <CorporateDashboard />
  if (user?.role === 'driver')    return <DriverDashboard />
  return <ClientDashboard />
}

export default function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/"         element={<Landing />} />
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <SocketProvider><DashboardRouter /></SocketProvider>
            </ProtectedRoute>
          } />
          <Route path="/admin" element={
            <ProtectedRoute roles={['admin']}>
              <SocketProvider><AdminDashboard /></SocketProvider>
            </ProtectedRoute>
          } />
          <Route path="/track/:rideId" element={<TrackRide />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ErrorBoundary>
  )
}
