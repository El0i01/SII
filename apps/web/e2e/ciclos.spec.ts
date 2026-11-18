import { type Browser, expect, type Page, test } from '@playwright/test';
import { lerEnvRaiz } from './ambiente';

/**
 * Critérios de aceite do P19: cada painel tem os estados obrigatórios; alterar os pesos cria nova
 * versão e recalcula o mapa; listas nominais respeitam perfil e escopo.
 */
const SENHA = lerEnvRaiz().SEED_SENHA as string;

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

const PAINEIS: [caminho: string, api: string, titulo: string, kpi: string][] = [
  [
    '/primeira-infancia',
    '/ciclos/primeira-infancia',
    'Primeira infância (0 a 6 anos)',
    'Crianças de 0 a 6 anos',
  ],
  ['/vagas-creche', '/ciclos/vagas-creche', 'Simulador de vagas de creche', 'Vagas em creche hoje'],
  [
    '/educacao-inclusiva',
    '/ciclos/educacao-inclusiva',
    'Educação inclusiva',
    'Crianças identificadas',
  ],
  ['/eja', '/ciclos/eja', 'Educação de Jovens e Adultos (EJA)', 'Público potencial'],
  ['/pessoa-idosa', '/ciclos/pessoa-idosa', 'Pessoa idosa', 'Pessoas com 60 anos ou mais'],
  ['/vulnerabilidade', '/ivm', 'Índice de vulnerabilidade municipal', 'Quadras avaliadas'],
];

test('estados obrigatórios: conteúdo, erro com "Tentar de novo" e sem permissão', async ({
  browser,
}) => {
  const page = await entrar(browser, 'comite.gestor');
  for (const [caminho, rota, titulo, kpi] of PAINEIS) {
    const padrao = new RegExp(`/api/v1${rota.replace(/\//g, '\\/')}(\\?.*)?$`);
    await page.goto(caminho);
    await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible();
    await expect(page.getByText(kpi, { exact: true }).first()).toBeVisible({ timeout: 20_000 });

    await page.route(padrao, (r) =>
      r.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ codigo: 'ERRO', mensagem: 'Falha simulada do servidor.' }),
      }),
    );
    await page.reload();
    await expect(page.getByText('Falha simulada do servidor.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
    await page.unroute(padrao);
    // "Tentar de novo" recupera sem recarregar a página.
    await page.getByRole('button', { name: 'Tentar de novo' }).click();
    await expect(page.getByText(kpi, { exact: true }).first()).toBeVisible({ timeout: 20_000 });

    await page.route(padrao, (r) =>
      r.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ codigo: 'SEM_PERMISSAO', mensagem: 'Sem permissão.' }),
      }),
    );
    await page.reload();
    await expect(page.getByText(/Este painel é das equipes/)).toBeVisible();
    await page.unroute(padrao);
  }
});

test('estado vazio: índice sem quadras no território', async ({ browser }) => {
  const page = await entrar(browser, 'comite.gestor');
  await page.route(/\/api\/v1\/ivm(\?.*)?$/, async (r) => {
    const real = await (await r.fetch()).json();
    await r.fulfill({ json: { ...real, quadras: [] } });
  });
  await page.goto('/vulnerabilidade');
  await expect(page.getByText('Nenhuma quadra com índice neste território')).toBeVisible();
  await page.unroute(/\/api\/v1\/ivm(\?.*)?$/);
});

test('aprovar pesos cria nova versão e recalcula o mapa', async ({ browser }) => {
  const page = await entrar(browser, 'comite.gestor');
  // Valor da camada "Índice de vulnerabilidade" de uma quadra na lista do Território, antes.
  const valorNoMapa = async (codigo: string) => {
    await page.goto('/territorio');
    await expect(page.getByTestId('mapa')).toHaveAttribute('data-camada', 'vul', {
      timeout: 30_000,
    });
    await page.getByLabel('Buscar quadra ou setor').fill(codigo);
    return (
      await page
        .getByRole('table', { name: /^Quadras e/ })
        .locator('tbody tr')
        .first()
        .locator('td')
        .nth(2)
        .textContent()
    )?.trim();
  };

  await page.goto('/vulnerabilidade');
  const primeira =
    (
      await page
        .getByRole('table', { name: 'Quadras com maior índice de vulnerabilidade' })
        .locator('tbody tr')
        .first()
        .locator('td b')
        .first()
        .textContent()
    )?.trim() ?? '';
  const antes = await valorNoMapa(primeira);

  await page.goto('/vulnerabilidade');
  await expect(page.getByText('Pesos vigentes: a proposta inicial')).toBeVisible({
    timeout: 20_000,
  });
  const regularizacao = page.getByLabel(/^Regularização ·/);
  await regularizacao.focus();
  await page.keyboard.press('End');
  await page.getByLabel(/^Renda ·/).focus();
  await page.keyboard.press('Home');
  await page.getByLabel('Justificativa da nova versão').fill('curta');
  await page.getByRole('button', { name: 'Aprovar como nova versão' }).click();
  await expect(page.getByLabel('Justificativa da nova versão')).toBeFocused();
  await expect(page.getByText(/pelo menos 20 caracteres/)).toBeVisible();
  await page
    .getByLabel('Justificativa da nova versão')
    .fill('Regularização fundiária é a prioridade do Comitê em 2027.');
  await page.getByRole('button', { name: 'Aprovar como nova versão' }).click();
  await expect(page.getByText(/Versão 2 aprovada/)).toBeVisible();
  await expect(
    page.getByText('Pesos vigentes: versão 2, aprovada pelo Comitê Gestor.'),
  ).toBeVisible();
  const historico = page.getByRole('table', { name: 'Versões dos pesos do índice' });
  await expect(historico.locator('tbody tr')).toHaveCount(2);
  await expect(historico).toContainText('Regularização fundiária é a prioridade');

  const depois = await valorNoMapa(primeira);
  expect(depois).not.toBe(antes);
});

test('listas nominais: o ACS vê só a microárea; o auditor não vê lista', async ({ browser }) => {
  const contar = async (page: Page) => {
    const [r] = await Promise.all([
      page.waitForResponse((x) => x.url().includes('/api/v1/ciclos/pessoa-idosa')),
      page.goto('/pessoa-idosa'),
    ]);
    expect(r.ok()).toBe(true);
    return ((await r.json()) as { prioritarias?: unknown[] }).prioritarias;
  };
  const comite = await contar(await entrar(browser, 'comite.gestor'));
  const acs = await contar(await entrar(browser, 'acs.area01'));
  expect(comite?.length).toBeGreaterThan(0);
  expect(acs?.length).toBeLessThan(comite?.length ?? 0);

  const auditor = await entrar(browser, 'tce.auditor');
  expect(await contar(auditor)).toBeUndefined();
  await expect(auditor.getByText(/Seu perfil vê só os números/)).toBeVisible();
  await expect(auditor.getByText(/Contagens|< 5/).first()).toBeVisible();
});
