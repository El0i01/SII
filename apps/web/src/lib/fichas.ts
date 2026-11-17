import type { EventoFicha, Motivo } from '@sii/shared';

/** Tipos das respostas da API de fichas (P12). */
export interface ItemFicha {
  id: number;
  codigo: string;
  iniciais: string;
  idade: number;
  localidade: string | null;
  setor: string | null;
  escola: string | null;
  motivos: number;
  notificacaoAberta: boolean;
  necessitaAee: boolean;
}

export interface ListaFichas {
  kpis: { fichas: number; precisamVisita: number; acompanhadasCras: number; criancaFeliz: number };
  total: number;
  fichas: ItemFicha[];
}

/** Seções opcionais: ausentes quando o perfil não pode ver (§3.8). */
export interface Ficha {
  id: number;
  codigo: string;
  iniciais: string;
  idade: number;
  cpf: string | null;
  endereco: {
    setor: string | null;
    quadra: string | null;
    lote: number | null;
    localidade: string | null;
  };
  motivos: Motivo[];
  notificacaoAberta: string | null;
  podeEncaminhar: boolean;
  educacao?: {
    situacao: 'MATRICULADA' | 'FORA_DA_ESCOLA' | 'SEM_MATRICULA_CRECHE';
    escola: string | null;
    rede: string | null;
    turma: string | null;
    frequenciaMes: number | null;
    faltasSeguidas: number | null;
  };
  saude?: {
    ubs: string | null;
    vacinacaoEmDia: boolean | null;
    ultimaVisitaAcs: string | null;
    diasSemVisitaAcs: number | null;
  };
  assistencia?: {
    cadunicoAtualizadoEm: string | null;
    bolsaFamilia: boolean;
    cras: { tipo: string; nome: string | null; ultimoAtendimento: string | null } | null;
    criancaFeliz: { visitador: string; ultimaVisita: string | null } | null;
  };
  protecao?: {
    conselhoTutelarEm: string | null;
    necessitaAee: boolean;
    atendimento: 'SALA_RECURSOS' | 'APAE' | null;
    bpc: boolean;
  };
  historico?: EventoFicha[];
  visitas?: {
    quando: string;
    autor: string;
    texto: string;
    parecer?: { notificacao: string; desfecho: string };
  }[];
}

export interface PainelAcessos {
  total: number;
  pagina: number;
  porPagina: number;
  acessos: {
    id: number;
    quando: string;
    usuario: { login: string | null; nome: string | null };
    perfil: string;
    registro: string | null;
    campo: string;
    finalidade: string;
    ip: string | null;
  }[];
}

export const anos = (n: number) => `${n} ${n === 1 ? 'ano' : 'anos'}`;

export function enderecoFicha(e: Ficha['endereco']): string {
  const lugar = e.quadra
    ? `${e.quadra}, lote ${String(e.lote ?? '').padStart(2, '0')}`
    : (e.localidade ?? 'Endereço não informado');
  return e.setor ? `${lugar} · ${e.setor}` : lugar;
}
