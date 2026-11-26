import { describe, expect, it } from 'vitest'
import { computePeopleRealView, type RealViewEntry } from '../../src/modules/people/people-real-view.js'

const entry = (overrides: Partial<RealViewEntry>): RealViewEntry => ({
  transactionId: 't1',
  contactId: 'sam',
  contactName: 'Sam',
  kind: 'share',
  amount: 0,
  ...overrides,
})

describe('computePeopleRealView', () => {
  it('a split expense keeps only the user’s portion', () => {
    const view = computePeopleRealView([entry({ amount: 40 }), entry({ contactId: 'priya', contactName: 'Priya', amount: 40 })])
    // −120 + 40 + 40 = −40
    expect(view.deltaByTransactionId.get('t1')).toBe(80)
    expect(view.infoByTransactionId.get('t1')).toEqual({ kind: 'split', names: ['Sam', 'Priya'], contactIds: ['sam', 'priya'] })
  })

  it('money from someone nets to zero', () => {
    const view = computePeopleRealView([entry({ transactionId: 'in', amount: -40 })])
    expect(view.deltaByTransactionId.get('in')).toBe(-40)
  })

  it('a settle-up adjustment is labelled but shown at face value', () => {
    const view = computePeopleRealView([entry({ transactionId: 'adj', kind: 'writeoff', amount: -0.5 })])
    expect(view.deltaByTransactionId.has('adj')).toBe(false)
    expect(view.infoByTransactionId.get('adj')?.kind).toBe('settle_up')
  })

  it('sums cents without floating-point drift', () => {
    const view = computePeopleRealView([entry({ amount: 0.1 }), entry({ contactId: 'b', contactName: 'B', amount: 0.2 })])
    expect(view.deltaByTransactionId.get('t1')).toBe(0.3)
  })
})
