import { defineConfig } from 'tsup'

const esmRequireShim = `import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);`

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
