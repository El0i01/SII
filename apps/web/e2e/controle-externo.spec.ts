import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { lerEnvRaiz, RAIZ } from './ambiente';

/**
 * Critérios de aceite do P16: o AUDITOR_TCE navega só por agregados; o relatório gerado contém os
 * indicadores com linha de base, valor atual e meta; a trilha de um caso é verificada pelo código
 * verificador.
 */
const SENHA = lerEnvRaiz().SEED_SENHA as string;

// Uma sessão por login no arquivo inteiro: o login tem limite por minuto (P03).
const sessoes = new Map<string, Page>();
async function entrar(browser: Browser, login: string): Promise<Page> {
  const ja = sessoes.get(login);
  if (ja) return ja;
  const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
  await page.goto('/entrar');
  await page.getByLabel('Login').fill(login);
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'));
  sessoes.set(login, page);
  return page;
}

async function abrirControle(page: Page) {
  await page.goto('/controle-externo');
  await expect(page.getByRole('heading', { level: 1, name: 'Controle externo' })).toBeVisible();
  await expect(page.getByRole('table', { name: /Indicadores do/ })).toBeVisible({
    timeout: 20_000,
  });
}

/** Texto do PDF do pdfkit (streams descomprimidos, strings dos TJ), sem espaços. */
function textoDoPdf(pdf: Buffer): string {
  const bin = pdf.toString('latin1');
  const textos: string[] = [];
  for (const m of bin.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let c: string;
    try {
      c = inflateSync(Buffer.from(m[1] as string, 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    for (const tj of c.matchAll(/\[(.*?)\]\s*TJ/g))
      textos.push(
        [...(tj[1] as string).matchAll(/<([0-9a-fA-F]+)>/g)]
          .map((h) => new TextDecoder('windows-1252').decode(Buffer.from(h[1] as string, 'hex')))
          .join(''),
      );
  }
  return textos.join('').replace(/[\s·]+/g, '');
}
/** O pedaço do exceljs que o teste usa. */
interface Excel {
  Workbook: new () => {
    xlsx: { readFile(caminho: string): Promise<unknown> };
    getWorksheet(nome: string):
      | {
          getRow(n: number): { values: unknown };
          getRows(de: number, n: number): { getCell(c: number): { value: unknown } }[] | undefined;
        }
      | undefined;
  };
}
const semEspaco = (t: string) => t.replace(/[\s·]+/g, '');

test('auditor do TCE: navega o menu inteiro e só recebe agregados', async ({ browser }) => {
  const page = await entrar(browser, 'tce.auditor');
  const capturas: Promise<{ url: string; corpo: string }>[] = [];
  page.on('response', (r) => {
    const url = r.url();
    if (!url.includes('/api/v1/') || url.includes('/auth/') || url.includes('.geojson')) return;
    if (!(r.headers()['content-type'] ?? '').includes('json')) return;
    capturas.push(r.text().then((corpo) => ({ url, corpo }), () => ({ url, corpo: '' })));
  });
  await page.goto('/');
  const menu = page.getByRole('navigation', { name: 'Painéis' }).first();
  const links = await menu
    .getByRole('link')
    .evaluateAll((as) => as.map((a) => new URL((a as HTMLAnchorElement).href).pathname));
  const telas = [
    ['/', '/painel/visao-geral'],
    ['/primeira-infancia', '/ciclos/primeira-infancia'],
    ['/vagas-creche', '/ciclos/vagas-creche'],
    ['/busca-ativa', '/busca-ativa/painel'],
    ['/educacao-inclusiva', '/ciclos/educacao-inclusiva'],
    ['/eja', '/ciclos/eja'],
    ['/pessoa-idosa', '/ciclos/pessoa-idosa'],
    ['/territorio', '/mapa/quadras'],
    ['/vulnerabilidade', '/ivm'],
    ['/controle-externo', '/indicadores/controle-externo'],
  ] as const;
  expect(links).toEqual(telas.map(([caminho]) => caminho));
  for (const [caminho, rota] of telas) {
    const [resposta] = await Promise.all([
      page.waitForResponse((r) => new URL(r.url()).pathname === `/api/v1${rota}`),
      page.goto(caminho),
    ]);
    expect(resposta.ok(), rota).toBe(true);
    await resposta.finished();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  const respostas = await Promise.all(capturas);
  for (const r of respostas) {
    // Uma sequência de 11 dígitos dentro da fração de um índice não é um CPF.
    expect(r.corpo, r.url).not.toMatch(/(?<![\d.])\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/);
    expect(r.corpo, r.url).not.toMatch(
      /"(cpf|nis|cns|iniciais|nomeMae|nascimento|fichaId|moradores)"/,
    );
  }
  // Nenhuma rota de pontos individuais nem de dado nominal foi chamada.
  const urls = respostas.map((r) => r.url);
  for (const nominal of ['/mapa/pontos', '/fichas', '/notificacoes', '/auditoria/acessos'])
    expect(urls.some((u) => u.includes(nominal))).toBe(false);
});

test('relatório semestral em PDF e XLSX com linha de base, atual e meta', async ({ browser }) => {
  const page = await entrar(browser, 'tce.auditor');
  await abrirControle(page);
  const linhas = await page
    .getByRole('table', { name: /Indicadores do/ })
    .locator('tbody tr')
    .evaluateAll((trs) =>
      trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => (td.textContent ?? '').trim())),
    );
  expect(linhas).toHaveLength(8);

  const [pdf] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Baixar relatório (PDF)' }).click(),
  ]);
  expect(pdf.suggestedFilename()).toMatch(/^relatorio-tce-\d{4}-S[12]\.pdf$/);
  const bytes = fs.readFileSync(await pdf.path());
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  const texto = textoDoPdf(bytes);
  for (const [, , indicador, base, atual, meta] of linhas)
    for (const v of [indicador, base, atual, meta]) expect(texto).toContain(semEspaco(v as string));

  const [xlsx] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Baixar relatório (XLSX)' }).click(),
  ]);
  // exceljs já está no repositório (dependência da API): carregado de lá, sem dependência nova.
  const ExcelJS = createRequire(__filename)(
    path.join(RAIZ, 'apps/api/node_modules/exceljs'),
  ) as Excel;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await xlsx.path());
  const ws = wb.getWorksheet('Indicadores');
  const cab = (ws?.getRow(1).values as string[]).slice(1, 8);
  expect(cab).toEqual([
    'Objetivo',
    'Eixo',
    'Indicador',
    'Linha de base',
    'Atual',
    'Meta',
    'Situação',
  ]);
  const valores = (ws?.getRows(2, 8) ?? []).map((r) =>
    [3, 4, 5, 6].map((c) => String(r.getCell(c).value)),
  );
  expect(valores).toEqual(linhas.map((l) => [l[2], l[3], l[4], l[5]]));
});

test('trilha de um caso verificada pelo código verificador', async ({ browser }) => {
  const page = await entrar(browser, 'tce.auditor');
  await abrirControle(page);
  const tabela = page.getByRole('table', {
    name: 'Casos encerrados no semestre com o código verificador',
  });
  const primeira = tabela.locator('tbody tr').first();
  const codigo = (await primeira.locator('td').first().textContent())?.trim() ?? '';
  await primeira.getByRole('button', { name: /^Conferir/ }).click();
  await expect(page.getByRole('textbox', { name: 'Código do caso' })).toHaveValue(codigo);
  await page.getByRole('button', { name: 'Verificar a trilha' }).click();
  await expect(page.getByText('Trilha íntegra e o código confere')).toBeVisible();
  await expect(page.getByText('Alerta gerado').first()).toBeVisible();

  await page.getByRole('textbox', { name: 'Código verificador' }).fill('AAAA-BBBB-CCCC');
  await page.getByRole('button', { name: 'Verificar a trilha' }).click();
  await expect(page.getByText('O código verificador não confere')).toBeVisible();

  // Erro de formato: ligado ao campo e com foco nele.
  await page.getByRole('textbox', { name: 'Código verificador' }).fill('123');
  await page.getByRole('button', { name: 'Verificar a trilha' }).click();
  const campo = page.getByRole('textbox', { name: 'Código verificador' });
  await expect(campo).toBeFocused();
  await expect(campo).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#trilha-verificador-erro')).toContainText('12 letras e números');
});
