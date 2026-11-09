/**
 * walletService tests — mocked models. We verify the service's business logic
 * (correct txn types, idempotency, error paths, update filters) without
 * requiring a running MongoDB. The atomic `$gte` precondition is tested by
 * mock-returning `null` for over-draft scenarios — same way real MongoDB
 * would behave when the filter fails.
 */

// ─── Set up model mocks BEFORE requiring the service ────────────────────
jest.mock('../src/models/DriverWallet')
jest.mock('../src/models/WalletTransaction')
jest.mock('../src/models/Ride')

const DriverWallet      = require('../src/models/DriverWallet')
const WalletTransaction = require('../src/models/WalletTransaction')
const Ride              = require('../src/models/Ride')
const wallet            = require('../src/services/walletService')

// ─── Shared mock state — reset in beforeEach ────────────────────────────
const state = {
  wallets: new Map(),   // driverId -> wallet doc
  txns:    [],          // array of txn docs
}

function mockWalletUpdate(filter, update) {
  const driverId = filter.driverId
  const w = state.wallets.get(driverId)
  if (!w) return null

  // Check preconditions (same semantics as MongoDB $gte)
  if (filter.balance?.$gte != null && w.balance < filter.balance.$gte) return null
  if (filter.heldBalance?.$gte != null && w.heldBalance < filter.heldBalance.$gte) return null

  // Apply $inc
  if (update.$inc) {
    for (const [k, v] of Object.entries(update.$inc)) w[k] = (w[k] || 0) + v
  }
  if (update.$set) Object.assign(w, update.$set)
  return { ...w }   // Return a copy, like Mongoose with { new: true }
}

beforeEach(() => {
  state.wallets.clear()
  state.txns = []

  DriverWallet.findOneAndUpdate = jest.fn(async (filter, update, opts) => {
    if (opts?.upsert && !state.wallets.has(filter.driverId)) {
      state.wallets.set(filter.driverId, {
        driverId: filter.driverId,
        balance: 0, heldBalance: 0, version: 0,
        ...(update.$setOnInsert || {}),
      })
    }
    return mockWalletUpdate(filter, update)
  })

  DriverWallet.findOne = jest.fn(async (filter) => {
    return state.wallets.get(filter.driverId) || null
  })

  // .lean() support
  DriverWallet.findOne.mockImplementation(async (filter) => {
    const w = state.wallets.get(filter.driverId) || null
    if (!w) return null
    return { ...w, lean: () => Promise.resolve({ ...w }) }
  })
  // For the version used in isEligible: Wallet.findOne({driverId}).lean()
  const originalFindOne = DriverWallet.findOne
  DriverWallet.findOne = jest.fn((filter) => {
    const w = state.wallets.get(filter.driverId) || null
    return {
      then: (resolve) => resolve(w ? { ...w } : null),
      lean: () => Promise.resolve(w ? { ...w } : null),
    }
  })

  WalletTransaction.findOne = jest.fn(async (filter) => {
    return state.txns.find(t =>
      Object.entries(filter).every(([k, v]) => t[k] === v),
    ) || null
  })

  WalletTransaction.create = jest.fn(async (doc) => {
    // Mirror Mongoose schema defaults
    const txn = { status: 'posted', ...doc, _id: `txn-${state.txns.length + 1}` }
    state.txns.push(txn)
    return txn
  })

  WalletTransaction.updateOne = jest.fn(async (filter, update) => {
    const t = state.txns.find(x => x.id === filter.id)
    if (t) Object.assign(t, update)
    return { modifiedCount: t ? 1 : 0 }
  })

  Ride.updateOne = jest.fn(async () => ({ modifiedCount: 1 }))
})

const D1 = 'drv-001'

describe('walletService.getOrCreateWallet', () => {
  test('creates a wallet with zero balance on first call', async () => {
    const w = await wallet.getOrCreateWallet(D1)
    expect(w.balance).toBe(0)
    expect(w.heldBalance).toBe(0)
    expect(w.driverId).toBe(D1)
  })

  test('rejects missing driverId', async () => {
    await expect(wallet.getOrCreateWallet('')).rejects.toThrow('INVALID_DRIVER')
  })
})

describe('walletService.credit (TOPUP)', () => {
  test('credits balance and writes a TOPUP txn', async () => {
    const { wallet: w, txn } = await wallet.credit(D1, 10, { type: 'TOPUP', reference: 'pay-123' })
    expect(w.balance).toBe(10)
    expect(txn.amount).toBe(10)
    expect(txn.type).toBe('TOPUP')
    expect(txn.reference).toBe('pay-123')
  })

  test('rejects zero and negative amounts', async () => {
    await expect(wallet.credit(D1, 0,  {})).rejects.toThrow('INVALID_AMOUNT')
    await expect(wallet.credit(D1, -5, {})).rejects.toThrow('INVALID_AMOUNT')
  })

  test('rejects invalid txn type', async () => {
    await expect(wallet.credit(D1, 5, { type: 'STEAL' })).rejects.toThrow('INVALID_TYPE')
  })

  test('multiple top-ups accumulate', async () => {
    await wallet.credit(D1, 5, {})
    await wallet.credit(D1, 7, {})
    expect(state.wallets.get(D1).balance).toBe(12)
  })
})

describe('walletService.holdCommission', () => {
  const RIDE = 'ride-001'

  beforeEach(async () => {
    await wallet.credit(D1, 20, {})
  })

  test('moves funds from balance to heldBalance and writes HOLD txn', async () => {
    const { wallet: w, txn } = await wallet.holdCommission(D1, RIDE, 3)
    expect(w.balance).toBe(17)
    expect(w.heldBalance).toBe(3)
    expect(txn.type).toBe('HOLD')
    expect(txn.amount).toBe(-3)
    expect(txn.rideId).toBe(RIDE)
  })

  test('rejects when balance is insufficient', async () => {
    await expect(wallet.holdCommission(D1, RIDE, 30)).rejects.toThrow('INSUFFICIENT_BALANCE')
    expect(state.wallets.get(D1).balance).toBe(20)   // Balance unchanged on failure
    expect(state.wallets.get(D1).heldBalance).toBe(0)
  })

  test('is idempotent — second call returns the same txn without re-charging', async () => {
    const first  = await wallet.holdCommission(D1, RIDE, 3)
    const second = await wallet.holdCommission(D1, RIDE, 3)
    expect(second.idempotent).toBe(true)
    expect(second.txn.id).toBe(first.txn.id)
    expect(state.wallets.get(D1).balance).toBe(17)   // Only one deduction
  })
})

describe('walletService.collectCommission', () => {
  const RIDE = 'ride-002'

  beforeEach(async () => {
    await wallet.credit(D1, 10, {})
    await wallet.holdCommission(D1, RIDE, 2)
  })

  test('converts held funds to platform revenue', async () => {
    const { wallet: w, txn } = await wallet.collectCommission(D1, RIDE)
    expect(w.balance).toBe(8)
    expect(w.heldBalance).toBe(0)
    expect(txn.type).toBe('COMMISSION')
    expect(txn.amount).toBe(-2)
  })

  test('is idempotent on repeated collection', async () => {
    await wallet.collectCommission(D1, RIDE)
    const second = await wallet.collectCommission(D1, RIDE)
    expect(second.idempotent).toBe(true)
  })

  test('throws when no HOLD exists', async () => {
    await expect(wallet.collectCommission(D1, 'nonexistent-ride')).rejects.toThrow('HOLD_NOT_FOUND')
  })
})

describe('walletService.refundCommission', () => {
  const RIDE = 'ride-003'

  beforeEach(async () => {
    await wallet.credit(D1, 10, {})
    await wallet.holdCommission(D1, RIDE, 2)
  })

  test('returns held funds to the balance', async () => {
    const { wallet: w, txn } = await wallet.refundCommission(D1, RIDE, 'cancelled by passenger')
    expect(w.balance).toBe(10)
    expect(w.heldBalance).toBe(0)
    expect(txn.type).toBe('REFUND')
    expect(txn.amount).toBe(2)
    expect(txn.metadata.reason).toBe('cancelled by passenger')
  })

  test('marks the original HOLD as reversed', async () => {
    await wallet.refundCommission(D1, RIDE)
    const originalHold = state.txns.find(t => t.rideId === RIDE && t.type === 'HOLD')
    expect(originalHold.status).toBe('reversed')
  })

  test('is idempotent on repeated refund', async () => {
    await wallet.refundCommission(D1, RIDE)
    const second = await wallet.refundCommission(D1, RIDE)
    expect(second.idempotent).toBe(true)
    expect(state.wallets.get(D1).balance).toBe(10)
  })
})

describe('walletService.isEligible', () => {
  test('returns false for driver without a wallet', async () => {
    expect(await wallet.isEligible('unknown', 5)).toBe(false)
  })

  test('returns true when balance >= required', async () => {
    await wallet.credit(D1, 5, {})
    expect(await wallet.isEligible(D1, 5)).toBe(true)
    expect(await wallet.isEligible(D1, 4.99)).toBe(true)
    expect(await wallet.isEligible(D1, 5.01)).toBe(false)
  })
})

describe('walletService.adminAdjust', () => {
  test('positive adjustment credits the balance', async () => {
    const { wallet: w, txn } = await wallet.adminAdjust(D1, 15, { note: 'promotion', adminId: 'adm-1' })
    expect(w.balance).toBe(15)
    expect(txn.type).toBe('ADMIN_ADJUST')
    expect(txn.reference).toBe('promotion')
    expect(txn.metadata.adminId).toBe('adm-1')
  })

  test('negative adjustment deducts, but only if balance supports it', async () => {
    await wallet.credit(D1, 10, {})
    const { wallet: w } = await wallet.adminAdjust(D1, -3, { note: 'penalty' })
    expect(w.balance).toBe(7)
    await expect(wallet.adminAdjust(D1, -100, { note: 'excess' })).rejects.toThrow('INSUFFICIENT_BALANCE')
  })

  test('rejects zero adjustment', async () => {
    await expect(wallet.adminAdjust(D1, 0, {})).rejects.toThrow('INVALID_AMOUNT')
  })
})
