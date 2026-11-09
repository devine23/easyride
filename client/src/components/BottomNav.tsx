import React from 'react'

interface Item {
  id: string
  label: string
  icon: React.ElementType
  badge?: number
}

interface Props {
  items: Item[]
  active: string
  onNav: (id: string) => void
}

export default function BottomNav({ items, active, onNav }: Props) {
  return (
    <nav
      className="d-flex"
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1050,
        height: 62, background: '#111827', borderTop: '1px solid #374151',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {items.map(({ id, label, icon: Icon, badge }) => {
        const isActive = active === id
        return (
          <button
            key={id}
            onPointerDown={(e) => { e.preventDefault(); onNav(id) }}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 3,
              background: 'transparent', border: 'none',
              color: isActive ? '#22c55e' : '#6b7280',
              cursor: 'pointer', position: 'relative',
              touchAction: 'manipulation', padding: '6px 0',
              transition: 'color 0.15s',
            }}
          >
            {isActive && (
              <span style={{
                position: 'absolute', top: 0, left: '50%',
                transform: 'translateX(-50%)',
                width: 28, height: 3, borderRadius: '0 0 3px 3px',
                background: '#22c55e',
              }} />
            )}
            <div style={{ position: 'relative' }}>
              <Icon size={21} />
              {!!badge && badge > 0 && (
                <span style={{
                  position: 'absolute', top: -5, right: -7,
                  background: '#ef4444', color: '#fff', borderRadius: '50%',
                  width: 16, height: 16, fontSize: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700,
                }}>
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </div>
            <span style={{ fontSize: '0.62rem', fontWeight: isActive ? 600 : 400, lineHeight: 1 }}>
              {label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
