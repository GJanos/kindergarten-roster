import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify('test') },
  test: {
    // Solver tests run real MILP solves; a few take seconds.
    testTimeout: 60_000,
  },
})
