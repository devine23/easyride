import { useState, useEffect, useMemo } from 'react'
import api from '../services/api'
import { CATEGORY_FUEL_TYPE, FareCategory, FuelMultipliers } from '../utils/fareCalc'

interface FuelLeg { price: number; base: number; multiplier: number }
interface FuelPriceData {
  petrol: FuelLeg
  diesel: FuelLeg
  // legacy — mirrors petrol for pre-dual-fuel callers
  fuelPrice: number
  baseFuelPrice: number
  multiplier: number
}

const DEFAULT: FuelPriceData = {
  petrol: { price: 1.65, base: 1.65, multiplier: 1 },
  diesel: { price: 1.85, base: 1.85, multiplier: 1 },
  fuelPrice: 1.65, baseFuelPrice: 1.65, multiplier: 1,
}

export function useFuelPrice() {
  const [data, setData] = useState<FuelPriceData>(DEFAULT)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/config/fuel-price')
      .then(r => {
        // Accept either new shape or legacy shape
        const d = r.data || {}
        if (d.petrol && d.diesel) setData(d)
        else {
          const price = d.fuelPrice ?? 1.65
          const base  = d.baseFuelPrice ?? 1.65
          const mult  = d.multiplier ?? 1
          setData({
            petrol: { price, base, multiplier: mult },
            diesel: { price, base, multiplier: mult },
            fuelPrice: price, baseFuelPrice: base, multiplier: mult,
          })
        }
      })
      .catch(() => { /* silently use defaults */ })
      .finally(() => setLoading(false))
  }, [])

  const multipliers: FuelMultipliers = useMemo(
    () => ({ petrol: data.petrol.multiplier, diesel: data.diesel.multiplier }),
    [data.petrol.multiplier, data.diesel.multiplier],
  )

  function multiplierFor(category: string): number {
    const t = CATEGORY_FUEL_TYPE[category as FareCategory] || 'petrol'
    return multipliers[t]
  }

  return { ...data, multipliers, multiplierFor, loading }
}
