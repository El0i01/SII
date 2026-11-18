import { z } from 'zod';
import { normalizarCpf } from '../cargas/documentos';
import { type DataISO, diasCorridosEntre } from '../calendario/dias';

/**
 * Indicadores dos objetivos estratégicos OE1 a OE6 (§3.11), como no protótipo. Os snapshots são
 * desidentificados, por território, e contagens menores que 5 são suprimidas.
 */
export const INDICADORES = [
  {
    codigo: 'ENCAMINHADOS_30D',
    objetivo: 'OE1',
    eixo: 'Acesso e permanência escolar',
    nome: 'Casos encaminhados em até 30 dias',
  },
  {
    codigo: 'VACINACAO_0_6',
    objetivo: 'OE2',
    eixo: 'Primeira infância',
    nome: 'Vacinação em dia, 0 a 6 anos',
  },
  {
    codigo: 'CRECHE_0_3',
    objetivo: 'OE2',
    eixo: 'Primeira infância',
    nome: 'Atendimento em creche, 0 a 3 anos',
  },
  {
    codigo: 'PBF_EDUCACAO',
    objetivo: 'OE3',
    eixo: 'Bolsa Família',
    nome: 'Acompanhamento de educação',
  },
  {
    codigo: 'PBF_SAUDE',
    objetivo: 'OE3',
    eixo: 'Bolsa Família',
    nome: 'Acompanhamento de saúde',
  },
  {
    codigo: 'PONTO_PRECISO',
    objetivo: 'OE4',
    eixo: 'Base territorial',
    nome: 'Domicílios com ponto de lote ou melhor',
  },
  {
    codigo: 'RELATORIOS_ENTREGUES',
    objetivo: 'OE5',
    eixo: 'Transparência',
    nome: 'Relatórios semestrais entregues',
  },
  {
    codigo: 'ACESSOS_REGISTRADOS',
    objetivo: 'OE6',
    eixo: 'Proteção de dados',
    nome: 'Acessos a dado pessoal registrados',
  },
] as const;

export type CodigoIndicador = (typeof INDICADORES)[number]['codigo'];
export const CODIGOS_INDICADOR = INDICADORES.map((i) => i.codigo) as CodigoIndicador[];
/** Indicadores que também têm snapshot por vigência do Bolsa Família. */
export const INDICADORES_POR_VIGENCIA: readonly CodigoIndicador[] = ['PBF_EDUCACAO', 'PBF_SAUDE'];
/** OE5 é contagem ("1 de 1"); os outros são percentuais. */
export const unidadeIndicador = (c: CodigoIndicador): '%' | 'contagem' =>
  c === 'RELATORIOS_ENTREGUES' ? 'contagem' : '%';
/** Indicadores sobre cidadãos (suprimidos < 5 e calculados por território). */
export const indicadorDePessoas = (c: CodigoIndicador): boolean =>
  c !== 'RELATORIOS_ENTREGUES' && c !== 'ACESSOS_REGISTRADOS';

/** Território do município inteiro nos snapshots. */
export const TERRITORIO_MUNICIPIO = 'MUN';

export interface Snapshot {
  numerador: number | null;
  denominador: number | null;
  valor: number | null;
  suprimido: boolean;
}

/**
 * Valor do snapshot com supressão: numerador ou denominador de 1 a 4 esconde os três números
 * (uma razão sobre poucas pessoas também identifica). Sem denominador, sem valor.
 */
export function calcularSnapshot(
  numerador: number,
  denominador: number,
  unidade: '%' | 'contagem' = '%',
  /** OE5 e OE6 contam relatórios e acessos de servidores, não cidadãos: sem supressão. */
  suprimir = true,
): Snapshot {
  if (numerador < 0 || denominador < 0 || numerador > denominador)
    throw new RangeError('numerador e denominador inválidos');
  const pequeno = (n: number) => n > 0 && n < 5;
  if (suprimir && unidade === '%' && (pequeno(numerador) || pequeno(denominador)))
    return { numerador: null, denominador: null, valor: null, suprimido: true };
  const valor =
    denominador === 0
      ? null
      : unidade === 'contagem'
        ? numerador
        : Math.round((numerador * 1000) / denominador) / 10;
  return { numerador, denominador, valor, suprimido: false };
}

/** Mês de referência `AAAA-MM`. */
export const periodoMensal = (d: DataISO) => d.slice(0, 7);

/** Vigência do acompanhamento do Bolsa Família: 1ª jan–jun, 2ª jul–dez (`AAAA-V1`/`AAAA-V2`). */
export function vigenciaPbf(d: DataISO): string {
  return `${d.slice(0, 4)}-V${Number(d.slice(5, 7)) <= 6 ? 1 : 2}`;
}

/** Semestre do relatório ao TCE (`AAAA-S1`/`AAAA-S2`). */
export function semestre(d: DataISO): string {
  return `${d.slice(0, 4)}-S${Number(d.slice(5, 7)) <= 6 ? 1 : 2}`;
}

export const ehSemestre = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-S[12]$/.test(s);

/** Primeiro e último dia de um semestre ou vigência (`AAAA-S1`, `AAAA-V2`). */
export function intervaloSemestre(s: string): { inicio: DataISO; fim: DataISO } {
  const m = /^(\d{4})-[SV]([12])$/.exec(s);
  if (!m) throw new RangeError('semestre inválido');
  const ano = m[1] as string;
  return m[2] === '1'
    ? { inicio: `${ano}-01-01`, fim: `${ano}-06-30` }
    : { inicio: `${ano}-07-01`, fim: `${ano}-12-31` };
}

/** "2º semestre de 2026". */
export function rotuloSemestre(s: string): string {
  const m = /^(\d{4})-S([12])$/.exec(s);
  if (!m) throw new RangeError('semestre inválido');
  return `${m[2]}º semestre de ${m[1]}`;
}

/** Semestres já iniciados de um ano até a data (para OE5: relatórios esperados). */
export function semestresAte(d: DataISO, desde: string): string[] {
  const r: string[] = [];
  const fim = semestre(d);
  let s = desde;
  for (let i = 0; i < 40 && s <= fim; i++) {
    r.push(s);
    s = s.endsWith('S1') ? `${s.slice(0, 4)}-S2` : `${Number(s.slice(0, 4)) + 1}-S1`;
  }
  return r;
}

/** OE1: o caso foi encaminhado em até 30 dias do alerta? `null` = ainda não dá para dizer. */
export function encaminhadoNoPrazo(
  alerta: DataISO,
  encaminhado: DataISO | null,
  hoje: DataISO,
): boolean | null {
  if (encaminhado) return diasCorridosEntre(alerta, encaminhado) <= 30;
  return diasCorridosEntre(alerta, hoje) > 30 ? false : null;
}

/** Frequência mínima da condicionalidade de educação do Bolsa Família (6 a 17 anos). */
export const FREQUENCIA_MINIMA_PBF = 85;

/** OE3 educação: presença no mês ≥ 85% dos dias lançados. Sem lançamento, sem informação. */
export function cumpreFrequenciaPbf(presencas: number, lancamentos: number): boolean | null {
  if (lancamentos === 0) return null;
  return (presencas * 100) / lancamentos >= FREQUENCIA_MINIMA_PBF;
}

export type SituacaoIndicador = 'EM_DIA' | 'EM_EVOLUCAO' | 'ABAIXO' | 'SEM_DADO';

export const ROTULO_SITUACAO_INDICADOR: Record<SituacaoIndicador, string> = {
  EM_DIA: 'Em dia',
  EM_EVOLUCAO: 'Em evolução',
  ABAIXO: 'Abaixo do esperado',
  SEM_DADO: 'Sem dado',
};

export const TOM_SITUACAO_INDICADOR: Record<
  SituacaoIndicador,
  'bom' | 'alerta' | 'critico' | 'neutro'
> = {
  EM_DIA: 'bom',
  EM_EVOLUCAO: 'alerta',
  ABAIXO: 'critico',
  SEM_DADO: 'neutro',
};

/**
 * Situação do indicador: atingiu a meta → em dia; senão compara com a trajetória linear da linha
 * de base (na data dela) até a meta (no prazo). Na trajetória ou acima → em evolução; abaixo →
 * abaixo do esperado. Sem base ou prazo, quem não atingiu a meta está em evolução.
 */
export function situacaoIndicador(p: {
  atual: number | null;
  meta: number | null;
  base?: number | null;
  dataBase?: DataISO | null;
  prazo?: DataISO | null;
  hoje: DataISO;
}): SituacaoIndicador {
  if (p.atual === null || p.meta === null) return 'SEM_DADO';
  if (p.atual >= p.meta) return 'EM_DIA';
  if (p.base === null || p.base === undefined || !p.dataBase || !p.prazo) return 'EM_EVOLUCAO';
  const total = diasCorridosEntre(p.dataBase, p.prazo);
  const passados = Math.min(Math.max(diasCorridosEntre(p.dataBase, p.hoje), 0), total);
  const esperado = total <= 0 ? p.meta : p.base + ((p.meta - p.base) * passados) / total;
  return p.atual >= esperado ? 'EM_EVOLUCAO' : 'ABAIXO';
}

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a data no formato AAAA-MM-DD.');

/** Nova versão da meta de um indicador (CTI e Comitê). */
export const MetaIndicador = z
  .object({
    linhaBase: z.number().min(0).nullable(),
    /** Quando a linha de base foi medida. */
    dataBase: dataIso.nullable(),
    meta: z.number().min(0, 'A meta não pode ser negativa.'),
    /** Texto da meta quando não é só um número ("Crescer por vigência"). */
    metaTexto: z.string().trim().max(60).nullable().default(null),
    prazo: dataIso.nullable(),
  })
  .refine((m) => (m.linhaBase === null) === (m.dataBase === null), {
    path: ['dataBase'],
    message: 'Informe a data da linha de base junto com o valor.',
  });
export type MetaIndicador = z.infer<typeof MetaIndicador>;

/** DPO: acessos de uma pessoa pelo CPF. Vai só no corpo do POST (nunca em URL nem log). */
export const AcessosPorCpf = z.object({
  cpf: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const n = normalizarCpf(v);
      if (!n) ctx.addIssue({ code: 'custom', message: 'Confira o CPF: os dígitos não batem.' });
      return n ?? '';
    }),
  de: dataIso.optional(),
  ate: dataIso.optional(),
});
export type AcessosPorCpf = z.infer<typeof AcessosPorCpf>;

/** Verificação da trilha de um caso pelo código verificador (auditor, Comitê, CTI, DPO). */
export const VerificarTrilha = z.object({
  caso: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,4}-\d{4}-\d{3,6}$/, 'Use o código do caso, como BA-2026-0329.'),
  verificador: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const c = v.replace(/[\s-]/g, '').toUpperCase();
      if (!/^[0-9A-F]{12}$/.test(c))
        ctx.addIssue({
          code: 'custom',
          message: 'O código verificador tem 12 letras e números (XXXX-XXXX-XXXX).',
        });
      return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
    }),
});
export type VerificarTrilha = z.infer<typeof VerificarTrilha>;
