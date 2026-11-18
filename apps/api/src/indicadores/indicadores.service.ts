import { createHash } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CODIGOS_INDICADOR,
  type CodigoIndicador,
  type DataISO,
  hojeEmPortoVelho,
  INDICADORES_POR_VIGENCIA,
  intervaloSemestre,
  type LinhaIndicador,
  type MetaIndicador,
  type MetaLida,
  montarLinhaIndicador,
  PROGRAMAS,
  rotuloSemestre,
  semestre as semestreDe,
  type SnapshotLido,
  TERRITORIO_MUNICIPIO,
  type VerificarTrilha,
} from '@sii/shared';
import { PrismaService } from '../banco/prisma.service';
import { ErroApi } from '../comum/erros';
import type { UsuarioAutenticado } from '../comum/usuario-autenticado';
import type { Prisma } from '../generated/prisma/client';
import { gerarPdf, gerarXlsx } from './relatorio';

type Tx = Prisma.TransactionClient;

export interface Trilha {
  codigo: string;
  tipo: string;
  encerradoEm: string;
  eventos: number;
  verificador: string;
}

export interface ControleExterno {
  semestre: string;
  rotuloSemestre: string;
  referencia: DataISO;
  indicadores: LinhaIndicador[];
  gasto: {
    ano: number;
    programas: {
      codigo: string;
      nome: string;
      valor: number;
      resultado: string;
      indicador: string;
    }[];
    fonte: string | null;
  };
  acessos: { registrados: number };
  trilhas: Trilha[];
  relatorios: {
    id: number;
    formato: string;
    geradoEm: string;
    entregueEm: string | null;
    sha256: string;
  }[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const num = (d: Prisma.Decimal | null) => (d === null ? null : Number(d));

const semestreNaoEncontrado = () =>
  new ErroApi(HttpStatus.UNPROCESSABLE_ENTITY, 'VALIDACAO', 'Confira os campos destacados.', {
    semestre: ['Use o semestre no formato AAAA-S1 ou AAAA-S2.'],
  });

/**
 * Indicadores e controle externo (§3.11, P16, ADR 0015). Tudo aqui é desidentificado: snapshots,
 * metas, despesa e as trilhas (só código e verificador). O auditor lê **pelo papel `sii_auditor`**
 * (`comoUsuario`), que só alcança o schema `indicadores` e as funções de trilha.
 */
@Injectable()
export class IndicadoresService {
  constructor(private readonly prisma: PrismaService) {}

  /** Semestre pedido ou o atual; nunca um semestre futuro. */
  semestreValido(s: string | undefined): string {
    const atual = semestreDe(hojeEmPortoVelho());
    if (s === undefined) return atual;
    if (!/^\d{4}-S[12]$/.test(s) || s > atual) throw semestreNaoEncontrado();
    return s;
  }

  private async metas(tx: Tx): Promise<Map<string, MetaLida>> {
    const linhas = await tx.metaIndicador.findMany({
      orderBy: [{ indicador: 'asc' }, { versao: 'desc' }],
    });
    const m = new Map<string, MetaLida>();
    for (const l of linhas) {
      if (m.has(l.indicador)) continue;
      m.set(l.indicador, {
        linhaBase: num(l.linhaBase),
        dataBase: l.dataBase ? iso(l.dataBase) : null,
        meta: Number(l.meta),
        metaTexto: l.metaTexto,
        prazo: l.prazo ? iso(l.prazo) : null,
        versao: l.versao,
      });
    }
    return m;
  }

  private async montar(tx: Tx, semestre: string): Promise<ControleExterno> {
    const { inicio, fim } = intervaloSemestre(semestre);
    const hoje = hojeEmPortoVelho();
    const referencia = (hoje < fim ? hoje : fim) as DataISO;
    const vigencia = `${semestre.slice(0, 4)}-V${semestre.slice(-1)}`;
    const snaps = await tx.indicadorSnapshot.findMany({
      where: { territorioCodigo: TERRITORIO_MUNICIPIO, periodo: { lte: fim.slice(0, 7) } },
      orderBy: { periodo: 'asc' },
    });
    const lido = (s: (typeof snaps)[number]): SnapshotLido => ({
      periodo: s.periodo,
      numerador: s.numerador,
      denominador: s.denominador,
      valor: num(s.valor),
      suprimido: s.suprimido,
    });
    const metas = await this.metas(tx);
    const indicadores = CODIGOS_INDICADOR.map((codigo) => {
      const doIndicador = snaps.filter((s) => s.indicador === codigo);
      const mensais = doIndicador.filter((s) => /^\d{4}-\d{2}$/.test(s.periodo));
      // OE3 é acompanhado por vigência: vale a do semestre, se já calculada.
      const daVigencia = INDICADORES_POR_VIGENCIA.includes(codigo)
        ? doIndicador.find((s) => s.periodo === vigencia)
        : undefined;
      const atual = daVigencia ?? mensais.at(-1) ?? null;
      const primeiro = (
        INDICADORES_POR_VIGENCIA.includes(codigo)
          ? doIndicador.filter((s) => /-V[12]$/.test(s.periodo))
          : mensais
      )[0];
      return montarLinhaIndicador(
        codigo,
        atual ? lido(atual) : null,
        primeiro ? lido(primeiro) : null,
        metas.get(codigo) ?? null,
        referencia,
      );
    });

    const ano = Number(semestre.slice(0, 4));
    const despesas = await tx.despesaPrograma.groupBy({
      by: ['programa'],
      where: { ano },
      _sum: { valorLiquidado: true },
    });
    const fonte = await tx.despesaPrograma.findFirst({
      where: { ano },
      orderBy: { atualizadoEm: 'desc' },
      select: { fonte: true },
    });
    const porCodigo = new Map(indicadores.map((i) => [i.codigo, i]));
    const programas = PROGRAMAS.map((p) => {
      const ind = porCodigo.get(p.indicador as CodigoIndicador);
      return {
        codigo: p.codigo,
        nome: p.nome,
        valor: Number(despesas.find((d) => d.programa === p.codigo)?._sum.valorLiquidado ?? 0),
        indicador: p.indicador,
        resultado: ind ? `${ind.nome}: ${ind.atual}` : '—',
      };
    });

    const [ac] = await tx.$queryRaw<{ n: number }[]>`
      SELECT coalesce(sum(numerador), 0)::int AS n FROM indicadores.indicador_snapshot
      WHERE indicador = 'ACESSOS_REGISTRADOS' AND territorio_codigo = 'MUN'
        AND periodo BETWEEN ${inicio.slice(0, 7)} AND ${fim.slice(0, 7)}`;
    const trilhas = await tx.$queryRaw<
      { codigo: string; tipo: string; encerrado_em: Date; eventos: number; verificador: string }[]
    >`SELECT * FROM casos.trilhas_encerradas(${new Date(`${inicio}T00:00:00Z`)}::date, ${new Date(`${fim}T00:00:00Z`)}::date)`;
    const relatorios = await tx.relatorioSemestral.findMany({
      where: { semestre },
      orderBy: { geradoEm: 'desc' },
      take: 10,
    });
    return {
      semestre,
      rotuloSemestre: rotuloSemestre(semestre),
      referencia,
      indicadores,
      gasto: { ano, programas, fonte: fonte?.fonte ?? null },
      acessos: { registrados: ac?.n ?? 0 },
      trilhas: trilhas.map((t) => ({
        codigo: t.codigo,
        tipo: t.tipo,
        encerradoEm: t.encerrado_em.toISOString(),
        eventos: Number(t.eventos),
        verificador: t.verificador,
      })),
      relatorios: relatorios.map((r) => ({
        id: r.id,
        formato: r.formato,
        geradoEm: r.geradoEm.toISOString(),
        entregueEm: r.entregueEm?.toISOString() ?? null,
        sha256: r.sha256,
      })),
    };
  }

  /** Painel "Controle externo" (CTI, Comitê, auditor), sempre pelo papel do perfil. */
  controleExterno(u: UsuarioAutenticado, semestre?: string): Promise<ControleExterno> {
    const s = this.semestreValido(semestre);
    return this.prisma.comoUsuario(u, (tx) => this.montar(tx, s));
  }

  /**
   * Relatório semestral ao TCE em PDF ou XLSX. Os dados vêm pelo papel do perfil; o registro do
   * relatório (hash, quem gerou) é gravado pelo dono, porque o auditor não escreve no banco.
   */
  async relatorio(u: UsuarioAutenticado, semestre: string | undefined, formato: 'pdf' | 'xlsx') {
    const dados = await this.controleExterno(u, semestre);
    const geradoEm = new Date();
    const arquivo =
      formato === 'pdf' ? await gerarPdf(dados, geradoEm) : await gerarXlsx(dados, geradoEm);
    const sha256 = createHash('sha256').update(arquivo).digest('hex');
    const r = await this.prisma.relatorioSemestral.create({
      data: { semestre: dados.semestre, formato, sha256, geradoPorId: u.id, geradoEm },
    });
    return { arquivo, sha256, id: r.id, nome: `relatorio-tce-${dados.semestre}.${formato}` };
  }

  /** A CTI marca a entrega do relatório ao TCE (conta no OE5). */
  async entregar(u: UsuarioAutenticado, id: number) {
    const r = await this.prisma.relatorioSemestral.findUnique({ where: { id } });
    if (!r) throw new ErroApi(HttpStatus.NOT_FOUND, 'NAO_ENCONTRADO', 'Relatório não encontrado.');
    if (r.entregueEm) return { id, entregueEm: r.entregueEm.toISOString() };
    const f = await this.prisma.relatorioSemestral.update({
      where: { id },
      data: { entregueEm: new Date(), entreguePorId: u.id },
    });
    return { id, entregueEm: (f.entregueEm as Date).toISOString() };
  }

  async listarMetas() {
    const m = await this.prisma.$transaction((tx) => this.metas(tx));
    return CODIGOS_INDICADOR.map((codigo) => ({ indicador: codigo, ...(m.get(codigo) ?? null) }));
  }

  /** Nova versão da meta (a anterior fica para o histórico). */
  async definirMeta(u: UsuarioAutenticado, indicador: string, m: MetaIndicador) {
    if (!(CODIGOS_INDICADOR as string[]).includes(indicador))
      throw new ErroApi(HttpStatus.NOT_FOUND, 'NAO_ENCONTRADO', 'Indicador não encontrado.');
    const ultima = await this.prisma.metaIndicador.findFirst({
      where: { indicador },
      orderBy: { versao: 'desc' },
      select: { versao: true },
    });
    const d = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null);
    const nova = await this.prisma.metaIndicador.create({
      data: {
        indicador,
        versao: (ultima?.versao ?? 0) + 1,
        linhaBase: m.linhaBase,
        dataBase: d(m.dataBase),
        meta: m.meta,
        metaTexto: m.metaTexto,
        prazo: d(m.prazo),
        aprovadoPorId: u.id,
      },
    });
    return { indicador, versao: nova.versao };
  }

  /**
   * Verificação da trilha pelo código verificador (critério do P16). A função do banco recalcula a
   * cadeia de hashes e devolve só tipo e data de cada evento.
   */
  async verificarTrilha(u: UsuarioAutenticado, v: VerificarTrilha) {
    const linhas = await this.prisma.comoUsuario(
      u,
      (tx) =>
        tx.$queryRaw<
          {
            integra: boolean;
            primeiro_seq_quebrado: number | null;
            eventos: number;
            verificador: string | null;
            seq: number;
            tipo: string;
            ocorrido_em: Date;
          }[]
        >`SELECT * FROM casos.verificar_trilha_codigo(${v.caso})`,
    );
    const p = linhas[0];
    if (!p)
      throw new ErroApi(
        HttpStatus.NOT_FOUND,
        'CASO_NAO_ENCONTRADO',
        'Nenhum caso com esse código.',
        {
          caso: ['Confira o código do caso.'],
        },
      );
    return {
      caso: v.caso,
      integra: p.integra,
      confere: p.integra && p.verificador === v.verificador,
      eventos: p.eventos,
      ...(p.integra ? {} : { primeiroEventoQuebrado: p.primeiro_seq_quebrado }),
      linhaDoTempo: linhas.map((l) => ({
        seq: l.seq,
        tipo: l.tipo,
        quando: l.ocorrido_em.toISOString(),
      })),
    };
  }
}
