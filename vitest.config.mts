import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Test harness for recipe-server. Mirrors the tsconfig `@/*` -> `src/*` path alias
// so tests import modules the same way the app does. (Vitest 5 shape.)
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.{test,spec}.ts', 'src/**/*.{test,spec}.ts'],
    // mongodb-memory-server can take a moment to download/boot the binary on first run
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Run serially: DB-backed integration tests share one in-memory Mongo from setup.
    pool: 'forks',
    fileParallelism: false,
    setupFiles: ['test/setup/vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.{test,spec}.ts', 'src/**/types.ts', 'src/types/**'],
    },
  },
});
