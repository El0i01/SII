import fs from 'node:fs';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { BOM_UTF8 } from '@sii/shared';
import { lerEnvRaiz } from './ambiente';

/**
 * Critério de aceite do P13: com o seed, o painel bate com o protótipo (74 identificados); a
 * exportação não tem CPF nem nome completo. Também: filtro "Escalonados ao Comitê" e encaminhamento.
 */
const SENHA = lerEnvRaiz().SEED_SENHA as string;

async function entrar(browser: Browser, login: string, destino: string): Promise<Page> {
  const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
  await page.goto(`/entrar?proximo=${destino}`);
  await page.getByLabel('Login').fill(login);
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(`**${destino}`);
  return page;
}

/** Valor do KPI: o parágrafo logo depois do rótulo. */
const kpi = (page: Page, rotulo: string) =>
  page.getByText(rotulo, { exact: true }).locator('xpath=following-sibling::p[1]');

test('painel da busca ativa → escalonados → encaminhar → CSV sem CPF', async ({ browser }) => {
  const semed = await entrar(browser, 'semed.gestor', '/busca-ativa');
  await expect(kpi(semed, 'Identificados')).toHaveText('74');
  const casos = semed.getByRole('region', { name: 'Casos' });
  await expect(casos.getByRole('row')).toHaveCount(11); // cabeçalho + 10 por página
  await expect(casos.getByText('1–10 de 74')).toBeVisible();

  // 1. Escalonados ao Comitê: o total da lista é o do KPI.
  const escalonados = (await kpi(semed, 'Escalonados ao Comitê').textContent()) as string;
  await casos.getByLabel('Situação').selectOption({ label: 'Escalonados ao Comitê' });
  // Com até 10 casos a tabela não pagina e mostra só o total.
  await expect(
    casos.getByText(new RegExp(`( de ${escalonados}|^${escalonados} registros?)$`)),
  ).toBeVisible();
  await expect(casos.getByRole('cell', { name: 'Vencido · coordenação' })).toHaveCount(0);

  // 2. Encaminha um caso identificado à Assistência.
  await casos.getByLabel('Situação').selectOption({ label: 'Identificado' });
  const primeiro = casos.getByRole('button', { name: /^Abrir o caso BA-/ }).first();
  const codigo = ((await primeiro.textContent()) as string).trim();
  await primeiro.click();
  const painel = semed.getByRole('region', { name: new RegExp(`^${codigo}`) });
  await painel.getByLabel('Encaminhar à secretaria').selectOption({ label: 'Assistência Social' });
  await painel.getByRole('button', { name: 'Encaminhar', exact: true }).click();
  await expect(painel.getByText('Caso encaminhado.')).toBeVisible();
  await expect(
    painel.getByRole('listitem').filter({ hasText: 'Caso encaminhado · Assistência Social' }),
  ).toBeVisible();
  await expect(painel.getByText(/^Encaminhado · Assistência Social/)).toBeVisible();

  // 3. CSV: só iniciais, sem CPF (nem mascarado) e sem nome.
  await casos.getByLabel('Situação').selectOption({ label: 'Todas' });
  const [download] = await Promise.all([
    semed.waitForEvent('download'),
    casos.getByRole('button', { name: 'Baixar CSV' }).click(),
  ]);
  const csv = fs.readFileSync((await download.path()) as string, 'utf8');
  expect(csv.startsWith(BOM_UTF8)).toBe(true);
  const linhas = csv.slice(BOM_UTF8.length).split('\r\n');
  expect(linhas[0]).toBe(
    '"Caso";"Criança";"Idade";"Território";"Quadra/Linha";"Origem";"Responsável";"Situação";"Dias";"Prazo"',
  );
  expect(linhas).toHaveLength(75);
  expect(csv).not.toMatch(/\d{3}\.\d{3}|\*\*\*/);
  for (const l of linhas.slice(1)) {
    const crianca = l.split(';')[1] as string;
    expect(crianca).toMatch(/^"([A-Z]\. ?)+"$/);
  }

  // 4. O auditor vê só os números.
  const tce = await entrar(browser, 'tce.auditor', '/busca-ativa');
  await expect(kpi(tce, 'Identificados')).toHaveText('74');
  await expect(tce.getByText('Seu perfil vê só os números agregados')).toBeVisible();
  await expect(tce.getByRole('button', { name: 'Baixar CSV' })).toHaveCount(0);
});
