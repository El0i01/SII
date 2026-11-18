import { describe, expect, it } from 'vitest';
import {
  atendeBusca,
  atendeFiltro,
  codigoFicha,
  ConsultaFichas,
  montarLinhaDoTempo,
  prioridadeFicha,
  type ResumoFicha,
  SECOES_FICHA,
  secoesDaFicha,
} from './ficha';

const base: ResumoFicha = {
  codigo: 'CI-10237',
  iniciais: 'A. B. C.',
  idade: 7,
  localidade: 'Q052',
  escola: 'EMEF Castanheira',
  motivos: 0,
  notificacaoAberta: false,
  necessitaAee: false,
};

describe('secoesDaFicha', () => {
  it('perfil nominal vê todas as seções (decisão de 17/11/2026)', () => {
    expect(secoesDaFicha('ESCOLA')).toEqual(SECOES_FICHA);
    expect(secoesDaFicha('ACS')).toEqual(SECOES_FICHA);
    expect(secoesDaFicha('COMITE_GESTOR')).toEqual(SECOES_FICHA);
  });
  it('perfil sem dado nominal não vê nenhuma seção', () => {
    expect(secoesDaFicha('AUDITOR_TCE')).toEqual([]);
    expect(secoesDaFicha('FAZENDA')).toEqual([]);
    expect(secoesDaFicha('DPO')).toEqual([]);
  });
});

describe('codigoFicha e consulta', () => {
  it('código legível pelo id da pessoa', () => {
    expect(codigoFicha(10237)).toBe('CI-10237');
  });
  it('filtro padrão é "todas"; filtro desconhecido é recusado', () => {
    expect(ConsultaFichas.parse({})).toEqual({ filtro: 'todas' });
    expect(ConsultaFichas.parse({ territorio: 'S03' }).territorio).toBe('S03');
    expect(ConsultaFichas.safeParse({ territorio: 's 3' }).success).toBe(false);
    expect(ConsultaFichas.safeParse({ filtro: 'x' }).success).toBe(false);
  });
});

describe('atendeFiltro', () => {
  it('cada filtro do protótipo', () => {
    expect(atendeFiltro(base, 'todas')).toBe(true);
    expect(atendeFiltro(base, 'visita')).toBe(false);
    expect(atendeFiltro({ ...base, motivos: 2 }, 'visita')).toBe(true);
    expect(atendeFiltro(base, 'notificacao')).toBe(false);
    expect(atendeFiltro({ ...base, notificacaoAberta: true }, 'notificacao')).toBe(true);
    expect(atendeFiltro(base, '0a3')).toBe(false);
    expect(atendeFiltro({ ...base, idade: 3 }, '0a3')).toBe(true);
    expect(atendeFiltro(base, 'aee')).toBe(false);
    expect(atendeFiltro({ ...base, necessitaAee: true }, 'aee')).toBe(true);
  });
});

describe('atendeBusca', () => {
  it('busca por código, iniciais, quadra ou escola, sem diferenciar maiúsculas', () => {
    expect(atendeBusca(base, undefined)).toBe(true);
    expect(atendeBusca(base, '  ')).toBe(true);
    expect(atendeBusca(base, 'ci-10237')).toBe(true);
    expect(atendeBusca(base, 'q052')).toBe(true);
    expect(atendeBusca(base, 'castanheira')).toBe(true);
    expect(atendeBusca(base, 'A. B.')).toBe(true);
    expect(atendeBusca(base, 'jamari')).toBe(false);
    expect(atendeBusca({ ...base, localidade: null, escola: null }, 'q052')).toBe(false);
  });
});

describe('prioridadeFicha', () => {
  it('motivos pesam 10; notificação aberta, 5', () => {
    expect(prioridadeFicha({ motivos: 0, notificacaoAberta: false })).toBe(0);
    expect(prioridadeFicha({ motivos: 2, notificacaoAberta: true })).toBe(25);
  });
});

describe('montarLinhaDoTempo', () => {
  it('junta as listas do mais recente ao mais antigo, estável no empate', () => {
    const r = montarLinhaDoTempo(
      [
        { quando: '2026-10-01', texto: 'Matrícula', origem: 'SEMED' },
        { quando: '2026-11-10T13:00:00.000Z', texto: 'B', origem: 'Sistema' },
      ],
      [
        { quando: '2026-11-10', texto: 'C', origem: 'Saúde', detalhe: 'x' },
        { quando: '2026-11-12', texto: 'D', origem: 'Saúde' },
      ],
    );
    expect(r.map((e) => e.texto)).toEqual(['D', 'B', 'C', 'Matrícula']);
  });
});
