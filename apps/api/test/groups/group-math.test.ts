import { describe, expect, it } from 'vitest'
import { allocateInOrder, allocationProblem, groupNet, shareOutstanding, transferFit } from 'shared-types'

describe('groupNet', () => {
  it('a dinner shared three ways nets to the user’s third, paid or not', () => {
    // −90 dinner; Sam and Alex each owe 30. Sam's payment doesn't change the net.
    expect(groupNet([-90], [{ amount: 30, forgiven: 0 }, { amount: 30, forgiven: 0 }])).toBe(-30)
  })

  it('forgiving puts the share back on the user', () => {
    expect(groupNet([-90], [{ amount: 30, forgiven: 0 }, { amount: 30, forgiven: 30 }])).toBe(-60)
  })

  it('a loan nets to nothing', () => {
    expect(groupNet([-100], [{ amount: 100, forgiven: 0 }])).toBe(0)
  })

  it('money borrowed nets to nothing', () => {
    expect(groupNet([100], [{ amount: -100, forgiven: 0 }])).toBe(0)
  })

  it('own money with no people is the plain sum (a card payment and its statement)', () => {
    expect(groupNet([-250.1, 250.1], [])).toBe(0)
    expect(groupNet([-80, 20.5], [])).toBe(-59.5)
  })

  it('adds to the cent', () => {
    expect(groupNet([-0.1, -0.2], [{ amount: 0.1, forgiven: 0 }])).toBe(-0.2)
  })
})

describe('shareOutstanding', () => {
  it('is what’s left after payments and forgiving', () => {
    expect(shareOutstanding({ amount: 30, forgiven: 0 }, 0)).toBe(30)
    expect(shareOutstanding({ amount: 30, forgiven: 0 }, 20)).toBe(10)
    expect(shareOutstanding({ amount: 30, forgiven: 10 }, 20)).toBe(0)
  })

  it('is signed like the share: what the user owes is negative', () => {
    expect(shareOutstanding({ amount: -45, forgiven: 0 }, -20)).toBe(-25)
  })

  it('overpaying turns it around', () => {
    expect(shareOutstanding({ amount: 30, forgiven: 0 }, 35)).toBe(-5)
  })
})

describe('allocationProblem', () => {
  it('fits parts that add up to no more than the transaction', () => {
    expect(allocationProblem(75, [30, 45])).toBeNull()
    expect(allocationProblem(-75, [30, 40])).toBeNull()
  })

  it('refuses parts over the amount', () => {
    expect(allocationProblem(75, [30, 45.01])).toBe('over_amount')
  })

  it('“all of it” can’t share the transaction with anything else', () => {
    expect(allocationProblem(75, [null])).toBeNull()
    expect(allocationProblem(75, [null, 10])).toBe('whole_and_part')
  })
})

describe('allocateInOrder', () => {
  it('one e-transfer pays the oldest first', () => {
    // Alex's $75 covers Dinner ($30) and Concert ($45).
    expect(allocateInOrder(75, [30, 45])).toEqual([30, 45])
  })

  it('stops when the money runs out', () => {
    expect(allocateInOrder(50, [30, 45, 10])).toEqual([30, 20, 0])
  })

  it('leaves the rest unallocated', () => {
    expect(allocateInOrder(100, [30, 45])).toEqual([30, 45])
  })

  it('works on magnitudes', () => {
    expect(allocateInOrder(-40, [-25, -25])).toEqual([25, 15])
  })
})

describe('transferFit', () => {
  const out = { amount: -500, currencyCode: 'CAD', accountId: 'chequing', date: '2026-11-10' }

  it('the same amount into another account a few days later is a likely match', () => {
    expect(transferFit(out, { amount: 500, currencyCode: 'CAD', accountId: 'savings', date: '2026-11-12' })).toEqual({ score: 2, likely: true })
  })

  it('can’t be the same direction or the same account', () => {
    expect(transferFit(out, { amount: -500, currencyCode: 'CAD', accountId: 'savings', date: '2026-11-10' })).toBeNull()
    expect(transferFit(out, { amount: 500, currencyCode: 'CAD', accountId: 'chequing', date: '2026-11-10' })).toBeNull()
  })

  it('another currency can match, but is never "likely"', () => {
    const fit = transferFit(out, { amount: 367.5, currencyCode: 'USD', accountId: 'usd', date: '2026-11-10' })
    expect(fit?.likely).toBe(false)
  })

  it('ranks likely matches first, then by how close in date', () => {
    const score = (c: { amount: number; currencyCode: string; date: string }) => transferFit(out, { ...c, accountId: 'other' })!.score
    const likely = score({ amount: 500, currencyCode: 'CAD', date: '2026-11-16' })
    const otherCurrencySameDay = score({ amount: 360, currencyCode: 'USD', date: '2026-11-10' })
    const differentAmountNextDay = score({ amount: 495, currencyCode: 'CAD', date: '2026-11-11' })
    const sameAmountLate = score({ amount: 500, currencyCode: 'CAD', date: '2026-12-20' })
    expect(likely).toBeLessThan(otherCurrencySameDay)
    expect(otherCurrencySameDay).toBeLessThan(differentAmountNextDay)
    expect(differentAmountNextDay).toBeLessThan(sameAmountLate)
    expect(transferFit(out, { amount: 500, currencyCode: 'CAD', accountId: 'other', date: '2026-12-20' })!.likely).toBe(false)
  })
})
