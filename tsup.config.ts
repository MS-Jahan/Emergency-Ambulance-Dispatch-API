import { defineConfig } from 'tsup'

const esmRequireShim =
  "import { createRequire } from 'module';\nconst require = createRequire(import.meta.url);"

export default defineConfig([
  {
    entry: ['src/server.ts'],
    format: ['esm'],
    outExtension: () => ({ js: '.js' }),
    sourcemap: true,
    clean: true,
    target: 'node20',
    banner: { js: esmRequireShim },
  },
  {
    entry: ['src/server.ts'],
    format: ['cjs'],
    outExtension: () => ({ js: '.cjs' }),
    sourcemap: true,
    target: 'node20',
  },
])
