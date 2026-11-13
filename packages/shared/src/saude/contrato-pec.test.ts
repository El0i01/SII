import { describe, expect, it } from 'vitest';
import {
  ContratoPec,
  colunasDoContrato,
  mensagemEstruturaMudou,
  verificarEstrutura,
} from './contrato-pec';

const contrato = ContratoPec.parse({
  versaoTestada: '5.x (a confirmar)',
  tabelas: {
    cidadao: {
      tabela: 'tb_cidadao',
      colunas: {
        id: 'co_seq_cidadao',
        nome: 'no_cidadao',
        mae: 'no_mae',
        nascimento: 'dt_nascimento',
        sexo: 'no_sexo',
        cpf: 'nu_cpf',
        cns: 'nu_cns',
        ativo: 'st_ativo',
        atualizado: 'dt_atualizado',
      },
    },
    fatCidadao: {
      tabela: 'tb_fat_cidadao_pec',
      colunas: { id: 'co_seq_fat_cidadao_pec', cidadao: 'co_cidadao' },
    },
    cadIndividual: {
      tabela: 'tb_fat_cad_individual',
      colunas: {
        fatCidadao: 'co_fat_cidadao_pec',
        tempo: 'co_dim_tempo',
        microarea: 'nu_micro_area',
        unidade: 'co_dim_unidade_saude',
        profissional: 'co_dim_profissional',
        gestante: 'st_gestante',
        acamado: 'st_acamado',
        domiciliado: 'st_domiciliado',
      },
    },
    cadDomiciliar: {
      tabela: 'tb_fat_cad_domiciliar',
      colunas: {
        id: 'co_seq_fat_cad_domiciliar',
        tempo: 'co_dim_tempo',
        microarea: 'nu_micro_area',
        unidade: 'co_dim_unidade_saude',
        latitude: 'nu_latitude',
        longitude: 'nu_longitude',
      },
    },
    visita: {
      tabela: 'tb_fat_visita_domiciliar',
      colunas: {
        fatCidadao: 'co_fat_cidadao_pec',
        tempo: 'co_dim_tempo',
        profissional: 'co_dim_profissional',
      },
    },
    atendimento: {
      tabela: 'tb_fat_atendimento_individual',
      colunas: { fatCidadao: 'co_fat_cidadao_pec', tempo: 'co_dim_tempo' },
    },
    vacinacao: {
      tabela: 'tb_fat_vacinacao',
      colunas: {
        fatCidadao: 'co_fat_cidadao_pec',
        tempo: 'co_dim_tempo',
        imunobiologico: 'co_dim_imunobiologico',
      },
    },
    unidade: {
      tabela: 'tb_dim_unidade_saude',
      colunas: { id: 'co_seq_dim_unidade_saude', cnes: 'nu_cnes' },
    },
    profissional: {
      tabela: 'tb_dim_profissional',
      colunas: { id: 'co_seq_dim_profissional', nome: 'no_profissional' },
    },
  },
  colunasCronicas: ['st_hipertensao_arterial', 'st_diabete'],
  imunobiologicosGripe: ['33'],
});

function estruturaCompleta(): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const [tabela, colunas] of colunasDoContrato(contrato)) m.set(tabela, new Set(colunas));
  return m;
}

describe('contrato do PEC', () => {
  it('lista as colunas usadas por tabela, incluindo as de condição crônica', () => {
    const cols = colunasDoContrato(contrato);
    expect(cols.get('tb_cidadao')).toContain('dt_atualizado');
    expect(cols.get('tb_fat_cad_individual')).toEqual(
      expect.arrayContaining(['st_acamado', 'st_hipertensao_arterial', 'st_diabete']),
    );
    expect(cols.size).toBe(9);
  });

  it('recusa nome de tabela ou coluna que não seja identificador simples (evita SQL injetado)', () => {
    const ruim = structuredClone(contrato) as Record<string, unknown> & typeof contrato;
    ruim.tabelas.cidadao.colunas.nome = 'no_cidadao; drop table x';
    expect(ContratoPec.safeParse(ruim).success).toBe(false);
    const ruim2 = { ...contrato, colunasCronicas: ['St_Maiuscula'] };
    expect(ContratoPec.safeParse(ruim2).success).toBe(false);
  });

  it('recusa contrato sem uma das tabelas', () => {
    const { visita: _v, ...resto } = contrato.tabelas;
    expect(ContratoPec.safeParse({ ...contrato, tabelas: resto }).success).toBe(false);
  });

  it('estrutura completa: nada faltando', () => {
    expect(verificarEstrutura(contrato, estruturaCompleta())).toEqual({ faltando: [] });
  });

  it('aponta coluna que sumiu e tabela inteira que sumiu, em ordem', () => {
    const e = estruturaCompleta();
    e.get('tb_cidadao')?.delete('dt_atualizado');
    e.get('tb_fat_cad_individual')?.delete('st_diabete');
    e.delete('tb_fat_vacinacao');
    expect(verificarEstrutura(contrato, e).faltando).toEqual([
      'tb_cidadao.dt_atualizado',
      'tb_fat_cad_individual.st_diabete',
      'tb_fat_vacinacao (tabela inteira)',
    ]);
  });

  it('mensagem cita o que falta, diz que nada foi gravado e corta listas longas', () => {
    const m = mensagemEstruturaMudou(['tb_cidadao.dt_atualizado']);
    expect(m).toContain('A estrutura do banco do e-SUS mudou');
    expect(m).toContain('tb_cidadao.dt_atualizado');
    expect(m).toContain('Nada foi gravado');
    const longa = mensagemEstruturaMudou(Array.from({ length: 14 }, (_, i) => `t.c${i}`));
    expect(longa).toContain('t.c9');
    expect(longa).not.toContain('t.c10');
    expect(longa).toContain('e mais 4');
  });
});
