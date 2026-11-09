import React from 'react'

interface Props {
  className?: string
  height?: number
  iconOnly?: boolean
}

export default function EasyGoLogo({ className = '', height = 56, iconOnly = false }: Props) {
  if (iconOnly) {
    // Square icon badge — used for favicons, splash screens, small slots
    const size = height
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 52 52"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="EasyRide"
      >
        <rect width="52" height="52" rx="13" fill="#060f1e"/>
        <ellipse cx="26" cy="34" rx="21" ry="10" fill="rgba(34,197,94,0.07)"/>
        {/* Car body */}
        <path d="M6 35L6 29.5Q8 26.5 12 24.5L15 23L28 23L31 24.5Q35 26.5 37 29.5L37 35Z" fill="#22c55e"/>
        {/* Roof highlight */}
        <path d="M15 23L28 23L31 24.5Q35 26.5 37 29.5L6 29.5Q8 26.5 12 24.5Z" fill="#4ade80" opacity="0.16"/>
        {/* Window glass */}
        <path d="M18 23L16.2 28.5L26.8 28.5L25 23Z" fill="#040d17" opacity="0.42"/>
        <line x1="21.5" y1="23.2" x2="21.5" y2="28.5" stroke="#040d17" strokeWidth="0.9" opacity="0.28"/>
        {/* Rear wheel */}
        <circle cx="13" cy="36.5" r="6" fill="#060f1e"/>
        <circle cx="13" cy="36.5" r="6" fill="none" stroke="#22c55e" strokeWidth="0.8"/>
        <circle cx="13" cy="36.5" r="3.6" fill="none" stroke="#4ade80" strokeWidth="1.8"/>
        <circle cx="13" cy="36.5" r="1.2" fill="#4ade80"/>
        {/* Front wheel */}
        <circle cx="30" cy="36.5" r="6" fill="#060f1e"/>
        <circle cx="30" cy="36.5" r="6" fill="none" stroke="#22c55e" strokeWidth="0.8"/>
        <circle cx="30" cy="36.5" r="3.6" fill="none" stroke="#4ade80" strokeWidth="1.8"/>
        <circle cx="30" cy="36.5" r="1.2" fill="#4ade80"/>
        {/* Headlight */}
        <rect x="35.5" y="29.5" width="3" height="2.6" rx="1" fill="#fde68a" opacity="0.95"/>
        {/* Tail light */}
        <rect x="4.5" y="29.5" width="2.4" height="2.6" rx="0.8" fill="#f87171" opacity="0.85"/>
        {/* Speed lines */}
        <line x1="1" y1="31" x2="5.5" y2="31" stroke="#4ade80" strokeWidth="1.6" strokeLinecap="round" opacity="0.45"/>
        <line x1="1.5" y1="34" x2="5" y2="34" strokeWidth="1.2" stroke="#4ade80" strokeLinecap="round" opacity="0.28"/>
      </svg>
    )
  }

  // Full horizontal lockup: badge icon + "EASYRIDE" wordmark + tagline
  const viewW = 240
  const viewH = 52
  const w = Math.round(height * (viewW / viewH))

  return (
    <svg
      width={w}
      height={height}
      viewBox={`0 0 ${viewW} ${viewH}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ maxWidth: '100%' }}
      aria-label="EasyRide"
    >
      {/* Badge background */}
      <rect x="1" y="1" width="50" height="50" rx="13" fill="#060f1e"/>
      <rect x="1" y="1" width="50" height="50" rx="13" stroke="rgba(34,197,94,0.3)" strokeWidth="1.2"/>
      <ellipse cx="26" cy="37" rx="20" ry="9" fill="rgba(34,197,94,0.07)"/>

      {/* Car body */}
      <path d="M6 36L6 31Q7.5 28.5 10.5 27L13 25.5L24 25.5L27 27Q30 28.5 31.5 31L31.5 36Z" fill="#22c55e"/>
      {/* Roof tint */}
      <path d="M13 25.5L24 25.5L27 27Q30 28.5 31.5 31L6 31Q7.5 28.5 10.5 27Z" fill="#4ade80" opacity="0.15"/>
      {/* Window */}
      <path d="M15.5 25.5L14 30.5L24 30.5L22.5 25.5Z" fill="#040d17" opacity="0.4"/>
      <line x1="19" y1="25.7" x2="19" y2="30.5" stroke="#040d17" strokeWidth="0.8" opacity="0.28"/>

      {/* Rear wheel */}
      <circle cx="12" cy="37.5" r="5.5" fill="#060f1e"/>
      <circle cx="12" cy="37.5" r="5.5" fill="none" stroke="#22c55e" strokeWidth="0.7"/>
      <circle cx="12" cy="37.5" r="3.3" fill="none" stroke="#4ade80" strokeWidth="1.6"/>
      <circle cx="12" cy="37.5" r="1.1" fill="#4ade80"/>

      {/* Front wheel */}
      <circle cx="27" cy="37.5" r="5.5" fill="#060f1e"/>
      <circle cx="27" cy="37.5" r="5.5" fill="none" stroke="#22c55e" strokeWidth="0.7"/>
      <circle cx="27" cy="37.5" r="3.3" fill="none" stroke="#4ade80" strokeWidth="1.6"/>
      <circle cx="27" cy="37.5" r="1.1" fill="#4ade80"/>

      {/* Headlight */}
      <rect x="30.2" y="31" width="2.8" height="2.4" rx="0.9" fill="#fde68a" opacity="0.95"/>
      {/* Tail light */}
      <rect x="4.5" y="31" width="2.2" height="2.4" rx="0.7" fill="#f87171" opacity="0.85"/>

      {/* Speed lines */}
      <line x1="1.5" y1="32.5" x2="5.5" y2="32.5" stroke="#4ade80" strokeWidth="1.4" strokeLinecap="round" opacity="0.45"/>
      <line x1="2" y1="35.2" x2="5" y2="35.2" stroke="#4ade80" strokeWidth="1" strokeLinecap="round" opacity="0.28"/>

      {/* Divider */}
      <line x1="60" y1="10" x2="60" y2="42" stroke="rgba(255,255,255,0.08)" strokeWidth="1"/>

      {/* Wordmark "EASYRIDE" */}
      <text
        x="72"
        y="33"
        fontFamily="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontSize="21"
        fontWeight="800"
        fill="#f1f5f9"
        letterSpacing="3"
      >
        EASYRIDE
      </text>

      {/* Tagline */}
      <text
        x="73"
        y="44"
        fontFamily="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontSize="7.5"
        fontWeight="500"
        fill="#6b7280"
        letterSpacing="2.2"
      >
        FAST · SAFE · RELIABLE
      </text>
    </svg>
  )
}
