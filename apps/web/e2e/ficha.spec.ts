import { type Browser, expect, type Page, test } from '@playwright/test';
import { lerEnvRaiz, URL_API } from './ambiente';

/**
 * Critério de aceite do P12: a ficha carrega em menos de 1,5 s com o seed; revelar CPF sem finalidade
 * é recusado (422 na API, erro no campo na tela); o acesso aparece no painel do DPO.
 */
const SENHA = lerEnvRaiz().SEED_SENHA as string;

async function entrar(browser: Browser, login: string, destino: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/entrar?proximo=${destino}`);
  await page.getByLabel('Login').fill(login);
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(`**${destino}`);
  return page;
}

test('ficha → revelar CPF com finalidade → acesso no painel do DPO', async ({ browser }) => {
  const semed = await entrar(browser, 'semed.gestor', '/fichas');
  await semed.getByLabel('Mostrar').selectOption({ label: 'Precisam de visita' });
  const painel = semed.getByRole('region', { name: 'Ficha selecionada' });
  const criancas = semed.getByRole('region', { name: 'Crianças' });
  await expect(criancas.getByText(/^\d+ alertas?$/).first()).toBeVisible();

  // 1. Abre a segunda ficha da lista e mede a resposta da API.
  const item = criancas.getByRole('listitem').getByRole('button').nth(1);
  const nome = (await item.locator('b').textContent()) as string;
  const resposta = semed.waitForResponse((r) => /\/fichas\/\d+$/.test(r.url()));
  const inicio = Date.now();
  await item.click();
  const r = await resposta;
  expect(r.status()).toBe(200);
  await expect(
    painel.getByRole('heading', { level: 2, name: new RegExp(`^${nome.replace(/\./g, '\\.')}`) }),
  ).toBeVisible();
  expect(Date.now() - inicio).toBeLessThan(1500);
  const ficha = (await r.json()) as { id: number; codigo: string; cpf: string };
  expect(ficha.cpf).toMatch(/^\*\*\*\.\d{3}\.\d{3}-\*\*$/);
  await expect(painel.getByText('Precisa de visita')).toBeVisible();
  await expect(painel.getByRole('heading', { name: 'Histórico no município' })).toBeVisible();
  await expect(painel.getByRole('heading', { name: 'Relatórios de visita' })).toBeVisible();

  // 2. Sem finalidade: a tela não envia e liga o erro ao campo; a API responde 422.
  await painel.getByRole('button', { name: 'Revelar CPF' }).click();
  await painel.getByRole('button', { name: 'Revelar e registrar acesso' }).click();
  await expect(painel.getByText('Escolha a finalidade.')).toBeVisible();
  await expect(painel.getByLabel('Finalidade')).toBeFocused();
  const semFinalidade = await semed.request.post(`${URL_API}/fichas/${ficha.id}/revelar-cpf`, {
    data: {},
  });
  expect(semFinalidade.status()).toBe(422);

  // 3. Com finalidade: o CPF aparece inteiro.
  await painel
    .getByLabel('Finalidade')
    .selectOption({ label: 'Contato com a família para matrícula' });
  await painel.getByRole('button', { name: 'Revelar e registrar acesso' }).click();
  await expect(painel.getByText(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/)).toBeVisible();
  await expect(painel.getByText(/acesso foi registrado/)).toBeVisible();

  // 4. O DPO vê o registro do acesso, sem o número revelado.
  const dpo = await entrar(browser, 'dpo.encarregado', '/acessos');
  await dpo.getByLabel('Login do usuário').fill('semed.gestor');
  await dpo.getByRole('button', { name: 'Filtrar' }).click();
  const linha = dpo.getByRole('row').filter({ hasText: ficha.codigo }).first();
  await expect(linha).toBeVisible();
  await expect(linha).toContainText('Contato com a família para matrícula');
  await expect(linha).toContainText('SEMED_GESTOR');
  await expect(dpo.getByText(/\d{3}\.\d{3}\.\d{3}-\d{2}/)).toHaveCount(0);

  // 5. O DPO não abre fichas.
  await dpo.goto('/fichas');
  await expect(dpo.getByText('Seu perfil não vê dados nominais.', { exact: false })).toBeVisible();
});
