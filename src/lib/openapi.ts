import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const OPENAPI_RELATIVE_PATH = join('docs', 'openapi.yaml')

function openApiCandidates(): string[] {
  return [
    join(process.cwd(), OPENAPI_RELATIVE_PATH),
    join(process.cwd(), '..', OPENAPI_RELATIVE_PATH),
  ]
}

export function readOpenApiSpec(): string {
  for (const candidate of openApiCandidates()) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // try next path (local dev vs vercel bundle layout)
    }
  }

  throw new Error(`OpenAPI spec not found. Looked in: ${openApiCandidates().join(', ')}`)
}
