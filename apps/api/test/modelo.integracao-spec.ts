import { contarFaltasSeguidas, iniciais } from '@sii/shared';
import { PrismaService } from '../src/banco/prisma.service';
import { chaveDeHex } from '../src/cripto/cifra';
import { CriptoService } from '../src/cripto/cripto.service';
import type { PrismaClient } from '../src/generated/prisma/client';
import { PessoasRepositorio } from '../src/pessoas/pessoas.repositorio';
import { gerarPrototipo } from '../prisma/seed/prototipo/gerador';
import { semearPrototipo } from '../prisma/seed/prototipo/persistir';
import { semearUsuarios } from '../prisma/seed/usuarios';
import { aplicarMigrations, clienteDono, usarBancoDeTeste } from './apoio-integracao';

const { url, senhaSeed } = usarBancoDeTeste();
const env = {
  CHAVE_CIFRA: process.env.CHAVE_CIFRA ?? '',
  CHAVE_HMAC: process.env.CHAVE_HMAC ?? '',
};
const chaves = {
  cifra: chaveDeHex(env.CHAVE_CIFRA, 'CHAVE_CIFRA'),
  hmac: chaveDeHex(env.CHAVE_HMAC, 'CHAVE_HMAC'),
};

/** Números do protótipo (docs/prototipo/index.html rodado no Node em 11/11/2026). */
const PROTOTIPO = {
  casosPorStatus: {
    IDENTIFICADO: 11,
    ENCAMINHADO: 9,
    VISITA_REALIZADA: 11,
    MATRICULADO: 39,
    NAO_LOCALIZADO: 4,
  },
  notificacoesPorStatus: { NOVA: 17, EM_ANALISE: 11, PARECER_EMITIDO: 9 },
  lotesPorSituacao: { REGULAR: 669, REURB_EM_ANALISE: 119, SEM_INSCRICAO: 92, VAZIO: 68 },
  /** Já com os nomes reais (mapeamento.ts). */
  matriculasCriancasPorInep: {
    '11048395': 76, // Creche Sementinha → Pequeninos de Cristo
    '11005360': 50, // Rede estadual → Paulo Freire
    '11005300': 127, // EMEF Rio Jamari → Sossego da Mamãe
    '11005378': 68, // EMEIEF Pequeno Ipê → Pequeno Príncipe
    '11005122': 53, // EMEF Linha 45 → Cecília Meireles
    '11005165': 104, // EMEF Castanheira → Dr. Custódio
  },
};

const contar = (linhas: { chave: string; n: bigint }[]) =>
  Object.fromEntries(linhas.map((l) => [l.chave, Number(l.n)]));

let dono: PrismaClient;
let prisma: PrismaService;

beforeAll(async () => {
  aplicarMigrations(url);
  dono = clienteDono(url);
  await semearUsuarios(dono, senhaSeed);
  await semearPrototipo(dono, chaves);
  prisma = new PrismaService({ get: () => url } as never);
}, 180_000);

afterAll(async () => {
  await dono?.$disconnect();
  await prisma?.$disconnect();
});

describe('seed fictício = protótipo', () => {
  it('totais de pessoas', async () => {
    const porPrefixo = contar(
      await dono.$queryRaw`
        SELECT split_part(id_externo, '-', 1) AS chave, count(*) AS n
        FROM pessoas.vinculo_fonte GROUP BY 1`,
    );
    expect(porPrefixo).toEqual({ BA: 74, CI: 620, PI: 1048, RESP: 694 });
  });

  it('casos de busca ativa por status, notificações e lotes', async () => {
    expect(
      contar(
        await dono.$queryRaw`
        SELECT status AS chave, count(*) AS n FROM casos.caso
        WHERE tipo = 'BUSCA_ATIVA_ESCOLAR' GROUP BY 1`,
      ),
    ).toEqual(PROTOTIPO.casosPorStatus);
    expect(
      contar(
        await dono.$queryRaw`SELECT status::text AS chave, count(*) AS n FROM casos.notificacao GROUP BY 1`,
      ),
    ).toEqual(PROTOTIPO.notificacoesPorStatus);
    expect(
      contar(
        await dono.$queryRaw`SELECT situacao::text AS chave, count(*) AS n FROM territorio.lote GROUP BY 1`,
      ),
    ).toEqual(PROTOTIPO.lotesPorSituacao);
  });

  it('matrículas das crianças por escola, com o INEP real', async () => {
    expect(
      contar(
        await dono.$queryRaw`
        SELECT e.inep AS chave, count(*) AS n
        FROM educacao.matricula m
        JOIN educacao.escola e ON e.id = m.escola_id
        JOIN pessoas.vinculo_fonte v ON v.pessoa_id = m.pessoa_id AND v.id_externo LIKE 'CI-%'
        GROUP BY 1`,
      ),
    ).toEqual(PROTOTIPO.matriculasCriancasPorInep);
  });

  it('a frequência lançada reproduz as faltas seguidas do protótipo, pelo calendário escolar', async () => {
    const g = gerarPrototipo();
    const esperado = new Map(
      g.criancas.filter((c) => c.idade >= 4 && c.matric).map((c) => [c.id, c.faltas]),
    );
    const letivos = (
      await dono.$queryRaw<{ dia: Date }[]>`
        SELECT DISTINCT dia FROM educacao.calendario_escolar ORDER BY dia`
    ).map((l) => l.dia.toISOString().slice(0, 10));
    const linhas = await dono.$queryRaw<
      { chave: string; dia: Date; situacao: 'PRESENTE' | 'FALTA' }[]
    >`
      SELECT v.id_externo AS chave, f.dia, f.situacao::text AS situacao
      FROM educacao.frequencia f
      JOIN educacao.matricula m ON m.id = f.matricula_id
      JOIN pessoas.vinculo_fonte v ON v.pessoa_id = m.pessoa_id`;
    const porAluno = new Map<string, { data: string; situacao: 'PRESENTE' | 'FALTA' }[]>();
    for (const l of linhas) {
      const lista = porAluno.get(l.chave) ?? [];
      lista.push({ data: l.dia.toISOString().slice(0, 10), situacao: l.situacao });
      porAluno.set(l.chave, lista);
    }
    expect(porAluno.size).toBe(esperado.size);
    for (const [aluno, faltas] of esperado) {
      expect([
        aluno,
        contarFaltasSeguidas(porAluno.get(aluno) ?? [], letivos, '2026-11-07'),
      ]).toEqual([aluno, faltas]);
    }
  });

  it('nome completo coerente com as iniciais do protótipo', async () => {
    const [p] = await dono.$queryRaw<{ nome: string }[]>`
      SELECT p.nome FROM pessoas.pessoa_mestra p
      JOIN pessoas.vinculo_fonte v ON v.pessoa_id = p.id WHERE v.id_externo = 'CI-10230'`;
    expect(iniciais(p?.nome ?? '')).toBe('T. F. L.');
  });

  it('roda de novo sem duplicar (idempotente)', async () => {
    await semearPrototipo(dono, chaves);
    const [l] = await dono.$queryRaw<
      { n: bigint }[]
    >`SELECT count(*) AS n FROM pessoas.pessoa_mestra`;
    expect(Number(l?.n)).toBe(2436);
  }, 120_000);

  it('recusa limpar um banco com pessoa que não veio do seed', async () => {
    const p = await dono.pessoaMestra.create({
      data: { nome: 'Pessoa de outra carga', nomeNormalizado: 'pessoa de outra carga' },
    });
    try {
      await expect(semearPrototipo(dono, chaves)).rejects.toThrow(/não vieram do seed/);
    } finally {
      await dono.pessoaMestra.delete({ where: { id: p.id } });
    }
  });
});

describe('documentos cifrados', () => {
  it('busca por CPF pelo hash, sem decifrar, respeitando a RLS', async () => {
    const repo = new PessoasRepositorio(
      prisma,
      new CriptoService({ get: (k: keyof typeof env) => env[k] } as never),
    );
    const [esperado] = await dono.$queryRaw<{ id: number }[]>`
      SELECT pessoa_id AS id FROM pessoas.vinculo_fonte WHERE id_externo = 'CI-10230'`;
    // CPF sorteado pelo protótipo para a 1ª criança (CI-10230, S03, sem escola).
    const semed = { id: 1, perfil: 'SEMED_GESTOR' as const, escopos: [] };
    expect(await repo.buscarPorCpf(semed, '587.959.953-56')).toEqual({ id: esperado?.id });
    expect(await repo.buscarPorCpf(semed, '000.000.000-00')).toBeNull();
    expect(await repo.buscarPorCpf(semed, '123')).toBeNull();
    // Escola de outra criança: a RLS esconde a pessoa mesmo com o CPF certo.
    const escola = {
      id: 2,
      perfil: 'ESCOLA' as const,
      escopos: [{ tipo: 'ESCOLA' as const, valor: '11005165' }],
    };
    expect(await repo.buscarPorCpf(escola, '58795995356')).toBeNull();
  });

  it('a busca usa o índice único do hash', async () => {
    const plano = await dono.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
      `EXPLAIN SELECT id FROM pessoas.pessoa_mestra WHERE cpf_hash = '\\x00'::bytea`,
    );
    expect(plano.map((l) => l['QUERY PLAN']).join('\n')).toMatch(/pessoa_mestra_cpf_hash_key/);
  });

  it('nenhum CPF aparece em texto no banco', async () => {
    const linhas = await dono.pessoaMestra.findMany({
      select: { cpfCifrado: true, nisCifrado: true, cnsCifrado: true },
    });
    const cpfConhecido = Buffer.from('58795995356');
    for (const l of linhas) {
      for (const v of [l.cpfCifrado, l.nisCifrado, l.cnsCifrado]) {
        if (v) expect(Buffer.from(v).includes(cpfConhecido)).toBe(false);
      }
    }
    const colunasTexto = await dono.$queryRaw<{ coluna: string }[]>`
      SELECT table_schema || '.' || table_name || '.' || column_name AS coluna
      FROM information_schema.columns
      WHERE column_name ~ '^(cpf|nis|cns)$' AND data_type IN ('text', 'character varying', 'character')`;
    expect(colunasTexto).toEqual([]);
  });
});

describe('trilha do caso (append-only, hash encadeado)', () => {
  it('UPDATE, DELETE e TRUNCATE falham, inclusive para o dono', async () => {
    await expect(dono.$executeRaw`UPDATE casos.evento_caso SET dados = '{}'`).rejects.toThrow(
      /append-only/,
    );
    await expect(dono.$executeRaw`DELETE FROM casos.evento_caso`).rejects.toThrow(/append-only/);
    await expect(dono.$executeRaw`TRUNCATE casos.evento_caso`).rejects.toThrow(/append-only/);
  });

  it('cada evento aponta para o hash do anterior; todas as trilhas íntegras', async () => {
    const quebradas = await dono.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM casos.evento_caso e
      JOIN casos.evento_caso a ON a.caso_id = e.caso_id AND a.seq = e.seq - 1
      WHERE e.hash_anterior <> a.hash`;
    expect(Number(quebradas[0]?.n)).toBe(0);
    const trilhas = await dono.$queryRaw<{ integra: boolean; n: bigint }[]>`
      SELECT t.integra, count(*) AS n FROM casos.caso c, casos.verificar_trilha(c.id) t GROUP BY 1`;
    expect(trilhas.map((t) => [t.integra, Number(t.n)])).toEqual([[true, 74 + 37]]);
  });

  it('verificar_trilha acusa adulteração feita por fora (dono desligando o trigger)', async () => {
    const SENTINELA = new Error('desfaz');
    await expect(
      dono.$transaction(async (tx) => {
        const [c] = await tx.$queryRaw<
          { id: number }[]
        >`SELECT id FROM casos.caso WHERE codigo = 'BA-2026-0301'`;
        await tx.$executeRawUnsafe(
          'ALTER TABLE casos.evento_caso DISABLE TRIGGER evento_caso_sem_update',
        );
        await tx.$executeRaw`UPDATE casos.evento_caso SET dados = '{"adulterado":true}' WHERE caso_id = ${c?.id} AND seq = 1`;
        const [r] = await tx.$queryRaw<{ integra: boolean; primeiro_seq_quebrado: number }[]>`
          SELECT integra, primeiro_seq_quebrado FROM casos.verificar_trilha(${c?.id}::int)`;
        expect(r).toEqual({ integra: false, primeiro_seq_quebrado: 1 });
        throw SENTINELA; // desfaz tudo, inclusive o DISABLE TRIGGER
      }),
    ).rejects.toBe(SENTINELA);
  });

  it('o auditor confere a trilha sem ler o conteúdo', async () => {
    const auditor = { id: 3, perfil: 'AUDITOR_TCE' as const, escopos: [] };
    const [c] = await dono.$queryRaw<
      { id: number }[]
    >`SELECT id FROM casos.caso WHERE codigo = 'BA-2026-0301'`;
    const r = await prisma.comoUsuario(
      auditor,
      (tx) =>
        tx.$queryRaw<
          { integra: boolean }[]
        >`SELECT integra FROM casos.verificar_trilha(${c?.id}::int)`,
    );
    expect(r[0]?.integra).toBe(true);
    await expect(prisma.comoUsuario(auditor, (tx) => tx.eventoCaso.count())).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe('Row-Level Security das tabelas novas', () => {
  const custodio = {
    id: 4,
    perfil: 'ESCOLA' as const,
    escopos: [{ tipo: 'ESCOLA' as const, valor: '11005165' }],
  };
  const auditor = { id: 3, perfil: 'AUDITOR_TCE' as const, escopos: [] };

  it('ESCOLA vê só as matrículas e a frequência dos próprios alunos', async () => {
    const r = await prisma.comoUsuario(custodio, async (tx) => ({
      matriculas: await tx.matricula.findMany({ select: { escola: { select: { inep: true } } } }),
      frequencias: await tx.frequencia.count(),
      sinalizadores: await tx.sinalizadorSaude.count(),
    }));
    expect(new Set(r.matriculas.map((m) => m.escola.inep))).toEqual(new Set(['11005165']));
    const casosMatriculadosLa = gerarPrototipo().casos.filter(
      (c) => c.status === 'Matriculado' && c.escola === 'EMEF Castanheira',
    ).length;
    expect(r.matriculas.length).toBe(104 + casosMatriculadosLa); // crianças + busca ativa matriculada lá
    expect(r.frequencias).toBe(104 * 20);
    // Sinalizador de saúde: a RLS deixa a escola ver as próprias crianças; o recorte por campo
    // (SEMED não vê dado de saúde) é nos DTOs (P12).
    expect(r.sinalizadores).toBeLessThanOrEqual(107);
  });

  it.each([
    'educacao.matricula',
    'educacao.frequencia',
    'saude.sinalizador_saude',
    'assistencia.bpc',
    'assistencia.cadunico_familia',
    'pessoas.familia',
    'casos.notificacao',
    'casos.parecer',
  ])('AUDITOR_TCE: permission denied em %s', async (tabela) => {
    await expect(
      prisma.comoUsuario(auditor, (tx) => tx.$queryRawUnsafe(`SELECT 1 FROM ${tabela} LIMIT 1`)),
    ).rejects.toThrow(/permission denied/i);
  });

  it('AUDITOR_TCE lê cadastros públicos e indicadores', async () => {
    const r = await prisma.comoUsuario(auditor, async (tx) => ({
      escolas: await tx.escola.count(),
      quadras: await tx.quadra.count(),
      dimensoes: await tx.dimensaoIvmQuadra.count(),
    }));
    expect(r).toEqual({ escolas: 7, quadras: 79, dimensoes: 79 });
  });

  it('auditoria é só do dono: nem sii_app nem sii_auditor', async () => {
    const admin = { id: 5, perfil: 'ADMIN_CTI' as const, escopos: [] };
    await expect(prisma.comoUsuario(admin, (tx) => tx.logCarga.count())).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('o schema de saúde não tem coluna de diagnóstico', async () => {
    const colunas = await dono.$queryRaw<{ c: string }[]>`
      SELECT column_name AS c FROM information_schema.columns
      WHERE table_schema = 'saude' AND column_name ~* '(cid|diagnost|laudo)'`;
    expect(colunas).toEqual([]);
  });
});
