import { z } from 'zod';
import type { CodigoIndicador } from './indicadores';

/**
 * Gasto × resultado (§3.11): despesa liquidada por programa. Vem da API de dados abertos do Portal
 * da Transparência (contrato configurável, a confirmar) ou de um CSV enviado pela Fazenda.
 */

/** Programas acompanhados e o indicador que mostra o resultado de cada um. */
export const PROGRAMAS = [
  { codigo: 'ATENCAO_PRIMARIA', nome: 'Atenção primária', indicador: 'VACINACAO_0_6' },
  { codigo: 'CRECHE', nome: 'Creche', indicador: 'CRECHE_0_3' },
  { codigo: 'TRANSPORTE_ESCOLAR', nome: 'Transporte escolar', indicador: 'ENCAMINHADOS_30D' },
  { codigo: 'CRAS_PAIF', nome: 'CRAS / PAIF', indicador: 'PBF_SAUDE' },
] as const satisfies readonly { codigo: string; nome: string; indicador: CodigoIndicador }[];
export type CodigoPrograma = (typeof PROGRAMAS)[number]['codigo'];

const semAcento = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

/** Programa pelo código ou pelo nome ("Atenção primária", "CRAS/PAIF"). Desconhecido: null. */
export function lerPrograma(valor: string | undefined): CodigoPrograma | null {
  if (!valor) return null;
  const n = semAcento(valor);
  const p = PROGRAMAS.find((x) => x.codigo === n || semAcento(x.nome) === n);
  return p?.codigo ?? null;
}

/** Valor em reais: aceita "1.234,56", "1234.56" e "R$ 3.900.000,00". */
export function lerValorReais(valor: string | number | undefined | null): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) && valor >= 0 ? valor : null;
  if (!valor) return null;
  let t = valor.replace(/R\$|\s/g, '');
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

export interface Despesa {
  ano: number;
  mes: number;
  programa: CodigoPrograma;
  valorLiquidado: number;
}

export type ResultadoDespesa = { ok: true; despesa: Despesa } | { ok: false; motivo: string };

/** Uma linha (do CSV ou da API) já com os campos pelo nome do contrato. */
export function converterDespesa(c: {
  programa?: string | undefined;
  ano?: string | number | undefined;
  mes?: string | number | undefined;
  valor?: string | number | undefined;
}): ResultadoDespesa {
  const programa = lerPrograma(c.programa === undefined ? undefined : String(c.programa));
  if (!programa) return { ok: false, motivo: 'Programa desconhecido.' };
  const ano = Number(c.ano);
  const mes = Number(c.mes);
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100)
    return { ok: false, motivo: 'Ano inválido.' };
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return { ok: false, motivo: 'Mês inválido.' };
  const valorLiquidado = lerValorReais(c.valor);
  if (valorLiquidado === null) return { ok: false, motivo: 'Valor liquidado inválido.' };
  return { ok: true, despesa: { ano, mes, programa, valorLiquidado } };
}

/** Contrato da API de despesa (arquivo de configuração do worker; nomes a confirmar). */
export const ContratoTransparencia = z.object({
  versaoTestada: z.string(),
  url: z.string().url(),
  /** Parâmetros fixos da consulta; `{ano}` e `{mes}` são trocados pelo período. */
  parametros: z.record(z.string(), z.string()).default({}),
  /** Caminho até a lista de itens na resposta ("dados.itens"); vazio = a resposta é a lista. */
  caminhoItens: z.string().default(''),
  campos: z.object({
    programa: z.string().min(1),
    ano: z.string().min(1),
    mes: z.string().min(1),
    valor: z.string().min(1),
  }),
});
export type ContratoTransparencia = z.infer<typeof ContratoTransparencia>;

/** Endereço da consulta com os parâmetros do período. */
export function urlConsulta(c: ContratoTransparencia, ano: number, mes: number): string {
  // Sem `URL` aqui: o shared roda também no mobile e não depende de DOM nem de Node.
  const q = Object.entries(c.parametros)
    .map(
      ([k, v]) =>
        `${encodeURIComponent(k)}=${encodeURIComponent(v.replace('{ano}', String(ano)).replace('{mes}', String(mes)))}`,
    )
    .join('&');
  if (!q) return c.url;
  return `${c.url}${c.url.includes('?') ? '&' : '?'}${q}`;
}

const ler = (obj: unknown, caminho: string): unknown =>
  caminho
    .split('.')
    .filter(Boolean)
    .reduce<unknown>(
      (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
      obj,
    );

/**
 * Lê a resposta da API pelo contrato. Estrutura diferente (sem a lista ou sem os campos) é erro
 * de contrato: a carga falha de forma visível, sem gravar pela metade (como no e-SUS).
 */
export function lerDespesas(
  resposta: unknown,
  c: ContratoTransparencia,
): { despesas: Despesa[]; rejeitadas: number } | { erroContrato: string } {
  const itens = ler(resposta, c.caminhoItens);
  if (!Array.isArray(itens))
    return { erroContrato: 'A resposta não tem a lista de itens do contrato.' };
  const faltando = Object.values(c.campos).find(
    (campo) => itens.length > 0 && !itens.some((i) => i && typeof i === 'object' && campo in i),
  );
  if (faltando) return { erroContrato: `A resposta não tem o campo "${faltando}" do contrato.` };
  const despesas: Despesa[] = [];
  let rejeitadas = 0;
  for (const i of itens as Record<string, string | number>[]) {
    const r = converterDespesa({
      programa: i[c.campos.programa] as string,
      ano: i[c.campos.ano],
      mes: i[c.campos.mes],
      valor: i[c.campos.valor],
    });
    if (r.ok) despesas.push(r.despesa);
    else rejeitadas++;
  }
  return { despesas, rejeitadas };
}

/** Soma por programa (várias linhas do mesmo programa e mês viram uma). */
export function somarDespesas(despesas: Despesa[]): Despesa[] {
  const m = new Map<string, Despesa>();
  for (const d of despesas) {
    const k = `${d.ano}-${d.mes}-${d.programa}`;
    const a = m.get(k);
    if (a) a.valorLiquidado = Math.round((a.valorLiquidado + d.valorLiquidado) * 100) / 100;
    else m.set(k, { ...d });
  }
  return [...m.values()];
}
