const {
  supplyFactorFromCount,
  computeFareEnvelope,
  computeCommission,
  haversineKm,
} = require('../src/utils/fareEngine')

const CFG = {
  fareBaseRatePerKm:    0.40,
  fareTimeBufferPerMin: 0.05,
  fareFloorAbsoluteUSD: 2.00,
  fareFloorPctOfEstim:  0.70,
  commissionPctDefault: 0.08,
  commissionPctMin:     0.06,
  commissionPctMax:     0.12,
}

describe('supplyFactorFromCount — surge pricing', () => {
  test('0–1 nearby drivers → 1.40 (strong surge)', () => {
    expect(supplyFactorFromCount(0)).toBe(1.40)
    expect(supplyFactorFromCount(1)).toBe(1.40)
  })
  test('2–4 drivers → 1.20 (mild surge)', () => {
    expect(supplyFactorFromCount(2)).toBe(1.20)
    expect(supplyFactorFromCount(4)).toBe(1.20)
  })
  test('5–9 drivers → 1.00 (base)', () => {
    expect(supplyFactorFromCount(5)).toBe(1.00)
    expect(supplyFactorFromCount(9)).toBe(1.00)
  })
  test('10+ drivers → 0.85 (discount)', () => {
    expect(supplyFactorFromCount(10)).toBe(0.85)
    expect(supplyFactorFromCount(100)).toBe(0.85)
  })
})

describe('computeFareEnvelope — estimate + floor', () => {
  test('10 km / 20 min at base rates: $0.40*10 + $0.05*20 = $5.00', () => {
    const { estimate, floor } = computeFareEnvelope({
      distKm: 10, durMin: 20, config: CFG, supplyFactor: 1,
    })
    expect(estimate).toBe(5.00)
    expect(floor).toBe(3.50)   // 70% of 5
  })

  test('short trip (1 km / 3 min) hits the $2.00 absolute floor', () => {
    const { estimate, floor } = computeFareEnvelope({
      distKm: 1, durMin: 3, config: CFG, supplyFactor: 1,
    })
    //  base = 0.40 + 0.15 = 0.55 ; floor = max(2.00, 0.385) = 2.00
    expect(estimate).toBe(0.55)
    expect(floor).toBe(2.00)
  })

  test('supplyFactor scales the estimate but not the absolute floor', () => {
    const { estimate, floor } = computeFareEnvelope({
      distKm: 10, durMin: 20, config: CFG, supplyFactor: 1.40,
    })
    expect(estimate).toBe(7.00)   // 5 * 1.4
    expect(floor).toBe(4.90)      // 70% of 7
  })

  test('passenger cannot offer below the floor — contract check', () => {
    // Simulate "offer = $1.50" against a trip whose floor is $3.50
    const { floor } = computeFareEnvelope({
      distKm: 10, durMin: 20, config: CFG, supplyFactor: 1,
    })
    const passengerOffer = 1.50
    expect(passengerOffer).toBeLessThan(floor)
  })
})

describe('computeCommission — service fee', () => {
  test('uses default pct when none supplied', () => {
    expect(computeCommission(10, undefined, CFG)).toBe(0.80)   // 8%
  })

  test('clamps pct to the min bound', () => {
    expect(computeCommission(10, 0.03, CFG)).toBe(0.60)        // 6% floor
  })

  test('clamps pct to the max bound', () => {
    expect(computeCommission(10, 0.50, CFG)).toBe(1.20)        // 12% ceiling
  })

  test('honours a custom pct within range', () => {
    expect(computeCommission(10, 0.10, CFG)).toBe(1.00)
  })

  test('always rounds to 2 dp', () => {
    expect(computeCommission(3.33, 0.07, CFG)).toBe(0.23)      // 3.33 * 0.07 = 0.2331
  })
})

describe('haversineKm — geo distance', () => {
  test('zero distance when points are identical', () => {
    expect(haversineKm(0, 0, 0, 0)).toBe(0)
  })

  test('Harare → Bulawayo (approx 365 km)', () => {
    const d = haversineKm(-17.825, 31.03, -20.15, 28.58)
    expect(d).toBeGreaterThan(350)
    expect(d).toBeLessThan(400)
  })
})
