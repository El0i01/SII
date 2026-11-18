import { suprimirContagem } from '../casos/busca-ativa';
import { faixaIvm } from '../indice/ivm';
import type { FonteGeo } from '../territorio/geocodificacao';

/**
 * Camadas da tela Território (P15), como no protótipo. Todas são calculadas no cliente a partir de
 * um único pedido de indicadores por quadra: trocar de camada não vai ao servidor.
 */
export const CAMADAS_MAPA = [
  'vul',
  'calor03',
  'pcf',
  'calorIdosos',
  'casos',
  'reurb',
  'prec',
] as const;
export type CamadaMapa = (typeof CAMADAS_MAPA)[number];

export const ROTULO_CAMADA_MAPA: Record<CamadaMapa, string> = {
  vul: 'Índice de vulnerabilidade',
  calor03: 'Calor: crianças de 0 a 3 anos',
  pcf: 'Criança Feliz: famílias acompanhadas',
  calorIdosos: 'Calor: pessoas idosas sozinhas sem visita',
  casos: 'Casos de busca ativa',
  reurb: 'Situação dos lotes (Reurb e cadastro)',
  prec: 'Verificação: precisão do ponto',
};

/** Como a camada aparece: quadras pintadas por classe, calor (heatmap) ou pontos. */
export const TIPO_CAMADA_MAPA: Record<CamadaMapa, 'quadra' | 'calor' | 'pontos'> = {
  vul: 'quadra',
  calor03: 'calor',
  pcf: 'pontos',
  calorIdosos: 'calor',
  casos: 'quadra',
  reurb: 'quadra',
  prec: 'quadra',
};

export function ehCamadaMapa(v: unknown): v is CamadaMapa {
  return typeof v === 'string' && (CAMADAS_MAPA as readonly string[]).includes(v);
}

/**
 * Cor da legenda: nome de token do CSS (`--color-<token>`), nunca hex solto.
 * `mapa-1` (mais escuro) a `mapa-6` (cinza) é a escala sequencial do protótipo.
 */
export type TokenCor =
  | 'mapa-1'
  | 'mapa-2'
  | 'mapa-3'
  | 'mapa-4'
  | 'mapa-5'
  | 'mapa-6'
  | 'alerta-destaque'
  | 'erro'
  | 'primaria'
  | 'superficie';

export interface ItemLegenda {
  classe: string;
  rotulo: string;
  cor: TokenCor;
}

/** Classe neutra: quadra sem pintura (camadas de calor e de pontos) ou sem informação. */
export const CLASSE_NEUTRA = 'neutra';
/** Contagem de 1 a 4 escondida para o auditor. */
export const CLASSE_SUPRIMIDA = 'suprimida';

const SEM_DADO: ItemLegenda = {
  classe: CLASSE_NEUTRA,
  rotulo: 'Sem informação',
  cor: 'superficie',
};

export const LEGENDA_CAMADA_MAPA: Record<CamadaMapa, ItemLegenda[]> = {
  vul: [
    { classe: 'BAIXA', rotulo: 'Baixa', cor: 'mapa-5' },
    { classe: 'MODERADA', rotulo: 'Moderada', cor: 'mapa-4' },
    { classe: 'ALTA', rotulo: 'Alta', cor: 'alerta-destaque' },
    { classe: 'MUITO_ALTA', rotulo: 'Muito alta', cor: 'erro' },
    SEM_DADO,
  ],
  calor03: [{ classe: 'calor', rotulo: 'Concentração de crianças de 0 a 3 anos', cor: 'primaria' }],
  pcf: [
    { classe: 'em-dia', rotulo: 'Família com visita em dia', cor: 'primaria' },
    { classe: 'atrasada', rotulo: 'Visita atrasada (14+ dias)', cor: 'alerta-destaque' },
  ],
  calorIdosos: [
    { classe: 'calor', rotulo: 'Concentração de pessoas idosas sozinhas sem visita', cor: 'erro' },
  ],
  casos: [
    { classe: '0', rotulo: 'Nenhum caso', cor: 'mapa-5' },
    { classe: '1', rotulo: '1', cor: 'mapa-3' },
    { classe: '2', rotulo: '2', cor: 'alerta-destaque' },
    { classe: '3', rotulo: '3 ou mais', cor: 'erro' },
    { classe: CLASSE_SUPRIMIDA, rotulo: 'De 1 a 4 (número protegido)', cor: 'mapa-4' },
  ],
  reurb: [
    { classe: '0', rotulo: 'Todos regulares', cor: 'mapa-5' },
    { classe: '25', rotulo: 'Até 25% irregulares', cor: 'mapa-4' },
    { classe: '50', rotulo: 'De 25% a 50%', cor: 'alerta-destaque' },
    { classe: '100', rotulo: 'Mais de 50%', cor: 'erro' },
    SEM_DADO,
  ],
  prec: [
    { classe: 'GPS', rotulo: 'GPS do Censo ou confirmado em campo', cor: 'mapa-1' },
    { classe: 'LOTE', rotulo: 'Lote cadastral', cor: 'mapa-2' },
    { classe: 'ESUS_TERRITORIO', rotulo: 'e-SUS', cor: 'mapa-3' },
    { classe: 'CNEFE', rotulo: 'CNEFE', cor: 'mapa-4' },
    { classe: 'BAIXA', rotulo: 'Baixa precisão (SIGEF/CAR ou setor)', cor: 'mapa-6' },
    SEM_DADO,
  ],
};

/** Situação dos lotes do cadastro (fonte: Fazenda), com a cor do detalhe da quadra. */
export const COR_SITUACAO_LOTE: Record<string, TokenCor> = {
  REGULAR: 'mapa-5',
  TITULADO: 'mapa-5',
  SEM_INSCRICAO: 'alerta-destaque',
  REURB_EM_ANALISE: 'erro',
  VAZIO: 'superficie',
};
const IRREGULARES = new Set(['SEM_INSCRICAO', 'REURB_EM_ANALISE']);
export const loteIrregular = (situacao: string) => IRREGULARES.has(situacao);

/** Contagem de pessoas: `null` = de 1 a 4, escondida para o auditor. */
export type Contagem = number | null;

/** Tudo o que as 7 camadas e o detalhe precisam de uma quadra. */
export interface IndicadoresQuadra {
  id: number;
  codigo: string;
  setor: string;
  provisoria: boolean;
  /** Centro da quadra [lon, lat]: base do calor agregado do auditor. */
  centro: [number, number] | null;
  ivm: number | null;
  /** Lotes não são dado pessoal: nunca suprimidos. */
  lotes: number;
  lotesIrregulares: number;
  domicilios: Contagem;
  domiciliosPorFonte: Partial<Record<FonteGeo, Contagem>>;
  criancas03: Contagem;
  criancasVisita: Contagem;
  familiasPcf: Contagem;
  pcfAtrasadas: Contagem;
  idosos: Contagem;
  idososSozinhos: Contagem;
  idososSozinhosSemVisita: Contagem;
  casosBuscaAtiva: Contagem;
}

const CONTAGENS = [
  'domicilios',
  'criancas03',
  'criancasVisita',
  'familiasPcf',
  'pcfAtrasadas',
  'idosos',
  'idososSozinhos',
  'idososSozinhosSemVisita',
  'casosBuscaAtiva',
] as const;

/** Versão do auditor (e da Fazenda): contagens de pessoas e domicílios de 1 a 4 viram `null`. */
export function suprimirIndicadores(q: IndicadoresQuadra): IndicadoresQuadra {
  const r: IndicadoresQuadra = { ...q, domiciliosPorFonte: {} };
  for (const k of CONTAGENS) r[k] = q[k] === null ? null : suprimirContagem(q[k]);
  for (const [f, n] of Object.entries(q.domiciliosPorFonte)) {
    r.domiciliosPorFonte[f as FonteGeo] =
      n === null || n === undefined ? null : suprimirContagem(n);
  }
  return r;
}

const GRUPO_FONTE: Record<FonteGeo, string> = {
  CONFIRMADO_USUARIO: 'GPS',
  CENSO_GPS: 'GPS',
  LOTE: 'LOTE',
  ESUS_TERRITORIO: 'ESUS_TERRITORIO',
  CNEFE: 'CNEFE',
  SIGEF_CAR: 'BAIXA',
  SETOR: 'BAIXA',
};
const ORDEM_GRUPO = ['GPS', 'LOTE', 'ESUS_TERRITORIO', 'CNEFE', 'BAIXA'];

/** Grupo de fonte com mais domicílios na quadra (empate: o mais preciso). Suprimido conta 0. */
export function fontePredominante(q: IndicadoresQuadra): string | null {
  const soma = new Map<string, number>();
  for (const [f, n] of Object.entries(q.domiciliosPorFonte)) {
    const g = GRUPO_FONTE[f as FonteGeo];
    soma.set(g, (soma.get(g) ?? 0) + (n ?? 0));
  }
  let melhor: string | null = null;
  let max = 0;
  for (const g of ORDEM_GRUPO) {
    const n = soma.get(g) ?? 0;
    if (n > max) {
      melhor = g;
      max = n;
    }
  }
  return melhor;
}

/** Classe da quadra na camada (chave da legenda). Calor e pontos não pintam a quadra. */
export function classeQuadra(camada: CamadaMapa, q: IndicadoresQuadra): string {
  switch (camada) {
    case 'vul':
      return q.ivm === null ? CLASSE_NEUTRA : faixaIvm(q.ivm).codigo;
    case 'casos':
      if (q.casosBuscaAtiva === null) return CLASSE_SUPRIMIDA;
      return String(Math.min(3, q.casosBuscaAtiva));
    case 'reurb': {
      if (q.lotes === 0) return CLASSE_NEUTRA;
      const irr = q.lotesIrregulares / q.lotes;
      return irr > 0.5 ? '100' : irr > 0.25 ? '50' : irr > 0 ? '25' : '0';
    }
    case 'prec':
      return fontePredominante(q) ?? CLASSE_NEUTRA;
    default:
      return CLASSE_NEUTRA;
  }
}

const fmtContagem = (n: Contagem) => (n === null ? '< 5' : String(n));

/** Valor da camada na lista de quadras (alternativa ao mapa): texto e número para ordenar. */
export function valorCamada(
  camada: CamadaMapa,
  q: IndicadoresQuadra,
): { texto: string; ordem: number } {
  const contagem = (n: Contagem) => ({ texto: fmtContagem(n), ordem: n ?? 2.5 });
  switch (camada) {
    case 'vul':
      return q.ivm === null
        ? { texto: 'Sem informação', ordem: -1 }
        : {
            texto: `${q.ivm.toFixed(2).replace('.', ',')} · ${faixaIvm(q.ivm).rotulo}`,
            ordem: q.ivm,
          };
    case 'calor03':
      return contagem(q.criancas03);
    case 'pcf':
      return contagem(q.familiasPcf);
    case 'calorIdosos':
      return contagem(q.idososSozinhosSemVisita);
    case 'casos':
      return contagem(q.casosBuscaAtiva);
    case 'reurb':
      return {
        texto: `${q.lotesIrregulares} de ${q.lotes} irregulares`,
        ordem: q.lotes ? q.lotesIrregulares / q.lotes : -1,
      };
    case 'prec': {
      const g = fontePredominante(q);
      const item = LEGENDA_CAMADA_MAPA.prec.find((i) => i.classe === g);
      return {
        texto: item?.rotulo ?? 'Sem informação',
        ordem: g ? 5 - ORDEM_GRUPO.indexOf(g) : -1,
      };
    }
  }
}

/**
 * Peso do calor agregado (auditor e Fazenda): o centro da quadra com a contagem já suprimida.
 * Quadra com 1 a 4 pessoas não entra (peso 0), para não revelar onde estão poucas pessoas.
 */
export function pesoCalorAgregado(camada: CamadaMapa, q: IndicadoresQuadra): number {
  const n =
    camada === 'calor03'
      ? q.criancas03
      : camada === 'calorIdosos'
        ? q.idososSozinhosSemVisita
        : camada === 'pcf'
          ? q.familiasPcf
          : 0;
  return n ?? 0;
}

/** Pessoa idosa sozinha sem visita do ACS há mais de 90 dias (ou nunca visitada). */
export function idosoSozinhoSemVisita(p: {
  idade: number;
  moradores: number | null;
  diasSemVisitaAcs: number | null;
}): boolean {
  return p.idade >= 60 && p.moradores === 1 && (p.diasSemVisitaAcs ?? Infinity) > 90;
}

/** Visita do Criança Feliz atrasada: mais de 14 dias (ou nenhuma registrada). */
export function pcfAtrasada(diasSemVisita: number | null): boolean {
  return (diasSemVisita ?? Infinity) > 14;
}

/** Pessoa já avaliada, para somar na quadra (nenhum dado de identificação). */
export interface PessoaNaQuadra {
  quadraId: number;
  idade: number | null;
  moradores: number | null;
  diasSemVisitaAcs: number | null;
  /** `null` = fora do Criança Feliz; número (ou `null` em `diasPcf`) = acompanhada. */
  pcf: { diasSemVisita: number | null } | null;
  precisaVisita: boolean;
  buscaAtivaAberta: boolean;
}

type Somas = Pick<IndicadoresQuadra, (typeof CONTAGENS)[number]>;

/** Soma as pessoas por quadra (sem `domicilios`, que vem do território). */
export function somarPessoas(pessoas: PessoaNaQuadra[]): Map<number, Omit<Somas, 'domicilios'>> {
  const m = new Map<number, Omit<Somas, 'domicilios'>>();
  for (const p of pessoas) {
    let s = m.get(p.quadraId);
    if (!s) {
      s = {
        criancas03: 0,
        criancasVisita: 0,
        familiasPcf: 0,
        pcfAtrasadas: 0,
        idosos: 0,
        idososSozinhos: 0,
        idososSozinhosSemVisita: 0,
        casosBuscaAtiva: 0,
      };
      m.set(p.quadraId, s);
    }
    const inc = (k: keyof typeof s) => (s[k] = (s[k] ?? 0) + 1);
    const idade = p.idade ?? -1;
    if (idade >= 0 && idade <= 3) inc('criancas03');
    if (idade >= 0 && idade <= 17 && p.precisaVisita) inc('criancasVisita');
    if (p.pcf) {
      inc('familiasPcf');
      if (pcfAtrasada(p.pcf.diasSemVisita)) inc('pcfAtrasadas');
    }
    if (idade >= 60) {
      inc('idosos');
      if (p.moradores === 1) inc('idososSozinhos');
      if (idosoSozinhoSemVisita({ ...p, idade })) inc('idososSozinhosSemVisita');
    }
    if (p.buscaAtivaAberta) inc('casosBuscaAtiva');
  }
  return m;
}
