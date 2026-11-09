import React, { useState, useRef, useEffect } from 'react'
import { Send, X, Phone, Video, MapPin } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { Message } from '../types'

interface Props {
  rideId: string;
  peerId: string;
  peerName: string;
  onClose?: () => void;
  onCall?: (type: 'audio' | 'video') => void;
}

export default function ChatPanel({ rideId, peerId, peerName, onClose, onCall }: Props) {
  const { user } = useAuth()
  const { messages, sendMessage, shareLocation } = useSocket()
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  const rideMessages = messages.filter(m => m.rideId === rideId)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [rideMessages])

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    sendMessage(peerId, rideId, text.trim())
    setText('')
  }

  function handleShareLocation() {
    navigator.geolocation.getCurrentPosition(
      pos => {
        shareLocation(rideId, { lat: pos.coords.latitude, lng: pos.coords.longitude })
        sendMessage(peerId, rideId, '📍 Shared my location')
      },
      () => { sendMessage(peerId, rideId, '⚠️ Could not share location — please enable location access') }
    )
  }

  return (
    <div className="d-flex flex-column card overflow-hidden" style={{ borderRadius: '1rem', height: '100%' }}>
      {/* Header */}
      <div className="card-header d-flex align-items-center justify-content-between px-3 py-2">
        <div className="d-flex align-items-center gap-3">
          <div
            className="d-flex align-items-center justify-content-center rounded-circle fw-bold text-brand flex-shrink-0"
            style={{ width: 36, height: 36, background: 'var(--eg-brand-dim)', fontSize: '0.9rem' }}
          >
            {peerName[0]}
          </div>
          <div>
            <p className="fw-semibold small mb-0">{peerName}</p>
            <p className="text-xs text-brand mb-0">● Online</p>
          </div>
        </div>
        <div className="d-flex align-items-center gap-1">
          {onCall && (
            <>
              <button onClick={() => onCall('audio')} className="btn btn-secondary p-2" aria-label="Audio call">
                <Phone size={15} className="text-brand" />
              </button>
              <button onClick={() => onCall('video')} className="btn btn-secondary p-2" aria-label="Video call">
                <Video size={15} style={{ color: '#c084fc' }} />
              </button>
            </>
          )}
          {onClose && (
            <button onClick={onClose} className="btn btn-secondary p-2" aria-label="Close">
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex-grow-1 p-3 d-flex flex-column gap-2"
        style={{ overflowY: 'auto', minHeight: 0 }}
      >
        {rideMessages.length === 0 && (
          <div className="text-center text-muted py-5 my-auto">
            <p className="mb-2" style={{ fontSize: '2rem' }}>💬</p>
            <p className="small mb-0">Send a message to {peerName}</p>
          </div>
        )}
        {rideMessages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} isMe={msg.senderId === user?.id} />
        ))}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="card-footer d-flex align-items-center gap-2 p-3">
        <button
          type="button" onClick={handleShareLocation}
          className="btn btn-secondary p-2 flex-shrink-0" aria-label="Share location"
        >
          <MapPin size={16} />
        </button>
        <input
          value={text} onChange={e => setText(e.target.value)}
          placeholder="Type a message..."
          className="form-control"
        />
        <button
          type="submit" disabled={!text.trim()}
          className="btn btn-primary p-2 flex-shrink-0" aria-label="Send"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  )
}

function MessageBubble({ msg, isMe }: { msg: Message; isMe: boolean }) {
  return (
    <div className={`d-flex ${isMe ? 'justify-content-end' : 'justify-content-start'}`}>
      <div
        className={`px-3 py-2 small ${isMe ? 'chat-bubble-me' : 'chat-bubble-other'}`}
        style={{ maxWidth: '75%' }}
      >
        <p className="mb-0">{msg.text}</p>
        <p className={`text-xs mb-0 mt-1 ${isMe ? 'opacity-75' : 'text-muted'}`}>
          {new Date(msg.timestamp).toLocaleTimeString('en-ZW', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}
