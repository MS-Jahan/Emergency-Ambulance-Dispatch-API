import { describe, expect, it } from 'vitest'
import { escapeHtml } from '../src/lib/emailTemplates'
import { maskEmail, maskPhone } from '../src/lib/mask'

describe('log masking and escaping', () => {
  it('masks emails and phones', () => {
    expect(maskEmail('jane.doe@example.com')).toBe('j***@example.com')
    expect(maskEmail('not-an-email')).toBe('***')
    expect(maskPhone('+8801712345678')).toBe('***5678')
    expect(maskPhone('12')).toBe('***')
  })

  it('escapes html in user-provided names', () => {
    expect(escapeHtml('<img src=x onerror=1>"&')).toBe('&lt;img src=x onerror=1&gt;&quot;&amp;')
  })
})
