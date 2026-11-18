import AxeBuilder from '@axe-core/playwright';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { lerEnvRaiz } from './ambiente';

/**
 * Critérios de aceite do P14: auditoria de acessibilidade (axe, WCAG 2.1 AA) sem erros críticos nem
 * sérios em todas as telas do menu; navegação por teclado; funciona em 360 px sem rolagem lateral.
 */
const SENHA = lerEnvRaiz().SEED_SENHA as string;

const TELAS: [login: string, caminho: string, titulo: string][] = [
  ['comite.gestor', '/', 'Visão geral'],
  ['comite.gestor', '/fichas', 'Ficha da criança'],
  ['comite.gestor', '/notificacoes', 'Notificações à Assistência Social'],
  ['comite.gestor', '/frequencia', 'Frequência da turma'],
  ['comite.gestor', '/avisos', 'Avisos'],
  ['comite.gestor', '/pauta', 'Pauta do Comitê Gestor'],
  ['comite.gestor', '/busca-ativa', 'Busca ativa escolar'],
  ['comite.gestor', '/territorio', 'Território'],
  ['comite.gestor', '/primeira-infancia', 'Primeira infância (0 a 6 anos)'],
  ['comite.gestor', '/vagas-creche', 'Simulador de vagas de creche'],
  ['comite.gestor', '/educacao-inclusiva', 'Educação inclusiva'],
  ['comite.gestor', '/eja', 'Educação de Jovens e Adultos (EJA)'],
  ['comite.gestor', '/pessoa-idosa', 'Pessoa idosa'],
  ['comite.gestor', '/vulnerabilidade', 'Índice de vulnerabilidade municipal'],
  ['cti.admin', '/cargas', 'Cargas de dados'],
  ['cti.admin', '/identidade/revisao', 'Revisão de pessoas duplicadas'],
  ['cti.admin', '/acessos', 'Acessos a dado pessoal'],
  ['cti.admin', '/controle-externo', 'Controle externo'],
  ['tce.auditor', '/', 'Visão geral'],
  ['tce.auditor', '/territorio', 'Território'],
  ['tce.auditor', '/controle-externo', 'Controle externo'],
];

const paginas = new Map<string, Page>();
async function como(browser: Browser, login: string): Promise<Page> {
  const ja = paginas.get(login);
  if (ja) return ja;
  const page = await (await browser.newContext()).newPage();
  await page.goto('/entrar');
  await page.getByLabel('Login').fill(login);
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'));
  paginas.set(login, page);
  return page;
}

async function abrir(page: Page, caminho: string, titulo: string) {
  await page.goto(caminho);
  await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
}

async function auditar(page: Page, onde: string) {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  // A análise rodou de verdade (regras aprovadas), não só uma página vazia.
  expect(r.passes.length, `axe em ${onde}`).toBeGreaterThan(15);
  const graves = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  const resumo = graves.map(
    (v) =>
      `${v.impact} · ${v.id}: ${v.nodes
        .map((n) => n.target.join(' '))
        .slice(0, 3)
        .join(' | ')}`,
  );
  expect(resumo, `axe em ${onde}`).toEqual([]);
}

test('axe sem violações críticas nem sérias, em todas as telas do menu', async ({ browser }) => {
  for (const [login, caminho, titulo] of TELAS) {
    const page = await como(browser, login);
    await abrir(page, caminho, titulo);
    await auditar(page, `${caminho} (${login})`);
  }
  // A tela de entrar, sem sessão.
  const anonimo = await (await browser.newContext()).newPage();
  await anonimo.goto('/entrar');
  await expect(anonimo.getByRole('heading', { level: 1, name: 'Entrar no SII' })).toBeVisible();
  await auditar(anonimo, '/entrar');
});

test('teclado: atalho para o conteúdo, menu e filtros', async ({ browser }) => {
  const page = await como(browser, 'semed.gestor');
  await abrir(page, '/', 'Visão geral');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Ir para o conteúdo' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#conteudo')).toBeFocused();

  // Do topo, o Tab chega aos filtros e ao menu; Enter navega.
  await page.goto('/');
  const menu = page.getByRole('navigation', { name: 'Painéis' });
  const alvo = menu.getByRole('link', { name: 'Busca ativa escolar' });
  let chegou = false;
  for (let i = 0; i < 30 && !chegou; i++) {
    await page.keyboard.press('Tab');
    chegou = await alvo.evaluate((el) => el === document.activeElement);
  }
  expect(chegou).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Busca ativa escolar' })).toBeVisible();
  await expect(alvo).toHaveAttribute('aria-current', 'page');

  // Território no cabeçalho vai para a URL e o menu leva junto.
  await page.getByLabel('Território').selectOption({ label: 'Setor 03' });
  await expect(page).toHaveURL(/territorio=S03/);
  await menu.getByRole('link', { name: 'Visão geral' }).click();
  await expect(page).toHaveURL(/\/\?territorio=S03/);
  await expect(page.getByText(/Setor 03\. Os números/)).toBeVisible();
});

test('360 px: sem rolagem lateral e menu em gaveta', async ({ browser }) => {
  const contexto = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const page = await contexto.newPage();
  await page.goto('/entrar');
  await page.getByLabel('Login').fill('comite.gestor');
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'));

  for (const [login, caminho, titulo] of TELAS) {
    if (login !== 'comite.gestor') continue;
    await abrir(page, caminho, titulo);
    const largura = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(largura, `rolagem lateral em ${caminho}`).toBeLessThanOrEqual(360);
  }

  await expect(page.getByRole('navigation', { name: 'Painéis' })).toBeHidden();
  await page.getByRole('button', { name: 'Abrir o menu' }).click();
  const gaveta = page.getByRole('dialog', { name: 'Menu' });
  await expect(gaveta).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(gaveta).toBeHidden();
  await page.getByRole('button', { name: 'Abrir o menu' }).click();
  await gaveta.getByRole('link', { name: 'Ficha da criança' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ficha da criança' })).toBeVisible();
  await expect(gaveta).toBeHidden();
});
