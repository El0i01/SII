import { describe, expect, it } from 'vitest';
import { FiltroAcessos, formatarCpf, RevelarCpf, textoFinalidade } from './revelar';

describe('RevelarCpf', () => {
  it('sem finalidade é recusado com mensagem simples', () => {
    const r = RevelarCpf.safeParse({});
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['finalidade']);
    expect(r.error?.issues[0]?.message).toBe('Escolha a finalidade.');
  });
  it('finalidade da lista basta', () => {
    expect(RevelarCpf.parse({ finalidade: 'CONTATO_MATRICULA' })).toEqual({
      finalidade: 'CONTATO_MATRICULA',
    });
  });
  it('"Outra" exige descrição de 10 caracteres', () => {
    const r = RevelarCpf.safeParse({ finalidade: 'OUTRA', detalhe: 'curto' });
    expect(r.error?.issues[0]?.path).toEqual(['detalhe']);
    expect(RevelarCpf.safeParse({ finalidade: 'OUTRA' }).success).toBe(false);
    expect(
      RevelarCpf.safeParse({ finalidade: 'OUTRA', detalhe: 'Ofício do Ministério Público' })
        .success,
    ).toBe(true);
  });
  it('recusa CID no detalhe', () => {
    const r = RevelarCpf.safeParse({ finalidade: 'OUTRA', detalhe: 'Consulta por CID F32.1' });
    expect(r.success).toBe(false);
  });
});

describe('textoFinalidade', () => {
  it('rótulo da lista, com o detalhe quando houver', () => {
    expect(textoFinalidade({ finalidade: 'CONTATO_MATRICULA' })).toBe(
      'Contato com a família para matrícula',
    );
    expect(textoFinalidade({ finalidade: 'ATUALIZACAO_CADASTRAL', detalhe: 'NIS novo' })).toBe(
      'Atualização cadastral: NIS novo',
    );
    expect(textoFinalidade({ finalidade: 'OUTRA', detalhe: 'Ofício do MP nº 12' })).toBe(
      'Outra: Ofício do MP nº 12',
    );
  });
});

describe('formatarCpf', () => {
  it('formata 11 dígitos; outro tamanho volta só com dígitos', () => {
    expect(formatarCpf('12345678901')).toBe('123.456.789-01');
    expect(formatarCpf('123.45')).toBe('12345');
  });
});

describe('FiltroAcessos', () => {
  it('página padrão 1; período invertido é recusado', () => {
    expect(FiltroAcessos.parse({})).toEqual({ pagina: 1 });
    expect(FiltroAcessos.parse({ pagina: '2', usuario: ' Escola.Custodio ' })).toEqual({
      pagina: 2,
      usuario: 'escola.custodio',
    });
    const r = FiltroAcessos.safeParse({ de: '2026-11-10', ate: '2026-11-01' });
    expect(r.error?.issues[0]?.path).toEqual(['ate']);
    expect(FiltroAcessos.safeParse({ de: '2026-13-01' }).success).toBe(false);
  });
});
