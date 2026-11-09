import { useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import { Coordinates } from '../types'

const HARARE: Coordinates = { lat: -17.8292, lng: 31.0522 }

export async function fetchPosition(): Promise<Coordinates> {
  if (Capacitor.isNativePlatform()) {
    const perm = await Geolocation.requestPermissions()
    if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
      throw new Error('Location permission denied. Enable it in phone Settings → Apps → EasyRide → Permissions.')
    }
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 })
    return { lat: pos.coords.latitude, lng: pos.coords.longitude }
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocation not supported by this browser')); return }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => reject(new Error(err.message)),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  })
}

export function useGeolocation() {
  const [coords, setCoords] = useState<Coordinates | null>(null)
  const [error, setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    let nativeClear: (() => void) | undefined
    let browserWatcher: number | undefined

    async function start() {
      if (Capacitor.isNativePlatform()) {
        try {
          const perm = await Geolocation.requestPermissions()
          if (cancelled) return
          if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
            setCoords(HARARE); setError('Location permission denied'); setLoading(false); return
          }
          const id = await Geolocation.watchPosition(
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
            (pos, err) => {
              if (cancelled) return
              if (err || !pos) { setCoords(HARARE); setError(String(err)) }
              else setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
              setLoading(false)
            }
          )
          nativeClear = () => Geolocation.clearWatch({ id })
        } catch {
          if (!cancelled) { setCoords(HARARE); setLoading(false) }
        }
      } else {
        if (!navigator.geolocation) {
          setError('Geolocation not supported'); setLoading(false); return
        }
        browserWatcher = navigator.geolocation.watchPosition(
          pos => {
            if (cancelled) return
            setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
            setLoading(false)
          },
          err => {
            if (cancelled) return
            setCoords(HARARE); setError(err.message); setLoading(false)
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
        )
      }
    }

    start()

    return () => {
      cancelled = true
      nativeClear?.()
      if (browserWatcher !== undefined) navigator.geolocation.clearWatch(browserWatcher)
    }
  }, [])

  return { coords, error, loading }
}
