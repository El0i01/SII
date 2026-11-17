import { HttpStatus, Injectable } from '@nestjs/common';
import {
  codigoVerificador,
  efeitoDoParecer,
  hojeEmPortoVelho,
  iniciais,
  type Parecer,
  prazoHoje,
  ROTULO_DESFECHO,
  type StatusNotificacao,
} from '@sii/shared';
import { PrismaService } from '../banco/prisma.service';
import { ErroApi } from '../comum/erros';
import type { UsuarioAutenticado } from '../comum/usuario-autenticado';
import type { Prisma } from '../generated/prisma/client';
import { registrarAvisos } from './avisos.service';
import { feriadosDoAno } from './criar-caso';

/** Quem registra parecer e marca "em análise" (decisão de 17/11/2026: CRAS e Comitê). */
export const RESPONDEM = ['CRAS_TECNICO', 'COMITE_GESTOR'] as const;

const naoEncontrada = () =>
  new ErroApi(HttpStatus.NOT_FOUND, 'NAO_ENCONTRADA', 'Notificação não encontrada.');

const SELECAO = {
  id: true,
  codigo: true,
  motivo: true,
  status: true,
  criadaEm: true,
  prazoEm: true,
  destinoCrasCodigo: true,
  caso: {
    select: {
      id: true,
      codigo: true,
      tipo: true,
      status: true,
      setorCodigo: true,
      localidade: true,
      encerradoEm: true,
      pessoa: { select: { nome: true, dataNascimento: true, escolaInep: true } },
      eventos: {
        where: { tipo: 'ALERTA_GERADO' as const },
        select: { dados: true },
        take: 1,
      },
    },
  },
  parecer: {
    select: {
      desfecho: true,
      texto: true,
      novaVisita: true,
      dataNovaVisita: true,
      emitidoEm: true,
      autorDescricao: true,
      autorId: true,
    },
  },
} satisfies Prisma.NotificacaoSelect;

type Linha = Prisma.NotificacaoGetPayload<{ select: typeof SELECAO }>;

function idade(nascimento: Date | null, hoje: string): number | null {
  if (!nascimento) return null;
  const n = nascimento.toISOString().slice(0, 10);
  let a = Number(hoje.slice(0, 4)) - Number(n.slice(0, 4));
  if (hoje.slice(5) < n.slice(5)) a -= 1;
  return a;
}

/** INEP da escola do caso: o do alerta (job de infrequência) ou o da matrícula ativa. */
function inepDoCaso(l: Linha): string | null {
  const dados = l.caso.eventos[0]?.dados as { inep?: unknown } | undefined;
  return typeof dados?.inep === 'string' ? dados.inep : l.caso.pessoa.escolaInep;
}

/**
 * Caixa de entrada do CRAS e parecer da Assistência (§3.7, §4.1, P11). Tudo por `comoUsuario`: a
 * RLS limita a escola aos próprios alunos e o CRAS ao território. A resposta não traz CPF: a criança
 * aparece pelas iniciais.
 */
@Injectable()
export class NotificacoesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Técnico do CRAS vê só o que foi enviado ao próprio CRAS. */
  private filtroCras(u: UsuarioAutenticado): Prisma.NotificacaoWhereInput {
    if (u.perfil !== 'CRAS_TECNICO') return {};
    return {
      destinoCrasCodigo: { in: u.escopos.filter((e) => e.tipo === 'CRAS').map((e) => e.valor) },
    };
  }

  private async contexto(linhas: Linha[], hoje: string) {
    const ineps = [...new Set(linhas.map(inepDoCaso).filter((x): x is string => !!x))];
    const [escolas, feriados] = await Promise.all([
      this.prisma.escola.findMany({
        where: { inep: { in: ineps } },
        select: { inep: true, nome: true },
      }),
      feriadosDoAno(this.prisma, Number(hoje.slice(0, 4))),
    ]);
    return {
      escola: new Map(escolas.map((e) => [e.inep, e.nome])),
      feriados: feriados.get('MUNICIPAL') ?? [],
    };
  }

  private resumo(
    l: Linha,
    ctx: Awaited<ReturnType<NotificacoesService['contexto']>>,
    hoje: string,
  ) {
    const inep = inepDoCaso(l);
    const prazo = prazoHoje(
      { tipo: 'INFREQUENCIA', status: l.status, alertaEm: hojeEmPortoVelho(l.criadaEm) },
      hoje,
      ctx.feriados,
    );
    return {
      codigo: l.codigo,
      caso: l.caso.codigo,
      status: l.status as StatusNotificacao,
      motivo: l.motivo,
      criadaEm: l.criadaEm,
      prazoEm: l.prazoEm.toISOString().slice(0, 10),
      prazo,
      crianca: {
        iniciais: iniciais(l.caso.pessoa.nome),
        idade: idade(l.caso.pessoa.dataNascimento, hoje),
      },
      escola: inep ? { inep, nome: ctx.escola.get(inep) ?? null } : null,
      territorio: { setor: l.caso.setorCodigo, localidade: l.caso.localidade },
      desfecho: l.parecer?.desfecho ?? null,
    };
  }

  async listar(
    u: UsuarioAutenticado,
    situacao: StatusNotificacao | undefined,
    hoje = hojeEmPortoVelho(),
  ) {
    const linhas = await this.prisma.comoUsuario(u, (tx) =>
      tx.notificacao.findMany({
        where: this.filtroCras(u),
        orderBy: { criadaEm: 'desc' },
        select: SELECAO,
      }),
    );
    const ctx = await this.contexto(linhas, hoje);
    const todos = linhas.map((l) => this.resumo(l, ctx, hoje));
    const ordem: Record<StatusNotificacao, number> = { NOVA: 0, EM_ANALISE: 1, PARECER_EMITIDO: 2 };
    return {
      contagens: {
        novas: todos.filter((n) => n.status === 'NOVA').length,
        emAnalise: todos.filter((n) => n.status === 'EM_ANALISE').length,
        pareceres: todos.filter((n) => n.status === 'PARECER_EMITIDO').length,
        foraDoPrazo: todos.filter((n) => (n.prazo?.restante ?? 0) < 0).length,
      },
      podeResponder: (RESPONDEM as readonly string[]).includes(u.perfil),
      notificacoes: todos
        .filter((n) => !situacao || n.status === situacao)
        .sort((a, b) => ordem[a.status] - ordem[b.status]),
    };
  }

  async detalhe(u: UsuarioAutenticado, codigo: string, hoje = hojeEmPortoVelho()) {
    const r = await this.prisma.comoUsuario(u, async (tx) => {
      const l = await tx.notificacao.findFirst({
        where: { codigo, ...this.filtroCras(u) },
        select: SELECAO,
      });
      if (!l) return null;
      const eventos = await tx.eventoCaso.findMany({
        where: { casoId: l.caso.id },
        orderBy: { seq: 'asc' },
        select: { seq: true, tipo: true, ocorridoEm: true, dados: true, hash: true },
      });
      return { l, eventos };
    });
    if (!r) throw naoEncontrada();
    const ctx = await this.contexto([r.l], hoje);
    const ultimo = r.eventos[r.eventos.length - 1];
    const p = r.l.parecer;
    return {
      ...this.resumo(r.l, ctx, hoje),
      podeResponder:
        (RESPONDEM as readonly string[]).includes(u.perfil) && r.l.status !== 'PARECER_EMITIDO',
      parecer: p
        ? {
            desfecho: p.desfecho,
            rotuloDesfecho: ROTULO_DESFECHO[p.desfecho],
            texto: p.texto,
            novaVisita: p.novaVisita,
            dataNovaVisita: p.dataNovaVisita?.toISOString().slice(0, 10) ?? null,
            emitidoEm: p.emitidoEm,
            autor: p.autorDescricao ?? 'Técnico(a) do CRAS',
          }
        : null,
      casoEncerrado: r.l.caso.encerradoEm !== null,
      trilha: {
        eventos: r.eventos.map((e) => ({
          seq: e.seq,
          tipo: e.tipo,
          ocorridoEm: e.ocorridoEm,
          // Só o desfecho entra: os dados da trilha não têm dado pessoal, mas a tela não precisa do resto.
          desfecho: (e.dados as { desfecho?: string }).desfecho ?? null,
        })),
        verificador: ultimo ? codigoVerificador(new Uint8Array(ultimo.hash)) : null,
      },
    };
  }

  async emAnalise(u: UsuarioAutenticado, codigo: string) {
    await this.prisma.comoUsuario(u, async (tx) => {
      const n = await tx.notificacao.findFirst({
        where: { codigo, ...this.filtroCras(u) },
        select: { id: true, status: true, casoId: true },
      });
      if (!n) throw naoEncontrada();
      if (n.status !== 'NOVA')
        throw new ErroApi(
          HttpStatus.CONFLICT,
          'SITUACAO_INVALIDA',
          'Só uma notificação nova pode ser marcada como em análise.',
        );
      await tx.notificacao.update({ where: { id: n.id }, data: { status: 'EM_ANALISE' } });
      await tx.caso.update({ where: { id: n.casoId }, data: { status: 'EM_ANALISE' } });
      await tx.eventoCaso.create({
        data: { casoId: n.casoId, tipo: 'EM_ANALISE', autorId: u.id, dados: {} },
      });
    });
    return this.detalhe(u, codigo);
  }

  /**
   * Parecer (§4.1): grava o parecer, fecha o caso (exceto Conselho Tutelar ou nova visita), registra
   * na trilha e avisa a escola e a SEMED. Tudo numa transação.
   */
  async parecer(u: UsuarioAutenticado, codigo: string, p: Parecer) {
    await this.prisma.comoUsuario(u, async (tx) => {
      const n = await tx.notificacao.findFirst({
        where: { codigo, ...this.filtroCras(u) },
        select: SELECAO,
      });
      if (!n) throw naoEncontrada();
      if (n.status === 'PARECER_EMITIDO' || n.parecer)
        throw new ErroApi(
          HttpStatus.CONFLICT,
          'PARECER_JA_EMITIDO',
          'Esta notificação já tem parecer. Para registrar outra situação, encaminhe um novo caso.',
        );
      const efeito = efeitoDoParecer(p.desfecho, p.novaVisita);
      const agora = new Date();
      await tx.parecer.create({
        data: {
          notificacaoId: n.id,
          desfecho: p.desfecho,
          texto: p.texto,
          autorId: u.id,
          autorDescricao: u.perfil === 'COMITE_GESTOR' ? 'Comitê Gestor' : 'Técnico(a) do CRAS',
          novaVisita: p.novaVisita,
          dataNovaVisita:
            p.novaVisita && p.dataNovaVisita ? new Date(`${p.dataNovaVisita}T00:00:00Z`) : null,
          emitidoEm: agora,
        },
      });
      await tx.notificacao.update({ where: { id: n.id }, data: { status: 'PARECER_EMITIDO' } });
      await tx.caso.update({
        where: { id: n.caso.id },
        data: {
          status: 'PARECER_EMITIDO',
          nivel: 0,
          encerradoEm: efeito.encerraCaso ? agora : null,
        },
      });
      await tx.eventoCaso.create({
        data: {
          casoId: n.caso.id,
          tipo: 'PARECER_EMITIDO',
          autorId: u.id,
          ocorridoEm: agora,
          dados: { desfecho: p.desfecho, novaVisita: p.novaVisita },
        },
      });
      for (const extra of efeito.eventosExtras)
        await tx.eventoCaso.create({
          data: { casoId: n.caso.id, tipo: extra, autorId: u.id, ocorridoEm: agora, dados: {} },
        });
      const inep = inepDoCaso(n);
      await registrarAvisos(
        tx,
        n.caso.id,
        n.caso.codigo,
        'PARECER_EMITIDO',
        [
          ...(inep ? [{ tipo: 'ESCOLA' as const, valor: inep }] : []),
          { tipo: 'SECRETARIA', valor: 'SEMED' },
        ],
        ROTULO_DESFECHO[p.desfecho],
      );
    });
    return this.detalhe(u, codigo);
  }
}
