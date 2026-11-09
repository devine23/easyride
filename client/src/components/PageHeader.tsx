import React, { ReactNode, useEffect, useRef } from 'react'
import { ArrowLeft, LucideIcon } from 'lucide-react'

interface Props {
  title:    string
  subtitle?: string
  icon?:    LucideIcon
  iconColor?: string
  canGoBack?: boolean
  onBack?:    () => void
  action?:    ReactNode   // right-aligned button area (e.g. "Export CSV", "New Code")
}

/**
 * Shared page header for every dashboard sub-section.
 *   - Prominent circular back button at the left when canGoBack is true.
 *   - Big h1 title (1.75rem) with optional icon in the matching tint.
 *   - Live-count subtitle underneath.
 *   - Right-aligned action slot for the primary CTA.
 *   - Bottom border separates header from content.
 */
export default function PageHeader({
  title, subtitle, icon: Icon, iconColor = '#4ade80',
  canGoBack = false, onBack, action,
}: Props) {
  return (
    <div className="d-flex align-items-start justify-content-between flex-wrap gap-3 mb-4 pb-3"
         style={{ borderBottom: '1px solid var(--eg-700)' }}>
      <div className="d-flex align-items-center gap-3 flex-grow-1" style={{ minWidth: 0 }}>
        {canGoBack && (
          <button
            onPointerDown={e => { e.preventDefault(); onBack?.() }}
            className="btn btn-secondary d-flex align-items-center justify-content-center flex-shrink-0"
            style={{ width: 42, height: 42, borderRadius: '50%' }}
            aria-label="Go back"
            title="Go back"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <div style={{ minWidth: 0 }}>
          <h1 className="fw-bold mb-1 d-flex align-items-center gap-2"
              style={{ fontSize: '1.75rem', letterSpacing: '-0.01em' }}>
            {Icon && <Icon size={24} style={{ color: iconColor, flexShrink: 0 }} />}
            <span className="text-truncate">{title}</span>
          </h1>
          {subtitle && (
            <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  )
}

/**
 * useSwipeBack — attaches a horizontal swipe listener to the window.
 * Calls onBack() when the user swipes right ≥ 80 px from the left edge
 * (first 60 px of the viewport, mimicking the iOS edge-swipe gesture).
 * Only active when `enabled` is true (i.e. canGoBack).
 */
export function useSwipeBack(enabled: boolean, onBack: () => void) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null)

  useEffect(() => {
    if (!enabled) return
    function handleStart(e: TouchEvent) {
      const t = e.touches[0]
      // Only start tracking if the touch began near the left edge
      if (t.clientX > 60) { start.current = null; return }
      start.current = { x: t.clientX, y: t.clientY, t: Date.now() }
    }
    function handleEnd(e: TouchEvent) {
      if (!start.current) return
      const t = e.changedTouches[0]
      const dx = t.clientX - start.current.x
      const dy = Math.abs(t.clientY - start.current.y)
      const dt = Date.now() - start.current.t
      // Horizontal swipe ≥ 80 px, mostly horizontal, under 500 ms
      if (dx >= 80 && dy < 60 && dt < 500) onBack()
      start.current = null
    }
    window.addEventListener('touchstart', handleStart, { passive: true })
    window.addEventListener('touchend',   handleEnd,   { passive: true })
    return () => {
      window.removeEventListener('touchstart', handleStart)
      window.removeEventListener('touchend',   handleEnd)
    }
  }, [enabled, onBack])
}
