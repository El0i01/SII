import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { iniciais } from '@sii/shared';
import { DADOS, type DadosE2E, envTeste, lerEnvRaiz, RAIZ, URL_API } from './ambiente';

/**
 * Critério de aceite do P11: falta → notificação → parecer → evento na trilha → aviso à escola;
 * o perfil ESCOLA não consegue emitir parecer. Tudo com dados fictícios do seed, no banco de teste.
 */
const dados = JSON.parse(fs.readFileSync(DADOS, 'utf8')) as DadosE2E;
const SENHA = lerEnvRaiz().SEED_SENHA as string;
const PARECER =
  'Visita feita com a responsável. A criança volta às aulas na segunda; transporte combinado com a escola.';
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

async function entrar(browser: Browser, login: string, destino: string): Promise<Page> {
  const contexto = await browser.newContext();
  const page = await contexto.newPage();
  await page.goto(`/entrar?proximo=${destino}`);
  await page.getByLabel('Login').fill(login);
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(`**${destino}`);
  return page;
}

test('falta → notificação ao CRAS → parecer → trilha → aviso à escola', async ({ browser }) => {
  // 1. A escola lança 5 faltas seguidas pela grade de frequência.
  const escola = await entrar(browser, 'escola.custodio', '/frequencia');
  await escola.getByLabel('Turma').selectOption({ label: dados.turma });
  for (const dia of dados.dias) {
    await escola.getByLabel('Mês').fill(dia.slice(0, 7));
    const celula = escola.getByRole('button', {
      name: new RegExp(`^${dados.aluno}, ${ddmm(dia)}:`),
    });
    await celula.focus();
    await escola.keyboard.press('f');
    await expect(
      escola.getByRole('button', { name: `${dados.aluno}, ${ddmm(dia)}: falta, ainda não salvo` }),
    ).toBeVisible();
    await expect(escola.getByText(/^Salvo às/)).toBeVisible();
  }

  // 2. O job diário roda (como às 6h) e notifica o CRAS.
  const saida = execFileSync('pnpm', ['--filter', '@sii/worker', 'infrequencia:rodar'], {
    cwd: RAIZ,
    env: envTeste(),
    encoding: 'utf8',
  });
  expect(saida).toMatch(/"criados":[1-9]/);

  // 3. O CRAS abre a notificação, erra a validação e envia o parecer.
  const cras = await entrar(browser, 'cras.tecnico', '/notificacoes');
  await cras.getByLabel('Situação').selectOption({ label: 'Nova' });
  const item = cras.getByRole('button', { name: new RegExp(`· ${iniciais(dados.aluno)}`) }).first();
  await item.click();
  // A notificação nova é a de hoje (as do seed são de antes).
  const hojeBr = dados.hoje.split('-').reverse().join('/');
  await expect(
    cras.getByText(`5 dias letivos seguidos sem frequência · recebida em ${hojeBr}`, {
      exact: false,
    }),
  ).toBeVisible();
  const codigo = (await cras
    .getByRole('heading', { level: 2, name: /^NT-/ })
    .textContent()) as string;

  await cras.getByLabel('Desfecho').selectOption({ label: 'Retorno à escola combinado' });
  await cras.getByLabel('Parecer', { exact: true }).fill('Texto curto demais.');
  await cras.getByRole('button', { name: 'Enviar parecer à escola' }).click();
  await expect(cras.getByText('Escreva pelo menos 30 caracteres.')).toBeVisible();
  await expect(cras.getByLabel('Parecer', { exact: true })).toBeFocused();

  await cras.getByLabel('Parecer', { exact: true }).fill(PARECER);
  await cras.getByRole('button', { name: 'Enviar parecer à escola' }).click();
  await expect(cras.getByText('Parecer: Retorno à escola combinado')).toBeVisible();

  // 4. O evento entra na trilha do caso, com código verificador.
  const trilha = cras.getByRole('region', { name: 'Trilha do caso' });
  await expect(trilha.getByRole('listitem').filter({ hasText: 'Parecer emitido' })).toBeVisible();
  await expect(trilha.getByText(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/)).toBeVisible();

  // 5. A escola recebe o aviso e lê o parecer, sem formulário para responder.
  await escola.goto('/avisos');
  const aviso = escola.getByText(/O CRAS emitiu o parecer do caso IF-\d{4}-\d{4}: Retorno/);
  await expect(aviso).toBeVisible();
  await escola.getByRole('link', { name: `Ver notificação ${codigo}` }).click();
  await expect(escola.getByText(PARECER)).toBeVisible();
  await expect(escola.getByRole('button', { name: 'Enviar parecer à escola' })).toHaveCount(0);

  // 6. Mesmo direto na API, a escola não emite parecer.
  const r = await escola.request.post(`${URL_API}/notificacoes/${codigo}/parecer`, {
    data: { desfecho: 'RETORNO_ESCOLA_COMBINADO', texto: PARECER },
  });
  expect(r.status()).toBe(403);
});
