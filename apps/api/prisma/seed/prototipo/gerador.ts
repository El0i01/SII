/**
 * Porte FIEL do gerador de dados fictícios de docs/prototipo/index.html (bloco "dados fictícios").
 *
 * Mesmas sementes, mesmas chamadas, na mesma ordem: os números do seed batem com os do protótipo.
 * O teste `gerador.spec.ts` compara o resultado com o digest calculado sobre o JS original.
 *
 * NÃO acrescente nenhuma chamada a R, R2 ou R3 aqui: qualquer sorteio novo desloca todos os
 * seguintes. Sorteios que o protótipo não tem ficam em `complementos.ts`, com sequência própria.
 * Os nomes de escola continuam os do protótipo; o mapeamento para o cadastro real está em
 * `mapeamento.ts`.
 */
import SETORES_DAS_QUADRAS from './quadras-setores.json';

/** mulberry32, idêntico ao `rng` do protótipo. */
export function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pesos<T> = readonly (readonly [T, number])[];

function ferramentas(r: () => number) {
  const pick = <T>(a: ArrayLike<T>): T => a[Math.floor(r() * a.length)] as T;
  const between = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const wpick = <T>(items: Pesos<T>): T => {
    let s = 0;
    for (const [, w] of items) s += w;
    let t = r() * s;
    for (const [v, w] of items) {
      t -= w;
      if (t <= 0) return v;
    }
    return (items[0] as readonly [T, number])[0];
  };
  return { pick, between, wpick };
}

export const SEMENTES = { R: 20261108, R2: 77, R3: 4242 } as const;
/** Data-base do protótipo: 08/11/2026 (os "dias" contam para trás a partir dela). */
export const DATA_BASE = '2026-11-08';

export const SETORES = [
  { id: 'S01', nome: 'Setor 01', vul: 0.28, prec: 0.86 },
  { id: 'S02', nome: 'Setor 02', vul: 0.36, prec: 0.81 },
  { id: 'S03', nome: 'Setor 03', vul: 0.62, prec: 0.64 },
  { id: 'S04', nome: 'Setor 04', vul: 0.44, prec: 0.77 },
  { id: 'S05', nome: 'Setor 05', vul: 0.51, prec: 0.7 },
  { id: 'RUR', nome: 'Zona rural', vul: 0.57, prec: 0.41 },
] as const;
export type CodigoSetor = (typeof SETORES)[number]['id'];

export const ESCOLAS = [
  'EMEF Castanheira',
  'EMEF Rio Jamari',
  'EMEIEF Pequeno Ipê',
  'Creche Municipal Sementinha',
  'EMEF Linha 45 (rural)',
  'Rede estadual',
] as const;
const LETRAS = 'ABCDEFGHIJLMNOPRSTV';
const LINHAS = ['C-10', 'C-15', '45', '65', 'B-20'] as const;
const VISIT = [
  'Visitador(a) PCF 01',
  'Visitador(a) PCF 02',
  'Visitador(a) PCF 03',
  'Visitador(a) PCF 04',
];

export const PARECERES = [
  [
    'Família visitada pelo CRAS. O aluno estava cuidando do irmão menor; a mãe foi orientada e o retorno à escola foi combinado para segunda-feira.',
    'Retorno à escola combinado',
  ],
  [
    'A família mudou de endereço e não consegue levar a criança à escola. Solicitada a inclusão na rota do transporte escolar.',
    'Encaminhado à SEMED (transporte)',
  ],
  [
    'Aluno em tratamento de saúde, com atestado entregue à escola. Família acompanhada pela unidade de saúde.',
    'Ausência justificada (saúde)',
  ],
  [
    'Família não localizada no endereço após duas tentativas. Caso comunicado ao Conselho Tutelar.',
    'Encaminhado ao Conselho Tutelar',
  ],
] as const;

export interface QuadraGerada {
  id: string;
  setor: CodigoSetor;
  idx: number;
  vul: number;
  prec: number;
  dom: number;
  casos: number;
  d: { renda: number; saude: number; escola: number; imovel: number; reg: number };
}

export type StatusCasoProto =
  'Matriculado' | 'Visita realizada' | 'Encaminhado' | 'Identificado' | 'Não localizado';

export interface CasoGerado {
  id: string;
  ini: string;
  cpf: string;
  idade: number;
  setor: CodigoSetor;
  quadra: string;
  origem: string;
  status: StatusCasoProto;
  dias: number;
  resp: string;
  escola: string;
}

export type SituacaoLoteProto = 'Regular' | 'Reurb em análise' | 'Sem inscrição' | 'Vazio';

export interface CriancaGerada {
  id: string;
  ini: string;
  cpf: string;
  idade: number;
  setor: CodigoSetor;
  quadra: string;
  /** null quando a criança mora na zona rural (sem quadra). */
  quadraId: string | null;
  lote: number;
  cad: boolean;
  pbf: boolean;
  cadDias: number;
  matric: boolean;
  escola: string;
  turma: string;
  matDias: number;
  freq: number | null;
  faltas: number;
  vac: boolean;
  acs: number;
  ubs: number;
  cras: boolean;
  crasUlt: number;
  pcf: boolean;
  pcfUlt: number;
  visitador: string;
  aee: boolean;
  apae: boolean;
  bpc: boolean;
  sala: boolean;
  ct: boolean;
  ctDias: number;
}

export type StatusNotifProto = 'Nova' | 'Em análise' | 'Parecer emitido';

export interface NotificacaoGerada {
  id: string;
  criancaId: string;
  status: StatusNotifProto;
  criada: number;
  parecer: string;
  desfecho: string;
  pDias: number;
}

export interface IdosoGerado {
  id: string;
  ini: string;
  idade: number;
  setor: CodigoSetor;
  quadra: string;
  quadraId: string | null;
  lote: number;
  so: boolean;
  bpc: boolean;
  acam: boolean;
  scfv: boolean;
  gripe: boolean;
  cad: boolean;
  cras: boolean;
  cron: boolean;
  cronA: boolean;
  acs: number;
}

export interface DadosPrototipo {
  quadras: QuadraGerada[];
  casos: CasoGerado[];
  lotes: Record<string, SituacaoLoteProto[]>;
  criancas: CriancaGerada[];
  notificacoes: NotificacaoGerada[];
  idosos: IdosoGerado[];
}

const setorPorId = (id: string) => SETORES.find((s) => s.id === id) as (typeof SETORES)[number];

export function gerarPrototipo(): DadosPrototipo {
  // ── Sequência R: quadras e casos de busca ativa ──────────────────────────────────────────────
  const R = rng(SEMENTES.R);
  const { pick, between, wpick } = ferramentas(R);

  const quadras: QuadraGerada[] = (SETORES_DAS_QUADRAS as CodigoSetor[]).map((setor, i) => {
    const st = setorPorId(setor);
    const vul = Math.max(0.05, Math.min(0.95, st.vul + (R() - 0.5) * 0.36));
    const prec = Math.max(0.2, Math.min(1, st.prec + (R() - 0.5) * 0.3));
    return {
      id: 'Q' + String(18 + i).padStart(3, '0'),
      setor,
      idx: i,
      vul,
      prec,
      dom: between(22, 58),
      casos: 0,
      d: { renda: 0, saude: 0, escola: 0, imovel: 0, reg: 0 },
    };
  });

  const iniciais = () => pick(LETRAS) + '. ' + pick(LETRAS) + '. ' + pick(LETRAS) + '.';
  const cpfDigits = () => {
    let d = '';
    for (let i = 0; i < 11; i++) d += between(0, 9);
    return d;
  };

  const casos: CasoGerado[] = [];
  for (let c = 0; c < 74; c++) {
    const st = wpick<StatusCasoProto>([
      ['Matriculado', 33],
      ['Visita realizada', 11],
      ['Encaminhado', 13],
      ['Identificado', 11],
      ['Não localizado', 6],
    ]);
    const setor = wpick<CodigoSetor>([
      ['S01', 8],
      ['S02', 10],
      ['S03', 24],
      ['S04', 12],
      ['S05', 14],
      ['RUR', 16],
    ]);
    const qs = quadras.filter((q) => q.setor === setor);
    const q = qs.length ? pick(qs) : null;
    if (q) q.casos++;
    const idade = between(4, 17);
    // A ordem abaixo é a das propriedades do objeto literal no protótipo.
    const id = 'BA-2026-' + String(301 + c * 7).padStart(4, '0');
    const ini = iniciais();
    const cpf = cpfDigits();
    const quadra = q ? q.id : 'Linha ' + pick(['C-10', 'C-15', '45', '65', 'B-20']);
    const origem = wpick([
      ['CadÚnico', 44],
      ['e-SUS', 30],
      ['Censo Municipal', 26],
    ]);
    const dias = st === 'Matriculado' ? between(6, 38) : between(1, 52);
    const resp =
      st === 'Identificado'
        ? 'SEMED'
        : wpick([
            ['Assistência Social', 45],
            ['Saúde (ACS)', 30],
            ['SEMED', 25],
          ]);
    const escola =
      st === 'Matriculado'
        ? idade < 6
          ? pick(['EMEIEF Pequeno Ipê', 'Creche Municipal Sementinha'])
          : pick(ESCOLAS)
        : '—';
    casos.push({ id, ini, cpf, idade, setor, quadra, origem, status: st, dias, resp, escola });
  }

  // ── Sequência R2: dimensões do índice por quadra ─────────────────────────────────────────────
  const R2 = rng(SEMENTES.R2);
  for (const q of quadras) {
    const d = (b: number) => Math.max(0.03, Math.min(0.97, b + (R2() - 0.5) * 0.3));
    q.d = {
      renda: d(q.vul + 0.05),
      saude: d(q.vul - 0.02),
      escola: d(q.vul - 0.05),
      imovel: d(q.vul),
      reg: d(q.setor === 'S03' ? 0.78 : q.setor === 'S05' ? 0.45 : 0.18),
    };
  }

  // ── Sequência R3: lotes, crianças, notificações e pessoas idosas ─────────────────────────────
  const R3 = rng(SEMENTES.R3);
  const t3 = ferramentas(R3);
  const pk = t3.pick;
  const bt = t3.between;
  const wp = t3.wpick;
  const ini3 = () => pk(LETRAS) + '. ' + pk(LETRAS) + '. ' + pk(LETRAS) + '.';
  const cpf3 = () => {
    let d = '';
    for (let i = 0; i < 11; i++) d += bt(0, 9);
    return d;
  };
  const qOf = (setor: string) => {
    const qs = quadras.filter((q) => q.setor === setor);
    return qs.length ? (qs[Math.floor(R3() * qs.length)] as QuadraGerada) : null;
  };

  const lotes: Record<string, SituacaoLoteProto[]> = {};
  for (const q of quadras) {
    const a: SituacaoLoteProto[] = [];
    for (let l = 1; l <= 12; l++) {
      a.push(
        q.setor === 'S03'
          ? wp<SituacaoLoteProto>([
              ['Regular', 30],
              ['Reurb em análise', 45],
              ['Sem inscrição', 15],
              ['Vazio', 10],
            ])
          : q.setor === 'S05'
            ? wp<SituacaoLoteProto>([
                ['Regular', 62],
                ['Reurb em análise', 14],
                ['Sem inscrição', 16],
                ['Vazio', 8],
              ])
            : wp<SituacaoLoteProto>([
                ['Regular', 82],
                ['Sem inscrição', 8],
                ['Reurb em análise', 4],
                ['Vazio', 6],
              ]),
      );
    }
    lotes[q.id] = a;
  }
  const pickLot = (q: QuadraGerada) => {
    for (let t = 0; t < 20; t++) {
      const l = bt(1, 12);
      if ((lotes[q.id] as SituacaoLoteProto[])[l - 1] !== 'Vazio') return l;
    }
    return 1;
  };

  const criancas: CriancaGerada[] = [];
  for (let ci = 0; ci < 620; ci++) {
    const cst = wp<CodigoSetor>([
      ['S01', 14],
      ['S02', 15],
      ['S03', 24],
      ['S04', 19],
      ['S05', 10],
      ['RUR', 18],
    ]);
    const cq = qOf(cst);
    const clote = cq ? pickLot(cq) : bt(10, 90);
    const rr = R3();
    const idade = rr < 0.3 ? bt(0, 3) : rr < 0.42 ? bt(4, 5) : rr < 0.86 ? bt(6, 14) : bt(15, 17);
    const vul = cq ? cq.vul : 0.57;
    const cad = R3() < vul + 0.15;
    let matric: boolean;
    let escola: string;
    let turma: string;
    if (idade <= 3) {
      matric = R3() < 0.36;
      escola = matric ? 'Creche Municipal Sementinha' : '';
      turma = idade < 1 ? 'Berçário' : 'Maternal';
    } else if (idade <= 5) {
      matric = R3() < 0.9;
      escola = matric ? 'EMEIEF Pequeno Ipê' : '';
      turma = 'Pré-escola ' + (idade - 3);
    } else if (idade <= 14) {
      matric = R3() < 0.96;
      escola = matric
        ? cst === 'RUR'
          ? 'EMEF Linha 45 (rural)'
          : pk(['EMEF Castanheira', 'EMEF Rio Jamari'])
        : '';
      turma = idade - 5 + 'º ano';
    } else {
      matric = R3() < 0.84;
      escola = matric ? (R3() < 0.8 ? 'Rede estadual' : 'EMEF Rio Jamari') : '';
      turma = idade - 14 + 'ª série do ensino médio';
    }
    const escolar = idade >= 4 && matric;
    const faltas = escolar ? (R3() < 0.09 ? bt(5, 9) : bt(0, 2)) : 0;
    const aee = R3() < 0.055;
    // Propriedades na ordem do objeto literal do protótipo (cada uma pode sortear).
    const id = 'CI-' + String(10230 + ci * 7);
    const ini = ini3();
    const cpf = cpf3();
    const quadra = cq ? cq.id : 'Linha ' + pk(LINHAS);
    const pbf = cad && R3() < 0.7;
    const cadDias = bt(20, 400);
    const matDias = bt(60, 280);
    const freq = escolar ? (faltas >= 5 ? bt(58, 78) : bt(80, 100)) : null;
    const vac = R3() < 1 - vul * 0.3;
    const acs = R3() < 0.8 ? bt(4, 90) : bt(91, 170);
    const ubs = bt(1, 7);
    const cras = cad && R3() < 0.33;
    const crasUlt = bt(5, 90);
    const pcf = idade <= 3 && cad && R3() < 0.55;
    const pcfUlt = R3() < 0.8 ? bt(1, 14) : bt(15, 30);
    const visitador = pk(VISIT);
    const apae = aee && R3() < 0.5;
    const bpc = aee && cad && R3() < 0.7;
    const sala = aee && escolar && R3() < 0.6;
    const ct = idade >= 4 && !matric && R3() < 0.5;
    const ctDias = bt(3, 60);
    criancas.push({
      id,
      ini,
      cpf,
      idade,
      setor: cst,
      quadra,
      quadraId: cq ? cq.id : null,
      lote: clote,
      cad,
      pbf,
      cadDias,
      matric,
      escola,
      turma,
      matDias,
      freq,
      faltas,
      vac,
      acs,
      ubs,
      cras,
      crasUlt,
      pcf,
      pcfUlt,
      visitador,
      aee,
      apae,
      bpc,
      sala,
      ct,
      ctDias,
    });
  }

  const notificacoes: NotificacaoGerada[] = [];
  let nseq = 0;
  for (const c of criancas) {
    if (c.faltas < 5) continue;
    const st = wp<StatusNotifProto>([
      ['Nova', 40],
      ['Em análise', 30],
      ['Parecer emitido', 30],
    ]);
    const pr = st === 'Parecer emitido' ? pk(PARECERES) : null;
    const crd = bt(0, 9);
    notificacoes.push({
      id: 'NT-2026-' + String(120 + nseq++ * 3).padStart(4, '0'),
      criancaId: c.id,
      status: st,
      criada: crd,
      parecer: pr ? pr[0] : '',
      desfecho: pr ? pr[1] : '',
      pDias: Math.max(0, crd - bt(1, 3)),
    });
  }

  const idosos: IdosoGerado[] = [];
  for (let ii = 0; ii < 1048; ii++) {
    const ist = wp<CodigoSetor>([
      ['S01', 17],
      ['S02', 16],
      ['S03', 19],
      ['S04', 20],
      ['S05', 11],
      ['RUR', 17],
    ]);
    const iq = qOf(ist);
    const il = iq ? pickLot(iq) : 0;
    const icad = R3() < 0.45;
    const icron = R3() < 0.48;
    const ia = R3();
    const id = 'PI-' + String(5100 + ii * 3);
    const ini = ini3();
    const idade = ia < 0.55 ? bt(60, 69) : ia < 0.85 ? bt(70, 79) : bt(80, 96);
    const quadra = iq ? iq.id : 'Linha ' + pk(LINHAS);
    const so = R3() < 0.17;
    const bpc = R3() < 0.08;
    const acam = R3() < 0.04;
    const scfv = R3() < 0.13;
    const gripe = R3() < 0.72;
    const cras = icad && R3() < 0.22;
    const cronA = icron && R3() < 0.7;
    const acs = R3() < 0.65 ? bt(3, 90) : bt(91, 260);
    idosos.push({
      id,
      ini,
      idade,
      setor: ist,
      quadra,
      quadraId: iq ? iq.id : null,
      lote: il,
      so,
      bpc,
      acam,
      scfv,
      gripe,
      cad: icad,
      cras,
      cron: icron,
      cronA,
      acs,
    });
  }

  return { quadras, casos, lotes, criancas, notificacoes, idosos };
}
