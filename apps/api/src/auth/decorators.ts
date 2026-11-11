import { SetMetadata } from '@nestjs/common';
import type { Perfil, TipoEscopo } from '@sii/shared';

export const CHAVE_PUBLICO = 'sii:publico';
export const CHAVE_PERFIS = 'sii:perfis';
export const CHAVE_ESCOPO = 'sii:escopo';
export const CHAVE_LIBERADO_TROCA = 'sii:liberado-troca';

/** Rota sem login (o padrão da API é exigir login em tudo). */
export const Publico = () => SetMetadata(CHAVE_PUBLICO, true);

/** RBAC: só estes perfis chamam a rota. */
export const Perfis = (...perfis: Perfil[]) => SetMetadata(CHAVE_PERFIS, perfis);

export interface RegraEscopo {
  /** Tipo de escopo que o usuário precisa ter. */
  tipo: TipoEscopo;
  /** Parâmetro da rota com o valor (ex.: `inep` em /escolas/:inep/...). */
  param: string;
}

/**
 * ABAC: o valor do parâmetro da rota precisa estar nos escopos do usuário. Perfis que veem o
 * município passam direto. A Row-Level Security do banco filtra as linhas de qualquer forma; este
 * decorator dá uma resposta clara (403) antes de consultar.
 */
export const Escopo = (regra: RegraEscopo) => SetMetadata(CHAVE_ESCOPO, regra);

/** Rota que funciona mesmo com a troca de senha pendente (trocar-senha, eu, sair). */
export const LiberadoComTrocaPendente = () => SetMetadata(CHAVE_LIBERADO_TROCA, true);
