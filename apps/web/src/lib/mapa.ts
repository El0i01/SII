import {
  type CamadaMapa,
  CLASSE_NEUTRA,
  classeQuadra,
  type IndicadoresQuadra,
  LEGENDA_CAMADA_MAPA,
  pesoCalorAgregado,
  type TokenCor,
} from '@sii/shared';

export interface RespostaQuadras {
  agregado: boolean;
  quadras: IndicadoresQuadra[];
  rural: {
    domicilios: number | null;
    escolas: number;
    sigefPct: number | null;
    baixaPrecisaoPct: number | null;
    casosBuscaAtiva: number | null;
  };
}

export type Coord = [number, number];

export interface RespostaPontos {
  calor03: Coord[];
  calorIdosos: Coord[];
  pcf: { c: Coord; atrasada: boolean }[];
}

export interface Morador {
  iniciais: string;
  idade: number | null;
  crianca: boolean;
  idosa: boolean;
  sozinha: boolean;
  criancaFeliz: boolean;
  precisaVisita: boolean;
  buscaAtiva: boolean;
  fichaId?: number;
}

export interface DetalheQuadra {
  indicadores: IndicadoresQuadra;
  lotes: { numero: number; situacao: string; moradores?: Morador[] }[];
}

/**
 * Classe Tailwind de cada token: escrita por extenso para o Tailwind gerar as variáveis CSS que o
 * mapa lê em tempo de execução (`corDoToken`).
 */
export const FUNDO_TOKEN: Record<TokenCor, string> = {
  'mapa-1': 'bg-mapa-1',
  'mapa-2': 'bg-mapa-2',
  'mapa-3': 'bg-mapa-3',
  'mapa-4': 'bg-mapa-4',
  'mapa-5': 'bg-mapa-5',
  'mapa-6': 'bg-mapa-6',
  'alerta-destaque': 'bg-alerta-destaque',
  erro: 'bg-erro',
  primaria: 'bg-primaria',
  superficie: 'bg-superficie',
};

/** Valor da variável `--color-<token>` (o MapLibre não entende `var()`). */
export function corDoToken(token: string, el: Element = document.documentElement): string {
  return getComputedStyle(el).getPropertyValue(`--color-${token}`).trim() || '#999999';
}

/** Expressão `match` do MapLibre: classe da quadra (feature-state) → cor da legenda. */
export function expressaoCorQuadra(
  camada: CamadaMapa,
  cor: (token: TokenCor) => string,
): unknown[] {
  const pares = LEGENDA_CAMADA_MAPA[camada].flatMap((i) => [i.classe, cor(i.cor)]);
  return [
    'match',
    ['coalesce', ['feature-state', 'classe'], CLASSE_NEUTRA],
    ...(pares.length ? pares : [CLASSE_NEUTRA, cor('superficie')]),
    cor('superficie'),
  ];
}

/** Classe de cada quadra na camada, para `setFeatureState`. */
export function classesDasQuadras(camada: CamadaMapa, quadras: IndicadoresQuadra[]) {
  return quadras.map((q) => ({ id: q.id, classe: classeQuadra(camada, q) }));
}

interface Ponto {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: Coord };
  properties: { peso: number; atrasada?: boolean };
}
export interface ColecaoPontos {
  type: 'FeatureCollection';
  features: Ponto[];
}

const ponto = (c: Coord, peso = 1, atrasada?: boolean): Ponto => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: c },
  properties: atrasada === undefined ? { peso } : { peso, atrasada },
});

/** Pontos de uma camada: individuais (perfis nominais) ou centro da quadra com peso (agregado). */
export function pontosDaCamada(
  camada: 'calor03' | 'calorIdosos' | 'pcf',
  quadras: IndicadoresQuadra[],
  pontos: RespostaPontos | null,
): ColecaoPontos {
  if (pontos) {
    const features =
      camada === 'pcf'
        ? pontos.pcf.map((p) => ponto(p.c, 1, p.atrasada))
        : pontos[camada].map((c) => ponto(c));
    return { type: 'FeatureCollection', features };
  }
  const features = quadras
    .map((q) => ({ q, peso: pesoCalorAgregado(camada, q) }))
    .filter(({ q, peso }) => q.centro && peso > 0)
    .map(({ q, peso }) => ponto(q.centro as Coord, peso, camada === 'pcf' ? false : undefined));
  return { type: 'FeatureCollection', features };
}

/** Retângulo [oeste, sul, leste, norte] de um GeoJSON qualquer (para enquadrar o mapa). */
export function limites(geo: unknown): [number, number, number, number] | null {
  let o = Infinity;
  let s = Infinity;
  let l = -Infinity;
  let n = -Infinity;
  const visitar = (v: unknown): void => {
    if (!Array.isArray(v)) return;
    if (typeof v[0] === 'number' && typeof v[1] === 'number') {
      o = Math.min(o, v[0]);
      l = Math.max(l, v[0]);
      s = Math.min(s, v[1]);
      n = Math.max(n, v[1]);
      return;
    }
    for (const x of v) visitar(x);
  };
  const feicoes = (geo as { features?: { geometry?: { coordinates?: unknown } }[] }).features ?? [];
  for (const f of feicoes) visitar(f.geometry?.coordinates);
  return o === Infinity ? null : [o, s, l, n];
}

/** Sinais do morador para o detalhe do lote (sem nome: iniciais, idade e o que chama atenção). */
export function sinaisDoMorador(m: Morador): string[] {
  const s: string[] = [];
  if (m.crianca) s.push('Criança');
  if (m.criancaFeliz) s.push('Criança Feliz');
  if (m.idosa) s.push(m.sozinha ? 'Pessoa idosa sozinha' : 'Pessoa idosa');
  if (m.precisaVisita) s.push('Precisa de visita');
  if (m.buscaAtiva) s.push('Busca ativa');
  return s;
}

export const idadeTexto = (idade: number | null) =>
  idade === null ? 'idade não informada' : idade === 1 ? '1 ano' : `${idade} anos`;
