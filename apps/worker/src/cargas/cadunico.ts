import { createHash } from 'node:crypto';
import {
  type CamposCadunico,
  converterLinhaCadunico,
  decodificar,
  detectarSeparador,
  lerCsv,
  mapearCabecalho,
  mensagemColunasFaltando,
  normalizarNomePessoa,
  type RegistroCadunico,
} from '@sii/shared';
import { hashDocumento } from '../../../api/src/cripto/cifra';
import { LigacaoPessoas, type ResultadoLigacao } from '../../../api/src/pessoas/ligacao';
import type { Prisma } from '../banco';
import type { DicionarioCadunico } from './dicionario';
import { type Contagens, type ProcessadorFonte, RejeicaoCarga } from './pipeline';

/**
 * Carga do CadÚnico (P08): CSV do CECAD ou base completa do Portal de Gestão.
 *
 * - stg_cadunico.pessoa guarda a linha bruta com `carga_id`, **sem CPF e sem NIS** (só se tinha);
 * - cada família entra numa transação: ligação das pessoas (LigacaoPessoas, CLAUDE.md) → Familia →
 *   MembroFamilia → retrato do mês (CadunicoFamilia);
 * - é idempotente: reenviar o mesmo mês não cria nada de novo.
 *
 * Não remove da família quem não veio no arquivo: o CECAD pode exportar um recorte (ADR 0007).
 */

const ESTAGIO_SQL = [
  'CREATE SCHEMA IF NOT EXISTS stg_cadunico',
  `CREATE TABLE IF NOT EXISTS stg_cadunico.pessoa (
     carga_id integer NOT NULL,
     linha integer NOT NULL,
     dados jsonb NOT NULL,
     tem_cpf boolean NOT NULL,
     tem_nis boolean NOT NULL,
     valida boolean NOT NULL,
     PRIMARY KEY (carga_id, linha)
   )`,
];
/** Quantas cargas ficam no staging (as mais recentes). */
export const CARGAS_NO_STAGING = 3;

interface LinhaValida {
  linha: number;
  registro: RegistroCadunico;
}

/**
 * Id do registro na fonte. Com NIS: `N` + HMAC do NIS (o NIS em texto nunca é gravado fora da
 * pessoa, onde fica cifrado). Sem NIS: o código familiar + um resumo de nome e nascimento.
 */
export function idExternoCadunico(r: RegistroCadunico, chaveHmac: Buffer): string {
  if (r.nis) return `N${hashDocumento('NIS', r.nis, chaveHmac).toString('hex').slice(0, 40)}`;
  const resumo = createHash('sha256')
    .update(`${normalizarNomePessoa(r.nome)}|${r.nascimento}`)
    .digest('hex')
    .slice(0, 12);
  return `CF${r.codigoFamiliar}-${resumo}`;
}

export function criarProcessadorCadunico(
  dic: DicionarioCadunico,
  chaves: { cifra: Buffer; hmac: Buffer },
): ProcessadorFonte {
  return async (ctx, arquivo) => {
    const mes = ctx.carga.mesReferencia;
    if (!mes)
      throw new RejeicaoCarga('A carga não tem mês de referência. Envie de novo informando o mês.');

    await ctx.etapa('LAYOUT');
    const { texto, codificacao } = decodificar(arquivo);
    const fimCabecalho = texto.search(/\r?\n/);
    const separador = detectarSeparador(fimCabecalho < 0 ? texto : texto.slice(0, fimCabecalho));
    if (!separador)
      throw new RejeicaoCarga(
        'Não foi possível identificar o separador das colunas (; ou ,). Confira se o arquivo é o CSV exportado do CECAD ou do Portal de Gestão.',
      );
    const linhas = lerCsv(texto, separador);
    const [cabecalho, ...dados] = linhas;
    const { mapa, faltando } = mapearCabecalho(cabecalho?.campos ?? [], dic);
    if (faltando.length > 0) throw new RejeicaoCarga(mensagemColunasFaltando(faltando, dic.fonte));
    if (dados.length === 0)
      throw new RejeicaoCarga('O arquivo só tem o cabeçalho, sem nenhuma linha de pessoa.');

    await ctx.etapa('STAGING', {
      total: dados.length,
      codificacao,
      separador: separador === '\t' ? 'TAB' : separador,
    });
    for (const sql of ESTAGIO_SQL) await ctx.prisma.$executeRawUnsafe(sql);
    await ctx.prisma.$executeRaw`DELETE FROM stg_cadunico.pessoa WHERE carga_id = ${ctx.carga.id}`;

    const c: Contagens = {
      total: dados.length,
      lidos: dados.length,
      inseridos: 0,
      rejeitados: 0,
      ligados: 0,
      novos: 0,
      revisao: 0,
      avisos: 0,
    };
    const validas: LinhaValida[] = [];
    let lote: unknown[] = [];
    const gravarLote = async () => {
      if (lote.length === 0) return;
      await ctx.prisma.$executeRaw`
        INSERT INTO stg_cadunico.pessoa (carga_id, linha, dados, tem_cpf, tem_nis, valida)
        SELECT carga_id, linha, dados, tem_cpf, tem_nis, valida
        FROM jsonb_to_recordset(${JSON.stringify(lote)}::jsonb)
          AS x(carga_id int, linha int, dados jsonb, tem_cpf boolean, tem_nis boolean, valida boolean)`;
      lote = [];
    };
    for (const l of dados) {
      const campos: CamposCadunico = {};
      for (const [chave, i] of Object.entries(mapa)) {
        const v = l.campos[i];
        if (v !== undefined) campos[chave as keyof CamposCadunico] = v;
      }
      const r = converterLinhaCadunico(campos, dic.linhasRenda);
      if (r.ok) {
        validas.push({ linha: l.numero, registro: r.registro });
        for (const a of r.avisos) ctx.problema(l.numero, a);
        c.avisos += r.avisos.length;
      } else {
        for (const p of r.problemas) ctx.problema(l.numero, p);
        c.rejeitados++;
      }
      // Staging: a linha bruta sem os documentos.
      const { cpf, nis, ...semDocumento } = campos;
      lote.push({
        carga_id: ctx.carga.id,
        linha: l.numero,
        dados: semDocumento,
        tem_cpf: (cpf ?? '').trim() !== '',
        tem_nis: (nis ?? '').trim() !== '',
        valida: r.ok,
      });
      if (lote.length >= 500) await gravarLote();
    }
    await gravarLote();

    await ctx.etapa('LIGACAO');
    const familias = new Map<string, LinhaValida[]>();
    for (const v of validas) {
      const lista = familias.get(v.registro.codigoFamiliar);
      if (lista) lista.push(v);
      else familias.set(v.registro.codigoFamiliar, [v]);
    }
    for (const [codigo, membros] of familias) {
      const resultados = await ctx.prisma.$transaction(
        (tx) => gravarFamilia(tx, codigo, membros, mes, ctx.carga.id, chaves),
        { timeout: 60_000 },
      );
      for (const res of resultados) {
        if (res.acao === 'NOVA') c.novos++;
        else if (res.acao === 'REVISAO') c.revisao++;
        else c.ligados++;
      }
      c.inseridos += membros.length;
      await ctx.progresso(c.inseridos);
    }

    await ctx.prisma.$executeRaw`
      DELETE FROM stg_cadunico.pessoa WHERE carga_id NOT IN (
        SELECT id FROM auditoria.log_carga WHERE fonte = 'CADUNICO'
        ORDER BY id DESC LIMIT ${CARGAS_NO_STAGING})`;
    return c;
  };
}

async function gravarFamilia(
  tx: Prisma.TransactionClient,
  codigoFamiliar: string,
  membros: LinhaValida[],
  mes: string,
  cargaId: number,
  chaves: { cifra: Buffer; hmac: Buffer },
): Promise<ResultadoLigacao[]> {
  const ligacao = new LigacaoPessoas(tx, chaves);
  const resultados: ResultadoLigacao[] = [];
  for (const { registro: r } of membros) {
    resultados.push(
      await ligacao.ligar({
        fonte: 'CADUNICO',
        idExterno: idExternoCadunico(r, chaves.hmac),
        cpf: r.cpf,
        nis: r.nis,
        nome: r.nome,
        nascimento: r.nascimento,
        mae: r.mae,
        sexo: r.sexo,
        cargaId,
      }),
    );
  }
  const familia = await tx.familia.upsert({
    where: { codigoFamiliar },
    create: { codigoFamiliar },
    update: {},
    select: { id: true },
  });
  const pessoas = new Set<number>();
  for (const [i, { registro }] of membros.entries()) {
    const pessoaId = (resultados[i] as ResultadoLigacao).pessoaId;
    if (pessoas.has(pessoaId)) continue;
    pessoas.add(pessoaId);
    await tx.membroFamilia.upsert({
      where: { familiaId_pessoaId: { familiaId: familia.id, pessoaId } },
      create: {
        familiaId: familia.id,
        pessoaId,
        papel: registro.papel,
        grauInstrucao: registro.grauInstrucao,
        sabeLer: registro.sabeLer,
      },
      // Escolaridade vazia no arquivo não apaga a que já existe.
      update: {
        papel: registro.papel,
        ...(registro.grauInstrucao ? { grauInstrucao: registro.grauInstrucao } : {}),
        ...(registro.sabeLer !== null ? { sabeLer: registro.sabeLer } : {}),
      },
    });
  }
  // Dados da família: do responsável familiar, ou do primeiro membro se o RF não veio.
  const rf = (membros.find((m) => m.registro.papel === 'RESPONSAVEL') ?? membros[0]) as LinhaValida;
  const retrato = {
    faixaRenda: rf.registro.faixaRenda,
    recebePbf: rf.registro.recebePbf,
    qtdMembros: rf.registro.qtdPessoas ?? pessoas.size,
    atualizadoEm: new Date(`${rf.registro.atualizadoEm ?? `${mes}-01`}T00:00:00Z`),
  };
  await tx.cadunicoFamilia.upsert({
    where: { familiaId_mesReferencia: { familiaId: familia.id, mesReferencia: mes } },
    create: { familiaId: familia.id, mesReferencia: mes, ...retrato },
    update: retrato,
  });
  return resultados;
}
