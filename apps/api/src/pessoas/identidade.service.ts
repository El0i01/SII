import { HttpStatus, Injectable } from '@nestjs/common';
import { mascararCpf, mascararNis, normalizarNomePessoa } from '@sii/shared';
import { PrismaService } from '../banco/prisma.service';
import { ErroApi } from '../comum/erros';
import { CriptoService } from '../cripto/cripto.service';
import type { Prisma } from '../generated/prisma/client';

type Tx = Prisma.TransactionClient;

const naoEncontrada = (o: string) =>
  new ErroApi(HttpStatus.NOT_FOUND, 'NAO_ENCONTRADO', `${o} não encontrada.`);

/** Tabelas com uma coluna pessoa_id simples, movidas na união. */
const TABELAS_PESSOA = [
  'pessoas.vinculo_fonte',
  'educacao.matricula',
  'educacao.fila_creche',
  'assistencia.bpc',
  'assistencia.scfv',
  'assistencia.crianca_feliz',
  'casos.caso',
];

/**
 * Identidade única (P07): união, separação e revisão. Só ADMIN_CTI (decisão de 11/11/2026).
 * Roda como dono: mexe em todas as fontes da pessoa de uma vez, numa transação, e cada ação vai
 * para auditoria.evento_identidade (só ids, nunca documento).
 */
@Injectable()
export class IdentidadeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cripto: CriptoService,
  ) {}

  /** Une `absorver` em `manter`: tudo o que era de `absorver` passa a ser de `manter`. */
  async unir(
    manterId: number,
    absorverId: number,
    usuarioId: number,
    tipo: 'UNIAO_MANUAL' | 'REVISAO_ACEITA',
    motivo: string | null,
    revisaoId: number | null = null,
  ) {
    if (manterId === absorverId) {
      throw new ErroApi(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'VALIDACAO',
        'Escolha duas pessoas diferentes.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const [manter, absorver] = await Promise.all([
        tx.pessoaMestra.findUnique({ where: { id: manterId } }),
        tx.pessoaMestra.findUnique({ where: { id: absorverId } }),
      ]);
      if (!manter || !absorver) throw naoEncontrada('Pessoa');
      if (
        manter.cpfHash &&
        absorver.cpfHash &&
        !Buffer.from(manter.cpfHash).equals(Buffer.from(absorver.cpfHash))
      ) {
        throw new ErroApi(
          HttpStatus.CONFLICT,
          'CPF_DIFERENTE',
          'As duas pessoas têm CPFs diferentes: não podem ser a mesma pessoa.',
        );
      }

      const vinculos = await tx.vinculoFonte.findMany({
        where: { pessoaId: absorverId },
        select: { id: true },
      });
      await this.moverReferencias(tx, absorverId, manterId);

      // Documentos e dados que faltam em `manter` vêm de `absorver` (hash é único: libera antes).
      const dados: Prisma.PessoaMestraUpdateInput = {};
      for (const doc of ['cpf', 'nis', 'cns'] as const) {
        if (!manter[`${doc}Hash`] && absorver[`${doc}Hash`]) {
          Object.assign(dados, {
            [`${doc}Cifrado`]: absorver[`${doc}Cifrado`],
            [`${doc}Hash`]: absorver[`${doc}Hash`],
          });
        }
      }
      for (const k of [
        'dataNascimento',
        'nomeMae',
        'sexo',
        'domicilioId',
        'setorCodigo',
        'microarea',
        'escolaInep',
        'crasCodigo',
        'familiaPcf',
      ] as const) {
        if (manter[k] === null && absorver[k] !== null) Object.assign(dados, { [k]: absorver[k] });
      }
      await tx.pessoaMestra.update({
        where: { id: absorverId },
        data: {
          cpfHash: null,
          cpfCifrado: null,
          nisHash: null,
          nisCifrado: null,
          cnsHash: null,
          cnsCifrado: null,
        },
      });
      if (Object.keys(dados).length)
        await tx.pessoaMestra.update({ where: { id: manterId }, data: dados });
      await tx.pessoaMestra.delete({ where: { id: absorverId } });

      await tx.eventoIdentidade.create({
        data: {
          tipo,
          pessoaId: manterId,
          outraPessoa: absorverId,
          revisaoId,
          vinculoIds: vinculos.map((v) => v.id),
          usuarioId,
          motivo,
        },
      });
      return { pessoaId: manterId, vinculosMovidos: vinculos.length };
    });
  }

  private async moverReferencias(tx: Tx, de: number, para: number) {
    for (const t of TABELAS_PESSOA) {
      await tx.$executeRawUnsafe(`UPDATE ${t} SET pessoa_id = $1 WHERE pessoa_id = $2`, para, de);
    }
    // Família: se as duas já estavam na mesma, fica um membro só.
    await tx.$executeRaw`
      DELETE FROM pessoas.membro_familia m WHERE m.pessoa_id = ${de}
        AND EXISTS (SELECT 1 FROM pessoas.membro_familia x WHERE x.familia_id = m.familia_id AND x.pessoa_id = ${para})`;
    await tx.$executeRaw`UPDATE pessoas.membro_familia SET pessoa_id = ${para} WHERE pessoa_id = ${de}`;
    // AEE: um registro por tipo.
    await tx.$executeRaw`
      DELETE FROM educacao.atendimento_especializado a WHERE a.pessoa_id = ${de}
        AND EXISTS (SELECT 1 FROM educacao.atendimento_especializado x WHERE x.pessoa_id = ${para} AND x.tipo = a.tipo)`;
    await tx.$executeRaw`UPDATE educacao.atendimento_especializado SET pessoa_id = ${para} WHERE pessoa_id = ${de}`;
    // Sinalizador de saúde: um por pessoa; o que faltar em `para` vem de `de`.
    await tx.$executeRaw`
      UPDATE saude.sinalizador_saude p SET
        ubs_cnes = coalesce(p.ubs_cnes, d.ubs_cnes), microarea = coalesce(p.microarea, d.microarea),
        acs_responsavel = coalesce(p.acs_responsavel, d.acs_responsavel),
        ultima_visita_acs = greatest(p.ultima_visita_acs, d.ultima_visita_acs),
        vacinacao_em_dia = coalesce(p.vacinacao_em_dia, d.vacinacao_em_dia),
        vacina_gripe_em_dia = coalesce(p.vacina_gripe_em_dia, d.vacina_gripe_em_dia),
        pre_natal_adequado = coalesce(p.pre_natal_adequado, d.pre_natal_adequado),
        acamado_domiciliado = coalesce(p.acamado_domiciliado, d.acamado_domiciliado),
        condicao_cronica = coalesce(p.condicao_cronica, d.condicao_cronica),
        condicao_cronica_acompanhada = coalesce(p.condicao_cronica_acompanhada, d.condicao_cronica_acompanhada),
        necessita_atendimento_especializado = coalesce(p.necessita_atendimento_especializado, d.necessita_atendimento_especializado)
      FROM saude.sinalizador_saude d WHERE p.pessoa_id = ${para} AND d.pessoa_id = ${de}`;
    await tx.$executeRaw`
      DELETE FROM saude.sinalizador_saude WHERE pessoa_id = ${de}
        AND EXISTS (SELECT 1 FROM saude.sinalizador_saude x WHERE x.pessoa_id = ${para})`;
    await tx.$executeRaw`UPDATE saude.sinalizador_saude SET pessoa_id = ${para} WHERE pessoa_id = ${de}`;
    // Visitas guardam a lista de pessoas atendidas.
    await tx.$executeRaw`
      UPDATE casos.visita SET pessoa_ids = array_replace(pessoa_ids, ${de}, ${para}) WHERE ${de} = ANY (pessoa_ids)`;
    // Revisões: passam para a pessoa mantida; o par entre as duas some (já foi decidido).
    await tx.$executeRaw`
      DELETE FROM pessoas.revisao_vinculo
      WHERE (pessoa_a_id = ${de} AND pessoa_b_id = ${para}) OR (pessoa_a_id = ${para} AND pessoa_b_id = ${de})`;
    await tx.$executeRaw`UPDATE pessoas.revisao_vinculo SET pessoa_a_id = ${para} WHERE pessoa_a_id = ${de}`;
    await tx.$executeRaw`UPDATE pessoas.revisao_vinculo SET pessoa_b_id = ${para} WHERE pessoa_b_id = ${de}`;
  }

  /**
   * Desfaz uma união: o registro daquela fonte volta a ser uma pessoa própria, com os dados com que
   * chegou. Documentos, matrículas e casos ficam com a pessoa original (não há como saber de qual
   * registro vieram); a CTI corrige o restante à mão, se precisar.
   */
  async separar(vinculoId: number, usuarioId: number, motivo: string) {
    return this.prisma.$transaction(async (tx) => {
      const v = await tx.vinculoFonte.findUnique({
        where: { id: vinculoId },
        include: { pessoa: true },
      });
      if (!v) throw naoEncontrada('Ligação');
      const total = await tx.vinculoFonte.count({ where: { pessoaId: v.pessoaId } });
      if (total < 2) {
        throw new ErroApi(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'NADA_A_SEPARAR',
          'Esta pessoa só tem este registro: não há o que separar.',
        );
      }
      const origem = (v.dados ?? {}) as {
        nome?: string;
        nascimento?: string | null;
        mae?: string | null;
        sexo?: 'FEMININO' | 'MASCULINO' | null;
      };
      const nome = origem.nome ?? v.pessoa.nome;
      const nova = await tx.pessoaMestra.create({
        data: {
          nome,
          nomeNormalizado: normalizarNomePessoa(nome),
          dataNascimento: origem.nascimento ? new Date(`${origem.nascimento}T00:00:00Z`) : null,
          nomeMae: origem.mae ?? null,
          sexo: origem.sexo ?? null,
          setorCodigo: v.pessoa.setorCodigo,
          microarea: v.pessoa.microarea,
          crasCodigo: v.pessoa.crasCodigo,
        },
        select: { id: true },
      });
      await tx.vinculoFonte.update({
        where: { id: vinculoId },
        data: { pessoaId: nova.id, regra: 'MANUAL', confianca: 1 },
      });
      await tx.eventoIdentidade.create({
        data: {
          tipo: 'SEPARACAO',
          pessoaId: v.pessoaId,
          outraPessoa: nova.id,
          vinculoIds: [vinculoId],
          usuarioId,
          motivo,
        },
      });
      return { pessoaOriginal: v.pessoaId, pessoaNova: nova.id };
    });
  }

  async aceitar(revisaoId: number, usuarioId: number) {
    const r = await this.revisaoPendente(revisaoId);
    // Mantém a pessoa que já existia (A); a criada pelo registro novo (B) é absorvida.
    const res = await this.unir(
      r.pessoaAId,
      r.pessoaBId,
      usuarioId,
      'REVISAO_ACEITA',
      null,
      revisaoId,
    );
    // A união apaga o par da fila; registra a decisão por cima do evento.
    return { ...res, revisaoId, situacao: 'ACEITA' as const };
  }

  async rejeitar(revisaoId: number, usuarioId: number) {
    const r = await this.revisaoPendente(revisaoId);
    await this.prisma.$transaction([
      this.prisma.revisaoVinculo.update({
        where: { id: revisaoId },
        data: { situacao: 'REJEITADA', decididoPor: usuarioId, decididoEm: new Date() },
      }),
      this.prisma.eventoIdentidade.create({
        data: {
          tipo: 'REVISAO_REJEITADA',
          pessoaId: r.pessoaAId,
          outraPessoa: r.pessoaBId,
          revisaoId,
          vinculoIds: [],
          usuarioId,
        },
      }),
    ]);
    return { revisaoId, situacao: 'REJEITADA' as const };
  }

  private async revisaoPendente(id: number) {
    const r = await this.prisma.revisaoVinculo.findUnique({ where: { id } });
    if (!r) throw naoEncontrada('Revisão');
    if (r.situacao !== 'PENDENTE') {
      throw new ErroApi(
        HttpStatus.CONFLICT,
        'REVISAO_JA_DECIDIDA',
        'Esta revisão já foi decidida.',
      );
    }
    return r;
  }

  /** Fila de revisão, com as duas pessoas lado a lado. Documentos sempre mascarados. */
  async listarRevisoes(situacao: 'PENDENTE' | 'REJEITADA' = 'PENDENTE') {
    const revisoes = await this.prisma.revisaoVinculo.findMany({
      where: { situacao },
      orderBy: [{ similaridade: 'desc' }, { id: 'asc' }],
      take: 200,
    });
    const ids = [...new Set(revisoes.flatMap((r) => [r.pessoaAId, r.pessoaBId]))];
    const pessoas = await this.prisma.pessoaMestra.findMany({
      where: { id: { in: ids } },
      include: { vinculos: { select: { fonte: true, regra: true } } },
    });
    const porId = new Map(pessoas.map((p) => [p.id, this.resumo(p)]));
    return revisoes
      .filter((r) => porId.has(r.pessoaAId) && porId.has(r.pessoaBId))
      .map((r) => ({
        id: r.id,
        similaridade: Number(r.similaridade),
        situacao: r.situacao,
        a: porId.get(r.pessoaAId),
        b: porId.get(r.pessoaBId),
      }));
  }

  private resumo(
    p: Prisma.PessoaMestraGetPayload<{
      include: { vinculos: { select: { fonte: true; regra: true } } };
    }>,
  ) {
    return {
      id: p.id,
      nome: p.nome,
      nascimento: p.dataNascimento?.toISOString().slice(0, 10) ?? null,
      mae: p.nomeMae,
      sexo: p.sexo,
      setor: p.setorCodigo,
      cpf: p.cpfCifrado ? mascararCpf(this.cripto.revelar(p.cpfCifrado)) : null,
      nis: p.nisCifrado ? mascararNis(this.cripto.revelar(p.nisCifrado)) : null,
      temCns: !!p.cnsHash,
      fontes: p.vinculos.map((v) => ({ fonte: v.fonte, regra: v.regra })),
    };
  }

  /** Busca por nome para a união manual (sem documento). */
  async buscarPessoas(texto: string) {
    const nome = normalizarNomePessoa(texto);
    if (nome.length < 3) return [];
    return this.prisma.$queryRaw<
      { id: number; nome: string; nascimento: string | null; setor: string | null }[]
    >`
      SELECT id, nome, to_char(data_nascimento, 'YYYY-MM-DD') AS nascimento, setor_codigo AS setor
      FROM pessoas.pessoa_mestra
      WHERE similarity(nome_normalizado, ${nome}) >= 0.35
      ORDER BY similarity(nome_normalizado, ${nome}) DESC, id
      LIMIT 20`;
  }

  /** Ligações por regra e revisões pendentes (card "Como as pessoas foram ligadas"). */
  async resumoLigacoes() {
    const porRegra = await this.prisma.vinculoFonte.groupBy({
      by: ['regra'],
      _count: { _all: true },
    });
    const pendentes = await this.prisma.revisaoVinculo.count({ where: { situacao: 'PENDENTE' } });
    return {
      porRegra: Object.fromEntries(porRegra.map((r) => [r.regra, r._count._all])),
      revisoesPendentes: pendentes,
    };
  }
}
