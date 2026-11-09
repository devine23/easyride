import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuth } from './AuthContext'
import { Message, Ride, Coordinates, VerificationRecord } from '../types'
import { SERVER_URL } from '../services/api'

interface SocketContextType {
  socket: Socket | null;
  onlineUsers: string[];
  messages: Message[];
  sendMessage: (to: string, rideId: string, text: string) => void;
  shareLocation: (rideId: string, coords: Coordinates) => void;
  requestRide: (rideData: Partial<Ride>) => void;
  acceptRide: (rideId: string) => void;
  updateRideStatus: (rideId: string, status: string, extra?: Record<string, unknown>) => void;
  initiateCall: (to: string, type: 'audio' | 'video') => void;
  endCall: () => void;
  incomingCall: { from: string; fromName: string; type: 'audio' | 'video'; signal: unknown } | null;
  answerCall: (signal: unknown) => void;
  activeRide: Ride | null;
  setActiveRide: (r: Ride | null) => void;
  driverLocation: Coordinates | null;
}

const SocketContext = createContext<SocketContextType | null>(null)

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user, token, isAuthenticated, updateUser, logout } = useAuth()
  const socketRef = useRef<Socket | null>(null)
  // Reactive socket state so consumers re-render when socket connects/disconnects
  const [socketState, setSocketState] = useState<Socket | null>(null)
  const [onlineUsers, setOnlineUsers] = useState<string[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [incomingCall, setIncomingCall] = useState<SocketContextType['incomingCall']>(null)
  const [activeRide, setActiveRide] = useState<Ride | null>(null)
  const [driverLocation, setDriverLocation] = useState<Coordinates | null>(null)

  // Refs for latest user/logout — handlers always read current values without triggering reconnects
  const userRef = useRef(user)
  const logoutRef = useRef(logout)
  useEffect(() => { userRef.current = user }, [user])
  useEffect(() => { logoutRef.current = logout }, [logout])

  useEffect(() => {
    if (!isAuthenticated || !user?.id || !token) return

    // React 18 StrictMode mounts effects twice in dev. If we connect synchronously
    // and then disconnect on the first (immediate) cleanup, Chrome logs:
    //   "WebSocket is closed before the connection is established."
    // Defer the actual connect() to the next tick with a cancellable flag so
    // the first short-lived mount never opens a real WS handshake.
    let cancelled = false
    const socket = io(SERVER_URL || '/', {
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: false,
    })
    const connectTimer = setTimeout(() => { if (!cancelled) socket.connect() }, 0)
    socketRef.current = socket
    setSocketState(socket)

    socket.on('connect', () => socket.emit('user:online'))
    socket.on('users:online', (ids: string[]) => setOnlineUsers(ids))
    socket.on('message:receive', (msg: Message) => setMessages(prev => [...prev, msg]))
    socket.on('call:incoming', (data) => setIncomingCall(data))
    socket.on('call:ended', () => setIncomingCall(null))
    // ride:new is handled in DriverDashboard to show the pending ride popup.
    // activeRide is set only on ride:accepted — never from ride:new — to avoid
    // overwriting pendingRide state before the driver has accepted.
    socket.on('ride:accepted', (ride: Ride) => setActiveRide(ride))
    socket.on('ride:status', (ride: Ride) => setActiveRide(ride))
    socket.on('location:driver', (coords: Coordinates) => setDriverLocation(coords))
    socket.on('verification:update', ({ status, rejectionReason }: { status: VerificationRecord['status']; rejectionReason?: string }) => {
      updateUser({
        verification: {
          ...(userRef.current?.verification || {}),
          status,
          reviewedAt: new Date().toISOString(),
          ...(rejectionReason ? { rejectionReason } : {}),
        } as VerificationRecord,
      })
    })
    socket.on('account:suspended', () => {
      // Use ref so we always call the latest logout even if the closure is stale
      logoutRef.current()
    })

    return () => {
      cancelled = true
      clearTimeout(connectTimer)
      socket.disconnect()
      socketRef.current = null
      setSocketState(null)
    }
  // Use user.id instead of the whole user object to avoid reconnecting on every updateUser call
  }, [isAuthenticated, user?.id, token]) // eslint-disable-line react-hooks/exhaustive-deps

  function sendMessage(to: string, rideId: string, text: string) {
    if (!socketRef.current || !userRef.current) return
    const msg: Message = {
      id: crypto.randomUUID(), senderId: userRef.current.id, receiverId: to,
      rideId, text, timestamp: new Date().toISOString(), type: 'text'
    }
    socketRef.current.emit('message:send', msg)
    setMessages(prev => [...prev, msg])
  }

  function shareLocation(rideId: string, coords: Coordinates) {
    socketRef.current?.emit('location:share', { rideId, coords })
  }

  function requestRide(rideData: Partial<Ride>) {
    socketRef.current?.emit('ride:request', { ...rideData, clientId: userRef.current?.id })
  }

  function acceptRide(rideId: string) {
    socketRef.current?.emit('ride:accept', { rideId, driverId: userRef.current?.id })
  }

  function updateRideStatus(rideId: string, status: string, extra?: Record<string, unknown>) {
    socketRef.current?.emit('ride:update', { rideId, status, driverId: userRef.current?.id, ...extra })
  }

  function initiateCall(to: string, type: 'audio' | 'video') {
    socketRef.current?.emit('call:initiate', {
      to, from: userRef.current?.id,
      fromName: userRef.current?.fullName || userRef.current?.name,
      type,
    })
  }

  function endCall() {
    socketRef.current?.emit('call:end', { userId: userRef.current?.id })
    setIncomingCall(null)
  }

  function answerCall(signal: unknown) {
    socketRef.current?.emit('call:answer', { signal, to: incomingCall?.from })
  }

  return (
    <SocketContext.Provider value={{
      socket: socketState, onlineUsers, messages, sendMessage, shareLocation,
      requestRide, acceptRide, updateRideStatus, initiateCall, endCall,
      incomingCall, answerCall, activeRide, setActiveRide, driverLocation,
    }}>
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  const ctx = useContext(SocketContext)
  if (!ctx) throw new Error('useSocket must be used within SocketProvider')
  return ctx
}
