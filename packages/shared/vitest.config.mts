import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      // Regras de negócio exigem 100% de cobertura de linhas (PROMPTS.md, P04).
      thresholds: { lines: 100 },
    },
  },
});
