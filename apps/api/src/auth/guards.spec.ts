import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Perfil } from '@sii/shared';
import { FiltroErros } from '../comum/erros';
import type { UsuarioAutenticado } from '../comum/usuario-autenticado';
import { CHAVE_ESCOPO, CHAVE_LIBERADO_TROCA, CHAVE_PERFIS, type RegraEscopo } from './decorators';
import { EscopoGuard, PerfisGuard, TrocaObrigatoriaGuard } from './guards';

function usuario(perfil: Perfil, extra: Partial<UsuarioAutenticado> = {}): UsuarioAutenticado {
  return { id: 1, login: 'x', nome: 'X', perfil, escopos: [], trocaObrigatoria: false, ...extra };
}

function contexto(
  user: UsuarioAutenticado | undefined,
  metadados: Record<string, unknown>,
  params: Record<string, string> = {},
): { ctx: ExecutionContext; reflector: Reflector } {
  const handler = () => undefined;
  const reflector = new Reflector();
  jest
    .spyOn(reflector, 'getAllAndOverride')
    .mockImplementation((chave: unknown) => metadados[chave as string]);
  const ctx = {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user, params }) }),
  } as unknown as ExecutionContext;
  return { ctx, reflector };
}

/** Executa o guard e devolve o código de erro do SII (ou 'OK'). */
function resultado(fn: () => boolean): string {
  try {
    return fn() ? 'OK' : 'NEGADO';
  } catch (e) {
    return new FiltroErros().converter(e).corpo.codigo;
  }
}

describe('PerfisGuard', () => {
  it('rota sem @Perfis libera qualquer usuário autenticado', () => {
    const { ctx, reflector } = contexto(usuario('FAZENDA'), {});
    expect(resultado(() => new PerfisGuard(reflector).canActivate(ctx))).toBe('OK');
  });

  it('libera perfil da lista e nega o resto com SEM_PERMISSAO', () => {
    const meta = { [CHAVE_PERFIS]: ['ADMIN_CTI'] };
    const admin = contexto(usuario('ADMIN_CTI'), meta);
    const escola = contexto(usuario('ESCOLA'), meta);
    expect(resultado(() => new PerfisGuard(admin.reflector).canActivate(admin.ctx))).toBe('OK');
    expect(resultado(() => new PerfisGuard(escola.reflector).canActivate(escola.ctx))).toBe(
      'SEM_PERMISSAO',
    );
  });
});

describe('EscopoGuard', () => {
  const regra: RegraEscopo = { tipo: 'ESCOLA', param: 'inep' };
  const meta = { [CHAVE_ESCOPO]: regra };
  const comEscola = usuario('ESCOLA', { escopos: [{ tipo: 'ESCOLA', valor: '11005165' }] });

  it('libera a própria escola', () => {
    const { ctx, reflector } = contexto(comEscola, meta, { inep: '11005165' });
    expect(resultado(() => new EscopoGuard(reflector).canActivate(ctx))).toBe('OK');
  });

  it('nega outra escola com FORA_DO_ESCOPO', () => {
    const { ctx, reflector } = contexto(comEscola, meta, { inep: '11005378' });
    expect(resultado(() => new EscopoGuard(reflector).canActivate(ctx))).toBe('FORA_DO_ESCOPO');
  });

  it('escopo de outro tipo com o mesmo valor não vale', () => {
    const acs = usuario('ESCOLA', { escopos: [{ tipo: 'MICROAREA', valor: '11005165' }] });
    const { ctx, reflector } = contexto(acs, meta, { inep: '11005165' });
    expect(resultado(() => new EscopoGuard(reflector).canActivate(ctx))).toBe('FORA_DO_ESCOPO');
  });

  it('perfil que vê o município passa sem escopo', () => {
    const { ctx, reflector } = contexto(usuario('SEMED_GESTOR'), meta, { inep: '11005378' });
    expect(resultado(() => new EscopoGuard(reflector).canActivate(ctx))).toBe('OK');
  });

  it('sem usuário: NAO_AUTENTICADO', () => {
    const { ctx, reflector } = contexto(undefined, meta, { inep: '1' });
    expect(resultado(() => new EscopoGuard(reflector).canActivate(ctx))).toBe('NAO_AUTENTICADO');
  });
});

describe('TrocaObrigatoriaGuard', () => {
  const pendente = usuario('ESCOLA', { trocaObrigatoria: true });

  it('bloqueia rotas comuns enquanto a senha provisória não foi trocada', () => {
    const { ctx, reflector } = contexto(pendente, {});
    expect(resultado(() => new TrocaObrigatoriaGuard(reflector).canActivate(ctx))).toBe(
      'TROCA_DE_SENHA_OBRIGATORIA',
    );
  });

  it('libera as rotas marcadas (trocar-senha, eu, sair)', () => {
    const { ctx, reflector } = contexto(pendente, { [CHAVE_LIBERADO_TROCA]: true });
    expect(resultado(() => new TrocaObrigatoriaGuard(reflector).canActivate(ctx))).toBe('OK');
  });

  it('usuário com senha pessoal passa', () => {
    const { ctx, reflector } = contexto(usuario('ESCOLA'), {});
    expect(resultado(() => new TrocaObrigatoriaGuard(reflector).canActivate(ctx))).toBe('OK');
  });
});
