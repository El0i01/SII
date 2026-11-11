/**
 * Ligação de registros das fontes à PessoaMestra (§3.3, P07). Sem Nest: o seed, a API e o worker
 * (cargas, P08) usam do mesmo jeito. Roda como dono do banco (cargas não passam pela RLS).
 *
 * Ordem: hash do CPF → hash do CNS/NIS → candidatos por nome (pg_trgm) pontuados pelo shared.
 * Nunca compara documento em texto: o CPF do candidato não é decifrado, só o hash é comparado.
 */
import {
  type Avaliacao,
  type DataISO,
  decidirLigacao,
  type DadosIdentidade,
  normalizarNomePessoa,
  pontuarCandidato,
} from '@sii/shared';
import {
  DocumentoInvalido,
  protegerDocumento,
  type DocumentoProtegido,
  type TipoDocumento,
} from '../cripto/cifra';
import type { FonteVinculo, Prisma, RegraVinculo } from '../generated/prisma/client';

type Tx = Prisma.TransactionClient;

export interface RegistroFonte {
  fonte: FonteVinculo;
  idExterno: string;
  cpf?: string | null;
  cns?: string | null;
  nis?: string | null;
  nome: string;
  nascimento: DataISO | null;
  mae: string | null;
  sexo?: 'FEMININO' | 'MASCULINO' | null;
  /** Colunas de escopo (RLS) para preencher na pessoa, quando estiverem vazias. */
  escopo?: {
    setorCodigo?: string | null;
    microarea?: string | null;
    escolaInep?: string | null;
    crasCodigo?: string | null;
    familiaPcf?: string | null;
  };
  /** Dado fictício do seed: a pessoa criada leva a regra SEED (o seed só limpa o que criou). */
  doSeed?: boolean;
}

export interface ResultadoLigacao {
  pessoaId: number;
  acao: 'LIGADA' | 'NOVA' | 'REVISAO' | 'JA_LIGADA';
  regra: RegraVinculo;
  confianca: number;
  revisoes: number[];
}

const bytes = (b: Buffer): Uint8Array<ArrayBuffer> => new Uint8Array(b);
const hex = (b: Uint8Array | null) => (b ? Buffer.from(b).toString('hex') : null);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Documento inválido (tamanho errado) é tratado como ausente: não liga e não é gravado. */
function proteger(
  tipo: TipoDocumento,
  valor: string | null | undefined,
  chaves: { cifra: Buffer; hmac: Buffer },
) {
  if (!valor) return null;
  try {
    return protegerDocumento(tipo, valor, chaves);
  } catch (e) {
    if (e instanceof DocumentoInvalido) return null;
    throw e;
  }
}

/** Troca o último dígito: um "CPF" garantidamente diferente, para o shared descartar o candidato. */
const cpfDiferente = (cpf: string) => {
  const d = cpf.replace(/\D/g, '');
  return d.slice(0, -1) + ((Number(d.at(-1)) + 1) % 10);
};

export class LigacaoPessoas {
  constructor(
    private readonly db: Tx,
    private readonly chaves: { cifra: Buffer; hmac: Buffer },
  ) {}

  async ligar(r: RegistroFonte): Promise<ResultadoLigacao> {
    const existente = await this.db.vinculoFonte.findUnique({
      where: { fonte_idExterno: { fonte: r.fonte, idExterno: r.idExterno } },
      select: { pessoaId: true, regra: true, confianca: true },
    });
    if (existente) {
      return {
        pessoaId: existente.pessoaId,
        acao: 'JA_LIGADA',
        regra: existente.regra,
        confianca: Number(existente.confianca),
        revisoes: [],
      };
    }

    const docs = {
      cpf: proteger('CPF', r.cpf, this.chaves),
      nis: proteger('NIS', r.nis, this.chaves),
      cns: proteger('CNS', r.cns, this.chaves),
    };
    const candidatos = await this.buscarCandidatos(r, docs);
    const registro: DadosIdentidade = {
      cpf: docs.cpf ? (r.cpf as string) : null,
      cns: docs.cns ? (r.cns as string) : null,
      nis: docs.nis ? (r.nis as string) : null,
      nome: r.nome,
      nascimento: r.nascimento,
      mae: r.mae,
    };
    const avaliacoes: Avaliacao[] = candidatos.map((c) =>
      pontuarCandidato(registro, {
        // Compara documentos pelo hash: igual → mesmo valor do registro; diferente → valor distinto.
        cpf: c.cpfHash
          ? hex(c.cpfHash) === hex(docs.cpf?.hash ?? null)
            ? registro.cpf
            : registro.cpf
              ? cpfDiferente(registro.cpf)
              : '00000000000'
          : null,
        cns: c.cnsHash && hex(c.cnsHash) === hex(docs.cns?.hash ?? null) ? registro.cns : null,
        nis: c.nisHash && hex(c.nisHash) === hex(docs.nis?.hash ?? null) ? registro.nis : null,
        nome: c.nome,
        nascimento: iso(c.dataNascimento),
        mae: c.nomeMae,
      }),
    );
    const decisao = decidirLigacao(avaliacoes);

    if (decisao.acao === 'LIGAR') {
      const alvo = candidatos[decisao.indice] as (typeof candidatos)[number];
      await this.completarPessoa(alvo.id, r, docs);
      await this.criarVinculo(alvo.id, r, decisao.regra, decisao.confianca);
      if (decisao.regra === 'NOME_NASCIMENTO_MAE') {
        await this.db.eventoIdentidade.create({
          data: {
            tipo: 'LIGACAO_AUTOMATICA',
            pessoaId: alvo.id,
            motivo: `${r.fonte} ${r.idExterno} ligado por nome, nascimento e mãe`,
          },
        });
      }
      return {
        pessoaId: alvo.id,
        acao: 'LIGADA',
        regra: decisao.regra,
        confianca: decisao.confianca,
        revisoes: [],
      };
    }

    const nova = await this.criarPessoa(r, docs);
    const regra: RegraVinculo = r.doSeed ? 'SEED' : 'ORIGEM';
    await this.criarVinculo(nova, r, regra, 1);
    if (decisao.acao === 'NOVA')
      return { pessoaId: nova, acao: 'NOVA', regra, confianca: 1, revisoes: [] };

    const revisoes: number[] = [];
    for (const c of decisao.candidatos) {
      const rev = await this.db.revisaoVinculo.create({
        data: {
          pessoaAId: (candidatos[c.indice] as (typeof candidatos)[number]).id,
          pessoaBId: nova,
          similaridade: c.pontuacao,
        },
        select: { id: true },
      });
      revisoes.push(rev.id);
    }
    return { pessoaId: nova, acao: 'REVISAO', regra, confianca: 1, revisoes };
  }

  private async buscarCandidatos(
    r: RegistroFonte,
    docs: {
      cpf: DocumentoProtegido | null;
      nis: DocumentoProtegido | null;
      cns: DocumentoProtegido | null;
    },
  ) {
    const selecao = {
      id: true,
      nome: true,
      dataNascimento: true,
      nomeMae: true,
      cpfHash: true,
      nisHash: true,
      cnsHash: true,
    } as const;
    const porDocumento = await this.db.pessoaMestra.findMany({
      where: {
        OR: [
          ...(docs.cpf ? [{ cpfHash: bytes(docs.cpf.hash) }] : []),
          ...(docs.nis ? [{ nisHash: bytes(docs.nis.hash) }] : []),
          ...(docs.cns ? [{ cnsHash: bytes(docs.cns.hash) }] : []),
        ],
      },
      select: selecao,
    });
    // CPF bate: não precisa procurar por nome.
    if (docs.cpf && porDocumento.some((p) => hex(p.cpfHash) === hex(docs.cpf?.hash ?? null)))
      return porDocumento;

    const nome = normalizarNomePessoa(r.nome);
    const ids = r.nascimento
      ? await this.db.$queryRaw<{ id: number }[]>`
          SELECT id FROM pessoas.pessoa_mestra
          WHERE (data_nascimento BETWEEN ${r.nascimento}::date - 31 AND ${r.nascimento}::date + 31
                 OR data_nascimento = make_date(extract(year from ${r.nascimento}::date)::int,
                                                least(extract(day from ${r.nascimento}::date)::int, 12),
                                                extract(month from ${r.nascimento}::date)::int))
            AND similarity(nome_normalizado, ${nome}) >= 0.4
          ORDER BY similarity(nome_normalizado, ${nome}) DESC
          LIMIT 20`
      : await this.db.$queryRaw<{ id: number }[]>`
          SELECT id FROM pessoas.pessoa_mestra WHERE similarity(nome_normalizado, ${nome}) >= 0.6
          ORDER BY similarity(nome_normalizado, ${nome}) DESC LIMIT 20`;
    const jaTem = new Set(porDocumento.map((p) => p.id));
    const porNome = await this.db.pessoaMestra.findMany({
      where: { id: { in: ids.map((i) => i.id).filter((id) => !jaTem.has(id)) } },
      select: selecao,
    });
    return [...porDocumento, ...porNome];
  }

  private dadosOrigem(r: RegistroFonte) {
    return { nome: r.nome, nascimento: r.nascimento, mae: r.mae, sexo: r.sexo ?? null };
  }

  private async criarVinculo(
    pessoaId: number,
    r: RegistroFonte,
    regra: RegraVinculo,
    confianca: number,
  ) {
    await this.db.vinculoFonte.create({
      data: {
        pessoaId,
        fonte: r.fonte,
        idExterno: r.idExterno,
        regra,
        confianca,
        dados: this.dadosOrigem(r),
      },
    });
  }

  private async criarPessoa(
    r: RegistroFonte,
    docs: {
      cpf: DocumentoProtegido | null;
      nis: DocumentoProtegido | null;
      cns: DocumentoProtegido | null;
    },
  ): Promise<number> {
    const p = await this.db.pessoaMestra.create({
      data: {
        nome: r.nome,
        nomeNormalizado: normalizarNomePessoa(r.nome),
        dataNascimento: r.nascimento ? new Date(`${r.nascimento}T00:00:00Z`) : null,
        nomeMae: r.mae,
        sexo: r.sexo ?? null,
        cpfCifrado: docs.cpf ? bytes(docs.cpf.cifrado) : null,
        cpfHash: docs.cpf ? bytes(docs.cpf.hash) : null,
        nisCifrado: docs.nis ? bytes(docs.nis.cifrado) : null,
        nisHash: docs.nis ? bytes(docs.nis.hash) : null,
        cnsCifrado: docs.cns ? bytes(docs.cns.cifrado) : null,
        cnsHash: docs.cns ? bytes(docs.cns.hash) : null,
        setorCodigo: r.escopo?.setorCodigo ?? null,
        microarea: r.escopo?.microarea ?? null,
        escolaInep: r.escopo?.escolaInep ?? null,
        crasCodigo: r.escopo?.crasCodigo ?? null,
        familiaPcf: r.escopo?.familiaPcf ?? null,
      },
      select: { id: true },
    });
    return p.id;
  }

  /** Preenche só o que está vazio na pessoa; nunca sobrescreve documento nem dado já existente. */
  private async completarPessoa(
    pessoaId: number,
    r: RegistroFonte,
    docs: {
      cpf: DocumentoProtegido | null;
      nis: DocumentoProtegido | null;
      cns: DocumentoProtegido | null;
    },
  ) {
    const p = await this.db.pessoaMestra.findUniqueOrThrow({ where: { id: pessoaId } });
    const dados: Prisma.PessoaMestraUpdateInput = {};
    for (const [tipo, d] of [
      ['cpf', docs.cpf],
      ['nis', docs.nis],
      ['cns', docs.cns],
    ] as const) {
      if (!d || p[`${tipo}Hash`]) continue;
      // O hash é único: se outra pessoa já tem esse documento, não completa (vai para revisão manual
      // numa próxima ligação, pelo conflito de CPF).
      const outro = await this.db.pessoaMestra.findFirst({
        where: { [`${tipo}Hash`]: bytes(d.hash) },
        select: { id: true },
      });
      if (outro) continue;
      Object.assign(dados, {
        [`${tipo}Cifrado`]: bytes(d.cifrado),
        [`${tipo}Hash`]: bytes(d.hash),
      });
    }
    if (!p.dataNascimento && r.nascimento)
      dados.dataNascimento = new Date(`${r.nascimento}T00:00:00Z`);
    if (!p.nomeMae && r.mae) dados.nomeMae = r.mae;
    if (!p.sexo && r.sexo) dados.sexo = r.sexo;
    for (const k of [
      'setorCodigo',
      'microarea',
      'escolaInep',
      'crasCodigo',
      'familiaPcf',
    ] as const) {
      const v = r.escopo?.[k];
      if (!p[k] && v) Object.assign(dados, { [k]: v });
    }
    if (Object.keys(dados).length)
      await this.db.pessoaMestra.update({ where: { id: pessoaId }, data: dados });
  }
}
