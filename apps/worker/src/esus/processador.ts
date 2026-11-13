import {
  calcularSinalizadores,
  type ContratoPec,
  converterMicroarea,
  type DataISO,
  diaDeTempo,
  mensagemEstruturaMudou,
  normalizarCpf,
  type SinalizadoresSaude,
  verificarEstrutura,
} from '@sii/shared';
import type { Pool } from 'pg';
import { LigacaoPessoas, type ResultadoLigacao } from '../../../api/src/pessoas/ligacao';
import type { Prisma, PrismaClient } from '../banco';
import {
  type Contagens,
  type ContextoCarga,
  FalhaDefinitiva,
  type ProcessadorConsulta,
} from '../cargas/pipeline';
import {
  type CidadaoPec,
  contarTabelas,
  emLeitura,
  lerEstrutura,
  lerMarca,
  parametros,
  sqlCidadaos,
} from './pec';

/**
 * Carga do e-SUS APS PEC (P09, ADR 0008), em ordem:
 * 1. ESTRUTURA: confere o contrato no information_schema. Faltou algo → FalhaDefinitiva, nada lido;
 * 2. LEITURA: numa foto só do PEC (somente leitura), lê os cidadãos alterados desde a última carga
 *    (ou todos, na completa semanal);
 * 3. LIGACAO: numa **única transação** do SII grava staging, ligação das pessoas e sinalizadores.
 *    Erro no meio → nada fica gravado.
 *
 * Só sinalizadores (§3.5): a consulta não seleciona CID, CIAP nem qual condição crônica.
 */

/** Uma carga completa por semana: as janelas de 180 dias e 12 meses vencem sem fato novo no PEC. */
export const DIAS_ENTRE_COMPLETAS = 7;
/** Cargas que ficam no staging (as mais recentes). */
export const CARGAS_NO_STAGING_ESUS = 3;
/** Tempo máximo da transação de gravação (uma carga completa grava o município inteiro). */
const LIMITE_TRANSACAO_MS = 30 * 60_000;

const ESTAGIO_SQL = [
  'CREATE SCHEMA IF NOT EXISTS stg_esus',
  `CREATE TABLE IF NOT EXISTS stg_esus.cidadao (
     carga_id integer NOT NULL,
     co_cidadao bigint NOT NULL,
     dados jsonb NOT NULL,
     tem_cpf boolean NOT NULL,
     tem_cns boolean NOT NULL,
     PRIMARY KEY (carga_id, co_cidadao)
   )`,
];

export interface DependenciasEsus {
  pec: Pool;
  schema: string;
  contrato: ContratoPec;
  microareas: Readonly<Record<string, string>>;
  chaves: { cifra: Buffer; hmac: Buffer };
  /** Data de hoje em America/Porto_Velho (injetável nos testes). */
  hoje?: () => DataISO;
}

export function hojePortoVelho(): DataISO {
  return new Date(Date.now() - 4 * 3_600_000).toISOString().slice(0, 10);
}

/** Decide completa × incremental pelas cargas OK anteriores. */
export async function decidirModo(
  prisma: PrismaClient,
  agora = new Date(),
): Promise<{ modo: 'COMPLETA' | 'INCREMENTAL'; desde: string | null }> {
  const ok = { fonte: 'ESUS_PEC', status: 'OK' as const, marca: { not: null } };
  const ultima = await prisma.logCarga.findFirst({ where: ok, orderBy: { id: 'desc' } });
  const completa = await prisma.logCarga.findFirst({
    where: { ...ok, modo: 'COMPLETA' },
    orderBy: { id: 'desc' },
  });
  const limite = agora.getTime() - DIAS_ENTRE_COMPLETAS * 86_400_000;
  if (!ultima?.marca || !completa || completa.inicioEm.getTime() < limite)
    return { modo: 'COMPLETA', desde: null };
  return { modo: 'INCREMENTAL', desde: ultima.marca };
}

const sexo = (s: string | null) => {
  const l = s?.trim().toUpperCase()[0];
  return l === 'F' ? 'FEMININO' : l === 'M' ? 'MASCULINO' : null;
};
const digitos = (s: string | null) => s?.replace(/\D/g, '') || null;

interface Preparado {
  linha: CidadaoPec;
  sinalizadores: SinalizadoresSaude;
  microareaSii: string | null;
  cpf: string | null;
  cns: string | null;
}

export function criarProcessadorEsus(dep: DependenciasEsus): ProcessadorConsulta {
  return async (ctx) => {
    await ctx.etapa('ESTRUTURA');
    const { modo, desde } = await decidirModo(ctx.prisma);

    const leitura = await emLeitura(dep.pec, async (c) => {
      const { faltando } = verificarEstrutura(dep.contrato, await lerEstrutura(c, dep.schema));
      if (faltando.length > 0) throw new FalhaDefinitiva(mensagemEstruturaMudou(faltando));
      await ctx.etapa('LEITURA');
      const marca = await lerMarca(c);
      const relatorio = await contarTabelas(c, dep.contrato, dep.schema, desde);
      const r = await c.query<CidadaoPec>(
        sqlCidadaos(dep.contrato, dep.schema),
        parametros(dep.contrato, desde),
      );
      return { marca, relatorio, linhas: r.rows };
    });

    const hoje = (dep.hoje ?? hojePortoVelho)();
    const c: Contagens = {
      total: leitura.linhas.length,
      lidos: leitura.linhas.length,
      inseridos: 0,
      rejeitados: 0,
      ligados: 0,
      novos: 0,
      revisao: 0,
      avisos: 0,
      modo,
      marca: leitura.marca,
      resumo: { ...leitura.relatorio.tabelas, cidadaosLidos: leitura.linhas.length },
    };
    await ctx.etapa('STAGING', { total: c.total });

    const validos: Preparado[] = [];
    for (const l of leitura.linhas) {
      const linha = Number(l.co_cidadao);
      if (!l.nome?.trim() || !l.nascimento) {
        c.rejeitados++;
        ctx.problema(linha, {
          campo: l.nome?.trim() ? 'nascimento' : 'nome',
          gravidade: 'ERRO',
          mensagem: 'Cidadão do PEC sem nome ou sem data de nascimento: não foi ligado.',
        });
        continue;
      }
      const cpfBruto = digitos(l.cpf);
      const cpf = normalizarCpf(cpfBruto);
      if (cpfBruto && !cpf) {
        c.avisos++;
        ctx.problema(linha, {
          campo: 'cpf',
          gravidade: 'AVISO',
          mensagem: 'CPF com dígito verificador inválido no PEC: a pessoa entrou sem CPF.',
        });
      }
      const microareaSii = converterMicroarea(l.cnes, l.microarea, dep.microareas);
      if (l.microarea?.trim() && !microareaSii) {
        c.avisos++;
        ctx.problema(linha, {
          campo: 'microarea',
          gravidade: 'AVISO',
          mensagem:
            'Microárea do PEC sem conversão para a área do Geoportal (config/esus/microareas.json).',
        });
      }
      validos.push({
        linha: l,
        microareaSii,
        cpf,
        cns: digitos(l.cns),
        sinalizadores: calcularSinalizadores(
          {
            nascimento: l.nascimento,
            microareaSii,
            cadastro: l.tem_cadastro
              ? {
                  cnes: l.cnes,
                  microarea: l.microarea?.trim() || null,
                  acs: l.acs,
                  gestante: l.gestante === true,
                  acamado: l.acamado === true,
                  domiciliado: l.domiciliado === true,
                  cronico: l.cronico === true,
                }
              : null,
            ultimaVisita: diaDeTempo(l.ultima_visita),
            ultimoAtendimento: diaDeTempo(l.ultimo_atendimento),
            ultimaVacinaGripe: diaDeTempo(l.ultima_gripe),
          },
          hoje,
        ),
      });
    }

    await ctx.etapa('LIGACAO');
    const resultados = await ctx.prisma.$transaction((tx) => gravar(tx, ctx, validos, dep.chaves), {
      timeout: LIMITE_TRANSACAO_MS,
      maxWait: 60_000,
    });
    for (const r of resultados) {
      if (r.acao === 'NOVA') c.novos++;
      else if (r.acao === 'REVISAO') c.revisao++;
      else c.ligados++;
    }
    c.inseridos = validos.length;

    await ctx.prisma.$executeRaw`
      DELETE FROM stg_esus.cidadao WHERE carga_id NOT IN (
        SELECT id FROM auditoria.log_carga WHERE fonte = 'ESUS_PEC'
        ORDER BY id DESC LIMIT ${CARGAS_NO_STAGING_ESUS})`;
    return c;
  };
}

const data = (d: DataISO | null) => (d ? new Date(`${d}T00:00:00Z`) : null);

async function gravar(
  tx: Prisma.TransactionClient,
  ctx: ContextoCarga,
  validos: Preparado[],
  chaves: { cifra: Buffer; hmac: Buffer },
): Promise<ResultadoLigacao[]> {
  for (const sql of ESTAGIO_SQL) await tx.$executeRawUnsafe(sql);
  // Staging: os sinalizadores calculados, sem CPF nem CNS (só se tinha).
  const estagio = validos.map((v) => ({
    co: Number(v.linha.co_cidadao),
    dados: v.sinalizadores,
    tem_cpf: v.cpf !== null,
    tem_cns: v.cns !== null,
  }));
  await tx.$executeRaw`
    INSERT INTO stg_esus.cidadao (carga_id, co_cidadao, dados, tem_cpf, tem_cns)
    SELECT ${ctx.carga.id}, x.co, x.dados, x.tem_cpf, x.tem_cns
      FROM jsonb_to_recordset(${JSON.stringify(estagio)}::jsonb)
        AS x(co bigint, dados jsonb, tem_cpf boolean, tem_cns boolean)
    ON CONFLICT DO NOTHING`;

  const ligacao = new LigacaoPessoas(tx, chaves);
  const resultados: ResultadoLigacao[] = [];
  for (const [i, v] of validos.entries()) {
    const l = v.linha;
    const r = await ligacao.ligar({
      fonte: 'ESUS',
      idExterno: `C${l.co_cidadao}`,
      cpf: v.cpf,
      cns: v.cns,
      nome: (l.nome as string).trim(),
      nascimento: l.nascimento,
      mae: l.mae?.trim() || null,
      sexo: sexo(l.sexo),
      cargaId: ctx.carga.id,
    });
    resultados.push(r);
    // O e-SUS é a fonte da microárea: com conversão, atualiza o escopo da RLS (ACS).
    if (v.microareaSii)
      await tx.pessoaMestra.updateMany({
        where: {
          id: r.pessoaId,
          OR: [{ microarea: null }, { microarea: { not: v.microareaSii } }],
        },
        data: { microarea: v.microareaSii },
      });
    const s = v.sinalizadores;
    const dados = {
      ubsCnes: s.ubsCnes,
      microarea: s.microarea,
      acsResponsavel: s.acsResponsavel?.slice(0, 80) ?? null,
      ultimaVisitaAcs: data(s.ultimaVisitaAcs),
      vacinacaoEmDia: s.vacinacaoEmDia,
      vacinaGripeEmDia: s.vacinaGripeEmDia,
      preNatalAdequado: s.preNatalAdequado,
      acamadoDomiciliado: s.acamadoDomiciliado,
      condicaoCronica: s.condicaoCronica,
      condicaoCronicaAcompanhada: s.condicaoCronicaAcompanhada,
      necessitaAtendimentoEspecializado: s.necessitaAtendimentoEspecializado,
    };
    await tx.sinalizadorSaude.upsert({
      where: { pessoaId: r.pessoaId },
      create: { pessoaId: r.pessoaId, ...dados },
      update: dados,
    });
    if ((i + 1) % 250 === 0) await ctx.progresso(i + 1);
  }
  return resultados;
}
