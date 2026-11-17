import { defineConfig } from '@playwright/test';
import { envTeste, PORTA_API, PORTA_WEB, RAIZ, URL_API } from './e2e/ambiente';

/**
 * E2E do web (P11) contra API + web próprios, em portas fora das de desenvolvimento e no banco de
 * TESTE. Usa o Chrome instalado na máquina (channel: 'chrome'): não baixa navegador.
 *   pnpm --filter @sii/web e2e
 */
const env = envTeste();

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  globalSetup: './e2e/preparar.ts',
  use: {
    baseURL: `http://localhost:${PORTA_WEB}`,
    channel: 'chrome',
    headless: true,
    locale: 'pt-BR',
    timezoneId: 'America/Porto_Velho',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @sii/api build && node apps/api/dist/main.js',
      cwd: RAIZ,
      url: `${URL_API}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...env,
        API_PORTA: String(PORTA_API),
        WEB_ORIGEM: `http://localhost:${PORTA_WEB}`,
      } as Record<string, string>,
    },
    {
      command: `pnpm exec next dev --port ${PORTA_WEB}`,
      url: `http://localhost:${PORTA_WEB}/entrar`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: { ...env, NEXT_PUBLIC_API_URL: URL_API } as Record<string, string>,
    },
  ],
});
