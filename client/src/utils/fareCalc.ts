// Mirror of server/src/utils/fareCalc.js — keep these in sync.
export const FARE_RATES = {
  Economy:     { base: 1.00, perKm: 0.35, perMin: 0.04, min: 2.00, range: '$2 – $7'  },
  Comfort:     { base: 1.50, perKm: 0.55, perMin: 0.06, min: 3.50, range: '$4 – $11' },
  SUV:         { base: 2.50, perKm: 0.85, perMin: 0.10, min: 6.00, range: '$6 – $18' },
  'Tow Truck': { base: 2.50, perKm: 0.85, perMin: 0.10, min: 6.00, range: '$6 – $18' },
} as const

export type FareCategory = keyof typeof FARE_RATES
export type FuelType     = 'petrol' | 'diesel'

// Which fuel each ride category runs on
export const CATEGORY_FUEL_TYPE: Record<FareCategory, FuelType> = {
  Economy:     'petrol',
  Comfort:     'petrol',
  SUV:         'diesel',
  'Tow Truck': 'diesel',
}

export interface FuelMultipliers { petrol: number; diesel: number }

export function multiplierFor(category: string, fuel?: number | FuelMultipliers): number {
  if (fuel == null) return 1
  if (typeof fuel === 'number') return fuel
  const fuelType = CATEGORY_FUEL_TYPE[(category as FareCategory)] || 'petrol'
  return typeof fuel[fuelType] === 'number' ? fuel[fuelType] : 1
}

export function calcFare(
  category: string,
  distanceKm: number,
  durationMin: number,
  fuel: number | FuelMultipliers = 1,
): number {
  const r = FARE_RATES[(category as FareCategory)] ?? FARE_RATES.Economy
  const m = multiplierFor(category, fuel)
  const base = r.base + distanceKm * r.perKm + durationMin * r.perMin
  return +(Math.max(r.min, base) * m).toFixed(2)
}

export function fareRange(category: string): string {
  return (FARE_RATES[(category as FareCategory)] ?? FARE_RATES.Economy).range
}
