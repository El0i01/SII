import { describe, expect, it } from 'vitest';
import {
  CriarUsuario,
  Login,
  PERFIS_MUNICIPIO,
  SENHA_MINIMA,
  TIPOS_ESCOPO,
  TrocarSenha,
  veMunicipio,
} from './acesso';

describe('Login', () => {
  it('normaliza o login para minúsculas e sem espaços nas pontas', () => {
    expect(Login.parse({ login: '  Ana.CRAS ', senha: 'x' })).toEqual({
      login: 'ana.cras',
      senha: 'x',
    });
  });

  it('exige login e senha', () => {
    const r = Login.safeParse({ login: '', senha: '' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path[0])).toEqual(['login', 'senha']);
    }
  });
});

describe('TrocarSenha', () => {
  it(`exige senha nova com pelo menos ${SENHA_MINIMA} caracteres`, () => {
    expect(TrocarSenha.safeParse({ senhaAtual: 'a', senhaNova: '123456789' }).success).toBe(false);
    expect(TrocarSenha.safeParse({ senhaAtual: 'a', senhaNova: '1234567890' }).success).toBe(true);
  });

  it('recusa senha nova igual à atual', () => {
    const r = TrocarSenha.safeParse({ senhaAtual: 'mesma-senha-1', senhaNova: 'mesma-senha-1' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['senhaNova']);
  });
});

describe('CriarUsuario', () => {
  const base = { login: 'prof.ana', nome: 'Ana Souza', perfil: 'ESCOLA' as const };

  it('aceita login com letras, números, ponto, hífen e sublinhado', () => {
    expect(
      CriarUsuario.safeParse({ ...base, escopos: [{ tipo: 'ESCOLA', valor: '11005165' }] }).success,
    ).toBe(true);
    expect(CriarUsuario.safeParse({ ...base, login: 'ana souza', escopos: [] }).success).toBe(
      false,
    );
  });

  it('perfil com escopo local exige ao menos um escopo', () => {
    const r = CriarUsuario.safeParse({ ...base, escopos: [] });
    expect(r.success).toBe(false);
  });

  it('perfil que vê o município dispensa escopo', () => {
    expect(CriarUsuario.safeParse({ ...base, perfil: 'SEMED_GESTOR', escopos: [] }).success).toBe(
      true,
    );
  });

  it('recusa tipo de escopo desconhecido', () => {
    expect(
      CriarUsuario.safeParse({ ...base, escopos: [{ tipo: 'BAIRRO', valor: 'x' }] }).success,
    ).toBe(false);
  });
});

describe('escopos', () => {
  it('tem os seis tipos de escopo', () => {
    expect(TIPOS_ESCOPO).toEqual([
      'SECRETARIA',
      'SETOR',
      'ESCOLA',
      'MICROAREA',
      'CRAS',
      'FAMILIA_PCF',
    ]);
  });

  it('ADMIN_CTI, COMITE_GESTOR e os gestores de SEMED, Saúde e Assistência veem o município', () => {
    expect([...PERFIS_MUNICIPIO].sort()).toEqual([
      'ADMIN_CTI',
      'ASSISTENCIA_GESTOR',
      'COMITE_GESTOR',
      'SAUDE_GESTOR',
      'SEMED_GESTOR',
    ]);
    expect(veMunicipio('SEMED_GESTOR')).toBe(true);
    expect(veMunicipio('ESCOLA')).toBe(false);
    expect(veMunicipio('AUDITOR_TCE')).toBe(false);
  });
});
