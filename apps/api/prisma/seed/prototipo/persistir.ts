/**
 * Grava no banco os dados fictícios do protótipo (gerador.ts) ligados ao cadastro real de
 * equipamentos (mapeamento.ts). Dev e testes apenas. Ver docs/adr/0004.
 */
import {
  diasUteisEntre,
  gerarDiasLetivos,
  LIMITES_BUSCA_ATIVA,
  prazoCaso,
  PRAZO_PARECER_DIAS_UTEIS,
  somarDiasUteis,
} from '@sii/shared';
import { protegerDocumento } from '../../../src/cripto/cifra';
import { Prisma, type PrismaClient } from '../../../src/generated/prisma/client';
import { garantirCadastro } from '../../referencia/cadastro';
import { type Complementos, criarComplementos, normalizarNome } from './complementos';
import { type CodigoSetor, DATA_BASE, gerarPrototipo, SETORES } from './gerador';
import {
  CRAS_CADSUAS,
  DESFECHO_POR_ROTULO,
  FERIADOS_2026,
  FONTES_GEO_POR_SETOR,
  INEP_POR_ESCOLA_PROTOTIPO,
  MICROAREAS_RURAIS,
  microareaDaQuadra,
  ORDEM_FONTES_GEO,
  PARAMETROS_CALENDARIO_2026,
  PRECISAO_SEED_M,
  SECRETARIA_POR_RESP,
  SITUACAO_LOTE,
  STATUS_BUSCA_ATIVA,
  STATUS_NOTIFICACAO,
  UBS_JACIR_BONI,
} from './mapeamento';

type Tx = Prisma.TransactionClient;
type Sexo = 'FEMININO' | 'MASCULINO';

export interface Chaves {
  cifra: Buffer;
  hmac: Buffer;
}

/** Fila de creche por setor (FILA do protótipo). */
const FILA_POR_SETOR: Record<CodigoSetor, number> = {
  S01: 9,
  S02: 11,
  S03: 31,
  S04: 10,
  S05: 14,
  RUR: 6,
};
const VISITADORES = [
  'Visitador(a) PCF 01',
  'Visitador(a) PCF 02',
  'Visitador(a) PCF 03',
  'Visitador(a) PCF 04',
];
const MES_CADUNICO = '2026-10';
/** Quantos dias letivos de frequência o seed lança antes da data-base. */
const DIAS_FREQUENCIA = 20;

// ── Datas ────────────────────────────────────────────────────────────────────────────────────────
const BASE = new Date(`${DATA_BASE}T00:00:00Z`);
const dia = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const diasAtras = (n: number) => new Date(BASE.getTime() - n * 86_400_000);
/** Instante no meio do expediente (15h UTC = 11h em Porto Velho), n dias antes da base. */
const instante = (n: number) => new Date(BASE.getTime() - n * 86_400_000 + 15 * 3_600_000);

function nascimento(cx: Complementos, idade: number): Date {
  const d = new Date(BASE);
  d.setUTCFullYear(d.getUTCFullYear() - idade);
  return new Date(d.getTime() - cx.between(1, 364) * 86_400_000);
}

// ── Limpeza (só dados do seed) ───────────────────────────────────────────────────────────────────
const TABELAS_DO_SEED = [
  'casos.evento_caso',
  'casos.parecer',
  'casos.notificacao',
  'casos.visita',
  'casos.caso',
  'educacao.frequencia',
  'educacao.matricula',
  'educacao.turma',
  'educacao.calendario_escolar',
  'educacao.calendario_parametros',
  'educacao.fila_creche',
  'educacao.atendimento_especializado',
  'saude.sinalizador_saude',
  'assistencia.cadunico_familia',
  'assistencia.acompanhamento_paif',
  'assistencia.bpc',
  'assistencia.scfv',
  'assistencia.crianca_feliz',
  'pessoas.membro_familia',
  'pessoas.familia',
  'pessoas.vinculo_fonte',
  'pessoas.revisao_vinculo',
  'pessoas.pessoa_mestra',
  'territorio.domicilio',
  'indicadores.dimensao_ivm_quadra',
  'territorio.lote',
  'territorio.quadra',
  'indicadores.pesos_ivm',
];

/**
 * Apaga os dados fictícios para recriar. Recusa se houver alguma pessoa que NÃO veio do seed.
 * A trilha é append-only: o TRUNCATE só passa com os triggers desligados nesta transação
 * (session_replication_role), o que exige superusuário. Nunca rode isso em produção.
 */
export async function limparDadosFicticios(tx: Tx): Promise<void> {
  const [linha] = await tx.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM pessoas.pessoa_mestra p
    WHERE NOT EXISTS (SELECT 1 FROM pessoas.vinculo_fonte v WHERE v.pessoa_id = p.id AND v.regra = 'SEED')`;
  const n = Number(linha?.n ?? 0);
  if (n > 0) {
    throw new Error(
      `Há ${n} pessoa(s) que não vieram do seed. O seed não apaga dados que não criou.`,
    );
  }
  await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
  await tx.$executeRawUnsafe(`TRUNCATE ${TABELAS_DO_SEED.join(', ')} RESTART IDENTITY CASCADE`);
  await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = origin`);
}

/** O Prisma 7 grava bytea a partir de Uint8Array (não de Buffer). */
const bytes = (b: Buffer): Uint8Array<ArrayBuffer> => new Uint8Array(b);

// ── Planejamento em memória ──────────────────────────────────────────────────────────────────────
interface PlanoDomicilio {
  setor: CodigoSetor;
  loteChave: string | null;
  localidade: string | null;
  moradores: number;
  geoFonte: (typeof ORDEM_FONTES_GEO)[number];
}

interface PlanoFamilia {
  domicilio: number;
  codigoFamiliar: string | null;
}

interface PlanoPessoa {
  idExterno: string;
  fonte: 'ESUS' | 'CADUNICO' | 'GESTAO_ESCOLAR' | 'CENSO';
  nome: string;
  sexo: Sexo;
  nascimento: Date;
  nomeMae: string | null;
  cpf: string;
  nis: string | null;
  cns: string;
  setor: CodigoSetor;
  microarea: string;
  escolaInep: string | null;
  familiaPcf: string | null;
  familia: number;
  papel: 'RESPONSAVEL' | 'FILHO';
  domicilio: number;
}

function pesoGeo(cx: Complementos, setor: CodigoSetor): PlanoDomicilio['geoFonte'] {
  const pesos = FONTES_GEO_POR_SETOR[setor];
  let t = cx.r() * pesos.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pesos.length; i++) {
    t -= pesos[i] as number;
    if (t <= 0) return ORDEM_FONTES_GEO[i] as PlanoDomicilio['geoFonte'];
  }
  return 'SETOR';
}

export interface ResumoSeed {
  pessoas: number;
  criancas: number;
  idosos: number;
  casosBuscaAtiva: number;
  notificacoes: number;
  eventos: number;
  frequencias: number;
  cpfsDuplicadosTrocados: number;
}

export async function semearPrototipo(prisma: PrismaClient, chaves: Chaves): Promise<ResumoSeed> {
  const g = gerarPrototipo();
  const cx = criarComplementos();
  const letivos = gerarDiasLetivos(PARAMETROS_CALENDARIO_2026);
  const ultimosLetivos = letivos.filter((d) => d < DATA_BASE).slice(-DIAS_FREQUENCIA);
  let cpfsTrocados = 0;

  // Microárea por quadra.
  const microareaQuadra = new Map<string, string>();
  for (const s of SETORES) {
    const qs = g.quadras.filter((q) => q.setor === s.id);
    qs.forEach((q, i) => microareaQuadra.set(q.id, microareaDaQuadra(s.id, i, qs.length)));
  }
  const microarea = (setor: CodigoSetor, quadraId: string | null) =>
    quadraId ? (microareaQuadra.get(quadraId) as string) : cx.pick(MICROAREAS_RURAIS);

  const domicilios: PlanoDomicilio[] = [];
  const familias: PlanoFamilia[] = [];
  const pessoas: PlanoPessoa[] = [];

  const novoDomicilio = (
    setor: CodigoSetor,
    quadraId: string | null,
    lote: number,
    localidade: string,
    moradores: number,
  ) => {
    domicilios.push({
      setor,
      loteChave: quadraId ? `${quadraId}:${lote}` : null,
      localidade: quadraId ? null : lote ? `${localidade} km ${lote}` : localidade,
      moradores,
      geoFonte: pesoGeo(cx, setor),
    });
    return domicilios.length - 1;
  };
  const novaFamilia = (domicilio: number, cad: boolean) => {
    familias.push({ domicilio, codigoFamiliar: cad ? cx.codigoFamiliar() : null });
    return familias.length - 1;
  };
  const cpfDo = (sorteado: string) => {
    if (cx.reservar(sorteado)) return sorteado;
    cpfsTrocados++;
    return cx.cpf();
  };

  /** Família com a criança (ou adolescente) e o responsável. */
  const comResponsavel = (p: {
    idExterno: string;
    ini: string;
    cpf: string;
    idade: number;
    setor: CodigoSetor;
    quadraId: string | null;
    lote: number;
    localidade: string;
    cad: boolean;
    escolaInep: string | null;
    familiaPcf: string | null;
    fonte: PlanoPessoa['fonte'];
  }) => {
    const dom = novoDomicilio(p.setor, p.quadraId, p.lote, p.localidade, cx.between(2, 6));
    const fam = novaFamilia(dom, p.cad);
    const ma = microarea(p.setor, p.quadraId);
    const sexoResp = cx.sexo(0.85);
    const idadeResp = Math.max(p.idade + 16, cx.between(20, 45));
    const nomeResp = cx.nomeAleatorio(sexoResp);
    const comum = {
      setor: p.setor,
      microarea: ma,
      familiaPcf: p.familiaPcf,
      familia: fam,
      domicilio: dom,
    };
    pessoas.push({
      ...comum,
      idExterno: `RESP-${p.idExterno}`,
      fonte: p.cad ? 'CADUNICO' : 'ESUS',
      nome: nomeResp,
      sexo: sexoResp,
      nascimento: nascimento(cx, idadeResp),
      nomeMae: cx.nomeAleatorio('FEMININO'),
      cpf: cx.cpf(),
      nis: p.cad ? cx.nis() : null,
      cns: cx.cns(),
      escolaInep: null,
      papel: 'RESPONSAVEL',
    });
    const sexo = cx.sexo();
    pessoas.push({
      ...comum,
      idExterno: p.idExterno,
      fonte: p.fonte,
      nome: cx.nomeDeIniciais(p.ini, sexo),
      sexo,
      nascimento: nascimento(cx, p.idade),
      nomeMae: sexoResp === 'FEMININO' ? nomeResp : cx.nomeAleatorio('FEMININO'),
      cpf: cpfDo(p.cpf),
      nis: p.cad ? cx.nis() : null,
      cns: cx.cns(),
      escolaInep: p.escolaInep,
      papel: 'FILHO',
    });
  };

  // Casos de busca ativa: crianças e adolescentes fora da escola (ou já matriculados).
  const FONTE_ORIGEM: Record<string, PlanoPessoa['fonte']> = {
    CadÚnico: 'CADUNICO',
    'e-SUS': 'ESUS',
    'Censo Municipal': 'CENSO',
  };
  for (const c of g.casos) {
    const quadraId = c.quadra.startsWith('Q') ? c.quadra : null;
    comResponsavel({
      idExterno: c.id,
      ini: c.ini,
      cpf: c.cpf,
      idade: c.idade,
      setor: c.setor,
      quadraId,
      lote: quadraId ? cx.between(1, 12) : 0,
      localidade: c.quadra,
      cad: c.origem === 'CadÚnico',
      escolaInep: c.status === 'Matriculado' ? (INEP_POR_ESCOLA_PROTOTIPO[c.escola] ?? null) : null,
      familiaPcf: null,
      fonte: FONTE_ORIGEM[c.origem] ?? 'ESUS',
    });
  }

  // Crianças e adolescentes da ficha (0 a 17).
  for (const c of g.criancas) {
    comResponsavel({
      idExterno: c.id,
      ini: c.ini,
      cpf: c.cpf,
      idade: c.idade,
      setor: c.setor,
      quadraId: c.quadraId,
      lote: c.lote,
      localidade: c.quadra,
      cad: c.cad,
      escolaInep: c.matric ? (INEP_POR_ESCOLA_PROTOTIPO[c.escola] as string) : null,
      familiaPcf: c.pcf ? `PCF-00${VISITADORES.indexOf(c.visitador) + 1}` : null,
      fonte: c.matric ? 'GESTAO_ESCOLAR' : c.cad ? 'CADUNICO' : 'ESUS',
    });
  }

  // Pessoas idosas: família de uma pessoa só no cadastro; moradores do domicílio pela flag "mora só".
  for (const p of g.idosos) {
    const dom = novoDomicilio(p.setor, p.quadraId, p.lote, p.quadra, p.so ? 1 : cx.between(2, 4));
    const fam = novaFamilia(dom, p.cad);
    const sexo = cx.sexo(0.56);
    pessoas.push({
      idExterno: p.id,
      fonte: p.cad ? 'CADUNICO' : 'ESUS',
      nome: cx.nomeDeIniciais(p.ini, sexo),
      sexo,
      nascimento: nascimento(cx, p.idade),
      nomeMae: cx.nomeAleatorio('FEMININO'),
      cpf: cx.cpf(),
      nis: p.cad ? cx.nis() : null,
      cns: cx.cns(),
      setor: p.setor,
      microarea: microarea(p.setor, p.quadraId),
      escolaInep: null,
      familiaPcf: null,
      familia: fam,
      papel: 'RESPONSAVEL',
      domicilio: dom,
    });
  }

  // ── Gravação ───────────────────────────────────────────────────────────────────────────────────
  let eventos = 0;
  let frequencias = 0;

  await prisma.$transaction(
    async (tx) => {
      await limparDadosFicticios(tx);

      // Cadastro de referência (upsert: preserva a geometria do geoportal).
      const cadastro = await garantirCadastro(tx);
      const setorId = cadastro.setor;
      const escolaId = cadastro.escola;

      const quadras = await tx.quadra.createManyAndReturn({
        data: g.quadras.map((q) => ({ setorId: setorId.get(q.setor) as number, codigo: q.id })),
        select: { id: true, codigo: true },
      });
      const quadraId = new Map(quadras.map((q) => [q.codigo, q.id]));
      const lotes = await tx.lote.createManyAndReturn({
        data: g.quadras.flatMap((q) =>
          (g.lotes[q.id] ?? []).map((sit, i) => ({
            quadraId: quadraId.get(q.id) as number,
            numero: i + 1,
            situacao: SITUACAO_LOTE[sit] as 'REGULAR',
          })),
        ),
        select: { id: true, quadraId: true, numero: true },
      });
      const codigoQuadra = new Map(quadras.map((q) => [q.id, q.codigo]));
      const loteId = new Map(
        lotes.map((l) => [`${codigoQuadra.get(l.quadraId)}:${l.numero}`, l.id]),
      );
      const d4 = (v: number) => new Prisma.Decimal(v.toFixed(4));
      await tx.dimensaoIvmQuadra.createMany({
        data: g.quadras.map((q) => ({
          quadraId: quadraId.get(q.id) as number,
          periodo: '2026-11',
          renda: d4(q.d.renda),
          saude: d4(q.d.saude),
          escola: d4(q.d.escola),
          imovel: d4(q.d.imovel),
          regularizacao: d4(q.d.reg),
        })),
      });
      await tx.pesosIvm.create({
        data: {
          versao: 1,
          pesos: { renda: 30, saude: 20, escola: 20, imovel: 15, regularizacao: 15 },
        },
      });

      // Domicílios, famílias e pessoas.
      const doms = await tx.domicilio.createManyAndReturn({
        data: domicilios.map((d) => ({
          setorId: setorId.get(d.setor) as number,
          loteId: d.loteChave ? (loteId.get(d.loteChave) ?? null) : null,
          localidade: d.localidade,
          moradores: d.moradores,
          geoFonte: d.geoFonte,
          geoPrecisaoM: PRECISAO_SEED_M[d.geoFonte],
        })),
        select: { id: true },
      });
      const fams = await tx.familia.createManyAndReturn({
        data: familias.map((f) => ({
          domicilioId: (doms[f.domicilio] as { id: number }).id,
          codigoFamiliar: f.codigoFamiliar,
        })),
        select: { id: true },
      });
      const famId = (i: number) => (fams[i] as { id: number }).id;

      const documentos = pessoas.map((p) => ({
        cpf: protegerDocumento('CPF', p.cpf, chaves),
        nis: p.nis ? protegerDocumento('NIS', p.nis, chaves) : null,
        cns: protegerDocumento('CNS', p.cns, chaves),
      }));
      const criadas = await tx.pessoaMestra.createManyAndReturn({
        data: pessoas.map((p, i) => {
          const doc = documentos[i] as (typeof documentos)[number];
          return {
            nome: p.nome,
            nomeNormalizado: normalizarNome(p.nome),
            dataNascimento: p.nascimento,
            nomeMae: p.nomeMae,
            sexo: p.sexo,
            cpfCifrado: bytes(doc.cpf.cifrado),
            cpfHash: bytes(doc.cpf.hash),
            nisCifrado: doc.nis ? bytes(doc.nis.cifrado) : null,
            nisHash: doc.nis ? bytes(doc.nis.hash) : null,
            cnsCifrado: bytes(doc.cns.cifrado),
            cnsHash: bytes(doc.cns.hash),
            domicilioId: (doms[p.domicilio] as { id: number }).id,
            setorCodigo: p.setor,
            microarea: p.microarea,
            escolaInep: p.escolaInep,
            crasCodigo: CRAS_CADSUAS,
            familiaPcf: p.familiaPcf,
          };
        }),
        select: { id: true, cpfHash: true },
      });
      // Liga pelo hash do CPF (único), sem depender da ordem do RETURNING.
      const idPorHash = new Map(
        criadas.map((c) => [Buffer.from(c.cpfHash as Uint8Array).toString('hex'), c.id]),
      );
      const pessoaId = new Map<string, number>();
      pessoas.forEach((p, i) => {
        const h = (documentos[i] as (typeof documentos)[number]).cpf.hash.toString('hex');
        pessoaId.set(p.idExterno, idPorHash.get(h) as number);
      });
      const pid = (idExterno: string) => pessoaId.get(idExterno) as number;

      await tx.membroFamilia.createMany({
        data: pessoas.map((p) => ({
          familiaId: famId(p.familia),
          pessoaId: pid(p.idExterno),
          papel: p.papel,
        })),
      });
      await tx.vinculoFonte.createMany({
        data: pessoas.map((p) => ({
          pessoaId: pid(p.idExterno),
          fonte: p.fonte,
          idExterno: p.idExterno,
          regra: 'SEED' as const,
          confianca: new Prisma.Decimal('1.00'),
        })),
      });

      // Educação: calendário, turmas, matrículas, frequência, fila, AEE.
      const escolas = [...escolaId.entries()];
      await tx.calendarioEscolar.createMany({
        data: escolas.flatMap(([, id]) => letivos.map((d) => ({ escolaId: id, dia: dia(d) }))),
      });
      await tx.calendarioParametros.createMany({
        data: escolas.map(([, id]) => ({
          escolaId: id,
          ano: 2026,
          parametros: PARAMETROS_CALENDARIO_2026,
          diasLetivos: letivos.length,
        })),
      });
      const turmasPlano = new Map<string, { escolaId: number; nome: string }>();
      for (const c of g.criancas.filter((x) => x.matric)) {
        const eid = escolaId.get(INEP_POR_ESCOLA_PROTOTIPO[c.escola] as string) as number;
        turmasPlano.set(`${eid}:${c.turma}`, { escolaId: eid, nome: c.turma });
      }
      const turmas = await tx.turma.createManyAndReturn({
        data: [...turmasPlano.values()].map((t) => ({ ...t, ano: 2026 })),
        select: { id: true, escolaId: true, nome: true },
      });
      const turmaId = new Map(turmas.map((t) => [`${t.escolaId}:${t.nome}`, t.id]));

      const matriculas = await tx.matricula.createManyAndReturn({
        data: [
          ...g.criancas
            .filter((c) => c.matric)
            .map((c) => {
              const eid = escolaId.get(INEP_POR_ESCOLA_PROTOTIPO[c.escola] as string) as number;
              return {
                pessoaId: pid(c.id),
                escolaId: eid,
                turmaId: turmaId.get(`${eid}:${c.turma}`) ?? null,
                ano: 2026,
                inicioEm: diasAtras(c.matDias),
              };
            }),
          ...g.casos
            .filter((c) => c.status === 'Matriculado')
            .map((c) => ({
              pessoaId: pid(c.id),
              escolaId: escolaId.get(INEP_POR_ESCOLA_PROTOTIPO[c.escola] as string) as number,
              ano: 2026,
              inicioEm: diasAtras(Math.max(1, c.dias - 3)),
            })),
        ],
        select: { id: true, pessoaId: true },
      });
      const matriculaDe = new Map(matriculas.map((m) => [m.pessoaId, m.id]));

      // Frequência dos últimos dias letivos: termina com exatamente `faltas` faltas seguidas,
      // com presença logo antes; as outras faltas do mês ficam espalhadas antes disso.
      const linhasFreq: { matriculaId: number; dia: Date; situacao: 'PRESENTE' | 'FALTA' }[] = [];
      for (const c of g.criancas.filter((x) => x.idade >= 4 && x.matric)) {
        const mid = matriculaDe.get(pid(c.id)) as number;
        const n = ultimosLetivos.length;
        const total = Math.max(c.faltas, Math.round(((100 - (c.freq ?? 100)) * n) / 100));
        const situacoes: ('PRESENTE' | 'FALTA')[] = Array.from({ length: n }, () => 'PRESENTE');
        for (let i = n - c.faltas; i < n; i++) situacoes[i] = 'FALTA';
        const livres = Array.from({ length: Math.max(0, n - c.faltas - 1) }, (_, i) => i);
        for (let extra = total - c.faltas; extra > 0 && livres.length; extra--) {
          const k = livres.splice(cx.between(0, livres.length - 1), 1)[0] as number;
          situacoes[k] = 'FALTA';
        }
        ultimosLetivos.forEach((d, i) =>
          linhasFreq.push({ matriculaId: mid, dia: dia(d), situacao: situacoes[i] as 'PRESENTE' }),
        );
      }
      for (let i = 0; i < linhasFreq.length; i += 5000) {
        await tx.frequencia.createMany({ data: linhasFreq.slice(i, i + 5000) });
      }
      frequencias = linhasFreq.length;

      const creche = escolaId.get('11048395') as number;
      const fila: { pessoaId: number; escolaId: number; inscritaEm: Date; criterios: object }[] =
        [];
      for (const s of SETORES) {
        g.criancas
          .filter((c) => c.setor === s.id && c.idade <= 3 && !c.matric)
          .slice(0, FILA_POR_SETOR[s.id])
          .forEach((c) =>
            fila.push({
              pessoaId: pid(c.id),
              escolaId: creche,
              inscritaEm: diasAtras(cx.between(10, 200)),
              criterios: { cadUnico: c.cad, setor: s.id },
            }),
          );
      }
      fila.sort((a, b) => a.inscritaEm.getTime() - b.inscritaEm.getTime());
      await tx.filaCreche.createMany({ data: fila.map((f, i) => ({ ...f, posicao: i + 1 })) });

      await tx.atendimentoEspecializado.createMany({
        data: g.criancas.flatMap((c) => [
          ...(c.aee && c.sala ? [{ pessoaId: pid(c.id), tipo: 'SALA_RECURSOS' as const }] : []),
          ...(c.aee && c.apae ? [{ pessoaId: pid(c.id), tipo: 'APAE' as const }] : []),
        ]),
      });

      // Saúde: só sinalizadores.
      const microareaDe = new Map(pessoas.map((p) => [p.idExterno, p.microarea]));
      await tx.sinalizadorSaude.createMany({
        data: [
          ...g.criancas.map((c) => ({
            pessoaId: pid(c.id),
            ubsCnes: UBS_JACIR_BONI,
            microarea: microareaDe.get(c.id) ?? null,
            acsResponsavel: `ACS ${microareaDe.get(c.id)}`,
            ultimaVisitaAcs: diasAtras(c.acs),
            vacinacaoEmDia: c.vac,
            necessitaAtendimentoEspecializado: c.aee,
          })),
          ...g.idosos.map((p) => ({
            pessoaId: pid(p.id),
            ubsCnes: UBS_JACIR_BONI,
            microarea: microareaDe.get(p.id) ?? null,
            acsResponsavel: `ACS ${microareaDe.get(p.id)}`,
            ultimaVisitaAcs: diasAtras(p.acs),
            vacinaGripeEmDia: p.gripe,
            acamadoDomiciliado: p.acam,
            condicaoCronica: p.cron,
            condicaoCronicaAcompanhada: p.cron ? p.cronA : null,
          })),
        ],
      });

      // Assistência.
      const familiaDe = new Map(pessoas.map((p) => [p.idExterno, famId(p.familia)]));
      const moradoresDe = new Map(
        pessoas.map((p) => [p.idExterno, (domicilios[p.domicilio] as PlanoDomicilio).moradores]),
      );
      const faixa = (vul: number) => {
        const r = cx.r();
        return r < vul * 0.6 ? 'EXTREMA_POBREZA' : r < vul ? 'POBREZA' : 'BAIXA_RENDA';
      };
      const vulQuadra = new Map(g.quadras.map((q) => [q.id, q.vul]));
      await tx.cadunicoFamilia.createMany({
        data: [
          ...g.criancas
            .filter((c) => c.cad)
            .map((c) => ({
              familiaId: familiaDe.get(c.id) as number,
              mesReferencia: MES_CADUNICO,
              faixaRenda: faixa(
                c.quadraId ? (vulQuadra.get(c.quadraId) as number) : 0.57,
              ) as 'POBREZA',
              recebePbf: c.pbf,
              qtdMembros: moradoresDe.get(c.id) ?? 2,
              atualizadoEm: diasAtras(c.cadDias),
            })),
          ...g.idosos
            .filter((p) => p.cad)
            .map((p) => ({
              familiaId: familiaDe.get(p.id) as number,
              mesReferencia: MES_CADUNICO,
              faixaRenda: faixa(0.5) as 'POBREZA',
              recebePbf: false,
              qtdMembros: p.so ? 1 : 2,
              atualizadoEm: diasAtras(cx.between(20, 400)),
            })),
        ],
      });
      await tx.acompanhamentoPaif.createMany({
        data: [
          ...g.criancas
            .filter((c) => c.cras)
            .map((c) => ({
              familiaId: familiaDe.get(c.id) as number,
              tipo: 'PAIF' as const,
              crasCodigo: CRAS_CADSUAS,
              inicioEm: diasAtras(c.crasUlt + cx.between(30, 300)),
              ultimoAtendimentoEm: diasAtras(c.crasUlt),
            })),
          ...g.idosos
            .filter((p) => p.cras)
            .map((p) => ({
              familiaId: familiaDe.get(p.id) as number,
              tipo: 'PAIF' as const,
              crasCodigo: CRAS_CADSUAS,
              inicioEm: diasAtras(cx.between(60, 600)),
              ultimoAtendimentoEm: diasAtras(cx.between(5, 90)),
            })),
        ],
      });
      await tx.bpc.createMany({
        data: [
          ...g.criancas
            .filter((c) => c.bpc)
            .map((c) => ({ pessoaId: pid(c.id), tipo: 'PCD' as const })),
          ...g.idosos
            .filter((p) => p.bpc)
            .map((p) => ({ pessoaId: pid(p.id), tipo: 'IDOSO' as const })),
        ],
      });
      await tx.scfv.createMany({
        data: g.idosos
          .filter((p) => p.scfv)
          .map((p) => ({
            pessoaId: pid(p.id),
            faixaEtaria: '60+',
            inicioEm: diasAtras(cx.between(30, 700)),
          })),
      });
      await tx.criancaFeliz.createMany({
        data: g.criancas
          .filter((c) => c.pcf)
          .map((c) => ({
            pessoaId: pid(c.id),
            visitador: c.visitador,
            ultimaVisitaEm: diasAtras(c.pcfUlt),
          })),
      });

      // Casos de busca ativa e a trilha de cada um.
      const casosBa = await tx.caso.createManyAndReturn({
        data: g.casos.map((c) => {
          const status = STATUS_BUSCA_ATIVA[c.status] as
            keyof typeof LIMITES_BUSCA_ATIVA | 'MATRICULADO';
          const prazo = prazoCaso('BUSCA_ATIVA_ESCOLAR', status, c.dias);
          return {
            codigo: c.id,
            tipo: 'BUSCA_ATIVA_ESCOLAR',
            pessoaId: pid(c.id),
            setorCodigo: c.setor,
            localidade: c.quadra,
            origem: c.origem,
            secretariaResponsavel: SECRETARIA_POR_RESP[c.resp] ?? 'SEMED',
            status,
            nivel: prazo?.nivel ?? 0,
            alertaEm: instante(c.dias),
            prazoEm:
              status === 'MATRICULADO' ? null : diasAtras(c.dias - LIMITES_BUSCA_ATIVA[status]),
            encerradoEm: status === 'MATRICULADO' ? instante(1) : null,
          };
        }),
        select: { id: true, codigo: true },
      });
      const casoId = new Map(casosBa.map((c) => [c.codigo, c.id]));
      type Evento = { casoId: number; tipo: string; ocorridoEm: Date; dados: object };
      const evs: Evento[] = [];
      for (const c of g.casos) {
        const id = casoId.get(c.id) as number;
        const status = STATUS_BUSCA_ATIVA[c.status] as string;
        const etapas: [string, object][] = [
          [
            'ALERTA_GERADO',
            {
              origem: c.origem,
              faixaEtaria: c.idade < 6 ? '4-5' : c.idade < 15 ? '6-14' : '15-17',
            },
          ],
        ];
        if (status !== 'IDENTIFICADO')
          etapas.push(['ENCAMINHADO', { destino: SECRETARIA_POR_RESP[c.resp] ?? 'SEMED' }]);
        if (['VISITA_REALIZADA', 'MATRICULADO', 'NAO_LOCALIZADO'].includes(status)) {
          etapas.push(['VISITA_REALIZADA', { familiaLocalizada: status !== 'NAO_LOCALIZADO' }]);
        }
        if (status === 'MATRICULADO') {
          etapas.push([
            'DESFECHO',
            { resultado: 'MATRICULADO', inep: INEP_POR_ESCOLA_PROTOTIPO[c.escola] },
          ]);
        }
        etapas.forEach(([tipo, dados], i) =>
          evs.push({
            casoId: id,
            tipo,
            dados,
            ocorridoEm: instante(Math.round(c.dias - (c.dias * i) / etapas.length)),
          }),
        );
      }

      // Infrequência: caso + notificação ao CRAS + parecer (quando emitido).
      const criancaPorId = new Map(g.criancas.map((c) => [c.id, c]));
      const casosIf = await tx.caso.createManyAndReturn({
        data: g.notificacoes.map((n) => {
          const c = criancaPorId.get(n.criancaId) as (typeof g.criancas)[number];
          const status = STATUS_NOTIFICACAO[n.status] as 'NOVA';
          const alerta = iso(diasAtras(n.criada));
          const prazo = prazoCaso(
            'INFREQUENCIA',
            status,
            diasUteisEntre(alerta, DATA_BASE, FERIADOS_2026),
          );
          const desfecho = n.desfecho ? DESFECHO_POR_ROTULO[n.desfecho] : null;
          return {
            codigo: n.id.replace('NT-', 'IF-'),
            tipo: 'INFREQUENCIA',
            pessoaId: pid(c.id),
            setorCodigo: c.setor,
            localidade: c.quadra,
            origem: 'Frequência escolar',
            secretariaResponsavel: 'ASSISTENCIA',
            status,
            nivel: prazo?.nivel ?? 0,
            alertaEm: instante(n.criada),
            prazoEm: dia(somarDiasUteis(alerta, PRAZO_PARECER_DIAS_UTEIS, FERIADOS_2026)),
            encerradoEm:
              desfecho && desfecho !== 'ENCAMINHADO_CONSELHO_TUTELAR' ? instante(n.pDias) : null,
          };
        }),
        select: { id: true, codigo: true },
      });
      const casoIf = new Map(casosIf.map((c) => [c.codigo, c.id]));
      const notifs = await tx.notificacao.createManyAndReturn({
        data: g.notificacoes.map((n) => {
          const c = criancaPorId.get(n.criancaId) as (typeof g.criancas)[number];
          const alerta = iso(diasAtras(n.criada));
          return {
            codigo: n.id,
            casoId: casoIf.get(n.id.replace('NT-', 'IF-')) as number,
            destinoCrasCodigo: CRAS_CADSUAS,
            motivo: `${c.faltas} dias letivos seguidos sem frequência`,
            status: STATUS_NOTIFICACAO[n.status] as 'NOVA',
            criadaEm: instante(n.criada),
            prazoEm: dia(somarDiasUteis(alerta, PRAZO_PARECER_DIAS_UTEIS, FERIADOS_2026)),
          };
        }),
        select: { id: true, codigo: true },
      });
      const notifId = new Map(notifs.map((n) => [n.codigo, n.id]));
      await tx.parecer.createMany({
        data: g.notificacoes
          .filter((n) => n.desfecho)
          .map((n) => ({
            notificacaoId: notifId.get(n.id) as number,
            desfecho: DESFECHO_POR_ROTULO[n.desfecho] as 'RETORNO_ESCOLA_COMBINADO',
            texto: n.parecer,
            autorDescricao: 'Técnico(a) do CRAS',
            emitidoEm: instante(n.pDias),
          })),
      });
      for (const n of g.notificacoes) {
        const id = casoIf.get(n.id.replace('NT-', 'IF-')) as number;
        const c = criancaPorId.get(n.criancaId) as (typeof g.criancas)[number];
        evs.push({
          casoId: id,
          tipo: 'ALERTA_GERADO',
          dados: { faltasSeguidas: c.faltas },
          ocorridoEm: instante(n.criada),
        });
        evs.push({
          casoId: id,
          tipo: 'NOTIFICACAO_ENVIADA',
          dados: { notificacao: n.id, destino: 'CRAS' },
          ocorridoEm: instante(n.criada),
        });
        if (n.status !== 'Nova') {
          evs.push({
            casoId: id,
            tipo: 'EM_ANALISE',
            dados: {},
            ocorridoEm: instante(Math.max(n.pDias, n.criada - 1)),
          });
        }
        if (n.desfecho) {
          const desfecho = DESFECHO_POR_ROTULO[n.desfecho] as string;
          evs.push({
            casoId: id,
            tipo: 'PARECER_EMITIDO',
            dados: { desfecho },
            ocorridoEm: instante(n.pDias),
          });
          if (desfecho === 'ENCAMINHADO_CONSELHO_TUTELAR') {
            evs.push({
              casoId: id,
              tipo: 'ENCAMINHADO_CONSELHO_TUTELAR',
              dados: {},
              ocorridoEm: instante(n.pDias),
            });
          }
        }
      }
      // O banco numera e encadeia na ordem de inserção: ordena por caso e por instante.
      evs.sort((a, b) => a.casoId - b.casoId || a.ocorridoEm.getTime() - b.ocorridoEm.getTime());
      await tx.eventoCaso.createMany({
        data: evs.map((e) => ({
          ...e,
          tipo: e.tipo as 'ALERTA_GERADO',
          dados: e.dados as Prisma.InputJsonValue,
        })),
      });
      eventos = evs.length;

      await tx.logCarga.create({
        data: {
          fonte: 'SEED_PROTOTIPO',
          status: 'OK',
          fimEm: new Date(),
          lidos: pessoas.length,
          inseridos: pessoas.length,
          rejeitados: 0,
        },
      });
    },
    { timeout: 600_000, maxWait: 30_000 },
  );

  return {
    pessoas: pessoas.length,
    criancas: g.criancas.length,
    idosos: g.idosos.length,
    casosBuscaAtiva: g.casos.length,
    notificacoes: g.notificacoes.length,
    eventos,
    frequencias,
    cpfsDuplicadosTrocados: cpfsTrocados,
  };
}
