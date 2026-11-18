import { itemAtivo, menuDoPerfil, telaInicial } from './menu';

const rotulos = (perfil: Parameters<typeof menuDoPerfil>[0], escopos = []) =>
  menuDoPerfil(perfil, escopos).flatMap((g) => g.itens.map((i) => i.rotulo));

describe('menuDoPerfil', () => {
  it('CTI vê tudo, nos grupos do protótipo (grupo vazio some)', () => {
    const m = menuDoPerfil('ADMIN_CTI');
    expect(m.map((g) => g.grupo)).toEqual([
      'Acompanhamento',
      'Ciclos de vida',
      'Território',
      'Gestão',
    ]);
    expect(rotulos('ADMIN_CTI')).toEqual([
      'Visão geral',
      'Ficha da criança',
      'Notificações à Assistência',
      'Frequência da turma',
      'Avisos',
      'Pauta do Comitê',
      'Busca ativa escolar',
      'Território',
      'Cargas de dados',
      'Revisão de vínculos',
      'Acessos a dado pessoal',
      'Controle externo',
    ]);
  });
  it('escola, CRAS, auditor e DPO veem só o que a API deixa', () => {
    expect(rotulos('ESCOLA', [{ tipo: 'ESCOLA', valor: '11005165' }] as never)).toEqual([
      'Visão geral',
      'Ficha da criança',
      'Notificações à Assistência',
      'Frequência da turma',
      'Avisos',
      'Busca ativa escolar',
      'Território',
    ]);
    expect(rotulos('CRAS_TECNICO')).toEqual([
      'Visão geral',
      'Ficha da criança',
      'Notificações à Assistência',
      'Avisos',
      'Busca ativa escolar',
      'Território',
    ]);
    expect(rotulos('AUDITOR_TCE')).toEqual([
      'Visão geral',
      'Busca ativa escolar',
      'Território',
      'Controle externo',
    ]);
    expect(rotulos('DPO')).toEqual(['Acessos a dado pessoal']);
    expect(rotulos('FAZENDA')).toEqual(['Avisos', 'Território', 'Cargas de dados']);
  });
  it('tela inicial e item ativo', () => {
    expect(telaInicial('DPO')).toBe('/acessos');
    expect(telaInicial('SEMED_GESTOR')).toBe('/');
    expect(itemAtivo('/', '/')).toBe(true);
    expect(itemAtivo('/', '/fichas')).toBe(false);
    expect(itemAtivo('/identidade/revisao', '/identidade/revisao')).toBe(true);
    expect(itemAtivo('/fichas', '/fichas/12')).toBe(true);
  });
});
