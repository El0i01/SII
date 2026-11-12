import { z } from 'zod';

/** Perfis de acesso (ESPECIFICACAO.md, seção 2). */
export const PERFIS = [
  'ADMIN_CTI',
  'COMITE_GESTOR',
  'SEMED_GESTOR',
  'ESCOLA',
  'SAUDE_GESTOR',
  'ASSISTENCIA_GESTOR',
  'ACS',
  'CRAS_TECNICO',
  'VISITADOR_PCF',
  'FAZENDA',
  'AUDITOR_TCE',
  'DPO',
] as const;

export const Perfil = z.enum(PERFIS);
export type Perfil = z.infer<typeof Perfil>;

/**
 * Perfis que podem ver dado nominal, sempre limitados ao próprio escopo
 * (escola, microárea, CRAS…). FAZENDA vê só imóvel e território, DPO vê só o
 * registro de acessos e AUDITOR_TCE vê só agregados.
 */
export const PERFIS_COM_DADO_NOMINAL: readonly Perfil[] = [
  'ADMIN_CTI',
  'COMITE_GESTOR',
  'SEMED_GESTOR',
  'ESCOLA',
  'SAUDE_GESTOR',
  'ASSISTENCIA_GESTOR',
  'ACS',
  'CRAS_TECNICO',
  'VISITADOR_PCF',
];

export function perfilVeDadoNominal(perfil: Perfil): boolean {
  return PERFIS_COM_DADO_NOMINAL.includes(perfil);
}
