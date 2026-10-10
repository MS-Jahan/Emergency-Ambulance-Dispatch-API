import { config } from 'dotenv'

config({ path: '.env.test', override: true })
process.env.NODE_ENV = 'test'
process.env.PROXY_SHARED_SECRET = 'test-proxy-secret-0123456789'
