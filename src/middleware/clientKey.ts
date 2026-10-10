import { timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'
import type { Request } from 'express'
import { ipKeyGenerator } from 'express-rate-limit'
import { env } from '../config/env'

function sameSecret(given: string | undefined, expected: string): boolean {
  if (!given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Identifies who a request is for rate limiting.
 *
 * Browsers reach this api through the web frontend's server, so the connecting
 * address is the frontend's, shared by every visitor. The frontend therefore
 * forwards the visitor address in `x-client-ip` together with a shared secret.
 * The header is trusted only when the secret matches; otherwise it is ignored
 * (anyone can send a header, so an unsigned one must never pick the bucket).
 */
export function clientKey(req: Request): string {
  const secret = env.PROXY_SHARED_SECRET
  const forwarded = req.headers['x-client-ip']
  const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded
  const proof = req.headers['x-proxy-secret']
  const given = Array.isArray(proof) ? proof[0] : proof

  if (secret && ip && isIP(ip) && sameSecret(given, secret)) {
    return `client:${ipKeyGenerator(ip)}`
  }
  return `conn:${ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? '127.0.0.1')}`
}
