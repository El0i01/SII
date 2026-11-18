import { execFileSync } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import type { ContratoTransparencia } from '@sii/shared';
import { semearPrototipo } from '../../api/prisma/seed/prototipo/persistir';
import { semearUsuarios } from '../../api/prisma/seed/usuarios';
import { buscarAlertasCarga } from '../../api/src/cargas/alertas';
import { clienteMinio, configMinio } from '../../api/src/cargas/armazenamento';
import { chaveDeHex } from '../../api/src/cripto/cifra';
import { criarPrisma, type PrismaClient } from '../src/banco';
import {
  type ContextoCarga,
  executarCarga,
  FalhaDefinitiva,
  RejeicaoCarga,
} from '../src/cargas/pipeline';
import { lerEnv } from '../src/config';
import {
  carregarContratoTransparencia,
  carregarDicionarioDespesa,
  criarProcessadorDespesa,
  criarProcessadorTransparencia,
} from '../src/indicadores/despesa';
import { executarIndicadores } from '../src/indicadores/snapshots';

/** Indicadores (P16) contra o seed: números conferidos com SQL independente; despesa por CSV e API. */
const base = lerEnv();
const url = process.env.DATABASE_URL_TESTE ?? '';
if (!url) throw new Error('defina DATABASE_URL_TESTE no .env da raiz');
const REF = '2026-11-08';

let prisma: PrismaClient;

beforeAll(async () => {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: path.resolve(__dirname, '../../api'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  prisma = criarPrisma(url);
  await semearUsuarios(prisma, process.env.SEED_SENHA ?? 'senha-de-teste');
  await semearPrototipo(prisma, {
    cifra: chaveDeHex(base.CHAVE_CIFRA, 'CHAVE_CIFRA'),
    hmac: chaveDeHex(base.CHAVE_HMAC, 'CHAVE_HMAC'),
  });
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
});

const snap = (indicador: string, territorio = 'MUN', periodo = '2026-11') =>
  prisma.indicadorSnapshot.findUniqueOrThrow({
    where: {
      indicador_territorioCodigo_periodo: { indicador, territorioCodigo: territorio, periodo },
    },
  });

describe('job de indicadores (P16)', () => {
  it('grava os 8 indicadores do município e de cada setor, e o OE3 por vigência', async () => {
    const r = await executarIndicadores(prisma, { referencia: REF });
    expect(r.periodos).toEqual(['2026-11', '2026-V2']);
    const setores = await prisma.setor.count();
    const mensais = await prisma.indicadorSnapshot.count({ where: { periodo: '2026-11' } });
    // 6 indicadores de pessoas × (MUN + setores) + OE5 e OE6 só no município.
    expect(mensais).toBe(6 * (setores + 1) + 2);
    expect(await prisma.indicadorSnapshot.count({ where: { periodo: '2026-V2' } })).toBe(
      2 * (setores + 1),
    );
  });

  it('vacinação, creche e ponto preciso conferem com SQL independente', async () => {
    const [v] = await prisma.$queryRaw<{ num: number; den: number }[]>`
      SELECT count(*) FILTER (WHERE s.vacinacao_em_dia)::int AS num, count(*)::int AS den
      FROM pessoas.pessoa_mestra p JOIN saude.sinalizador_saude s ON s.pessoa_id = p.id
      WHERE s.vacinacao_em_dia IS NOT NULL AND age(${new Date(`${REF}T00:00:00Z`)}::date, p.data_nascimento) < interval '7 years'
        AND p.data_nascimento <= ${new Date(`${REF}T00:00:00Z`)}::date`;
    const vac = await snap('VACINACAO_0_6');
    expect([vac.numerador, vac.denominador]).toEqual([v?.num, v?.den]);
    expect(Number(vac.valor)).toBeCloseTo(((v?.num ?? 0) * 100) / (v?.den ?? 1), 1);

    const [c] = await prisma.$queryRaw<{ num: number; den: number }[]>`
      SELECT count(DISTINCT p.id) FILTER (WHERE m.id IS NOT NULL)::int AS num, count(DISTINCT p.id)::int AS den
      FROM pessoas.pessoa_mestra p
      LEFT JOIN educacao.matricula m ON m.pessoa_id = p.id AND m.situacao = 'ATIVA' AND m.ano = 2026
      WHERE age(${new Date(`${REF}T00:00:00Z`)}::date, p.data_nascimento) < interval '4 years'
        AND p.data_nascimento <= ${new Date(`${REF}T00:00:00Z`)}::date`;
    const cre = await snap('CRECHE_0_3');
    expect([cre.numerador, cre.denominador]).toEqual([c?.num, c?.den]);

    const total = await prisma.domicilio.count();
    const precisos = await prisma.domicilio.count({
      where: { OR: [{ geoFonte: { in: ['LOTE', 'CENSO_GPS'] } }, { confirmadoEm: { not: null } }] },
    });
    const pp = await snap('PONTO_PRECISO');
    expect([pp.numerador, pp.denominador]).toEqual([precisos, total]);

    // A soma dos setores não suprimidos nunca passa do município.
    const porSetor = await prisma.indicadorSnapshot.findMany({
      where: { indicador: 'PONTO_PRECISO', periodo: '2026-11', territorioCodigo: { not: 'MUN' } },
    });
    expect(porSetor.reduce((a, s) => a + (s.denominador ?? 0), 0)).toBeLessThanOrEqual(total);
  });

  it('suprime contagens de 1 a 4 (setor) e guarda só números', async () => {
    const suprimidos = await prisma.indicadorSnapshot.findMany({ where: { suprimido: true } });
    for (const s of suprimidos)
      expect([s.numerador, s.denominador, s.valor]).toEqual([null, null, null]);
    const visiveis = await prisma.indicadorSnapshot.findMany({
      where: {
        suprimido: false,
        indicador: { notIn: ['RELATORIOS_ENTREGUES', 'ACESSOS_REGISTRADOS'] },
      },
    });
    for (const s of visiveis) {
      for (const n of [s.numerador ?? 0, s.denominador ?? 0]) expect(n === 0 || n >= 5).toBe(true);
    }
  });

  it('OE5 e OE6: relatórios devidos e acessos registrados', async () => {
    const rel = await snap('RELATORIOS_ENTREGUES');
    expect([rel.numerador, rel.denominador]).toEqual([0, 1]);
    const ac = await snap('ACESSOS_REGISTRADOS');
    expect(ac.numerador).toBe(ac.denominador);
  });

  it('rodar duas vezes não duplica', async () => {
    const antes = await prisma.indicadorSnapshot.count();
    await executarIndicadores(prisma, { referencia: REF });
    expect(await prisma.indicadorSnapshot.count()).toBe(antes);
  });
});

function contexto(fonte: string, id: number): ContextoCarga & { problemas: number[] } {
  const problemas: number[] = [];
  return {
    carga: { id, fonte, mesReferencia: null },
    prisma,
    problemas,
    etapa: async () => {},
    progresso: async () => {},
    problema: (linha) => problemas.push(linha),
  };
}

describe('despesa por programa (P16)', () => {
  it('CSV da Fazenda: grava por programa e mês, recusa linha inválida, reenviar substitui', async () => {
    const csv = Buffer.from(
      'programa;exercicio;mes;valor_liquidado\nCreche;2026;11;"210.000,00"\nPrograma X;2026;11;1,00\nAtenção primária;2026;11;390000\n',
      'utf8',
    );
    const ctx = contexto('DESPESA', 999001);
    const processar = criarProcessadorDespesa(carregarDicionarioDespesa());
    const r = await processar(ctx, csv);
    expect(r).toMatchObject({ lidos: 3, rejeitados: 1, inseridos: 2 });
    expect(ctx.problemas).toEqual([3]);
    const creche = await prisma.despesaPrograma.findUniqueOrThrow({
      where: { ano_mes_programa: { ano: 2026, mes: 11, programa: 'CRECHE' } },
    });
    expect(Number(creche.valorLiquidado)).toBe(210000);
    expect(creche.fonte).toBe('CSV');

    await processar(ctx, Buffer.from('programa;ano;mes;valor\nCreche;2026;11;5\n', 'utf8'));
    expect(
      Number(
        (
          await prisma.despesaPrograma.findUniqueOrThrow({
            where: { ano_mes_programa: { ano: 2026, mes: 11, programa: 'CRECHE' } },
          })
        ).valorLiquidado,
      ),
    ).toBe(5);

    await expect(processar(ctx, Buffer.from('programa;ano\nCreche;2026\n'))).rejects.toThrow(
      RejeicaoCarga,
    );
  });

  describe('conector do Portal da Transparência', () => {
    let servidor: http.Server;
    let endereco = '';
    let resposta: (mes: number) => unknown = () => ({ dados: [] });

    beforeAll(async () => {
      servidor = http.createServer((req, res) => {
        const mes = Number(new URL(req.url ?? '/', 'http://x').searchParams.get('mes'));
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(resposta(mes)));
      });
      await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
      endereco = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/despesas`;
    });
    afterAll(() => new Promise<void>((ok) => servidor.close(() => ok())));

    const contrato = (): ContratoTransparencia =>
      carregarContratoTransparencia(undefined, endereco);

    it('lê os meses do ano pelo contrato e grava com fonte API', async () => {
      resposta = (mes) => ({
        dados: [
          { programa: 'Transporte escolar', exercicio: 2026, mes, valorLiquidado: 1000 + mes },
        ],
      });
      const r = await criarProcessadorTransparencia(contrato(), { referencia: '2026-03-10' })(
        contexto('PORTAL_TRANSPARENCIA', 999002),
      );
      expect(r).toMatchObject({ lidos: 3, inseridos: 3, rejeitados: 0 });
      const linhas = await prisma.despesaPrograma.findMany({
        where: { programa: 'TRANSPORTE_ESCOLAR', ano: 2026, mes: { lte: 3 } },
        orderBy: { mes: 'asc' },
      });
      expect(linhas.map((l) => [l.mes, Number(l.valorLiquidado), l.fonte])).toEqual([
        [1, 1001, 'API'],
        [2, 1002, 'API'],
        [3, 1003, 'API'],
      ]);
    });

    it('contrato quebrado: falha visível (alerta da CTI) e nada gravado', async () => {
      const antes = await prisma.despesaPrograma.findMany({
        where: { mes: 1, programa: 'TRANSPORTE_ESCOLAR' },
      });
      resposta = (mes) =>
        mes === 1
          ? { dados: [{ programa: 'Creche', exercicio: 2026, mes, valorLiquidado: 7 }] }
          : { itens: [] };
      const processar = criarProcessadorTransparencia(contrato(), { referencia: '2026-02-10' });
      await expect(processar(contexto('PORTAL_TRANSPARENCIA', 999003))).rejects.toThrow(
        FalhaDefinitiva,
      );

      const carga = await prisma.logCarga.create({
        data: { fonte: 'PORTAL_TRANSPARENCIA', status: 'AGUARDANDO' },
      });
      const env = lerEnv();
      await executarCarga(
        {
          prisma,
          minio: clienteMinio(configMinio(env)),
          bucket: 'nao-usado',
          logger: { log: () => {}, warn: () => {}, error: () => {} },
          processadores: {},
          consultas: { PORTAL_TRANSPARENCIA: processar },
        },
        carga.id,
        true,
      );
      const fim = await prisma.logCarga.findUniqueOrThrow({ where: { id: carga.id } });
      expect(fim.status).toBe('FALHOU');
      expect(fim.erro).toContain('Contrato da API mudou');
      expect((await buscarAlertasCarga(prisma)).map((a) => a.fonte)).toContain(
        'PORTAL_TRANSPARENCIA',
      );
      // Não deixa o alerta no banco de teste compartilhado (o teste de alertas da API conta as falhas).
      await prisma.logCarga.delete({ where: { id: carga.id } });
      // O mês 1 (que veio certo) não foi gravado pela metade.
      expect(
        await prisma.despesaPrograma.findMany({
          where: { mes: 1, programa: 'TRANSPORTE_ESCOLAR' },
        }),
      ).toEqual(antes);
      expect(
        await prisma.despesaPrograma.count({
          where: { mes: 1, programa: 'CRECHE', valorLiquidado: 7 },
        }),
      ).toBe(0);
    });
  });
});
