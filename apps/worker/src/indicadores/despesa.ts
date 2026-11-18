import fs from 'node:fs';
import path from 'node:path';
import {
  ContratoTransparencia,
  converterDespesa,
  decodificar,
  type Despesa,
  detectarSeparador,
  Dicionario,
  hojeEmPortoVelho,
  lerCsv,
  lerDespesas,
  mapearCabecalho,
  mensagemColunasFaltando,
  somarDespesas,
  urlConsulta,
} from '@sii/shared';
import type { PrismaClient } from '../banco';
import { raizDoRepo } from '../config';
import {
  type Contagens,
  FalhaDefinitiva,
  type ProcessadorConsulta,
  type ProcessadorFonte,
  RejeicaoCarga,
} from '../cargas/pipeline';

/**
 * Despesa por programa (gasto × resultado, §3.11, P16, ADR 0015). Duas entradas, a mesma tabela
 * `indicadores.despesa_programa` (sem dado pessoal):
 * - **DESPESA**: CSV enviado pela Fazenda em /cargas (enquanto a API não for confirmada);
 * - **PORTAL_TRANSPARENCIA**: conector HTTP pelo contrato `config/transparencia/contrato.json`.
 * A estrutura da resposta mudou → a carga falha de forma visível (alerta da CTI) e não grava nada.
 */

export const CAMINHO_DICIONARIO_DESPESA = 'apps/worker/config/dicionarios/despesa.json';
export const CAMINHO_CONTRATO_TRANSPARENCIA = 'apps/worker/config/transparencia/contrato.json';

export function carregarDicionarioDespesa(caminho?: string): Dicionario {
  const arquivo = caminho ?? path.join(raizDoRepo(), CAMINHO_DICIONARIO_DESPESA);
  return Dicionario.parse(JSON.parse(fs.readFileSync(arquivo, 'utf8')));
}

export function carregarContratoTransparencia(
  caminho?: string,
  url?: string,
): ContratoTransparencia {
  const arquivo = caminho ?? path.join(raizDoRepo(), CAMINHO_CONTRATO_TRANSPARENCIA);
  const c = ContratoTransparencia.parse(JSON.parse(fs.readFileSync(arquivo, 'utf8')));
  return url ? { ...c, url } : c;
}

async function gravar(
  prisma: PrismaClient,
  despesas: Despesa[],
  fonte: 'API' | 'CSV',
  cargaId: number,
): Promise<number> {
  const somadas = somarDespesas(despesas);
  await prisma.$transaction(async (tx) => {
    for (const d of somadas) {
      const valores = { valorLiquidado: d.valorLiquidado, fonte, cargaId };
      await tx.despesaPrograma.upsert({
        where: { ano_mes_programa: { ano: d.ano, mes: d.mes, programa: d.programa } },
        create: { ano: d.ano, mes: d.mes, programa: d.programa, ...valores },
        update: valores,
      });
    }
  });
  return somadas.length;
}

const vazio = (): Contagens => ({
  total: 0,
  lidos: 0,
  inseridos: 0,
  rejeitados: 0,
  ligados: 0,
  novos: 0,
  revisao: 0,
  avisos: 0,
});

/** CSV da Fazenda: programa, ano, mês e valor liquidado. Reenviar substitui os valores. */
export function criarProcessadorDespesa(dic: Dicionario): ProcessadorFonte {
  return async (ctx, arquivo) => {
    await ctx.etapa('LAYOUT');
    const { texto, codificacao } = decodificar(arquivo);
    const separador = detectarSeparador(texto.split(/\r?\n/, 1)[0] ?? '');
    if (!separador)
      throw new RejeicaoCarga(
        'Não foi possível identificar o separador das colunas (; ou ,). Confira se o arquivo é um CSV.',
      );
    const [cabecalho, ...dados] = lerCsv(texto, separador);
    const { mapa, faltando } = mapearCabecalho(cabecalho?.campos ?? [], dic);
    if (faltando.length > 0) throw new RejeicaoCarga(mensagemColunasFaltando(faltando, dic.fonte));
    if (dados.length === 0)
      throw new RejeicaoCarga('O arquivo só tem o cabeçalho, sem nenhuma linha.');
    await ctx.etapa('STAGING', { total: dados.length, codificacao, separador });
    const c = vazio();
    c.total = dados.length;
    const despesas: Despesa[] = [];
    for (const l of dados) {
      c.lidos++;
      const campo = (k: string) =>
        mapa[k] === undefined ? undefined : l.campos[mapa[k] as number];
      const r = converterDespesa({
        programa: campo('programa'),
        ano: campo('ano'),
        mes: campo('mes'),
        valor: campo('valor'),
      });
      if (r.ok) despesas.push(r.despesa);
      else {
        c.rejeitados++;
        ctx.problema(l.numero, { campo: 'linha', mensagem: r.motivo, gravidade: 'ERRO' });
      }
    }
    await ctx.etapa('DESPESA');
    c.inseridos = await gravar(ctx.prisma, despesas, 'CSV', ctx.carga.id);
    return c;
  };
}

/** Busca JSON com prazo: a API fora do ar não pode travar a fila. */
async function buscarJson(url: string, prazoMs: number): Promise<unknown> {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(prazoMs),
    headers: { Accept: 'application/json' },
  });
  if (!r.ok) throw new FalhaDefinitiva(`O Portal da Transparência respondeu ${r.status}.`);
  try {
    return await r.json();
  } catch {
    throw new FalhaDefinitiva('O Portal da Transparência não respondeu em JSON.');
  }
}

/**
 * Conector do Portal da Transparência: lê os meses do ano até a referência (padrão: o mês corrente)
 * pelo contrato. Erro de contrato em qualquer mês → nada é gravado (falha visível).
 */
export function criarProcessadorTransparencia(
  contrato: ContratoTransparencia,
  opcoes: { referencia?: string; prazoMs?: number } = {},
): ProcessadorConsulta {
  return async (ctx) => {
    await ctx.etapa('DESPESA');
    const ref = opcoes.referencia ?? hojeEmPortoVelho();
    const ano = Number(ref.slice(0, 4));
    const ultimoMes = Number(ref.slice(5, 7));
    const c = vazio();
    const despesas: Despesa[] = [];
    for (let mes = 1; mes <= ultimoMes; mes++) {
      let resposta: unknown;
      try {
        resposta = await buscarJson(urlConsulta(contrato, ano, mes), opcoes.prazoMs ?? 30_000);
      } catch (e) {
        if (e instanceof FalhaDefinitiva) throw e;
        throw new FalhaDefinitiva('Não foi possível falar com o Portal da Transparência.');
      }
      const r = lerDespesas(resposta, contrato);
      if ('erroContrato' in r)
        throw new FalhaDefinitiva(`Contrato da API mudou: ${r.erroContrato}`);
      despesas.push(...r.despesas);
      c.lidos += r.despesas.length + r.rejeitadas;
      c.rejeitados += r.rejeitadas;
    }
    c.total = c.lidos;
    c.inseridos = await gravar(ctx.prisma, despesas, 'API', ctx.carga.id);
    return c;
  };
}
