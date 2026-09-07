import { readFileSync, writeFileSync } from 'node:fs'

const path = 'docs/openapi.yaml'
const yaml = readFileSync(path, 'utf8')

const servers = `servers:
  - url: https://emergency-ambulance-dispatch-api.vercel.app
    description: Production
  - url: http://localhost:5000
    description: Local development
`

const patched = yaml.replace(/servers:\n(?:  - url: .+\n)+/, `${servers}\n`)

if (!patched.includes('emergency-ambulance-dispatch-api.vercel.app')) {
  console.error('patch-openapi-servers: could not find servers block to replace')
  process.exit(1)
}

writeFileSync(path, patched)
