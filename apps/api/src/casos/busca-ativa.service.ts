import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type AcaoBuscaAtiva,
  acoesPermitidas,
  adicionarDias,
  type CasoPainel,
  codigoVerificador,
  diasCorridosEntre,
  type EncaminharBuscaAtiva,
  enderecoDaSecretaria,
  hojeEmPortoVelho,
  idadeEm,
  iniciais,
  LIMITES_BUSCA_ATIVA,
  type MatriculaBuscaAtiva,
  mascararCpf,
  type Prazo,
  prazoHoje,
  proximaEtapa,
  quemPode,
  resumoBuscaAtiva,
  ROTULO_SECRETARIA_BUSCA_ATIVA,
  type StatusBuscaAtiva,
  suprimirContagem,
  type VisitaBuscaAtiva,
} from '@sii/shared';
import { PrismaService } from '../banco/prisma.service';
import { ErroApi, erros } from '../comum/erros';
import type { UsuarioAutenticado } from '../comum/usuario-autenticado';
import { CriptoService } from '../cripto/cripto.service';
import type { Prisma } from '../generated/prisma/client';
import { registrarAvisos } from './avisos.service';
import { destinosCras } from './criar-caso';

const TIPO = 'BUSCA_ATIVA_ESCOLAR';
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dia = (s: string) => new Date(`${s}T00:00:00Z`);

const naoEncontrado = () =>
  new ErroApi(HttpStatus.NOT_FOUND, 'NAO_ENCONTRADO', 'Caso de busca ativa não encontrado.');

const SELECAO = {
  id: true,
  codigo: true,
  pessoaId: true,
  setorCodigo: true,
  localidade: true,
  origem: true,
  secretariaResponsavel: true,
  status: true,
  alertaEm: true,
  encerradoEm: true,
  pessoa: { select: { nome: true, dataNascimento: true, cpfCifrado: true } },
  eventos: {
    select: { seq: true, tipo: true, ocorridoEm: true, dados: true, hash: true },
    orderBy: { seq: 'asc' as const },
  },
} satisfies Prisma.CasoSelect;
type Linha = Prisma.CasoGetPayload<{ select: typeof SELECAO }>;

/** Rótulo do prazo; caso encerrado sem matrícula = comunicado ao Conselho Tutelar. */
function prazoDoCaso(l: Pick<Linha, 'status' | 'alertaEm' | 'encerradoEm'>, hoje: string): Prazo {
  if (l.encerradoEm && l.status !== 'MATRICULADO') {
    return {
      restante: null,
      nivel: 0,
      rotulo: 'Comunicado ao Conselho Tutelar',
      tom: 'neutro',
      concluido: true,
    };
  }
  return prazoHoje(
    { tipo: TIPO, status: l.status, alertaEm: hojeEmPortoVelho(l.alertaEm) },
    hoje,
  ) as Prazo;
}

function paraPainel(l: {
  status: string;
  alertaEm: Date;
  encerradoEm: Date | null;
  origem: string | null;
  eventos: { tipo: string; ocorridoEm: Date }[];
}): CasoPainel {
  const enc = l.eventos.find((e) => e.tipo === 'ENCAMINHADO');
  return {
    status: l.status as StatusBuscaAtiva,
    alertaEm: hojeEmPortoVelho(l.alertaEm),
    encaminhadoEm: enc ? hojeEmPortoVelho(enc.ocorridoEm) : null,
    origem: l.origem,
    encerrado: l.encerradoEm !== null,
  };
}

/**
 * Busca ativa escolar (§4.2, P13, ADR 0012): painel, lista de casos e as etapas. Dado nominal só por
 * `comoUsuario`; o auditor recebe só os números do painel, com contagens < 5 suprimidas.
 */
@Injectable()
export class BuscaAtivaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cripto: CriptoService,
  ) {}

  async painel(u: UsuarioAutenticado) {
    const hoje = hojeEmPortoVelho();
    const selecao = {
      status: true,
      alertaEm: true,
      encerradoEm: true,
      origem: true,
      eventos: {
        where: { tipo: 'ENCAMINHADO' as const },
        select: { tipo: true, ocorridoEm: true },
        orderBy: { seq: 'asc' as const },
        take: 1,
      },
    } satisfies Prisma.CasoSelect;
    if (u.perfil === 'AUDITOR_TCE') {
      // Só agregados: o cliente dono conta, a resposta não tem nenhuma linha nominal.
      const casos = await this.prisma.caso.findMany({ where: { tipo: TIPO }, select: selecao });
      const r = resumoBuscaAtiva(casos.map(paraPainel), hoje);
      return {
        suprimido: true,
        ...r,
        identificados: suprimirContagem(r.identificados),
        encaminhados: suprimirContagem(r.encaminhados),
        visitados: suprimirContagem(r.visitados),
        matriculados: suprimirContagem(r.matriculados),
        naoLocalizados: suprimirContagem(r.naoLocalizados),
        escalonados: suprimirContagem(r.escalonados),
        porOrigem: Object.fromEntries(
          Object.entries(r.porOrigem).map(([k, v]) => [k, suprimirContagem(v)]),
        ),
      };
    }
    const casos = await this.prisma.comoUsuario(u, (tx) =>
      tx.caso.findMany({ where: { tipo: TIPO }, select: selecao }),
    );
    return { suprimido: false, ...resumoBuscaAtiva(casos.map(paraPainel), hoje) };
  }

  async listar(u: UsuarioAutenticado) {
    const hoje = hojeEmPortoVelho();
    const casos = await this.prisma.comoUsuario(u, (tx) =>
      tx.caso.findMany({ where: { tipo: TIPO }, select: SELECAO, orderBy: { alertaEm: 'asc' } }),
    );
    const ineps = new Set<string>();
    for (const c of casos) {
      const d = c.eventos.findLast((e) => e.tipo === 'DESFECHO')?.dados as { inep?: string } | null;
      if (d?.inep) ineps.add(d.inep);
    }
    const [setores, escolas] = await Promise.all([
      this.prisma.setor.findMany({ select: { codigo: true, nome: true } }),
      this.prisma.escola.findMany({
        where: { inep: { in: [...ineps] } },
        select: { inep: true, nome: true },
      }),
    ]);
    const nomeSetor = new Map(setores.map((s) => [s.codigo, s.nome]));
    const nomeEscola = new Map(escolas.map((e) => [e.inep, e.nome]));
    return {
      itens: casos.map((c) => {
        const prazo = prazoDoCaso(c, hoje);
        const desfecho = c.eventos.findLast((e) => e.tipo === 'DESFECHO')?.dados as {
          inep?: string;
        } | null;
        return {
          codigo: c.codigo,
          pessoaId: c.pessoaId,
          iniciais: iniciais(c.pessoa.nome),
          cpf: c.pessoa.cpfCifrado ? mascararCpf(this.cripto.revelar(c.pessoa.cpfCifrado)) : null,
          idade: c.pessoa.dataNascimento ? idadeEm(iso(c.pessoa.dataNascimento), hoje) : null,
          setor: c.setorCodigo ? (nomeSetor.get(c.setorCodigo) ?? c.setorCodigo) : null,
          localidade: c.localidade,
          origem: c.origem,
          responsavel: c.secretariaResponsavel,
          rotuloResponsavel:
            ROTULO_SECRETARIA_BUSCA_ATIVA[c.secretariaResponsavel] ?? c.secretariaResponsavel,
          status: c.status,
          encerrado: c.encerradoEm !== null,
          escola: desfecho?.inep ? (nomeEscola.get(desfecho.inep) ?? desfecho.inep) : null,
          dias: Math.max(0, diasCorridosEntre(hojeEmPortoVelho(c.alertaEm), hoje)),
          prazo,
          acoes: acoesPermitidas(
            c.status as StatusBuscaAtiva,
            c.encerradoEm !== null,
            u.perfil,
            c.secretariaResponsavel,
          ),
        };
      }),
    };
  }

  async detalhe(u: UsuarioAutenticado, codigo: string) {
    return this.prisma.comoUsuario(u, (tx) => this.montarDetalhe(tx, u, codigo));
  }

  private async montarDetalhe(tx: Prisma.TransactionClient, u: UsuarioAutenticado, codigo: string) {
    const hoje = hojeEmPortoVelho();
    const c = await tx.caso.findFirst({
      where: { codigo, tipo: TIPO },
      select: {
        ...SELECAO,
        visitas: {
          select: { realizadaEm: true, situacao: true },
          orderBy: { realizadaEm: 'desc' },
        },
      },
    });
    if (!c) throw naoEncontrado();
    const ultimo = c.eventos.at(-1);
    return {
      codigo: c.codigo,
      pessoaId: c.pessoaId,
      iniciais: iniciais(c.pessoa.nome),
      status: c.status,
      encerrado: c.encerradoEm !== null,
      responsavel: c.secretariaResponsavel,
      origem: c.origem,
      prazo: prazoDoCaso(c, hoje),
      acoes: acoesPermitidas(
        c.status as StatusBuscaAtiva,
        c.encerradoEm !== null,
        u.perfil,
        c.secretariaResponsavel,
      ),
      trilha: {
        eventos: c.eventos.map((e) => {
          const d = (e.dados ?? {}) as Record<string, unknown>;
          return {
            seq: e.seq,
            tipo: e.tipo,
            ocorridoEm: e.ocorridoEm.toISOString(),
            destino: typeof d.destino === 'string' ? d.destino : null,
            familiaLocalizada:
              typeof d.familiaLocalizada === 'boolean' ? d.familiaLocalizada : null,
          };
        }),
        verificador: ultimo ? codigoVerificador(new Uint8Array(ultimo.hash)) : null,
      },
      visitas: c.visitas.map((v) => ({ quando: v.realizadaEm.toISOString(), relato: v.situacao })),
    };
  }

  /** Uma etapa (§4.2): confere etapa (409) e perfil (403); tudo numa transação, com a trilha. */
  async agir(
    u: UsuarioAutenticado,
    codigo: string,
    acao: AcaoBuscaAtiva,
    corpo: Partial<EncaminharBuscaAtiva & VisitaBuscaAtiva & MatriculaBuscaAtiva> = {},
  ) {
    const hoje = hojeEmPortoVelho();
    return this.prisma.comoUsuario(u, async (tx) => {
      const c = await tx.caso.findFirst({
        where: { codigo, tipo: TIPO },
        select: {
          id: true,
          codigo: true,
          pessoaId: true,
          status: true,
          alertaEm: true,
          encerradoEm: true,
          secretariaResponsavel: true,
        },
      });
      if (!c) throw naoEncontrado();
      const t = c.encerradoEm
        ? null
        : proximaEtapa(c.status as StatusBuscaAtiva, acao, corpo.localizada ?? true);
      if (!t) {
        throw new ErroApi(
          HttpStatus.CONFLICT,
          'ETAPA_INVALIDA',
          'Este caso não está na etapa para esta ação. Atualize a página.',
        );
      }
      if (!quemPode(acao, u.perfil, c.secretariaResponsavel)) throw erros.semPermissao();

      const agora = new Date();
      const evento = (
        tipo: 'ENCAMINHADO' | 'VISITA_REALIZADA' | 'DESFECHO' | 'ENCAMINHADO_CONSELHO_TUTELAR',
        dados: Prisma.InputJsonValue,
      ) =>
        tx.eventoCaso.create({
          data: { casoId: c.id, tipo, ocorridoEm: agora, autorId: u.id, dados },
        });
      let secretaria = c.secretariaResponsavel;

      if (acao === 'ENCAMINHAR') {
        secretaria = corpo.secretaria as string;
        await evento('ENCAMINHADO', { destino: secretaria });
        const cras = (await destinosCras(tx, [c.pessoaId])).get(c.pessoaId)?.cras ?? null;
        await registrarAvisos(tx, c.id, c.codigo, 'ENCAMINHAMENTO', [
          enderecoDaSecretaria(secretaria, cras),
        ]);
      } else if (acao === 'VISITA') {
        await tx.visita.create({
          data: {
            idLocal: randomUUID(),
            tipo: 'BUSCA_ATIVA',
            casoId: c.id,
            autorId: u.id,
            pessoaIds: [c.pessoaId],
            realizadaEm: agora,
            situacao: corpo.relato as string,
          },
        });
        await evento('VISITA_REALIZADA', { familiaLocalizada: corpo.localizada === true });
        await registrarAvisos(
          tx,
          c.id,
          c.codigo,
          'VISITA',
          [{ tipo: 'SECRETARIA', valor: 'SEMED' }],
          corpo.localizada ? 'família localizada' : 'família não localizada',
        );
      } else if (acao === 'MATRICULAR') {
        const escola = await tx.escola.findUnique({
          where: { inep: corpo.inep as string },
          select: { id: true, inep: true },
        });
        if (!escola) throw erros.validacao({ inep: ['Escola não encontrada no cadastro.'] });
        const ano = Number(hoje.slice(0, 4));
        await tx.matricula.upsert({
          where: { pessoaId_escolaId_ano: { pessoaId: c.pessoaId, escolaId: escola.id, ano } },
          create: { pessoaId: c.pessoaId, escolaId: escola.id, ano, inicioEm: dia(hoje) },
          update: { situacao: 'ATIVA' },
        });
        await tx.pessoaMestra.update({
          where: { id: c.pessoaId },
          data: { escolaInep: escola.inep },
        });
        await evento('DESFECHO', { resultado: 'MATRICULADO', inep: escola.inep, origem: 'SEMED' });
      } else {
        await evento('ENCAMINHADO_CONSELHO_TUTELAR', {});
      }

      const alerta = hojeEmPortoVelho(c.alertaEm);
      const nivel = t.encerra
        ? 0
        : (prazoHoje({ tipo: TIPO, status: t.status, alertaEm: alerta }, hoje)?.nivel ?? 0);
      await tx.caso.update({
        where: { id: c.id },
        data: {
          status: t.status,
          secretariaResponsavel: secretaria,
          nivel,
          prazoEm: t.encerra
            ? null
            : dia(
                adicionarDias(
                  alerta,
                  LIMITES_BUSCA_ATIVA[t.status as keyof typeof LIMITES_BUSCA_ATIVA],
                ),
              ),
          ...(t.encerra ? { encerradoEm: agora } : {}),
        },
      });
      return this.montarDetalhe(tx, u, codigo);
    });
  }
}
