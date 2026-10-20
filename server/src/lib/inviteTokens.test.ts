import { describe, expect, it } from 'vitest'
import { isInviteTokenShaped, newInviteToken } from './inviteTokens.js'

describe('invite tokens', () => {
  it('accepts every token it makes', () => {
    for (let i = 0; i < 1000; i++) expect(isInviteTokenShaped(newInviteToken())).toBe(true)
  })

  it('rejects anything that could not be a token', () => {
    for (const token of ['', 'abc', 'Ab3dEf_h-jK', 'Ab3dEf_h-jKlm', 'Ab3dEf_h-jK!', 'Ab3dEf_h+jK/', 'Ab3dEf_h-jK\n']) {
      expect(isInviteTokenShaped(token)).toBe(false)
    }
  })
})
