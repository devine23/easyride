const axios = require('axios')

/**
 * Core bidding-fare math. Pure except for the OSRM/Nominatim call.
 * Returns { distKm, durMin, estimate, floor, supplyFactor } or throws.
 */

const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving'

async function getRoute(from, to) {
  try {
    const url = `${OSRM_URL}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`
    const { data } = await axios.get(url, { timeout: 6000 })
    if (data.code !== 'Ok' || !data.routes?.length) return null
    const { distance, duration } = data.routes[0]
    return { distKm: +(distance / 1000).toFixed(2), durMin: +(duration / 60).toFixed(1) }
  } catch { return null }
}

/**
 * Compute surge from live driver supply around the pickup point.
 * < 2 drivers in 3km → 1.4 (surge)
 * 2 – 4 drivers       → 1.2
 * 5 – 9 drivers       → 1.0 (base)
 * ≥ 10 drivers        → 0.85 (discount)
 *
 * Caller passes `nearbyDriverCount` so this stays pure/testable.
 */
function supplyFactorFromCount(nearbyDriverCount) {
  const n = Math.max(0, Math.floor(nearbyDriverCount))
  if (n < 2)  return 1.40
  if (n < 5)  return 1.20
  if (n < 10) return 1.00
  return 0.85
}

/**
 * Haversine distance in km.
 */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2) ** 2
          + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
          * Math.sin(dLng/2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Core estimator — PURE given fixed distKm/durMin/config/supplyFactor.
 * Rounds every number to 2 dp.
 */
function computeFareEnvelope({ distKm, durMin, config, supplyFactor = 1 }) {
  const base    = (config.fareBaseRatePerKm || 0.40) * distKm
  const time    = (config.fareTimeBufferPerMin || 0.05) * durMin
  const estimate = +((base + time) * supplyFactor).toFixed(2)

  const floor = +Math.max(
    config.fareFloorAbsoluteUSD || 2.00,
    estimate * (config.fareFloorPctOfEstim || 0.70),
  ).toFixed(2)

  return { estimate, floor }
}

/**
 * Full estimate — fetches route, counts nearby drivers via caller-supplied
 * driverCoords Map, then composes the envelope.
 *
 * `driverCoordsMap`: Map<driverId, { lat, lng }> — e.g. from index.js's driverCoords
 */
async function estimateFare({ pickup, dropoff, config, driverCoordsMap }) {
  const route = await getRoute(pickup, dropoff)
  if (!route) throw new Error('ROUTE_UNAVAILABLE')

  // Count drivers within 3 km of pickup
  let nearby = 0
  if (driverCoordsMap && pickup) {
    for (const loc of driverCoordsMap.values()) {
      if (!loc) continue
      if (haversineKm(pickup.lat, pickup.lng, loc.lat, loc.lng) <= 3) nearby++
    }
  }
  const supplyFactor = supplyFactorFromCount(nearby)
  const { estimate, floor } = computeFareEnvelope({
    distKm: route.distKm, durMin: route.durMin, config, supplyFactor,
  })

  return { ...route, estimate, floor, supplyFactor, nearbyDrivers: nearby }
}

/**
 * Compute commission in USD for a given final fare + pct (clamped to range).
 */
function computeCommission(finalFare, pct, config) {
  const min = config.commissionPctMin ?? 0.06
  const max = config.commissionPctMax ?? 0.12
  const clamped = Math.min(max, Math.max(min, pct ?? config.commissionPctDefault ?? 0.08))
  return +(finalFare * clamped).toFixed(2)
}

module.exports = {
  getRoute,
  haversineKm,
  supplyFactorFromCount,
  computeFareEnvelope,
  estimateFare,
  computeCommission,
}
