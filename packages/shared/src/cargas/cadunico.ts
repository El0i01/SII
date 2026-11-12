import type { DataISO } from '../calendario/dias';
import { normalizarNomePessoa } from '../pessoas/similaridade';
import { lerData, lerDecimal, normalizarCpf, normalizarNis } from './documentos';

/**
 * Conversão de uma linha do CadÚnico (CECAD ou Portal de Gestão) para o registro da carga (P08).
 * As mensagens de erro são fixas e nunca trazem o valor da célula (CPF e NIS não podem ir para log).
 */

export const FAIXAS_RENDA = [
  'EXTREMA_POBREZA',
  'POBREZA',
  'BAIXA_RENDA',
  'ACIMA_MEIO_SALARIO',
] as const;
export type FaixaRenda = (typeof FAIXAS_RENDA)[number];
export type PapelFamiliar = 'RESPONSAVEL' | 'CONJUGE' | 'FILHO' | 'NETO' | 'OUTRO';

/** Linhas de renda per capita (R$), configuráveis no dicionário. */
export interface LinhasRenda {
  extremaPobreza: number;
  pobreza: number;
  meioSalarioMinimo: number;
}

/** `fx_rfpc` do CECAD: 1 extrema pobreza, 2 pobreza, 3 baixa renda, 4 acima de ½ salário. */
export function faixaPorCodigo(codigo: string): FaixaRenda | null {
  const n = Number(codigo.trim());
  return Number.isInteger(n) && n >= 1 && n <= 4 ? (FAIXAS_RENDA[n - 1] as FaixaRenda) : null;
}

export function faixaPorRenda(perCapita: number, linhas: LinhasRenda): FaixaRenda {
  if (perCapita <= linhas.extremaPobreza) return 'EXTREMA_POBREZA';
  if (perCapita <= linhas.pobreza) return 'POBREZA';
  if (perCapita <= linhas.meioSalarioMinimo) return 'BAIXA_RENDA';
  return 'ACIMA_MEIO_SALARIO';
}

/** `cod_parentesco_rf_pessoa`: 1 RF, 2 cônjuge, 3 filho, 4 enteado, 5 neto; o resto é OUTRO. */
export function papelPorParentesco(codigo: string | undefined): PapelFamiliar {
  switch (Number((codigo ?? '').trim())) {
    case 1:
      return 'RESPONSAVEL';
    case 2:
      return 'CONJUGE';
    case 3:
    case 4:
      return 'FILHO';
    case 5:
      return 'NETO';
    default:
      return 'OUTRO';
  }
}

function sexo(valor: string | undefined): 'FEMININO' | 'MASCULINO' | null {
  const v = (valor ?? '').trim().toUpperCase();
  if (v === '1' || v === 'M' || v === 'MASCULINO') return 'MASCULINO';
  if (v === '2' || v === 'F' || v === 'FEMININO') return 'FEMININO';
  return null;
}

function simNao(valor: string | undefined): boolean {
  const v = (valor ?? '').trim().toUpperCase();
  return v === '1' || v === 'S' || v === 'SIM' || v === 'TRUE';
}

export interface RegistroCadunico {
  codigoFamiliar: string;
  nome: string;
  nis: string | null;
  cpf: string | null;
  nascimento: DataISO;
  mae: string | null;
  sexo: 'FEMININO' | 'MASCULINO' | null;
  papel: PapelFamiliar;
  faixaRenda: FaixaRenda;
  recebePbf: boolean;
  atualizadoEm: DataISO | null;
  qtdPessoas: number | null;
}

export interface ProblemaLinha {
  campo: string;
  mensagem: string;
  /** ERRO descarta a linha; AVISO carrega a linha sem o dado com problema. */
  gravidade: 'ERRO' | 'AVISO';
}

export type ResultadoLinha =
  | { ok: true; registro: RegistroCadunico; avisos: ProblemaLinha[] }
  | { ok: false; problemas: ProblemaLinha[] };

/** Valores da linha já separados por campo do dicionário (ausente = coluna não existe). */
export type CamposCadunico = Partial<
  Record<
    | 'codigoFamiliar'
    | 'nome'
    | 'nis'
    | 'cpf'
    | 'nascimento'
    | 'mae'
    | 'sexo'
    | 'parentesco'
    | 'faixaRenda'
    | 'rendaPerCapita'
    | 'pbf'
    | 'atualizadoEm'
    | 'qtdPessoas',
    string
  >
>;

const vazio = (v: string | undefined) => (v ?? '').trim() === '';

export function converterLinhaCadunico(c: CamposCadunico, linhas: LinhasRenda): ResultadoLinha {
  const erros: ProblemaLinha[] = [];
  const avisos: ProblemaLinha[] = [];
  const erro = (campo: string, mensagem: string) =>
    erros.push({ campo, mensagem, gravidade: 'ERRO' });

  const codigoFamiliar = (c.codigoFamiliar ?? '').replace(/\D/g, '');
  if (codigoFamiliar.length === 0 || codigoFamiliar.length > 20)
    erro('codigoFamiliar', 'Código familiar vazio ou inválido.');

  const nome = (c.nome ?? '').trim().replace(/\s+/g, ' ');
  if (normalizarNomePessoa(nome).length < 2) erro('nome', 'Nome da pessoa vazio.');

  const nascimento = lerData(c.nascimento);
  if (!nascimento) erro('nascimento', 'Data de nascimento vazia ou inválida.');

  const nis = normalizarNis(c.nis);
  if (!vazio(c.nis) && !nis) erro('nis', 'NIS inválido (dígito verificador não confere).');

  const cpf = normalizarCpf(c.cpf);
  if (!vazio(c.cpf) && !cpf)
    avisos.push({
      campo: 'cpf',
      mensagem: 'CPF inválido: a pessoa foi carregada sem CPF.',
      gravidade: 'AVISO',
    });

  let faixaRenda: FaixaRenda | null = null;
  if (!vazio(c.faixaRenda)) faixaRenda = faixaPorCodigo(c.faixaRenda as string);
  if (!faixaRenda) {
    const renda = lerDecimal(c.rendaPerCapita);
    if (renda !== null && renda >= 0) faixaRenda = faixaPorRenda(renda, linhas);
  }
  if (!faixaRenda) erro('faixaRenda', 'Faixa de renda e renda per capita vazias ou inválidas.');

  const qtd = lerDecimal(c.qtdPessoas);

  if (erros.length > 0) return { ok: false, problemas: [...erros, ...avisos] };
  const mae = (c.mae ?? '').trim().replace(/\s+/g, ' ');
  return {
    ok: true,
    avisos,
    registro: {
      codigoFamiliar,
      nome,
      nis,
      cpf,
      nascimento: nascimento as DataISO,
      mae: normalizarNomePessoa(mae).length >= 2 ? mae : null,
      sexo: sexo(c.sexo),
      papel: papelPorParentesco(c.parentesco),
      faixaRenda: faixaRenda as FaixaRenda,
      recebePbf: simNao(c.pbf),
      atualizadoEm: lerData(c.atualizadoEm),
      qtdPessoas: qtd !== null && Number.isInteger(qtd) && qtd > 0 && qtd < 100 ? qtd : null,
    },
  };
}
