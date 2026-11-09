const { calcFare, FARE_RATES, CATEGORY_FUEL_TYPE, multiplierFor } = require('../src/utils/fareCalc')

describe('calcFare', () => {
  test('Economy: short trip hits the $2 minimum fare', () => {
    // 1 km, 3 min: base $1.00 + $0.35 + $0.12 = $1.47 → clamps up to $2.00 min
    expect(calcFare('Economy', 1, 3)).toBe(2.00)
  })

  test('Economy: medium trip computes above the minimum', () => {
    // 10 km, 20 min: $1 + $3.50 + $0.80 = $5.30
    expect(calcFare('Economy', 10, 20)).toBe(5.30)
  })

  test('Comfort: computes correctly for 15 km / 25 min', () => {
    // $1.50 + 15*0.55 + 25*0.06 = $1.50 + $8.25 + $1.50 = $11.25
    expect(calcFare('Comfort', 15, 25)).toBe(11.25)
  })

  test('SUV: computes correctly for 20 km / 30 min', () => {
    // $2.50 + 20*0.85 + 30*0.10 = $2.50 + $17.00 + $3.00 = $22.50
    expect(calcFare('SUV', 20, 30)).toBe(22.50)
  })

  test('Fuel multiplier scales the fare', () => {
    const base = calcFare('Economy', 10, 20)
    expect(calcFare('Economy', 10, 20, 1.2)).toBe(+(base * 1.2).toFixed(2))
  })

  test('Unknown category falls back to Economy pricing', () => {
    expect(calcFare('Bogus', 10, 20)).toBe(calcFare('Economy', 10, 20))
  })

  test('All three categories are defined with required fields', () => {
    for (const cat of ['Economy', 'Comfort', 'SUV']) {
      expect(FARE_RATES[cat]).toMatchObject({
        base: expect.any(Number),
        perKm: expect.any(Number),
        perMin: expect.any(Number),
        min: expect.any(Number),
      })
    }
  })
})

describe('calcFare dual-fuel pricing', () => {
  test('CATEGORY_FUEL_TYPE maps Economy/Comfort → petrol, SUV/Tow Truck → diesel', () => {
    expect(CATEGORY_FUEL_TYPE.Economy).toBe('petrol')
    expect(CATEGORY_FUEL_TYPE.Comfort).toBe('petrol')
    expect(CATEGORY_FUEL_TYPE.SUV).toBe('diesel')
    expect(CATEGORY_FUEL_TYPE['Tow Truck']).toBe('diesel')
  })

  test('Economy uses the petrol multiplier when passed { petrol, diesel }', () => {
    // Base Economy fare for 10km/20min is $5.30 (verified above)
    // At petrol multiplier 1.2, diesel 1.5 — Economy should scale by 1.2
    expect(calcFare('Economy', 10, 20, { petrol: 1.2, diesel: 1.5 })).toBe(+(5.30 * 1.2).toFixed(2))
  })

  test('SUV uses the diesel multiplier when passed { petrol, diesel }', () => {
    // Base SUV fare for 20km/30min is $22.50
    // At petrol 1.2, diesel 1.5 — SUV should scale by 1.5
    expect(calcFare('SUV', 20, 30, { petrol: 1.2, diesel: 1.5 })).toBe(+(22.50 * 1.5).toFixed(2))
  })

  test('Legacy single-number multiplier still works (back-compat)', () => {
    const legacyEconomy = calcFare('Economy', 10, 20, 1.2)
    const dualEconomy   = calcFare('Economy', 10, 20, { petrol: 1.2, diesel: 999 })
    expect(legacyEconomy).toBe(dualEconomy)
  })

  test('multiplierFor returns 1 when no fuel info is given', () => {
    expect(multiplierFor('Economy')).toBe(1)
    expect(multiplierFor('SUV', undefined)).toBe(1)
  })
})
