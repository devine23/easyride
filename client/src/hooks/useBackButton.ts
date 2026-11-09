import { useEffect, useRef } from 'react'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

export function useBackButton(onBack: () => boolean) {
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let handle: { remove: () => void } | null = null
    App.addListener('backButton', () => {
      const handled = onBackRef.current()
      if (!handled) App.exitApp()
    }).then(h => { handle = h })
    return () => { handle?.remove() }
  }, [])
}
