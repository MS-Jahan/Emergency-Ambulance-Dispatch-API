import express from 'express'
import rateLimit from 'express-rate-limit'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { clientKey } from '../src/middleware/clientKey'

const SECRET = 'test-proxy-secret-0123456789'

// A tiny app with the same key function and a limit of 2, so the buckets are easy to see.
function limitedApp() {
  const app = express()
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 2,
      keyGenerator: clientKey,
      validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
    }),
  )
  app.get('/ping', (_req, res) => {
    res.json({ ok: true })
  })
  return app
}

const hit = (app: express.Express, headers: Record<string, string> = {}) =>
  request(app).get('/ping').set(headers)

describe('rate limit key', () => {
  it('gives each forwarded visitor its own bucket when the secret matches', async () => {
    const app = limitedApp()
    const a = { 'x-client-ip': '203.0.113.7', 'x-proxy-secret': SECRET }
    const b = { 'x-client-ip': '198.51.100.9', 'x-proxy-secret': SECRET }

    expect((await hit(app, a)).status).toBe(200)
    expect((await hit(app, a)).status).toBe(200)
    expect((await hit(app, a)).status).toBe(429)
    // another visitor behind the same frontend is not affected
    expect((await hit(app, b)).status).toBe(200)
  })

  it('ignores the forwarded address without the secret', async () => {
    const app = limitedApp()
    // rotating the header must not escape the limit
    expect((await hit(app, { 'x-client-ip': '203.0.113.1' })).status).toBe(200)
    expect((await hit(app, { 'x-client-ip': '203.0.113.2' })).status).toBe(200)
    expect((await hit(app, { 'x-client-ip': '203.0.113.3' })).status).toBe(429)
  })

  it('ignores the forwarded address with a wrong secret or a bad address', async () => {
    const app = limitedApp()
    const wrong = { 'x-client-ip': '203.0.113.1', 'x-proxy-secret': 'nope' }
    expect((await hit(app, wrong)).status).toBe(200)
    expect((await hit(app, { ...wrong, 'x-client-ip': '203.0.113.2' })).status).toBe(200)
    expect((await hit(app, { ...wrong, 'x-client-ip': '203.0.113.3' })).status).toBe(429)

    const app2 = limitedApp()
    const junk = { 'x-client-ip': 'not-an-ip', 'x-proxy-secret': SECRET }
    expect((await hit(app2, junk)).status).toBe(200)
    expect((await hit(app2, junk)).status).toBe(200)
    expect((await hit(app2, junk)).status).toBe(429)
  })
})
