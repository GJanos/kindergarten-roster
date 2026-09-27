import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Solver tests run real MILP solves; a few take seconds.
    testTimeout: 60_000,
  },
})
