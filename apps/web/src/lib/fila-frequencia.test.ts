import { describe, expect, it } from 'vitest';
import {
  type Alteracao,
  type Armazem,
  chaveGuardado,
  enfileirar,
  gravarGuardado,
  lerGuardado,
  limparFrequenciaGuardada,
  proximaSituacao,
  removerEnviados,
  situacaoDaTecla,
  VALIDADE_MS,
  valoresDaGrade,
} from './fila-frequencia';

function armazem(): Armazem & { dados: Map<string, string> } {
  const dados = new Map<string, string>();
  return {
    dados,
    getItem: (k) => dados.get(k) ?? null,
    setItem: (k, v) => void dados.set(k, v),
    removeItem: (k) => void dados.delete(k),
    key: (i) => [...dados.keys()][i] ?? null,
    get length() {
      return dados.size;
    },
  };
}

const alt = (matriculaId: number, dia: string, situacao: Alteracao['situacao']): Alteracao => ({
  matriculaId,
  dia,
  situacao,
});

describe('fila de alterações', () => {
  it('a mesma célula alterada de novo substitui a anterior', () => {
    let fila = enfileirar([], alt(1, '2026-11-16', 'FALTA'));
    fila = enfileirar(fila, alt(2, '2026-11-16', 'PRESENTE'));
    fila = enfileirar(fila, alt(1, '2026-11-16', 'JUSTIFICADA'));
    expect(fila).toEqual([alt(2, '2026-11-16', 'PRESENTE'), alt(1, '2026-11-16', 'JUSTIFICADA')]);
  });

  it('remove o que foi enviado, mas mantém célula que mudou durante o envio', () => {
    const enviados = [alt(1, '2026-11-16', 'FALTA'), alt(2, '2026-11-16', 'PRESENTE')];
    const fila = [alt(1, '2026-11-16', 'JUSTIFICADA'), alt(2, '2026-11-16', 'PRESENTE')];
    expect(removerEnviados(fila, enviados)).toEqual([alt(1, '2026-11-16', 'JUSTIFICADA')]);
  });

  it('a fila aparece por cima do que veio do servidor', () => {
    const v = valoresDaGrade(
      [
        { matriculaId: 1, dia: '2026-11-16', situacao: 'PRESENTE' },
        { matriculaId: 2, dia: '2026-11-16', situacao: 'FALTA' },
      ],
      [alt(1, '2026-11-16', 'FALTA'), alt(2, '2026-11-16', null)],
    );
    expect(v.get('1|2026-11-16')).toBe('FALTA');
    expect(v.get('2|2026-11-16')).toBeNull();
  });
});

describe('guardado no navegador', () => {
  const chave = chaveGuardado(7, '11005165', 3);

  it('grava e lê; vazio apaga a chave', () => {
    const a = armazem();
    gravarGuardado(a, chave, { salvoEm: 1000, fila: [alt(1, '2026-11-16', 'FALTA')], grades: {} });
    expect(lerGuardado(a, chave, 2000)?.fila).toHaveLength(1);
    gravarGuardado(a, chave, { salvoEm: 3000, fila: [], grades: {} });
    expect(a.dados.has(chave)).toBe(false);
  });

  it('vence em 24 h e o conteúdo ilegível é apagado', () => {
    const a = armazem();
    gravarGuardado(a, chave, { salvoEm: 0, fila: [alt(1, '2026-11-16', 'FALTA')], grades: {} });
    expect(lerGuardado(a, chave, VALIDADE_MS + 1)).toBeNull();
    expect(a.dados.has(chave)).toBe(false);
    a.setItem(chave, '{quebrado');
    expect(lerGuardado(a, chave)).toBeNull();
    expect(a.dados.has(chave)).toBe(false);
  });

  it('limpar apaga só as chaves da frequência', () => {
    const a = armazem();
    a.setItem('outra', 'x');
    gravarGuardado(a, chave, {
      salvoEm: Date.now(),
      fila: [alt(1, '2026-11-16', 'FALTA')],
      grades: {},
    });
    gravarGuardado(a, chaveGuardado(8, '11005165', 3), {
      salvoEm: Date.now(),
      fila: [alt(1, '2026-11-16', 'FALTA')],
      grades: {},
    });
    limparFrequenciaGuardada(a, 7);
    expect([...a.dados.keys()]).toEqual(['outra', chave]);
    limparFrequenciaGuardada(a);
    expect([...a.dados.keys()]).toEqual(['outra']);
  });

  it('armazenamento bloqueado não derruba a tela', () => {
    const quebrado: Armazem = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('cheio');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
      key: () => {
        throw new Error('bloqueado');
      },
      length: 1,
    };
    expect(lerGuardado(quebrado, chave)).toBeNull();
    expect(() =>
      gravarGuardado(quebrado, chave, { salvoEm: 1, fila: [], grades: {} }),
    ).not.toThrow();
    expect(() =>
      gravarGuardado(quebrado, chave, {
        salvoEm: 1,
        fila: [alt(1, '2026-11-16', 'F' as never)],
        grades: {},
      }),
    ).not.toThrow();
    expect(() => limparFrequenciaGuardada(quebrado)).not.toThrow();
  });
});

describe('teclado e clique', () => {
  it('clique percorre vazio → P → F → J → vazio', () => {
    expect(proximaSituacao(null)).toBe('PRESENTE');
    expect(proximaSituacao('PRESENTE')).toBe('FALTA');
    expect(proximaSituacao('FALTA')).toBe('JUSTIFICADA');
    expect(proximaSituacao('JUSTIFICADA')).toBeNull();
  });

  it('P, F, J lançam; Delete e Backspace apagam; o resto não faz nada', () => {
    expect(situacaoDaTecla('P')).toBe('PRESENTE');
    expect(situacaoDaTecla('f')).toBe('FALTA');
    expect(situacaoDaTecla('j')).toBe('JUSTIFICADA');
    expect(situacaoDaTecla('Delete')).toBeNull();
    expect(situacaoDaTecla('Backspace')).toBeNull();
    expect(situacaoDaTecla('x')).toBeUndefined();
  });
});
