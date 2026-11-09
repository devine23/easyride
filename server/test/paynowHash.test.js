const { verifyPaynowHash, createPaynowHash } = require('../src/utils/paynowHash')

const KEY = 'test-integration-key-abcdef1234'

describe('verifyPaynowHash', () => {
  const fields = {
    reference: 'Ride-xyz',
    paynowreference: '12345',
    amount: '5.00',
    additionalinfo: 'EasyRide',
    status: 'Paid',
    pollurl: 'https://paynow.co.zw/poll/abc',
  }

  test('accepts a hash produced with the same key and fields', () => {
    const hash = createPaynowHash(fields, KEY)
    expect(verifyPaynowHash({ ...fields, hash }, KEY)).toBe(true)
  })

  test('rejects a hash signed with a different key', () => {
    const hash = createPaynowHash(fields, 'wrong-key')
    expect(verifyPaynowHash({ ...fields, hash }, KEY)).toBe(false)
  })

  test('rejects when the payload has been tampered with', () => {
    const hash = createPaynowHash(fields, KEY)
    const tampered = { ...fields, status: 'Cancelled', hash }
    expect(verifyPaynowHash(tampered, KEY)).toBe(false)
  })

  test('rejects when no hash field is present', () => {
    expect(verifyPaynowHash(fields, KEY)).toBe(false)
  })

  test('rejects when integration key is empty (fail-closed)', () => {
    const hash = createPaynowHash(fields, KEY)
    expect(verifyPaynowHash({ ...fields, hash }, '')).toBe(false)
    expect(verifyPaynowHash({ ...fields, hash }, undefined)).toBe(false)
  })

  test('accepts both lowercase "hash" and uppercase "Hash" field names', () => {
    const hash = createPaynowHash(fields, KEY)
    expect(verifyPaynowHash({ ...fields, Hash: hash }, KEY)).toBe(true)
  })
})
