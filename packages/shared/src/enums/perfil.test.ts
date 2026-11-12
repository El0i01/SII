import { describe, expect, it } from 'vitest';
import { PERFIS, PERFIS_COM_DADO_NOMINAL, Perfil, perfilVeDadoNominal } from './perfil';

describe('Perfil', () => {
  it('tem os 12 perfis da seção 2 da especificação (ASSISTENCIA_GESTOR desde 12/11/2026)', () => {
    expect(PERFIS).toEqual([
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
    ]);
  });

  it('aceita um perfil válido e recusa um desconhecido', () => {
    expect(Perfil.parse('ESCOLA')).toBe('ESCOLA');
    expect(Perfil.safeParse('PREFEITO').success).toBe(false);
  });

  it('AUDITOR_TCE, FAZENDA e DPO nunca veem dado nominal', () => {
    expect(perfilVeDadoNominal('AUDITOR_TCE')).toBe(false);
    expect(perfilVeDadoNominal('FAZENDA')).toBe(false);
    expect(perfilVeDadoNominal('DPO')).toBe(false);
    expect(PERFIS_COM_DADO_NOMINAL).not.toContain('AUDITOR_TCE');
  });

  it('perfis de atendimento veem dado nominal (dentro do próprio escopo)', () => {
    expect(perfilVeDadoNominal('CRAS_TECNICO')).toBe(true);
    expect(perfilVeDadoNominal('ACS')).toBe(true);
  });
});
