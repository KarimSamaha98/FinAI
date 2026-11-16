import { describe, expect, it } from 'vitest'
import { bankSlugFromLoginUrl } from '../../src/modules/bank-connections/bank-connections.service.js'

describe('bankSlugFromLoginUrl', () => {
  it('returns the lowercase hostname of the pasted sign-on URL', () => {
    expect(bankSlugFromLoginUrl('https://www.cibconline.cibc.com/ebm-resources/online-banking/client/index.html#/auth/signon?locale=en')).toBe(
      'www.cibconline.cibc.com',
    )
    expect(bankSlugFromLoginUrl('HTTP://Bank.Example.COM')).toBe('bank.example.com')
  })

  it('drops the port from the slug — display name only', () => {
    expect(bankSlugFromLoginUrl('http://localhost:5175/login')).toBe('localhost')
  })

  it('returns empty string for unusable input', () => {
    expect(bankSlugFromLoginUrl('')).toBe('')
    expect(bankSlugFromLoginUrl('not a url')).toBe('')
  })
})
