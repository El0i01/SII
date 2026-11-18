import { Injectable } from '@nestjs/common';
import {
  diasCorridosEntre,
  type FiltroPainel,
  hojeEmPortoVelho,
  percentual,
  precisaDeAtencao,
  rotuloMes,
  serieCasosPorMes,
  suprimirContagem,
} from '@sii/shared';
import { PrismaService } from '../banco/prisma.service';
import { buscarAlertasCarga } from '../cargas/alertas';
import { CasosService } from '../casos/casos.service';
import type { UsuarioAutenticado } from '../comum/usuario-autenticado';
import { Prisma } from '../generated/prisma/client';

/** Quem vê a pauta do Comitê (mesma lista de GET /casos/pauta). */
const VEEM_PAUTA = ['ADMIN_CTI', 'COMITE_GESTOR', 'SEMED_GESTOR'];

export const ROTULO_RESPONSAVEL: Record<string, string> = {
  SEMED: 'SEMED',
  ASSISTENCIA: 'Assistência Social',
  SEMSAU: 'Saúde (ACS)',
  SEMFAZ: 'Fazenda',
  CONSELHO_TUTELAR: 'Conselho Tutelar',
};

type Consulta = Pick<Prisma.TransactionClient, '$queryRaw'>;

interface LinhaCaso {
  alerta_em: Date;
  encerrado_em: Date | null;
  responsavel: string;
  setor: string | null;
  nivel: number;
  tipo: string;
  status: string;
}

const iso = (d: Date) => hojeEmPortoVelho(d);

/**
 * Visão geral (P14): números do cruzamento das secretarias, por território e período. Perfis
 * nominais contam pelo `comoUsuario` (a RLS recorta o que cada um vê); o auditor do TCE conta pelo
 * cliente dono e recebe contagens < 5 suprimidas. Nenhuma linha nominal sai daqui.
 */
@Injectable()
export class PainelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly casos: CasosService,
  ) {}

  async setores() {
    return this.prisma.setor.findMany({
      select: { codigo: true, nome: true },
      orderBy: { codigo: 'asc' },
    });
  }

  private async contar(db: Consulta, t: string | null, hoje: string) {
    const filtroPessoa = t ? Prisma.sql`AND p.setor_codigo = ${t}` : Prisma.empty;
    const filtroCaso = t ? Prisma.sql`AND c.setor_codigo = ${t}` : Prisma.empty;
    const [base] = await db.$queryRaw<
      {
        pessoas: number;
        familias: number;
        vacinados: number;
        vacina_info: number;
        aguardando: number;
      }[]
    >`
      SELECT
        (SELECT count(*)::int FROM pessoas.pessoa_mestra p WHERE true ${filtroPessoa}) AS pessoas,
        (SELECT count(DISTINCT mf.familia_id)::int FROM pessoas.membro_familia mf
           JOIN pessoas.pessoa_mestra p ON p.id = mf.pessoa_id WHERE true ${filtroPessoa}) AS familias,
        (SELECT count(*) FILTER (WHERE s.vacinacao_em_dia)::int FROM pessoas.pessoa_mestra p
           JOIN saude.sinalizador_saude s ON s.pessoa_id = p.id
          WHERE p.data_nascimento > ${hoje}::date - interval '7 years' ${filtroPessoa}) AS vacinados,
        (SELECT count(*) FILTER (WHERE s.vacinacao_em_dia IS NOT NULL)::int FROM pessoas.pessoa_mestra p
           JOIN saude.sinalizador_saude s ON s.pessoa_id = p.id
          WHERE p.data_nascimento > ${hoje}::date - interval '7 years' ${filtroPessoa}) AS vacina_info,
        (SELECT count(*)::int FROM casos.notificacao n JOIN casos.caso c ON c.id = n.caso_id
          WHERE n.status <> 'PARECER_EMITIDO' ${filtroCaso}) AS aguardando`;
    const linhas = await db.$queryRaw<LinhaCaso[]>`
      SELECT c.alerta_em, c.encerrado_em,
             c.secretaria_responsavel AS responsavel, c.setor_codigo AS setor, c.nivel,
             c.tipo, c.status
      FROM casos.caso c WHERE true ${filtroCaso}`;
    return {
      base: base as NonNullable<typeof base>,
      casos: linhas.map((c) => ({
        ...c,
        alerta: iso(c.alerta_em),
        encerrado: c.encerrado_em ? iso(c.encerrado_em) : null,
      })),
    };
  }

  async visaoGeral(u: UsuarioAutenticado, f: FiltroPainel) {
    const hoje = hojeEmPortoVelho();
    const periodo = f.periodo ?? hoje.slice(0, 7);
    const t = f.territorio ?? null;
    const auditor = u.perfil === 'AUDITOR_TCE';
    const { base, casos } = auditor
      ? await this.contar(this.prisma, t, hoje)
      : await this.prisma.comoUsuario(u, (tx) => this.contar(tx, t, hoje));

    // Domicílios e lotes não são nominais: contagem direta no território.
    const [dom] = await this.prisma.$queryRaw<{ total: number; precisos: number }[]>`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE d.geo_fonte IN ('LOTE', 'CENSO_GPS') OR d.confirmado_em IS NOT NULL)::int AS precisos
      FROM territorio.domicilio d JOIN territorio.setor s ON s.id = d.setor_id
      WHERE ${t}::text IS NULL OR s.codigo = ${t}`;
    const ultimaSeduc = await this.prisma.logCarga.findFirst({
      where: { fonte: 'SEDUC', status: 'OK' },
      orderBy: { fimEm: 'desc' },
      select: { fimEm: true, inicioEm: true },
    });
    const setores = await this.setores();
    const nomeSetor = new Map(setores.map((s) => [s.codigo, s.nome]));

    const abertos = casos.filter((c) => c.encerrado === null);
    const ano = periodo.slice(0, 4);
    const contagem = (lista: string[]) => {
      const m = new Map<string, number>();
      for (const k of lista) m.set(k, (m.get(k) ?? 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const n = (v: number) => (auditor ? suprimirContagem(v) : v);
    const pct = (parte: number, total: number) =>
      auditor && total < 5 ? null : percentual(parte, total);
    const escalonados = abertos.filter((c) => c.nivel === 3).length;

    const pauta = VEEM_PAUTA.includes(u.perfil)
      ? (await this.casos.pauta(u, hoje))
          .filter((p) => !t || p.setor === t)
          .map((p) => ({ ...p, setor: p.setor ? (nomeSetor.get(p.setor) ?? p.setor) : null }))
      : null;

    return {
      referencia: rotuloMes(periodo),
      periodo,
      territorio: t ? { codigo: t, nome: nomeSetor.get(t) ?? t } : null,
      suprimido: auditor,
      kpis: {
        pessoas: n(base.pessoas),
        familias: n(base.familias),
        domicilios: n(dom?.total ?? 0),
        casosAbertos: n(abertos.length),
        casosMaisDe30Dias: n(abertos.filter((c) => diasCorridosEntre(c.alerta, hoje) > 30).length),
        rematriculas: n(
          casos.filter(
            (c) =>
              c.tipo === 'BUSCA_ATIVA_ESCOLAR' &&
              c.status === 'MATRICULADO' &&
              c.encerrado?.slice(0, 4) === ano,
          ).length,
        ),
        vacinacaoEmDia: pct(base.vacinados, base.vacina_info),
        pontoPreciso: pct(dom?.precisos ?? 0, dom?.total ?? 0),
      },
      serie: serieCasosPorMes(
        casos.map((c) => ({ alertaEm: c.alerta, encerradoEm: c.encerrado })),
        periodo,
      ).map((p) => ({ ...p, abertos: n(p.abertos), resolvidos: n(p.resolvidos) })),
      atencao: precisaDeAtencao({
        hoje,
        cargasComFalha:
          u.perfil === 'ADMIN_CTI' ? (await buscarAlertasCarga(this.prisma)).length : null,
        notificacoesAguardando: auditor ? 0 : base.aguardando,
        escalonados: auditor ? 0 : escalonados,
        ultimaSeduc: ultimaSeduc ? iso(ultimaSeduc.fimEm ?? ultimaSeduc.inicioEm) : null,
      }),
      porResponsavel: contagem(abertos.map((c) => c.responsavel)).map(([k, v]) => ({
        rotulo: ROTULO_RESPONSAVEL[k] ?? k,
        valor: n(v),
      })),
      porTerritorio: setores.map((s) => ({
        codigo: s.codigo,
        rotulo: s.nome,
        valor: n(abertos.filter((c) => c.setor === s.codigo).length),
      })),
      pauta: pauta ? { total: pauta.length, itens: pauta.slice(0, 8) } : null,
    };
  }
}
