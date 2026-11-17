import { describe, expect, it } from 'vitest';
import { destinosDoUsuario, enderecoDaSecretaria } from './avisos';

describe('destinosDoUsuario', () => {
  it('CTI vê tudo; Comitê, a pauta', () => {
    expect(destinosDoUsuario('ADMIN_CTI', [])).toBeNull();
    expect(destinosDoUsuario('COMITE_GESTOR', [])).toEqual([{ tipo: 'COMITE', valor: 'COMITE' }]);
  });

  it('escola pelo INEP e CRAS pelo CadSUAS (mais a Assistência)', () => {
    expect(
      destinosDoUsuario('ESCOLA', [
        { tipo: 'ESCOLA', valor: '11005165' },
        { tipo: 'SETOR', valor: 'S01' },
      ]),
    ).toEqual([{ tipo: 'ESCOLA', valor: '11005165' }]);
    expect(destinosDoUsuario('CRAS_TECNICO', [{ tipo: 'CRAS', valor: '11011015018' }])).toEqual([
      { tipo: 'CRAS', valor: '11011015018' },
      { tipo: 'SECRETARIA', valor: 'ASSISTENCIA' },
    ]);
  });

  it('gestores pela secretaria; quem não recebe aviso fica sem caixa', () => {
    expect(destinosDoUsuario('SEMED_GESTOR', [])).toEqual([{ tipo: 'SECRETARIA', valor: 'SEMED' }]);
    expect(destinosDoUsuario('SAUDE_GESTOR', [])).toEqual([
      { tipo: 'SECRETARIA', valor: 'SEMSAU' },
    ]);
    expect(destinosDoUsuario('AUDITOR_TCE', [])).toEqual([]);
    expect(destinosDoUsuario('ACS', [{ tipo: 'MICROAREA', valor: '01' }])).toEqual([]);
  });
});

describe('enderecoDaSecretaria', () => {
  it('Assistência com CRAS vai ao CRAS; o resto à secretaria', () => {
    expect(enderecoDaSecretaria('ASSISTENCIA', '11011015018')).toEqual({
      tipo: 'CRAS',
      valor: '11011015018',
    });
    expect(enderecoDaSecretaria('ASSISTENCIA', null)).toEqual({
      tipo: 'SECRETARIA',
      valor: 'ASSISTENCIA',
    });
    expect(enderecoDaSecretaria('CONSELHO_TUTELAR', null)).toEqual({
      tipo: 'SECRETARIA',
      valor: 'CONSELHO_TUTELAR',
    });
  });
});
