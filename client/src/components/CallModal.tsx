import React, { useEffect, useRef, useState } from 'react'
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, Volume2 } from 'lucide-react'
import type Peer from 'simple-peer'
import { useSocket } from '../context/SocketContext'
import api from '../services/api'

interface Props {
  peerId: string;
  peerName: string;
  callType: 'audio' | 'video';
  isIncoming?: boolean;
  onEnd: () => void;
}

async function fetchIceServers(): Promise<RTCIceServer[]> {
  try {
    const res = await api.get('/turn-config')
    const { urls, username, credential } = res.data
    const servers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
    if (urls?.length && username) servers.push({ urls, username, credential })
    return servers
  } catch {
    return [{ urls: 'stun:stun.l.google.com:19302' }]
  }
}

export default function CallModal({ peerId, peerName, callType, isIncoming, onEnd }: Props) {
  const { initiateCall, endCall, answerCall, incomingCall, socket } = useSocket()
  const [isMuted,    setIsMuted]    = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [callState,  setCallState]  = useState<'ringing' | 'connected' | 'ended'>('ringing')
  const [duration,   setDuration]   = useState(0)
  const localVideoRef  = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const streamRef      = useRef<MediaStream | null>(null)
  const peerRef        = useRef<Peer.Instance | null>(null)
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!isIncoming) initiateCall(peerId, callType)

    let peerInstance: Peer.Instance | null = null

    async function setup() {
      let stream: MediaStream | undefined
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === 'video' })
        streamRef.current = stream
        if (localVideoRef.current) localVideoRef.current.srcObject = stream
      } catch { /* microphone/camera unavailable — continue without local stream */ }

      const iceServers = await fetchIceServers()
      const SimplePeer = (await import('simple-peer')).default
      peerInstance = new SimplePeer({
        initiator: !isIncoming,
        stream,
        trickle: true,
        config: { iceServers },
      })
      peerRef.current = peerInstance

      peerInstance.on('signal', (signal) => {
        if (isIncoming) {
          socket?.emit('call:answer', { signal, to: incomingCall?.from })
        } else {
          socket?.emit('call:signal', { signal, to: peerId })
        }
      })

      peerInstance.on('stream', (remoteStream) => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream
        setCallState('connected')
      })

      peerInstance.on('connect', () => setCallState('connected'))
      peerInstance.on('error', () => { /* log silently */ })
      peerInstance.on('close', () => { setCallState('ended'); setTimeout(onEnd, 800) })
    }

    setup()

    // Receive signaling data from the other side
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function handleSignal({ signal }: { signal: any }) {
      peerRef.current?.signal(signal)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function handleAnswered({ signal }: { signal: any }) {
      peerRef.current?.signal(signal)
      setCallState('connected')
    }

    socket?.on('call:signal',   handleSignal)
    socket?.on('call:answered', handleAnswered)
    socket?.on('call:ended', () => { setCallState('ended'); setTimeout(onEnd, 800) })

    // Fallback: if no WebRTC stream in 8s, still show connected UI
    const fallbackTimer = setTimeout(() => {
      if (callState !== 'connected') setCallState('connected')
    }, 8000)

    return () => {
      clearTimeout(fallbackTimer)
      streamRef.current?.getTracks().forEach(t => t.stop())
      peerInstance?.destroy()
      socket?.off('call:signal',   handleSignal)
      socket?.off('call:answered', handleAnswered)
      socket?.off('call:ended')
      if (timerRef.current) clearInterval(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (callState === 'connected') {
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [callState])

  function handleEnd() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    peerRef.current?.destroy()
    endCall()
    onEnd()
  }

  function handleAnswer() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (incomingCall?.signal) peerRef.current?.signal(incomingCall.signal as any)
    setCallState('connected')
  }

  function toggleMute() {
    setIsMuted(m => {
      streamRef.current?.getAudioTracks().forEach(t => { t.enabled = m })
      return !m
    })
  }

  function toggleVideo() {
    setIsVideoOff(v => {
      streamRef.current?.getVideoTracks().forEach(t => { t.enabled = v })
      return !v
    })
  }

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div
      className="position-fixed top-0 start-0 end-0 bottom-0 d-flex align-items-center justify-content-center p-3"
      style={{ zIndex: 1100, background: 'rgba(0,0,0,0.92)' }}
    >
      <div className="card overflow-hidden animate-fade-in" style={{ width: '100%', maxWidth: 360, borderRadius: '1.25rem' }}>

        {callType === 'video' ? (
          <div className="position-relative">
            <video
              ref={remoteVideoRef} autoPlay playsInline
              className="w-100"
              style={{ height: 240, objectFit: 'cover', background: 'var(--eg-900)', display: 'block' }}
            />
            <video
              ref={localVideoRef} autoPlay playsInline muted
              className="position-absolute rounded-xl"
              style={{ top: 10, right: 10, width: 90, height: 72, objectFit: 'cover', border: '2px solid var(--eg-600)', background: 'var(--eg-900)' }}
            />
          </div>
        ) : (
          <div
            className="d-flex align-items-center justify-content-center"
            style={{ height: 180, background: 'linear-gradient(135deg, rgba(34,197,94,0.1) 0%, var(--eg-900) 100%)' }}
          >
            <div
              className="d-flex align-items-center justify-content-center rounded-circle fw-bold"
              style={{ width: 80, height: 80, background: 'var(--eg-brand-dim)', fontSize: '2rem', color: '#4ade80' }}
            >
              {peerName[0]}
            </div>
          </div>
        )}

        <div className="card-body p-4 text-center">
          <h5 className="fw-bold mb-1">{peerName}</h5>
          {callState === 'ringing'   && <p className="text-muted small mb-0">{isIncoming ? 'Incoming call…' : 'Calling…'}</p>}
          {callState === 'connected' && <p className="text-brand small fw-semibold mb-0">{fmt(duration)}</p>}
          {callState === 'ended'     && <p className="text-danger small mb-0">Call ended</p>}

          <div className="d-flex align-items-center justify-content-center gap-3 mt-4">
            <button
              onClick={toggleMute}
              className="btn rounded-circle d-flex align-items-center justify-content-center border-0"
              style={{ width: 48, height: 48, background: isMuted ? '#ef4444' : 'var(--eg-700)', color: '#fff' }}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>

            {isIncoming && callState === 'ringing' ? (
              <>
                <button onClick={handleAnswer}
                  className="btn btn-primary rounded-circle d-flex align-items-center justify-content-center border-0"
                  style={{ width: 64, height: 64 }}
                ><Phone size={26} /></button>
                <button onClick={handleEnd}
                  className="btn btn-danger rounded-circle d-flex align-items-center justify-content-center border-0"
                  style={{ width: 64, height: 64 }}
                ><PhoneOff size={26} /></button>
              </>
            ) : (
              <button onClick={handleEnd}
                className="btn btn-danger rounded-circle d-flex align-items-center justify-content-center border-0"
                style={{ width: 64, height: 64 }}
              ><PhoneOff size={26} /></button>
            )}

            {callType === 'video' ? (
              <button onClick={toggleVideo}
                className="btn rounded-circle d-flex align-items-center justify-content-center border-0"
                style={{ width: 48, height: 48, background: isVideoOff ? '#ef4444' : 'var(--eg-700)', color: '#fff' }}
              >{isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}</button>
            ) : (
              <button
                className="btn rounded-circle d-flex align-items-center justify-content-center border-0"
                style={{ width: 48, height: 48, background: 'var(--eg-700)', color: '#9ca3af' }}
              ><Volume2 size={20} /></button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
