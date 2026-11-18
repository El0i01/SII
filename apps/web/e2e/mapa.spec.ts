import { type Browser, expect, type Page, test } from '@playwright/test';
import { CAMADAS_MAPA, ROTULO_CAMADA_MAPA } from '@sii/shared';
import { lerEnvRaiz } from './ambiente';

/**
 * Critérios de aceite do P15: troca de camada em menos de 300 ms com o seed; mapa utilizável pelo
 * teclado (lista de quadras alternativa); o auditor do TCE nunca recebe ponto individual nem morador.
 */
const SENHA = lerEnvRaiz().SEED_SENHA as string;
const LIMITE_TROCA_MS = 300;

// Uma sessão por login no arquivo inteiro: o login tem limite por minuto (P03).
const sessoes = new Map<string, Page>();
async function entrar(browser: Browser, login: string): Promise<Page> {
  const ja = sessoes.get(login);
  if (ja) return ja;
  const page = await (await browser.newContext()).newPage();
  await page.goto('/entrar');
  await page.getByLabel('Login').fill(login);
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'));
  sessoes.set(login, page);
  return page;
}

async function abrirMapa(page: Page) {
  await page.goto('/territorio');
  await expect(page.getByRole('heading', { level: 1, name: 'Território' })).toBeVisible();
  // Mapa carregado e parado na camada inicial.
  await expect(page.getByTestId('mapa')).toHaveAttribute('data-camada', 'vul', { timeout: 30_000 });
}

test('troca de camada em menos de 300 ms, em todas as camadas', async ({ browser }) => {
  const page = await entrar(browser, 'comite.gestor');
  await abrirMapa(page);
  const mapa = page.getByTestId('mapa');
  const tempos: Record<string, number> = {};
  const parado: Record<string, number> = {};
  // Ida e volta: cada camada é medida depois de outra (a primeira vez de cada uma conta).
  for (const c of [...CAMADAS_MAPA.slice(1), CAMADAS_MAPA[0]]) {
    await page.getByLabel('Camada').selectOption(c);
    await expect(mapa).toHaveAttribute('data-camada', c);
    tempos[c] = Number(await mapa.getAttribute('data-troca-ms'));
    parado[c] = Number(await mapa.getAttribute('data-parado-ms'));
  }
  test.info().annotations.push({ type: 'tempos (ms)', description: JSON.stringify(tempos) });
  test.info().annotations.push({ type: 'até parar (ms)', description: JSON.stringify(parado) });
  for (const [c, ms] of Object.entries(tempos))
    expect(ms, `${ROTULO_CAMADA_MAPA[c as keyof typeof ROTULO_CAMADA_MAPA]}`).toBeLessThan(
      LIMITE_TROCA_MS,
    );
});

test('quadra aberta só pelo teclado, pela lista de quadras', async ({ browser }) => {
  const page = await entrar(browser, 'comite.gestor');
  await abrirMapa(page);
  const busca = page.getByLabel('Buscar quadra ou setor');
  await busca.focus();
  await page.keyboard.type('S01');
  const botao = page.getByRole('button', { name: /^Ver quadra/ }).first();
  // Tab até o primeiro "Ver quadra" (sem mouse).
  for (let i = 0; i < 20 && !(await botao.evaluate((b) => b === document.activeElement)); i++)
    await page.keyboard.press('Tab');
  await expect(botao).toBeFocused();
  await page.keyboard.press('Enter');
  const detalhe = page.getByRole('region', { name: 'Detalhe da quadra' });
  await expect(detalhe.getByRole('heading', { level: 3, name: /^Quadra / })).toBeFocused();
  await expect(detalhe.getByText(/^L01/)).toBeVisible();
  await expect(page).toHaveURL(/quadra=\d+/);
});

test('auditor: sem pontos individuais e sem moradores', async ({ browser }) => {
  const page = await entrar(browser, 'tce.auditor');
  const pedidos: string[] = [];
  page.on('request', (r) => pedidos.push(r.url()));
  await abrirMapa(page);
  await page.getByLabel('Camada').selectOption('calor03');
  await expect(page.getByTestId('mapa')).toHaveAttribute('data-camada', 'calor03');
  expect(pedidos.some((u) => u.includes('/mapa/pontos'))).toBe(false);
  await expect(page.getByText(/Seu perfil vê só números por quadra/)).toBeVisible();

  await page
    .getByRole('button', { name: /^Ver quadra/ })
    .first()
    .click();
  const detalhe = page.getByRole('region', { name: 'Detalhe da quadra' });
  await expect(detalhe.getByText(/^L01/)).toBeVisible();
  await expect(detalhe.getByText(/Quem mora em cada lote aparece para as equipes/)).toBeVisible();
  await expect(detalhe.getByRole('link', { name: /Abrir ficha/ })).toHaveCount(0);
});
