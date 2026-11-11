import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Login, TrocarSenha } from '@sii/shared';
import { PrismaService } from '../banco/prisma.service';
import { ErroApi } from '../comum/erros';
import type { UsuarioAutenticado } from '../comum/usuario-autenticado';
import { estaBloqueado, minutosRestantes, registrarFalha } from './bloqueio';
import { conferirSenha, HASH_FICTICIO, hashSenha } from './senha';
import { Metadados, RefreshEmitido, SessoesService } from './sessoes.service';
import { ACESSO_MINUTOS, Cliente } from './tokens';

/** Conteúdo do JWT de acesso. `tv` = versão do token do usuário (troca de senha invalida). */
export interface ConteudoJwt {
  sub: string;
  perfil: string;
  tv: number;
}

export interface Credenciais {
  usuario: UsuarioAutenticado;
  acesso: { token: string; expiraEm: Date };
  refresh: RefreshEmitido;
}

const credenciaisInvalidas = () =>
  new ErroApi(HttpStatus.UNAUTHORIZED, 'CREDENCIAIS_INVALIDAS', 'Login ou senha incorretos.');

const comEscopos = { escopos: { select: { tipo: true, valor: true } } } as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly sessoes: SessoesService,
  ) {}

  async entrar(dados: Login, cliente: Cliente, meta: Metadados): Promise<Credenciais> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { login: dados.login },
      include: comEscopos,
    });

    if (!usuario || !usuario.ativo) {
      // Mesmo custo de um login real: não revela se o login existe.
      await conferirSenha(dados.senha, HASH_FICTICIO);
      await this.evento(
        usuario?.id ?? null,
        'LOGIN_FALHA',
        meta,
        usuario ? 'usuário inativo' : null,
      );
      throw credenciaisInvalidas();
    }

    const agora = new Date();
    if (estaBloqueado(usuario.bloqueadoAte, agora)) {
      await conferirSenha(dados.senha, HASH_FICTICIO);
      throw this.erroBloqueado(usuario.bloqueadoAte as Date, agora);
    }

    if (!(await conferirSenha(dados.senha, usuario.senhaHash))) {
      const r = registrarFalha(usuario, agora);
      await this.prisma.usuario.update({
        where: { id: usuario.id },
        data: { falhasSeguidas: r.falhasSeguidas, bloqueadoAte: r.bloqueadoAte },
      });
      await this.evento(usuario.id, r.bloqueouAgora ? 'BLOQUEIO' : 'LOGIN_FALHA', meta);
      if (r.bloqueouAgora) throw this.erroBloqueado(r.bloqueadoAte as Date, agora);
      throw credenciaisInvalidas();
    }

    if (usuario.senhaProvisoriaExpiraEm && usuario.senhaProvisoriaExpiraEm <= agora) {
      await this.evento(usuario.id, 'LOGIN_FALHA', meta, 'senha provisória vencida');
      throw new ErroApi(
        HttpStatus.UNAUTHORIZED,
        'SENHA_PROVISORIA_VENCIDA',
        'A senha provisória venceu. Peça uma nova à CTI.',
      );
    }

    if (usuario.falhasSeguidas > 0 || usuario.bloqueadoAte) {
      await this.prisma.usuario.update({
        where: { id: usuario.id },
        data: { falhasSeguidas: 0, bloqueadoAte: null },
      });
    }
    await this.evento(usuario.id, 'LOGIN_OK', meta);

    const refresh = await this.sessoes.criar(usuario.id, cliente, meta);
    return this.credenciais(usuario, refresh);
  }

  async renovar(tokenRefresh: unknown, meta: Metadados): Promise<Credenciais> {
    const { usuarioId, refresh } = await this.sessoes.rotacionar(tokenRefresh, meta);
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      include: comEscopos,
    });
    if (!usuario || !usuario.ativo || estaBloqueado(usuario.bloqueadoAte)) {
      await this.sessoes.revogarTodas(usuarioId, 'USUARIO_INDISPONIVEL');
      throw new ErroApi(
        HttpStatus.UNAUTHORIZED,
        'SESSAO_INVALIDA',
        'Sua sessão terminou. Entre de novo.',
      );
    }
    return this.credenciais(usuario, refresh);
  }

  async sair(tokenRefresh: unknown, meta: Metadados): Promise<void> {
    const usuarioId = await this.sessoes.encerrar(tokenRefresh);
    if (usuarioId) await this.evento(usuarioId, 'SAIR', meta);
  }

  /**
   * Troca de senha (também a obrigatória, depois da provisória). Derruba todos os tokens antigos
   * (versaoToken + 1, sessões revogadas) e devolve credenciais novas para quem trocou.
   */
  async trocarSenha(
    usuarioId: number,
    dados: TrocarSenha,
    cliente: Cliente,
    meta: Metadados,
  ): Promise<Credenciais> {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
    if (!(await conferirSenha(dados.senhaAtual, usuario.senhaHash))) {
      const r = registrarFalha(usuario);
      await this.prisma.usuario.update({
        where: { id: usuario.id },
        data: { falhasSeguidas: r.falhasSeguidas, bloqueadoAte: r.bloqueadoAte },
      });
      throw new ErroApi(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'VALIDACAO',
        'Confira os campos destacados.',
        {
          senhaAtual: ['A senha atual não confere.'],
        },
      );
    }

    const atualizado = await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        senhaHash: await hashSenha(dados.senhaNova),
        trocaObrigatoria: false,
        senhaProvisoriaExpiraEm: null,
        falhasSeguidas: 0,
        bloqueadoAte: null,
        versaoToken: { increment: 1 },
      },
      include: comEscopos,
    });
    await this.sessoes.revogarTodas(usuario.id, 'TROCA_SENHA');
    await this.evento(usuario.id, 'TROCA_SENHA', meta);

    const refresh = await this.sessoes.criar(usuario.id, cliente, meta);
    return this.credenciais(atualizado, refresh);
  }

  private async credenciais(
    usuario: {
      id: number;
      login: string;
      nome: string;
      perfil: UsuarioAutenticado['perfil'];
      versaoToken: number;
      trocaObrigatoria: boolean;
      escopos: UsuarioAutenticado['escopos'];
    },
    refresh: RefreshEmitido,
  ): Promise<Credenciais> {
    const conteudo: ConteudoJwt = {
      sub: String(usuario.id),
      perfil: usuario.perfil,
      tv: usuario.versaoToken,
    };
    const token = await this.jwt.signAsync(conteudo);
    return {
      usuario: {
        id: usuario.id,
        login: usuario.login,
        nome: usuario.nome,
        perfil: usuario.perfil,
        escopos: usuario.escopos,
        trocaObrigatoria: usuario.trocaObrigatoria,
      },
      acesso: { token, expiraEm: new Date(Date.now() + ACESSO_MINUTOS * 60_000) },
      refresh,
    };
  }

  private erroBloqueado(ate: Date, agora: Date) {
    const min = minutosRestantes(ate, agora);
    return new ErroApi(
      423 as HttpStatus, // Locked (o enum do Nest 10 não tem)
      'ACESSO_BLOQUEADO',
      `Acesso bloqueado por excesso de tentativas. Tente de novo em ${min} ${min === 1 ? 'minuto' : 'minutos'} ou peça à CTI para liberar.`,
    );
  }

  private evento(
    usuarioId: number | null,
    tipo: 'LOGIN_OK' | 'LOGIN_FALHA' | 'BLOQUEIO' | 'SAIR' | 'TROCA_SENHA',
    meta: Metadados,
    detalhe: string | null = null,
  ) {
    return this.prisma.eventoAcesso.create({
      data: { usuarioId, tipo, ip: meta.ip ?? null, detalhe },
    });
  }
}
