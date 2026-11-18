import { hojeEmPortoVelho } from '@sii/shared';
import { gravarFiltros, gravarParametrosDaTela, lerFiltros, sufixoFiltros } from './filtros-url';

const mesAtual = hojeEmPortoVelho().slice(0, 7);

describe('filtros na URL', () => {
  beforeEach(() => window.history.replaceState(null, '', '/busca-ativa?situacao=escalonados'));

  it('lê território e período válidos; inválido cai no padrão', () => {
    expect(lerFiltros('?territorio=S03&periodo=2026-10')).toEqual({
      territorio: 'S03',
      periodo: '2026-10',
    });
    expect(lerFiltros('?territorio=x y&periodo=2026-13')).toEqual({
      territorio: null,
      periodo: mesAtual,
    });
  });

  it('grava sem perder os parâmetros da tela e avisa quem escuta', () => {
    const ouvinte = vi.fn();
    window.addEventListener('sii:filtros', ouvinte);
    gravarFiltros({ territorio: 'S03', periodo: '2026-10' });
    expect(window.location.search).toBe('?situacao=escalonados&territorio=S03&periodo=2026-10');
    gravarFiltros({ territorio: null, periodo: mesAtual });
    expect(window.location.search).toBe('?situacao=escalonados');
    expect(ouvinte).toHaveBeenCalledTimes(2);
  });

  it('sufixo dos links do menu e parâmetros da tela', () => {
    expect(sufixoFiltros({ territorio: 'S03', periodo: mesAtual })).toBe('?territorio=S03');
    expect(sufixoFiltros({ territorio: null, periodo: mesAtual })).toBe('');
    gravarParametrosDaTela({ situacao: null, caso: 'BA-2026-0301' });
    expect(window.location.search).toBe('?caso=BA-2026-0301');
  });
});
