import {
  type AlunoCarga,
  type CamposEscolar,
  converterLinhaGestaoEscolar,
  converterLinhaSeduc,
  type DataISO,
  decodificar,
  detectarSeparador,
  type Dicionario,
  lerCsv,
  mapearCabecalho,
  mensagemColunasFaltando,
  type ProblemaLinha,
  type RegistroGestaoEscolar,
  type RegistroSeduc,
  type ResultadoEscolar,
  type SituacaoMatricula,
} from '@sii/shared';
import { LigacaoPessoas, type ResultadoLigacao } from '../../../api/src/pessoas/ligacao';
import type { Prisma } from '../banco';
import { type Contagens, type ProcessadorFonte, RejeicaoCarga } from './pipeline';

/**
 * Cargas da Educação (P10): gestão escolar (aluno × dia: matrícula na turma + frequência) e
 * SEDUC-RO (matrículas na rede estadual). Mesmo padrão do CadÚnico (ADR 0007):
 *
 * - staging `stg_<fonte>.linha` com a linha bruta **sem CPF**, só das 3 últimas cargas;
 * - cada aluno numa transação: `LigacaoPessoas.ligar` → turma → matrícula (pessoa, escola, ano) →
 *   `pessoa.escola_inep` (escopo da RLS do perfil ESCOLA) → frequência;
 * - idempotente: reenviar o arquivo não cria nada de novo, só regrava as situações.
 *
 * Frequência em dia que não é letivo no calendário da escola é ignorada com aviso: a regra das
 * 5 faltas conta pelo calendário (§4.1).
 */

type FonteEscolar = 'GESTAO_ESCOLAR' | 'SEDUC';
type Registro = RegistroGestaoEscolar | RegistroSeduc;

const SCHEMA: Record<FonteEscolar, string> = {
  GESTAO_ESCOLAR: 'stg_gestao_escolar',
  SEDUC: 'stg_seduc',
};
const CARGAS_NO_STAGING = 3;

interface Linha<R> {
  linha: number;
  registro: R;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dia = (s: string) => new Date(`${s}T00:00:00Z`);

const PROBLEMA_ESCOLA: ProblemaLinha = {
  campo: 'inep',
  mensagem: 'Escola não cadastrada no SII (confira o código INEP).',
  gravidade: 'ERRO',
};
const AVISO_DIA_NAO_LETIVO: ProblemaLinha = {
  campo: 'data',
  mensagem: 'Dia não letivo no calendário da escola: a frequência foi ignorada.',
  gravidade: 'AVISO',
};

export function criarProcessadorEscolar(
  fonte: FonteEscolar,
  dic: Dicionario,
  chaves: { cifra: Buffer; hmac: Buffer },
): ProcessadorFonte {
  const converter = (c: CamposEscolar): ResultadoEscolar<Registro> =>
    fonte === 'SEDUC' ? converterLinhaSeduc(c) : converterLinhaGestaoEscolar(c);
  const schema = SCHEMA[fonte];

  return async (ctx, arquivo) => {
    const mes = ctx.carga.mesReferencia;
    if (!mes)
      throw new RejeicaoCarga('A carga não tem mês de referência. Envie de novo informando o mês.');
    const anoCarga = Number(mes.slice(0, 4));

    await ctx.etapa('LAYOUT');
    const { texto, codificacao } = decodificar(arquivo);
    const fimCabecalho = texto.search(/\r?\n/);
    const separador = detectarSeparador(fimCabecalho < 0 ? texto : texto.slice(0, fimCabecalho));
    if (!separador)
      throw new RejeicaoCarga(
        'Não foi possível identificar o separador das colunas (; ou ,). Confira se o arquivo é o CSV exportado do sistema.',
      );
    const [cabecalho, ...dados] = lerCsv(texto, separador);
    const { mapa, faltando } = mapearCabecalho(cabecalho?.campos ?? [], dic);
    if (faltando.length > 0) throw new RejeicaoCarga(mensagemColunasFaltando(faltando, dic.fonte));
    if (dados.length === 0)
      throw new RejeicaoCarga('O arquivo só tem o cabeçalho, sem nenhuma linha de aluno.');

    await ctx.etapa('STAGING', {
      total: dados.length,
      codificacao,
      separador: separador === '\t' ? 'TAB' : separador,
    });
    await ctx.prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await ctx.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ${schema}.linha (
      carga_id integer NOT NULL, linha integer NOT NULL, dados jsonb NOT NULL,
      tem_cpf boolean NOT NULL, valida boolean NOT NULL, PRIMARY KEY (carga_id, linha))`);
    await ctx.prisma.$executeRawUnsafe(
      `DELETE FROM ${schema}.linha WHERE carga_id = $1`,
      ctx.carga.id,
    );

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
    const validas: Linha<Registro>[] = [];
    let lote: unknown[] = [];
    const gravarLote = async () => {
      if (lote.length === 0) return;
      await ctx.prisma.$executeRawUnsafe(
        `INSERT INTO ${schema}.linha (carga_id, linha, dados, tem_cpf, valida)
         SELECT carga_id, linha, dados, tem_cpf, valida FROM jsonb_to_recordset($1::jsonb)
           AS x(carga_id int, linha int, dados jsonb, tem_cpf boolean, valida boolean)`,
        JSON.stringify(lote),
      );
      lote = [];
    };
    for (const l of dados) {
      const campos: CamposEscolar = {};
      for (const [chave, i] of Object.entries(mapa)) {
        const v = l.campos[i];
        if (v !== undefined) campos[chave as keyof CamposEscolar] = v;
      }
      const r = converter(campos);
      if (r.ok) {
        validas.push({ linha: l.numero, registro: r.registro });
        for (const a of r.avisos) ctx.problema(l.numero, a);
        c.avisos += r.avisos.length;
      } else {
        for (const p of r.problemas) ctx.problema(l.numero, p);
        c.rejeitados++;
      }
      const { cpf, ...semCpf } = campos;
      lote.push({
        carga_id: ctx.carga.id,
        linha: l.numero,
        dados: semCpf,
        tem_cpf: (cpf ?? '').trim() !== '',
        valida: r.ok,
      });
      if (lote.length >= 500) await gravarLote();
    }
    await gravarLote();

    // Escolas e dias letivos (para a frequência).
    const escolas = new Map(
      (
        await ctx.prisma.escola.findMany({
          where: { inep: { in: [...new Set(validas.map((v) => v.registro.inep))] } },
          select: { id: true, inep: true },
        })
      ).map((e) => [e.inep, e.id]),
    );
    const letivos = new Set<string>();
    const datas = validas
      .map((v) => ('data' in v.registro ? v.registro.data : null))
      .filter((d): d is DataISO => d !== null)
      .sort();
    if (datas.length > 0) {
      const cal = await ctx.prisma.calendarioEscolar.findMany({
        where: {
          escolaId: { in: [...escolas.values()] },
          dia: { gte: dia(datas[0] as string), lte: dia(datas[datas.length - 1] as string) },
        },
        select: { escolaId: true, dia: true },
      });
      for (const d of cal) letivos.add(`${d.escolaId}|${iso(d.dia)}`);
    }

    await ctx.etapa('LIGACAO');
    const alunos = new Map<string, Linha<Registro>[]>();
    for (const v of validas) {
      if (!escolas.has(v.registro.inep)) {
        ctx.problema(v.linha, PROBLEMA_ESCOLA);
        c.rejeitados++;
        continue;
      }
      const chave = `${v.registro.inep}|${v.registro.codigoAluno}`;
      const lista = alunos.get(chave);
      if (lista) lista.push(v);
      else alunos.set(chave, [v]);
    }

    for (const linhas of alunos.values()) {
      const primeira = linhas[0] as Linha<Registro>;
      const escolaId = escolas.get(primeira.registro.inep) as number;
      const { resultado, ignoradas } = await ctx.prisma.$transaction(
        (tx) =>
          gravarAluno(tx, {
            fonte,
            linhas,
            escolaId,
            anoCarga,
            mesReferencia: mes,
            cargaId: ctx.carga.id,
            letivos,
            chaves,
          }),
        { timeout: 60_000 },
      );
      for (const n of ignoradas) ctx.problema(n, AVISO_DIA_NAO_LETIVO);
      c.avisos += ignoradas.length;
      if (resultado.acao === 'NOVA') c.novos++;
      else if (resultado.acao === 'REVISAO') c.revisao++;
      else c.ligados++;
      c.inseridos += linhas.length - ignoradas.length;
      await ctx.progresso(c.inseridos);
    }

    await ctx.prisma.$executeRawUnsafe(
      `DELETE FROM ${schema}.linha WHERE carga_id NOT IN (
         SELECT id FROM auditoria.log_carga WHERE fonte = $1 ORDER BY id DESC LIMIT $2)`,
      fonte,
      CARGAS_NO_STAGING,
    );
    return c;
  };
}

/** Dados do aluno: os da linha mais recente do arquivo. */
function dadosDoAluno(linhas: Linha<Registro>[]): AlunoCarga {
  return (linhas[linhas.length - 1] as Linha<Registro>).registro;
}

async function gravarAluno(
  tx: Prisma.TransactionClient,
  a: {
    fonte: FonteEscolar;
    linhas: Linha<Registro>[];
    escolaId: number;
    anoCarga: number;
    mesReferencia: string;
    cargaId: number;
    letivos: Set<string>;
    chaves: { cifra: Buffer; hmac: Buffer };
  },
): Promise<{ resultado: ResultadoLigacao; ignoradas: number[] }> {
  const aluno = dadosDoAluno(a.linhas);
  const resultado = await new LigacaoPessoas(tx, a.chaves).ligar({
    fonte: a.fonte,
    // O código do aluno no sistema de origem não é documento: fica como id do vínculo.
    idExterno: `${aluno.inep}-${aluno.codigoAluno}`,
    cpf: aluno.cpf,
    nome: aluno.nome,
    nascimento: aluno.nascimento,
    mae: aluno.mae,
    sexo: aluno.sexo,
    cargaId: a.cargaId,
  });
  const pessoaId = resultado.pessoaId;

  const datas = a.linhas
    .map((l) => ('data' in l.registro ? l.registro.data : null))
    .filter((d): d is DataISO => d !== null)
    .sort();
  const ano =
    datas.length > 0 ? Number((datas[datas.length - 1] as string).slice(0, 4)) : a.anoCarga;
  const situacao: SituacaoMatricula =
    'situacaoMatricula' in aluno ? (aluno as RegistroSeduc).situacaoMatricula : 'ATIVA';

  const turma = aluno.turma
    ? await tx.turma.upsert({
        where: { escolaId_ano_nome: { escolaId: a.escolaId, ano, nome: aluno.turma } },
        create: { escolaId: a.escolaId, ano, nome: aluno.turma },
        update: {},
        select: { id: true },
      })
    : null;
  const matricula = await tx.matricula.upsert({
    where: { pessoaId_escolaId_ano: { pessoaId, escolaId: a.escolaId, ano } },
    create: {
      pessoaId,
      escolaId: a.escolaId,
      ano,
      situacao,
      turmaId: turma?.id ?? null,
      inicioEm: dia(datas[0] ?? `${a.mesReferencia}-01`),
    },
    update: { situacao, ...(turma ? { turmaId: turma.id } : {}) },
    select: { id: true },
  });
  if (situacao === 'ATIVA')
    await tx.pessoaMestra.update({ where: { id: pessoaId }, data: { escolaInep: aluno.inep } });

  const ignoradas: number[] = [];
  // O mesmo dia repetido no arquivo: vale a última linha.
  const porDia = new Map<string, { matricula_id: number; dia: string; situacao: string }>();
  for (const l of a.linhas) {
    if (!('data' in l.registro) || !l.registro.data || !l.registro.situacao) continue;
    if (!a.letivos.has(`${a.escolaId}|${l.registro.data}`)) {
      ignoradas.push(l.linha);
      continue;
    }
    porDia.set(l.registro.data, {
      matricula_id: matricula.id,
      dia: l.registro.data,
      situacao: l.registro.situacao,
    });
  }
  const frequencias = [...porDia.values()];
  if (frequencias.length > 0)
    await tx.$executeRaw`
      INSERT INTO educacao.frequencia (matricula_id, dia, situacao, atualizado_em)
      SELECT x.matricula_id, x.dia, x.situacao::educacao."SituacaoFrequencia", now()
      FROM jsonb_to_recordset(${JSON.stringify(frequencias)}::jsonb)
        AS x(matricula_id int, dia date, situacao text)
      ON CONFLICT (matricula_id, dia) DO UPDATE
        SET situacao = EXCLUDED.situacao, lancado_por = NULL, atualizado_em = now()`;
  return { resultado, ignoradas };
}
