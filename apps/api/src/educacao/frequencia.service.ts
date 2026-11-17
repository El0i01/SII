import { HttpStatus, Injectable } from '@nestjs/common';
import {
  adicionarDias,
  hojeEmPortoVelho,
  type LancamentoFrequencia,
  type SituacaoFrequencia,
} from '@sii/shared';
import { PrismaService } from '../banco/prisma.service';
import { ErroApi } from '../comum/erros';
import type { UsuarioAutenticado } from '../comum/usuario-autenticado';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dia = (s: string) => new Date(`${s}T00:00:00Z`);

export interface GradeFrequencia {
  escola: { inep: string; nome: string };
  turma: { id: number; nome: string; ano: number };
  mes: string;
  /** Hoje em Porto Velho: dias depois disso não aceitam lançamento. */
  hoje: string;
  /** Dias letivos do mês, pelo calendário da escola. */
  dias: string[];
  alunos: { matriculaId: number; nome: string }[];
  lancamentos: { matriculaId: number; dia: string; situacao: SituacaoFrequencia }[];
}

export type MotivoRecusa = 'MATRICULA_FORA_DA_TURMA' | 'DIA_NAO_LETIVO' | 'DIA_FUTURO';

export interface ResultadoLancamento {
  salvos: number;
  apagados: number;
  recusados: { matriculaId: number; dia: string; motivo: MotivoRecusa }[];
}

/**
 * Frequência diária da turma (§3.4, P10). Escola e turma não são nominais (cliente direto); aluno e
 * frequência passam por `comoUsuario`, então a RLS limita a escola aos próprios alunos.
 */
@Injectable()
export class FrequenciaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Escolas que o usuário pode abrir: as do escopo (perfil ESCOLA) ou todas. */
  async escolas(u: UsuarioAutenticado) {
    const ineps = u.escopos.filter((e) => e.tipo === 'ESCOLA').map((e) => e.valor);
    return this.prisma.escola.findMany({
      where: u.perfil === 'ESCOLA' ? { inep: { in: ineps } } : {},
      orderBy: { nome: 'asc' },
      select: { inep: true, nome: true, rede: true },
    });
  }

  async turmas(inep: string, ano: number) {
    const escola = await this.escola(inep);
    return this.prisma.turma.findMany({
      where: { escolaId: escola.id, ano },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, ano: true },
    });
  }

  async grade(
    u: UsuarioAutenticado,
    inep: string,
    turmaId: number,
    mes: string,
    hoje = hojeEmPortoVelho(),
  ): Promise<GradeFrequencia> {
    const escola = await this.escola(inep);
    const turma = await this.turma(escola.id, turmaId);
    const inicio = dia(`${mes}-01`);
    const fim = dia(adicionarDias(`${proximoMes(mes)}-01`, -1));
    const calendario = await this.prisma.calendarioEscolar.findMany({
      where: { escolaId: escola.id, dia: { gte: inicio, lte: fim } },
      orderBy: { dia: 'asc' },
      select: { dia: true },
    });
    const { alunos, lancamentos } = await this.prisma.comoUsuario(u, async (tx) => {
      const matriculas = await tx.matricula.findMany({
        where: { turmaId: turma.id, escolaId: escola.id, situacao: 'ATIVA' },
        select: { id: true, pessoa: { select: { nome: true } } },
      });
      const freq = await tx.frequencia.findMany({
        where: {
          matriculaId: { in: matriculas.map((m) => m.id) },
          dia: { gte: inicio, lte: fim },
        },
        select: { matriculaId: true, dia: true, situacao: true },
      });
      return { alunos: matriculas, lancamentos: freq };
    });
    return {
      escola: { inep, nome: escola.nome },
      turma: { id: turma.id, nome: turma.nome, ano: turma.ano },
      mes,
      hoje,
      dias: calendario.map((c) => iso(c.dia)),
      alunos: alunos
        .map((m) => ({ matriculaId: m.id, nome: m.pessoa.nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      lancamentos: lancamentos.map((l) => ({
        matriculaId: l.matriculaId,
        dia: iso(l.dia),
        situacao: l.situacao,
      })),
    };
  }

  /**
   * Grava a grade em lote. Responde por item: o que não pode ser gravado volta em `recusados` (a
   * fila offline do web descarta esses e mantém o resto salvo). O último a salvar vence.
   */
  async lancar(
    u: UsuarioAutenticado,
    inep: string,
    turmaId: number,
    lancamentos: LancamentoFrequencia[],
    hoje = hojeEmPortoVelho(),
  ): Promise<ResultadoLancamento> {
    const escola = await this.escola(inep);
    const turma = await this.turma(escola.id, turmaId);
    // Último lançamento de cada célula vence (a fila pode mandar a mesma célula duas vezes).
    const porCelula = new Map(lancamentos.map((l) => [`${l.matriculaId}|${l.dia}`, l]));
    const itens = [...porCelula.values()];
    const dias = [...new Set(itens.map((l) => l.dia))];
    const letivos = new Set(
      (
        await this.prisma.calendarioEscolar.findMany({
          where: { escolaId: escola.id, dia: { in: dias.map(dia) } },
          select: { dia: true },
        })
      ).map((c) => iso(c.dia)),
    );

    return this.prisma.comoUsuario(u, async (tx) => {
      const daTurma = new Set(
        (
          await tx.matricula.findMany({
            where: {
              id: { in: [...new Set(itens.map((l) => l.matriculaId))] },
              turmaId: turma.id,
              escolaId: escola.id,
              situacao: 'ATIVA',
            },
            select: { id: true },
          })
        ).map((m) => m.id),
      );
      const r: ResultadoLancamento = { salvos: 0, apagados: 0, recusados: [] };
      const gravar: { matricula_id: number; dia: string; situacao: SituacaoFrequencia }[] = [];
      const apagar: { matricula_id: number; dia: string }[] = [];
      for (const l of itens) {
        const motivo: MotivoRecusa | null = !daTurma.has(l.matriculaId)
          ? 'MATRICULA_FORA_DA_TURMA'
          : l.dia > hoje
            ? 'DIA_FUTURO'
            : !letivos.has(l.dia)
              ? 'DIA_NAO_LETIVO'
              : null;
        if (motivo) r.recusados.push({ matriculaId: l.matriculaId, dia: l.dia, motivo });
        else if (l.situacao === null) apagar.push({ matricula_id: l.matriculaId, dia: l.dia });
        else gravar.push({ matricula_id: l.matriculaId, dia: l.dia, situacao: l.situacao });
      }
      if (gravar.length > 0) {
        r.salvos = await tx.$executeRaw`
          INSERT INTO educacao.frequencia (matricula_id, dia, situacao, lancado_por, atualizado_em)
          SELECT x.matricula_id, x.dia, x.situacao::educacao."SituacaoFrequencia", ${u.id}, now()
          FROM jsonb_to_recordset(${JSON.stringify(gravar)}::jsonb)
            AS x(matricula_id int, dia date, situacao text)
          ON CONFLICT (matricula_id, dia) DO UPDATE
            SET situacao = EXCLUDED.situacao, lancado_por = EXCLUDED.lancado_por,
                atualizado_em = now()`;
      }
      if (apagar.length > 0) {
        r.apagados = await tx.$executeRaw`
          DELETE FROM educacao.frequencia f
          USING jsonb_to_recordset(${JSON.stringify(apagar)}::jsonb) AS x(matricula_id int, dia date)
          WHERE f.matricula_id = x.matricula_id AND f.dia = x.dia`;
      }
      return r;
    });
  }

  private async escola(inep: string) {
    const escola = await this.prisma.escola.findUnique({
      where: { inep },
      select: { id: true, nome: true },
    });
    if (!escola)
      throw new ErroApi(HttpStatus.NOT_FOUND, 'ESCOLA_NAO_ENCONTRADA', 'Escola não encontrada.');
    return escola;
  }

  private async turma(escolaId: number, turmaId: number) {
    const turma = await this.prisma.turma.findFirst({
      where: { id: turmaId, escolaId },
      select: { id: true, nome: true, ano: true },
    });
    if (!turma)
      throw new ErroApi(
        HttpStatus.NOT_FOUND,
        'TURMA_NAO_ENCONTRADA',
        'Turma não encontrada nesta escola.',
      );
    return turma;
  }
}

function proximoMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}
