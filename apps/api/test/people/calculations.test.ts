import { describe, expect, it } from 'vitest'
import { computeSplit, shareEntryAmount } from 'shared-types'

describe('computeSplit', () => {
  it('splits equally to the cent, leftover cents to the user', () => {
    const result = computeSplit(100, 'equal', [0, 0])
    expect(result.shares).toEqual([33.33, 33.33])
    expect(result.myShare).toBe(33.34)
    expect(result.problem).toBeNull()
  })

  it('does not round to the dollar', () => {
    const result = computeSplit(121.5, 'equal', [0, 0, 0])
    expect(result.shares).toEqual([30.37, 30.37, 30.37])
    expect(result.myShare).toBe(30.39)
  })

  it('gives everything to the participants when the user is left out (equal, myValue 0)', () => {
    const result = computeSplit(100, 'equal', [0, 0, 0], { myValue: 0 })
    expect(result.myShare).toBe(0)
    expect(result.shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2)
    expect(result.shares).toEqual([33.34, 33.33, 33.33])
  })

  it('a single person taking the whole amount is a loan', () => {
    const result = computeSplit(500, 'equal', [0], { myValue: 0 })
    expect(result.shares).toEqual([500])
    expect(result.myShare).toBe(0)
  })

  it('uses typed amounts as entered and gives the user the rest', () => {
    const result = computeSplit(120, 'amount', [40.5, 20])
    expect(result.shares).toEqual([40.5, 20])
    expect(result.myShare).toBe(59.5)
  })

  it('flags amounts above the total', () => {
    expect(computeSplit(50, 'amount', [40, 20]).problem).toBe('over_total')
  })

  it('percentages adding to 100 leave the user nothing, with no stray cent', () => {
    const result = computeSplit(100, 'percent', [33.333, 66.667])
    expect(result.myShare).toBe(0)
    expect(result.shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2)
  })

  it('flags percentages over 100', () => {
    expect(computeSplit(100, 'percent', [60, 50]).problem).toBe('percent_over_100')
  })

  it('splits by percent and gives the user the rest', () => {
    const result = computeSplit(100, 'percent', [25, 50])
    expect(result.shares).toEqual([25, 50])
    expect(result.myShare).toBe(25)
  })

  it('flags a zero share', () => {
    expect(computeSplit(100, 'amount', [0, 10]).problem).toBe('zero_share')
  })

  it('works on the magnitude of a negative total', () => {
    expect(computeSplit(-60, 'equal', [0]).shares).toEqual([30])
  })
})

describe('shareEntryAmount', () => {
  it('an expense split means they owe the user (+)', () => {
    expect(shareEntryAmount(-120, 60)).toBe(60)
  })

  it('money in from them means they owe less (−)', () => {
    expect(shareEntryAmount(60, 60)).toBe(-60)
  })
})
