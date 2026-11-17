import {
  type DataISO,
  deveAbrirBuscaAtiva,
  faixaEtariaBuscaAtiva,
  hojeEmPortoVelho,
  idadeEm,
  origemDoAlerta,
} from '@sii/shared';
import { registrarAvisos } from '../../../api/src/casos/avisos.service';
import { criarCaso, destinosCras } from '../../../api/src/casos/criar-caso';
import type { PrismaClient } from '../banco';
import type { Contagens, ProcessadorConsulta } from '../cargas/pipeline';

/**
 * Job diário da busca ativa escolar (§4.2, P13, ADR 0012).
 *
 * 1. Procura pessoas de 4 a 17 anos com domicílio no município e sem matrícula ATIVA (municipal nem
 *    estadual). `deveAbrirBuscaAtiva` (shared) decide; o caso abre por `criarCaso` como IDENTIFICADO,
 *    com a origem do alerta (CadÚnico, e-SUS ou Censo) e aviso à SEMED.
 * 2. Fecha como MATRICULADO os casos abertos cuja pessoa ganhou matrícula ativa (evento DESFECHO).
 *
 * Idempotente: `criarCaso` trava e confere caso aberto na transação. Resumo sem dado pessoal.
 */

export interface ResumoBuscaAtivaJob {
  avaliadas: number;
  abertos: number;
  matriculados: number;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

interface Candidata {
  id: number;
  nascimento: Date;
  residente: boolean;
  matriculada: boolean;
  caso_aberto: boolean;
  ultimo_ct: Date | null;
  fontes: string[];
}

export async function executarBuscaAtiva(
  prisma: PrismaClient,
  opcoes: { hoje?: DataISO } = {},
): Promise<ResumoBuscaAtivaJob> {
  const hoje = opcoes.hoje ?? hojeEmPortoVelho();
  const r: ResumoBuscaAtivaJob = { avaliadas: 0, abertos: 0, matriculados: 0 };

  // 1. Matrícula apareceu: fecha o caso.
  const comMatricula = await prisma.$queryRaw<{ id: number; codigo: string; inep: string }[]>`
    SELECT c.id, c.codigo,
           (SELECT e.inep FROM educacao.matricula m JOIN educacao.escola e ON e.id = m.escola_id
             WHERE m.pessoa_id = c.pessoa_id AND m.situacao = 'ATIVA'
             ORDER BY m.ano DESC, m.inicio_em DESC LIMIT 1) AS inep
    FROM casos.caso c
    WHERE c.tipo = 'BUSCA_ATIVA_ESCOLAR' AND c.encerrado_em IS NULL
      AND EXISTS (SELECT 1 FROM educacao.matricula m
                   WHERE m.pessoa_id = c.pessoa_id AND m.situacao = 'ATIVA')`;
  for (const c of comMatricula) {
    await prisma.$transaction(async (tx) => {
      const agora = new Date();
      await tx.caso.update({
        where: { id: c.id },
        data: { status: 'MATRICULADO', encerradoEm: agora, nivel: 0, prazoEm: null },
      });
      await tx.eventoCaso.create({
        data: {
          casoId: c.id,
          tipo: 'DESFECHO',
          ocorridoEm: agora,
          dados: { resultado: 'MATRICULADO', inep: c.inep, origem: 'CARGA_ESCOLAR' },
        },
      });
    });
    r.matriculados++;
  }

  // 2. Crianças e adolescentes fora da escola.
  const candidatas = await prisma.$queryRaw<Candidata[]>`
    SELECT p.id, p.data_nascimento AS nascimento,
           (p.domicilio_id IS NOT NULL) AS residente,
           EXISTS (SELECT 1 FROM educacao.matricula m
                    WHERE m.pessoa_id = p.id AND m.situacao = 'ATIVA') AS matriculada,
           EXISTS (SELECT 1 FROM casos.caso c
                    WHERE c.pessoa_id = p.id AND c.tipo = 'BUSCA_ATIVA_ESCOLAR'
                      AND c.encerrado_em IS NULL) AS caso_aberto,
           (SELECT max(e.ocorrido_em) FROM casos.evento_caso e
              JOIN casos.caso c ON c.id = e.caso_id
             WHERE c.pessoa_id = p.id AND c.tipo = 'BUSCA_ATIVA_ESCOLAR'
               AND e.tipo = 'ENCAMINHADO_CONSELHO_TUTELAR') AS ultimo_ct,
           array(SELECT DISTINCT v.fonte::text FROM pessoas.vinculo_fonte v
                  WHERE v.pessoa_id = p.id) AS fontes
    FROM pessoas.pessoa_mestra p
    WHERE p.data_nascimento <= ${hoje}::date - interval '4 years'
      AND p.data_nascimento > ${hoje}::date - interval '18 years'
    ORDER BY p.id`;
  r.avaliadas = candidatas.length;
  const abrir = candidatas.filter((c) =>
    deveAbrirBuscaAtiva(
      {
        idade: idadeEm(iso(c.nascimento), hoje),
        residente: c.residente,
        matriculaAtiva: c.matriculada,
        casoAberto: c.caso_aberto,
        ultimoConselhoEm: c.ultimo_ct ? hojeEmPortoVelho(c.ultimo_ct) : null,
      },
      hoje,
    ),
  );
  if (abrir.length === 0) return r;

  const destinos = await destinosCras(
    prisma,
    abrir.map((c) => c.id),
  );
  for (const c of abrir) {
    const origem = origemDoAlerta(c.fontes);
    const novo = await prisma.$transaction(async (tx) => {
      const res = await criarCaso(tx, {
        tipo: 'BUSCA_ATIVA_ESCOLAR',
        pessoaId: c.id,
        origem,
        secretaria: 'SEMED',
        statusInicial: 'IDENTIFICADO',
        destino: destinos.get(c.id) ?? { cras: null, setor: null, localidade: null },
        hoje,
        feriados: [],
        abertura: {
          tipo: 'ALERTA_GERADO',
          dados: { origem, faixaEtaria: faixaEtariaBuscaAtiva(idadeEm(iso(c.nascimento), hoje)) },
        },
      });
      if (res.criado) {
        await registrarAvisos(tx, res.casoId, res.codigo, 'IDENTIFICADO', [
          { tipo: 'SECRETARIA', valor: 'SEMED' },
        ]);
      }
      return res.criado;
    });
    if (novo) r.abertos++;
  }
  return r;
}

export function criarProcessadorBuscaAtiva(opcoes: { hoje?: DataISO } = {}): ProcessadorConsulta {
  return async (ctx): Promise<Contagens> => {
    await ctx.etapa('BUSCA_ATIVA');
    const r = await executarBuscaAtiva(ctx.prisma, opcoes);
    return {
      total: r.avaliadas,
      lidos: r.avaliadas,
      inseridos: r.abertos,
      rejeitados: 0,
      ligados: 0,
      novos: r.abertos,
      revisao: 0,
      avisos: 0,
      resumo: { ...r },
    };
  };
}
