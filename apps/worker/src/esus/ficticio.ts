import { adicionarDias, type DataISO, tempoDeDia } from '@sii/shared';
import type { Pool, PoolClient } from 'pg';
import { cpfValido, NOMES_F, NOMES_M, rng, SOBRENOMES } from '../cargas/ficticio';

/**
 * PEC fictício para o teste de integração e para desenvolvimento (P09). Só dados inventados
 * (CLAUDE.md: dado real nunca entra no repositório).
 *
 * O schema mínimo segue os nomes do `config/esus/contrato.json` e tem **colunas-isca** com
 * "CID" (`co_cid10_isca`): o teste confere que nada delas chega ao SII.
 */
export const SCHEMA_MINIMO_PEC = `
CREATE TABLE tb_cidadao (
  co_seq_cidadao bigint PRIMARY KEY,
  no_cidadao varchar(200),
  no_mae varchar(200),
  dt_nascimento date,
  no_sexo varchar(20),
  nu_cpf varchar(11),
  nu_cns varchar(15),
  st_ativo integer NOT NULL DEFAULT 1,
  dt_atualizado timestamp NOT NULL DEFAULT now()
);
CREATE TABLE tb_fat_cidadao_pec (
  co_seq_fat_cidadao_pec bigint PRIMARY KEY,
  co_cidadao bigint NOT NULL
);
CREATE TABLE tb_dim_unidade_saude (co_seq_dim_unidade_saude bigint PRIMARY KEY, nu_cnes varchar(7));
CREATE TABLE tb_dim_profissional (co_seq_dim_profissional bigint PRIMARY KEY, no_profissional varchar(200));
CREATE TABLE tb_fat_cad_individual (
  co_seq_fat_cad_individual bigserial PRIMARY KEY,
  co_fat_cidadao_pec bigint NOT NULL,
  co_dim_tempo integer NOT NULL,
  nu_micro_area varchar(2),
  co_dim_unidade_saude bigint,
  co_dim_profissional bigint,
  st_gestante integer, st_acamado integer, st_domiciliado integer,
  st_hipertensao_arterial integer, st_diabete integer, st_doenca_cardiaca integer,
  st_doenca_respiratoria integer, st_problema_rins integer,
  co_cid10_isca varchar(20)
);
CREATE TABLE tb_fat_cad_domiciliar (
  co_seq_fat_cad_domiciliar bigint PRIMARY KEY,
  co_dim_tempo integer NOT NULL,
  nu_micro_area varchar(2),
  co_dim_unidade_saude bigint,
  nu_latitude numeric(10,7),
  nu_longitude numeric(10,7)
);
CREATE TABLE tb_fat_visita_domiciliar (
  co_fat_cidadao_pec bigint NOT NULL, co_dim_tempo integer NOT NULL, co_dim_profissional bigint
);
CREATE TABLE tb_fat_atendimento_individual (
  co_fat_cidadao_pec bigint NOT NULL, co_dim_tempo integer NOT NULL, co_cid10_isca varchar(20)
);
CREATE TABLE tb_fat_vacinacao (
  co_fat_cidadao_pec bigint NOT NULL, co_dim_tempo integer NOT NULL, co_dim_imunobiologico integer
);
`;

/** Valor das colunas-isca: não pode aparecer em lugar nenhum do SII. */
export const ISCA_CID = 'J45-ISCA';
export const CNES_FICTICIO = '7327862';
/** Código da influenza no contrato padrão. */
const GRIPE = 33;
const OUTRA_VACINA = 7;

export interface CasoConhecido {
  /** co_seq_cidadao */
  id: number;
  descricao: string;
}

export interface PecFicticio {
  /** Cidadãos ativos com nome e nascimento (os que a carga liga). */
  validos: number;
  /** Ativos sem nascimento (rejeitados pela carga). */
  semNascimento: number;
  inativos: number;
  linhasPorTabela: Record<string, number>;
  cpfs: string[];
  cnss: string[];
  casos: {
    idosoSemGripeCronicoAcompanhado: number;
    idosoComGripeAcamado: number;
    cronicoSemConsultaMicroareaSemConversao: number;
    soVisita: number;
    cpfInvalido: number;
    semNascimento: number;
    inativo: number;
  };
}

const tempo = (hoje: DataISO, dias: number) => tempoDeDia(adicionarDias(hoje, -dias));

function cnsFicticio(r: () => number): string {
  return `7${Array.from({ length: 14 }, () => Math.floor(r() * 10)).join('')}`;
}

/**
 * Fatos aleatórios ficam sempre até ontem: o teste incremental controla o que acontece "hoje".
 *
 * Cria as tabelas (no schema atual da conexão) e insere `n` cidadãos fictícios. Os sete primeiros
 * são casos conhecidos que o teste confere um a um.
 */
export async function popularPecFicticio(
  db: Pool | PoolClient,
  opcoes: { n?: number; semente?: number; hoje: DataISO },
): Promise<PecFicticio> {
  const n = opcoes.n ?? 300;
  const r = rng(opcoes.semente ?? 9);
  const hoje = opcoes.hoje;
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)] as T;

  await db.query(SCHEMA_MINIMO_PEC);
  await db.query(
    `INSERT INTO tb_dim_unidade_saude VALUES (1, '${CNES_FICTICIO}'), (2, '2899418');
     INSERT INTO tb_dim_profissional VALUES (1, 'ACS Fictícia Um'), (2, 'ACS Fictício Dois');`,
  );

  const cidadaos: Record<string, unknown>[] = [];
  const fatCid: Record<string, unknown>[] = [];
  const cad: Record<string, unknown>[] = [];
  const visitas: Record<string, unknown>[] = [];
  const atend: Record<string, unknown>[] = [];
  const vacinas: Record<string, unknown>[] = [];
  const cpfs: string[] = [];
  const cnss: string[] = [];
  let validos = 0;
  let semNascimento = 0;
  let inativos = 0;

  for (let id = 1; id <= n; id++) {
    const fem = r() < 0.5;
    // Sobrenome "Pecficticio" afasta a ligação com as pessoas do seed.
    const nome = `${pick(fem ? NOMES_F : NOMES_M)} ${pick(SOBRENOMES)} Pecficticio`;
    let idade = Math.floor(r() * 90);
    if (id === 1) idade = 70;
    if (id === 2) idade = 65;
    if (id === 3) idade = 45;
    const nascimento =
      id === 6 ? null : adicionarDias(hoje, -(idade * 365 + Math.floor(r() * 300) + 30));
    let cpf: string | null = r() < 0.7 ? cpfValido(r) : null;
    if (id === 5) cpf = '12345678900';
    const cns = r() < 0.8 ? cnsFicticio(r) : null;
    if (cpf) cpfs.push(cpf);
    if (cns) cnss.push(cns);
    const ativo = id === 7 ? 0 : 1;
    if (!ativo) inativos++;
    else if (!nascimento) semNascimento++;
    else validos++;
    cidadaos.push({
      co_seq_cidadao: id,
      no_cidadao: nome,
      no_mae: `${pick(NOMES_F)} ${pick(SOBRENOMES)} Pecficticio`,
      dt_nascimento: nascimento,
      no_sexo: fem ? 'FEMININO' : 'MASCULINO',
      nu_cpf: cpf,
      nu_cns: cns,
      st_ativo: ativo,
      dt_atualizado: '2026-01-01T00:00:00',
    });
    const fc = 1000 + id;
    fatCid.push({ co_seq_fat_cidadao_pec: fc, co_cidadao: id });

    const comCadastro = id !== 4 && (id <= 7 || r() < 0.9);
    if (comCadastro) {
      const cronico = id === 1 || id === 3 || (id > 7 && r() < 0.25);
      cad.push({
        co_fat_cidadao_pec: fc,
        co_dim_tempo: tempo(hoje, 400),
        nu_micro_area: '01',
        co_dim_unidade_saude: 1,
        co_dim_profissional: 2,
      });
      cad.push({
        co_fat_cidadao_pec: fc,
        co_dim_tempo: tempo(hoje, 60 + Math.floor(r() * 200)),
        nu_micro_area: id === 3 ? '09' : pick(['04', '05']),
        co_dim_unidade_saude: 1,
        co_dim_profissional: 1,
        st_gestante: fem && idade > 15 && idade < 45 && r() < 0.1 ? 1 : 0,
        st_acamado: id === 2 || (id > 7 && r() < 0.05) ? 1 : 0,
        st_domiciliado: 0,
        st_hipertensao_arterial: cronico ? 1 : 0,
        st_diabete: id === 1 ? 1 : 0,
        st_doenca_cardiaca: 0,
        st_doenca_respiratoria: 0,
        st_problema_rins: 0,
        co_cid10_isca: cronico ? ISCA_CID : null,
      });
    }
    if (id === 4 || r() < 0.6)
      visitas.push({
        co_fat_cidadao_pec: fc,
        co_dim_tempo: tempo(hoje, id === 4 ? 20 : 1 + Math.floor(r() * 200)),
        co_dim_profissional: 1,
      });
    if (id === 1)
      atend.push({
        co_fat_cidadao_pec: fc,
        co_dim_tempo: tempo(hoje, 30),
        co_cid10_isca: ISCA_CID,
      });
    else if (id === 3)
      atend.push({
        co_fat_cidadao_pec: fc,
        co_dim_tempo: tempo(hoje, 300),
        co_cid10_isca: ISCA_CID,
      });
    else if (r() < 0.5)
      atend.push({
        co_fat_cidadao_pec: fc,
        co_dim_tempo: tempo(hoje, 1 + Math.floor(r() * 365)),
        co_cid10_isca: ISCA_CID,
      });
    if (id === 1)
      vacinas.push({
        co_fat_cidadao_pec: fc,
        co_dim_tempo: tempo(hoje, 30),
        co_dim_imunobiologico: OUTRA_VACINA,
      });
    else if (id === 2)
      vacinas.push({
        co_fat_cidadao_pec: fc,
        co_dim_tempo: tempo(hoje, 60),
        co_dim_imunobiologico: GRIPE,
      });
    else if (r() < 0.4)
      vacinas.push({
        co_fat_cidadao_pec: fc,
        co_dim_tempo: tempo(hoje, 1 + Math.floor(r() * 500)),
        co_dim_imunobiologico: r() < 0.5 ? GRIPE : OUTRA_VACINA,
      });
  }

  const domicilios = Array.from({ length: Math.ceil(n / 3) }, (_, i) => ({
    co_seq_fat_cad_domiciliar: i + 1,
    co_dim_tempo: tempo(hoje, 100),
    nu_micro_area: pick(['04', '05']),
    co_dim_unidade_saude: 1,
    nu_latitude: -9.19 + r() * 0.02,
    nu_longitude: -63.18 + r() * 0.02,
  }));

  const inserir = (tabela: string, linhas: Record<string, unknown>[]) =>
    linhas.length
      ? db.query(
          `INSERT INTO ${tabela} SELECT * FROM json_populate_recordset(null::${tabela}, $1::json)`,
          [JSON.stringify(linhas)],
        )
      : Promise.resolve();
  await inserir('tb_cidadao', cidadaos);
  await inserir('tb_fat_cidadao_pec', fatCid);
  // bigserial: a ordem de inserção define o cadastro mais recente só pelo co_dim_tempo.
  await db.query(
    `INSERT INTO tb_fat_cad_individual (co_fat_cidadao_pec, co_dim_tempo, nu_micro_area,
       co_dim_unidade_saude, co_dim_profissional, st_gestante, st_acamado, st_domiciliado,
       st_hipertensao_arterial, st_diabete, st_doenca_cardiaca, st_doenca_respiratoria,
       st_problema_rins, co_cid10_isca)
     SELECT co_fat_cidadao_pec, co_dim_tempo, nu_micro_area, co_dim_unidade_saude,
       co_dim_profissional, st_gestante, st_acamado, st_domiciliado, st_hipertensao_arterial,
       st_diabete, st_doenca_cardiaca, st_doenca_respiratoria, st_problema_rins, co_cid10_isca
       FROM json_populate_recordset(null::tb_fat_cad_individual, $1::json)`,
    [JSON.stringify(cad)],
  );
  await inserir('tb_fat_cad_domiciliar', domicilios);
  await inserir('tb_fat_visita_domiciliar', visitas);
  await inserir('tb_fat_atendimento_individual', atend);
  await inserir('tb_fat_vacinacao', vacinas);

  return {
    validos,
    semNascimento,
    inativos,
    linhasPorTabela: {
      tb_cidadao: cidadaos.length,
      tb_fat_cidadao_pec: fatCid.length,
      tb_fat_cad_individual: cad.length,
      tb_fat_cad_domiciliar: domicilios.length,
      tb_fat_visita_domiciliar: visitas.length,
      tb_fat_atendimento_individual: atend.length,
      tb_fat_vacinacao: vacinas.length,
      tb_dim_unidade_saude: 2,
      tb_dim_profissional: 2,
    },
    cpfs,
    cnss,
    casos: {
      idosoSemGripeCronicoAcompanhado: 1,
      idosoComGripeAcamado: 2,
      cronicoSemConsultaMicroareaSemConversao: 3,
      soVisita: 4,
      cpfInvalido: 5,
      semNascimento: 6,
      inativo: 7,
    },
  };
}
