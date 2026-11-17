import {
  type AcaoBuscaAtiva,
  csvBuscaAtiva,
  type LinhaCsvBuscaAtiva,
  type ResumoBuscaAtiva,
  type StatusBuscaAtiva,
} from '@sii/shared';
import type { PrazoApi } from './casos';

/** Tipos das respostas da API de busca ativa (P13). */
export type PainelBuscaAtiva = { suprimido: boolean } & Omit<
  ResumoBuscaAtiva,
  | 'identificados'
  | 'encaminhados'
  | 'visitados'
  | 'matriculados'
  | 'naoLocalizados'
  | 'escalonados'
  | 'porOrigem'
> & {
    identificados: number | null;
    encaminhados: number | null;
    visitados: number | null;
    matriculados: number | null;
    naoLocalizados: number | null;
    escalonados: number | null;
    porOrigem: Record<string, number | null>;
  };

export interface ItemBuscaAtiva {
  codigo: string;
  pessoaId: number;
  iniciais: string;
  cpf: string | null;
  idade: number | null;
  setor: string | null;
  localidade: string | null;
  origem: string | null;
  responsavel: string;
  rotuloResponsavel: string;
  status: StatusBuscaAtiva;
  encerrado: boolean;
  escola: string | null;
  dias: number;
  prazo: PrazoApi & { restante: number | null };
  acoes: AcaoBuscaAtiva[];
}

export interface DetalheBuscaAtiva {
  codigo: string;
  pessoaId: number;
  iniciais: string;
  status: StatusBuscaAtiva;
  encerrado: boolean;
  responsavel: string;
  origem: string | null;
  prazo: PrazoApi;
  acoes: AcaoBuscaAtiva[];
  trilha: {
    eventos: {
      seq: number;
      tipo: string;
      ocorridoEm: string;
      destino: string | null;
      familiaLocalizada: boolean | null;
    }[];
    verificador: string | null;
  };
  visitas: { quando: string; relato: string }[];
}

/** Filtro "Situação" do protótipo: as etapas e os escalonados ao Comitê. */
export type FiltroSituacao = 'todos' | 'escalonados' | StatusBuscaAtiva;

export function atendeSituacao(i: ItemBuscaAtiva, f: FiltroSituacao): boolean {
  if (f === 'todos') return true;
  if (f === 'escalonados') return i.prazo.nivel === 3;
  return i.status === f;
}

/** Busca por caso, quadra, escola ou responsável (como no protótipo). */
export function atendeBuscaCaso(i: ItemBuscaAtiva, busca: string): boolean {
  const q = busca.trim().toLowerCase();
  if (!q) return true;
  return [i.codigo, i.localidade ?? '', i.escola ?? '', i.rotuloResponsavel]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

export type ColunaOrdem =
  | 'codigo'
  | 'iniciais'
  | 'idade'
  | 'localidade'
  | 'origem'
  | 'responsavel'
  | 'status'
  | 'dias'
  | 'prazo';

export function ordenar(itens: ItemBuscaAtiva[], coluna: ColunaOrdem, direcao: 1 | -1) {
  const valor = (i: ItemBuscaAtiva): string | number =>
    coluna === 'prazo'
      ? (i.prazo.restante ?? 99)
      : coluna === 'responsavel'
        ? i.rotuloResponsavel
        : (i[coluna] ?? '');
  return [...itens].sort((a, b) => {
    const x = valor(a);
    const y = valor(b);
    return (x > y ? 1 : x < y ? -1 : 0) * direcao;
  });
}

/** CSV para a equipe: nunca CPF nem nome (só iniciais). */
export function csvDosCasos(itens: ItemBuscaAtiva[]): string {
  const linhas: LinhaCsvBuscaAtiva[] = itens.map((i) => ({
    codigo: i.codigo,
    iniciais: i.iniciais,
    idade: i.idade,
    setor: i.setor,
    localidade: i.localidade,
    origem: i.origem,
    responsavel: i.responsavel,
    status: i.status,
    dias: i.dias,
    prazo: i.prazo.rotulo,
  }));
  return csvBuscaAtiva(linhas);
}
