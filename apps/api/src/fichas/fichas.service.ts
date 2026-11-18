import { HttpStatus, Injectable } from '@nestjs/common';
import {
  adicionarDias,
  atendeBusca,
  atendeFiltro,
  codigoFicha,
  type ConsultaFichas,
  type DadosCrianca,
  diasCorridosEntre,
  type EventoFicha,
  type FiltroAcessos,
  formatarCpf,
  hojeEmPortoVelho,
  idadeEm,
  iniciais,
  mascararCpf,
  type Motivo,
  montarLinhaDoTempo,
  motivosVisitaCrianca,
  prioridadeFicha,
  type RevelarCpf,
  type ResumoFicha,
  ROTULO_AUTOR_VISITA,
  ROTULO_DESFECHO,
  ROTULO_EVENTO_CASO,
  secoesDaFicha,
  textoFinalidade,
} from '@sii/shared';
import { PrismaService } from '../banco/prisma.service';
import { ErroApi } from '../comum/erros';
import type { UsuarioAutenticado } from '../comum/usuario-autenticado';
import { CriptoService } from '../cripto/cripto.service';
import { consultaFichas, type LinhaFicha } from './consulta-fichas';

/** Perfis que encaminham caso a partir da ficha (mesma lista de POST /casos/encaminhamentos). */
export const ENCAMINHAM = ['ADMIN_CTI', 'COMITE_GESTOR', 'SEMED_GESTOR', 'ESCOLA'] as const;

/** Itens da lista por resposta (o protótipo mostra 40 e pede para refinar a busca). */
export const LIMITE_LISTA = 40;
const POR_PAGINA_ACESSOS = 50;

const naoEncontrada = () =>
  new ErroApi(HttpStatus.NOT_FOUND, 'NAO_ENCONTRADA', 'Ficha não encontrada.');

const iso = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

interface Avaliada {
  linha: LinhaFicha;
  idade: number;
  motivos: Motivo[];
  resumo: ResumoFicha;
}

function avaliar(l: LinhaFicha, hoje: string): Avaliada {
  const idade = idadeEm(iso(l.nascimento) as string, hoje);
  const dias = (d: Date | null) => (d ? diasCorridosEntre(iso(d) as string, hoje) : null);
  const dados: DadosCrianca = {
    idade,
    matriculaAtiva: l.matricula_id !== null,
    faltasSeguidas: l.faltas_seguidas ?? 0,
    vacinacaoEmDia: l.vacinacao_em_dia,
    diasSemVisitaAcs: dias(l.ultima_visita_acs),
    acompanhadaPcf: l.pcf_visitador !== null,
    diasSemVisitaPcf: dias(l.pcf_ultima),
    necessitaAee: l.necessita_aee === true,
    temSalaRecursos: l.sala_recursos === true,
    atendidaApae: l.apae === true,
    noCadUnico: l.cad_atualizado !== null,
  };
  const motivos = motivosVisitaCrianca(dados);
  return {
    linha: l,
    idade,
    motivos,
    resumo: {
      codigo: codigoFicha(l.id),
      iniciais: iniciais(l.nome),
      idade,
      localidade: l.quadra ?? l.localidade,
      escola: l.escola,
      motivos: motivos.length,
      notificacaoAberta: l.notificacao_aberta !== null,
      necessitaAee: dados.necessitaAee,
    },
  };
}

/**
 * Ficha da criança (§3.8, P12). Dado nominal só por `comoUsuario` (RLS). A saída nunca tem CPF em
 * claro, nome completo, NIS, CNS, CID ou laudo; as seções vêm de `secoesDaFicha` e, quando o perfil
 * não pode ver uma seção, a chave fica ausente.
 */
@Injectable()
export class FichasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cripto: CriptoService,
  ) {}

  async listar(u: UsuarioAutenticado, c: ConsultaFichas) {
    const hoje = hojeEmPortoVelho();
    const linhas = await this.prisma.comoUsuario(u, (tx) =>
      tx.$queryRaw<LinhaFicha[]>(consultaFichas(hoje)),
    );
    const todas = linhas
      .filter((l) => !c.territorio || l.setor_codigo === c.territorio)
      .map((l) => avaliar(l, hoje));
    const filtradas = todas
      .filter((a) => atendeFiltro(a.resumo, c.filtro) && atendeBusca(a.resumo, c.busca))
      .sort(
        (a, b) => prioridadeFicha(b.resumo) - prioridadeFicha(a.resumo) || a.linha.id - b.linha.id,
      );
    return {
      kpis: {
        fichas: todas.length,
        precisamVisita: todas.filter((a) => a.motivos.length > 0).length,
        acompanhadasCras: todas.filter((a) => a.linha.paif_tipo !== null).length,
        criancaFeliz: todas.filter((a) => a.linha.pcf_visitador !== null).length,
      },
      total: filtradas.length,
      fichas: filtradas.slice(0, LIMITE_LISTA).map((a) => ({
        id: a.linha.id,
        ...a.resumo,
        setor: a.linha.setor_nome ?? a.linha.setor_codigo,
      })),
    };
  }

  async detalhe(u: UsuarioAutenticado, id: number) {
    const hoje = hojeEmPortoVelho();
    const secoes = new Set(secoesDaFicha(u.perfil));
    return this.prisma.comoUsuario(u, async (tx) => {
      const [linha] = await tx.$queryRaw<LinhaFicha[]>(consultaFichas(hoje, id));
      if (!linha) throw naoEncontrada();
      const a = avaliar(linha, hoje);
      const l = a.linha;
      const pessoa = await tx.pessoaMestra.findUnique({
        where: { id },
        select: { cpfCifrado: true },
      });

      const ficha: Record<string, unknown> = {
        id: l.id,
        codigo: a.resumo.codigo,
        iniciais: a.resumo.iniciais,
        idade: a.idade,
        // DTO de saída: o CPF só sai mascarado. Em claro, só por POST /fichas/:id/revelar-cpf.
        cpf: pessoa?.cpfCifrado ? mascararCpf(this.cripto.revelar(pessoa.cpfCifrado)) : null,
        endereco: {
          setor: l.setor_nome ?? l.setor_codigo,
          quadra: l.quadra,
          lote: l.lote,
          localidade: l.localidade,
        },
        motivos: a.motivos,
        notificacaoAberta: l.notificacao_aberta,
        podeEncaminhar: (ENCAMINHAM as readonly string[]).includes(u.perfil),
      };

      if (secoes.has('EDUCACAO')) {
        ficha.educacao = {
          situacao: l.matricula_id
            ? 'MATRICULADA'
            : a.idade >= 4
              ? 'FORA_DA_ESCOLA'
              : 'SEM_MATRICULA_CRECHE',
          escola: l.escola,
          rede: l.rede,
          turma: l.turma,
          frequenciaMes: l.lancamentos_mes
            ? Math.round(((l.presencas_mes ?? 0) * 100) / l.lancamentos_mes)
            : null,
          faltasSeguidas: l.matricula_id ? (l.faltas_seguidas ?? 0) : null,
        };
      }
      if (secoes.has('SAUDE')) {
        ficha.saude = {
          ubs: l.ubs,
          vacinacaoEmDia: l.vacinacao_em_dia,
          ultimaVisitaAcs: iso(l.ultima_visita_acs),
          diasSemVisitaAcs: l.ultima_visita_acs
            ? diasCorridosEntre(iso(l.ultima_visita_acs) as string, hoje)
            : null,
        };
      }
      if (secoes.has('ASSISTENCIA')) {
        ficha.assistencia = {
          cadunicoAtualizadoEm: iso(l.cad_atualizado),
          bolsaFamilia: l.recebe_pbf === true,
          cras: l.paif_tipo
            ? { tipo: l.paif_tipo, nome: l.cras, ultimoAtendimento: iso(l.paif_ultimo) }
            : null,
          criancaFeliz: l.pcf_visitador
            ? { visitador: l.pcf_visitador, ultimaVisita: iso(l.pcf_ultima) }
            : null,
        };
      }
      if (secoes.has('PROTECAO')) {
        ficha.protecao = {
          conselhoTutelarEm: iso(l.conselho_tutelar),
          necessitaAee: l.necessita_aee === true,
          atendimento: l.sala_recursos ? 'SALA_RECURSOS' : l.apae ? 'APAE' : null,
          bpc: l.bpc === true,
        };
      }

      if (secoes.has('HISTORICO') || secoes.has('VISITAS')) {
        const casos = await tx.caso.findMany({
          where: { pessoaId: id },
          select: {
            codigo: true,
            eventos: {
              select: { tipo: true, ocorridoEm: true, dados: true },
              orderBy: { seq: 'asc' },
            },
            notificacoes: {
              select: {
                codigo: true,
                parecer: {
                  select: { desfecho: true, texto: true, emitidoEm: true, autorDescricao: true },
                },
              },
            },
          },
        });

        if (secoes.has('HISTORICO')) {
          const fontes: EventoFicha[] = [];
          if (l.matricula_inicio) {
            fontes.push({
              quando: iso(l.matricula_inicio) as string,
              texto: `Matrícula: ${l.escola}${l.turma ? ` (${l.turma})` : ''}`,
              origem: 'SEMED',
            });
          }
          if (l.cad_atualizado) {
            fontes.push({
              quando: iso(l.cad_atualizado) as string,
              texto: 'Cadastro atualizado no CadÚnico',
              origem: 'Assistência Social',
            });
          }
          if (l.ultima_visita_acs) {
            fontes.push({
              quando: iso(l.ultima_visita_acs) as string,
              texto: 'Visita domiciliar do ACS',
              origem: 'Saúde',
            });
          }
          if (l.paif_ultimo) {
            fontes.push({
              quando: iso(l.paif_ultimo) as string,
              texto: `Atendimento no CRAS (${l.paif_tipo})`,
              origem: 'Assistência Social',
            });
          }
          if (l.pcf_ultima) {
            fontes.push({
              quando: iso(l.pcf_ultima) as string,
              texto: 'Visita do Criança Feliz',
              origem: 'Assistência Social',
              detalhe: l.pcf_visitador as string,
            });
          }
          const doCaso: EventoFicha[] = casos.flatMap((c) =>
            c.eventos.map((e) => {
              const desfecho = (e.dados as { desfecho?: string } | null)?.desfecho;
              const rotulo = ROTULO_EVENTO_CASO[e.tipo] ?? e.tipo;
              return {
                quando: e.ocorridoEm.toISOString(),
                texto:
                  desfecho && desfecho in ROTULO_DESFECHO
                    ? `${rotulo}: ${ROTULO_DESFECHO[desfecho as keyof typeof ROTULO_DESFECHO]}`
                    : rotulo,
                origem: 'Sistema',
                detalhe: `Caso ${c.codigo}`,
              };
            }),
          );
          ficha.historico = montarLinhaDoTempo(fontes, doCaso);
        }

        if (secoes.has('VISITAS')) {
          const visitas = await tx.visita.findMany({
            where: { pessoaIds: { has: id } },
            select: { tipo: true, realizadaEm: true, situacao: true },
            orderBy: { realizadaEm: 'desc' },
            take: 50,
          });
          const relatorios = [
            ...visitas.map((v) => ({
              quando: v.realizadaEm.toISOString(),
              autor: ROTULO_AUTOR_VISITA[v.tipo] ?? v.tipo,
              texto: v.situacao,
            })),
            ...casos.flatMap((c) =>
              c.notificacoes.flatMap((n) =>
                n.parecer
                  ? [
                      {
                        quando: n.parecer.emitidoEm.toISOString(),
                        autor: n.parecer.autorDescricao ?? 'Técnico(a) do CRAS',
                        texto: n.parecer.texto,
                        parecer: {
                          notificacao: n.codigo,
                          desfecho: ROTULO_DESFECHO[n.parecer.desfecho],
                        },
                      },
                    ]
                  : [],
              ),
            ),
          ];
          ficha.visitas = relatorios.sort((x, y) => y.quando.localeCompare(x.quando));
        }
      }
      return ficha;
    });
  }

  /**
   * Revela o CPF com finalidade (§3.12, CLAUDE.md). Ordem: confere sob RLS que o usuário vê a ficha,
   * **grava o acesso** e só então decifra. Se a gravação falhar, nada é revelado.
   */
  async revelarCpf(u: UsuarioAutenticado, id: number, corpo: RevelarCpf, ip?: string) {
    const hoje = hojeEmPortoVelho();
    const pessoa = await this.prisma.comoUsuario(u, (tx) =>
      tx.pessoaMestra.findUnique({
        where: { id },
        select: { id: true, dataNascimento: true, cpfCifrado: true },
      }),
    );
    if (!pessoa?.dataNascimento) throw naoEncontrada();
    const idade = idadeEm(iso(pessoa.dataNascimento) as string, hoje);
    if (idade < 0 || idade > 17) throw naoEncontrada();
    if (!pessoa.cpfCifrado) {
      throw new ErroApi(HttpStatus.NOT_FOUND, 'SEM_CPF', 'Esta ficha não tem CPF registrado.');
    }
    // auditoria.acesso_dado_pessoal não tem grant para sii_app: grava com o cliente dono.
    await this.prisma.acessoDadoPessoal.create({
      data: {
        usuarioId: u.id,
        perfil: u.perfil,
        pessoaId: id,
        registro: codigoFicha(id),
        campo: 'CPF',
        finalidade: textoFinalidade(corpo).slice(0, 300),
        ip: ip ?? null,
      },
    });
    return { cpf: formatarCpf(this.cripto.revelar(pessoa.cpfCifrado)) };
  }

  /** Painel do DPO: quem revelou o quê, quando e para quê. Sem nome da pessoa. */
  async acessos(f: FiltroAcessos) {
    // Dias no fuso de Porto Velho (UTC-4): o dia D vai de D 04:00Z até D+1 04:00Z.
    const inicioDoDia = (d: string) => new Date(`${d}T04:00:00Z`);
    const usuariosFiltro = f.usuario
      ? (
          await this.prisma.usuario.findMany({
            where: { login: { contains: f.usuario } },
            select: { id: true },
          })
        ).map((x) => x.id)
      : null;
    const filtro = {
      ...(f.de || f.ate
        ? {
            quando: {
              ...(f.de ? { gte: inicioDoDia(f.de) } : {}),
              ...(f.ate ? { lt: inicioDoDia(adicionarDias(f.ate, 1)) } : {}),
            },
          }
        : {}),
      ...(f.registro ? { registro: f.registro } : {}),
      ...(usuariosFiltro ? { usuarioId: { in: usuariosFiltro } } : {}),
    };
    const [total, linhas] = await Promise.all([
      this.prisma.acessoDadoPessoal.count({ where: filtro }),
      this.prisma.acessoDadoPessoal.findMany({
        where: filtro,
        orderBy: { quando: 'desc' },
        skip: (f.pagina - 1) * POR_PAGINA_ACESSOS,
        take: POR_PAGINA_ACESSOS,
      }),
    ]);
    const usuarios = new Map(
      (
        await this.prisma.usuario.findMany({
          where: { id: { in: [...new Set(linhas.map((l) => l.usuarioId))] } },
          select: { id: true, login: true, nome: true },
        })
      ).map((x) => [x.id, x]),
    );
    return {
      total,
      pagina: f.pagina,
      porPagina: POR_PAGINA_ACESSOS,
      acessos: linhas.map((l) => ({
        id: Number(l.id),
        quando: l.quando.toISOString(),
        usuario: usuarios.get(l.usuarioId) ?? { id: l.usuarioId, login: null, nome: null },
        perfil: l.perfil,
        registro: l.registro,
        campo: l.campo,
        finalidade: l.finalidade,
        ip: l.ip,
      })),
    };
  }
}
