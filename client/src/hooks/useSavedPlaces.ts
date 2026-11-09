import { useState, useCallback } from 'react'

export interface SavedPlace {
  id: string
  name: string
  address: string
  icon: string
}

const DEFAULTS: SavedPlace[] = [
  { id: 'home', name: 'Home', address: '', icon: '🏠' },
  { id: 'work', name: 'Work', address: '', icon: '🏢' },
]

const STORAGE_KEY = 'easyride_saved_places'

export function useSavedPlaces() {
  const [places, setPlaces] = useState<SavedPlace[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : DEFAULTS
    } catch {
      return DEFAULTS
    }
  })

  const setAddress = useCallback((id: string, address: string) => {
    setPlaces(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, address } : p)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      return updated
    })
  }, [])

  return { places, setAddress }
}
