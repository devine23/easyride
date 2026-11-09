const FARE_RATES = {
  Economy:    { base: 1.00, perKm: 0.35, perMin: 0.04, min: 2.00 },
  Comfort:    { base: 1.50, perKm: 0.55, perMin: 0.06, min: 3.50 },
  SUV:        { base: 2.50, perKm: 0.85, perMin: 0.10, min: 6.00 },
  'Tow Truck':{ base: 2.50, perKm: 0.85, perMin: 0.10, min: 6.00 },
}

// Which fuel each ride category runs on. Used by dual-fuel pricing.
const CATEGORY_FUEL_TYPE = {
  Economy:     'petrol',
  Comfort:     'petrol',
  SUV:         'diesel',
  'Tow Truck': 'diesel',
}

// Pick the multiplier for a given category. Accepts:
//   - a number: legacy single-fuel multiplier applied to every category
//   - an object { petrol, diesel }: dual-fuel, picked by CATEGORY_FUEL_TYPE
//   - undefined: 1.0 (base rates)
function multiplierFor(category, fuel) {
  if (fuel == null) return 1
  if (typeof fuel === 'number') return fuel
  const fuelType = CATEGORY_FUEL_TYPE[category] || 'petrol'
  return typeof fuel[fuelType] === 'number' ? fuel[fuelType] : 1
}

function calcFare(category, distanceKm, durationMin, fuel = 1) {
  const r = FARE_RATES[category] || FARE_RATES.Economy
  const m = multiplierFor(category, fuel)
  const base = r.base + distanceKm * r.perKm + durationMin * r.perMin
  return Math.round(Math.max(r.min, base) * m * 100) / 100
}

module.exports = { FARE_RATES, CATEGORY_FUEL_TYPE, calcFare, multiplierFor }
