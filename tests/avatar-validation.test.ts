import { describe, expect, it } from 'vitest'
import { updateProfileSchema } from '../src/modules/auth/auth.validation'

const tiny = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=='

describe('updateProfileSchema avatarUrl', () => {
  it('accepts a small image data URL and null (remove)', () => {
    expect(updateProfileSchema.safeParse({ avatarUrl: tiny }).success).toBe(true)
    expect(updateProfileSchema.safeParse({ avatarUrl: null }).success).toBe(true)
  })

  it('rejects other URLs, non-image types and oversize payloads', () => {
    expect(updateProfileSchema.safeParse({ avatarUrl: 'https://x.test/a.png' }).success).toBe(false)
    expect(
      updateProfileSchema.safeParse({ avatarUrl: 'data:text/html;base64,PGh0bWw+' }).success,
    ).toBe(false)
    expect(
      updateProfileSchema.safeParse({ avatarUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }).success,
    ).toBe(false)
    const big = `data:image/jpeg;base64,${'A'.repeat(60_001)}`
    expect(updateProfileSchema.safeParse({ avatarUrl: big }).success).toBe(false)
  })
})
