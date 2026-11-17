import type { DataISO } from '../calendario/dias';
import type { SituacaoFrequencia } from '../educacao/frequencia';
import { normalizarNomePessoa } from '../pessoas/similaridade';
import type { ProblemaLinha } from './cadunico';
import { lerData, normalizarCpf } from './documentos';

/**
 * Conversão das linhas das cargas da Educação (P10): gestão escolar (matrícula + frequência por dia)
 * e SEDUC-RO (matrículas na rede estadual). O layout é próprio do SII até a SEMED definir o sistema
 * de gestão (§9); os nomes de coluna ficam nos dicionários do worker. Mensagens fixas, sem valor.
 */

export const SITUACOES_MATRICULA = ['ATIVA', 'TRANSFERIDA', 'ABANDONO', 'CONCLUIDA'] as const;
export type SituacaoMatricula = (typeof SITUACOES_MATRICULA)[number];

/** Dados do aluno comuns às duas fontes. */
export interface AlunoCarga {
  inep: string;
  turma: string | null;
  /** Código do aluno no sistema de origem (id do vínculo da fonte). */
  codigoAluno: string;
  nome: string;
  nascimento: DataISO;
  mae: string | null;
  cpf: string | null;
  sexo: 'FEMININO' | 'MASCULINO' | null;
}

export interface RegistroGestaoEscolar extends AlunoCarga {
  /** Linha só de matrícula quando não há data. */
  data: DataISO | null;
  situacao: SituacaoFrequencia | null;
}

export interface RegistroSeduc extends AlunoCarga {
  situacaoMatricula: SituacaoMatricula;
}

type Campo =
  | 'inep'
  | 'turma'
  | 'codigoAluno'
  | 'nome'
  | 'nascimento'
  | 'mae'
  | 'cpf'
  | 'sexo'
  | 'data'
  | 'situacao'
  | 'situacaoMatricula';
export type CamposEscolar = Partial<Record<Campo, string>>;

export type ResultadoEscolar<R> =
  { ok: true; registro: R; avisos: ProblemaLinha[] } | { ok: false; problemas: ProblemaLinha[] };

const limpar = (v: string | undefined) => (v ?? '').trim().replace(/\s+/g, ' ');

/** P/F/J, PRESENTE/FALTA/JUSTIFICADA ou 1/0 (presença). Desconhecido → null. */
export function lerSituacaoFrequencia(valor: string | undefined): SituacaoFrequencia | null {
  const v = limpar(valor).toUpperCase();
  if (['P', 'PRESENTE', 'C', 'COMPARECEU', '1'].includes(v)) return 'PRESENTE';
  if (['F', 'FALTA', 'AUSENTE', '0'].includes(v)) return 'FALTA';
  if (['J', 'JUSTIFICADA', 'FALTA JUSTIFICADA', 'FJ'].includes(v)) return 'JUSTIFICADA';
  return null;
}

/** Situação da matrícula; vazio é ATIVA. Desconhecida → null. */
export function lerSituacaoMatricula(valor: string | undefined): SituacaoMatricula | null {
  const v = limpar(valor).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (v === '' || ['ATIVA', 'CURSANDO', 'MATRICULADO', 'MATRICULADA'].includes(v)) return 'ATIVA';
  if (['TRANSFERIDA', 'TRANSFERIDO'].includes(v)) return 'TRANSFERIDA';
  if (['ABANDONO', 'DEIXOU DE FREQUENTAR'].includes(v)) return 'ABANDONO';
  if (['CONCLUIDA', 'CONCLUIDO', 'APROVADO', 'REPROVADO'].includes(v)) return 'CONCLUIDA';
  return null;
}

function sexo(valor: string | undefined): 'FEMININO' | 'MASCULINO' | null {
  const v = limpar(valor).toUpperCase();
  if (v === 'M' || v === 'MASCULINO' || v === '1') return 'MASCULINO';
  if (v === 'F' || v === 'FEMININO' || v === '2') return 'FEMININO';
  return null;
}

function converterAluno(c: CamposEscolar): {
  aluno: AlunoCarga | null;
  erros: ProblemaLinha[];
  avisos: ProblemaLinha[];
} {
  const erros: ProblemaLinha[] = [];
  const avisos: ProblemaLinha[] = [];
  const erro = (campo: string, mensagem: string) =>
    erros.push({ campo, mensagem, gravidade: 'ERRO' });

  const inep = (c.inep ?? '').replace(/\D/g, '');
  if (inep.length !== 8) erro('inep', 'Código INEP da escola vazio ou inválido (8 dígitos).');

  const codigoAluno = limpar(c.codigoAluno);
  if (codigoAluno.length === 0 || codigoAluno.length > 40)
    erro('codigoAluno', 'Código do aluno vazio ou longo demais.');

  const nome = limpar(c.nome);
  if (normalizarNomePessoa(nome).length < 2) erro('nome', 'Nome do aluno vazio.');

  const nascimento = lerData(c.nascimento);
  if (!nascimento) erro('nascimento', 'Data de nascimento vazia ou inválida.');

  const cpf = normalizarCpf(c.cpf);
  if (limpar(c.cpf) !== '' && !cpf)
    avisos.push({
      campo: 'cpf',
      mensagem: 'CPF inválido: o aluno foi carregado sem CPF.',
      gravidade: 'AVISO',
    });

  const turma = limpar(c.turma).slice(0, 60);
  const mae = limpar(c.mae);
  if (erros.length > 0) return { aluno: null, erros, avisos };
  return {
    erros,
    avisos,
    aluno: {
      inep,
      turma: turma === '' ? null : turma,
      codigoAluno,
      nome,
      nascimento: nascimento as DataISO,
      mae: normalizarNomePessoa(mae).length >= 2 ? mae : null,
      cpf,
      sexo: sexo(c.sexo),
    },
  };
}

/** Linha da gestão escolar: aluno × dia. Sem data, vale só como matrícula na turma. */
export function converterLinhaGestaoEscolar(
  c: CamposEscolar,
): ResultadoEscolar<RegistroGestaoEscolar> {
  const { aluno, erros, avisos } = converterAluno(c);
  let data: DataISO | null = null;
  let situacao: SituacaoFrequencia | null = null;
  if (limpar(c.data) !== '') {
    data = lerData(c.data);
    if (!data)
      erros.push({ campo: 'data', mensagem: 'Data da frequência inválida.', gravidade: 'ERRO' });
    situacao = lerSituacaoFrequencia(c.situacao);
    if (!situacao)
      erros.push({
        campo: 'situacao',
        mensagem: 'Situação da frequência vazia ou desconhecida (use P, F ou J).',
        gravidade: 'ERRO',
      });
  }
  if (!aluno || erros.length > 0) return { ok: false, problemas: [...erros, ...avisos] };
  return { ok: true, avisos, registro: { ...aluno, data, situacao } };
}

/** Linha da SEDUC-RO: matrícula de residente na rede estadual. */
export function converterLinhaSeduc(c: CamposEscolar): ResultadoEscolar<RegistroSeduc> {
  const { aluno, erros, avisos } = converterAluno(c);
  const situacaoMatricula = lerSituacaoMatricula(c.situacaoMatricula);
  if (!situacaoMatricula)
    erros.push({
      campo: 'situacaoMatricula',
      mensagem: 'Situação da matrícula desconhecida.',
      gravidade: 'ERRO',
    });
  if (!aluno || erros.length > 0) return { ok: false, problemas: [...erros, ...avisos] };
  return {
    ok: true,
    avisos,
    registro: { ...aluno, situacaoMatricula: situacaoMatricula as SituacaoMatricula },
  };
}
