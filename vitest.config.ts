import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup-env.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Files share one postgres test database, so they run one at a time
    fileParallelism: false,
  },
})
