import { HttpStatus, Injectable } from '@nestjs/common';
import type { CriarUsuario } from '@sii/shared';
import { PrismaService } from '../banco/prisma.service';
import { ErroApi } from '../comum/erros';
import { SessoesService } from '../auth/sessoes.service';
import { gerarSenhaProvisoria, hashSenha } from '../auth/senha';

/** Campos que saem da API. O hash da senha nunca sai. */
const SAIDA = {
  id: true,
  login: true,
  nome: true,
  perfil: true,
  ativo: true,
  trocaObrigatoria: true,
  bloqueadoAte: true,
  criadoEm: true,
  escopos: { select: { tipo: true, valor: true } },
} as const;

const naoEncontrado = () =>
  new ErroApi(HttpStatus.NOT_FOUND, 'USUARIO_NAO_ENCONTRADO', 'Usuário não encontrado.');

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessoes: SessoesService,
  ) {}

  listar() {
    return this.prisma.usuario.findMany({ select: SAIDA, orderBy: { login: 'asc' } });
  }

  /** Cria o usuário com uma senha provisória (24 h). A senha aparece uma única vez, nesta resposta. */
  async criar(dados: CriarUsuario, adminId: number) {
    const existe = await this.prisma.usuario.findUnique({ where: { login: dados.login } });
    if (existe) {
      throw new ErroApi(
        HttpStatus.CONFLICT,
        'LOGIN_EM_USO',
        'Já existe um usuário com este login.',
        {
          login: ['Escolha outro login.'],
        },
      );
    }
    const provisoria = gerarSenhaProvisoria();
    const usuario = await this.prisma.usuario.create({
      data: {
        login: dados.login,
        nome: dados.nome,
        perfil: dados.perfil,
        senhaHash: await hashSenha(provisoria.senha),
        senhaProvisoriaExpiraEm: provisoria.expiraEm,
        trocaObrigatoria: true,
        escopos: { create: dados.escopos },
      },
      select: SAIDA,
    });
    await this.prisma.eventoAcesso.create({
      data: {
        usuarioId: usuario.id,
        tipo: 'SENHA_PROVISORIA',
        detalhe: `criado pelo admin ${adminId}`,
      },
    });
    return { usuario, senhaProvisoria: provisoria.senha, expiraEm: provisoria.expiraEm };
  }

  /** Nova senha provisória (esqueceu a senha, bloqueio): derruba as sessões e destrava a conta. */
  async novaSenhaProvisoria(id: number, adminId: number) {
    await this.garantirExiste(id);
    const provisoria = gerarSenhaProvisoria();
    const usuario = await this.prisma.usuario.update({
      where: { id },
      data: {
        senhaHash: await hashSenha(provisoria.senha),
        senhaProvisoriaExpiraEm: provisoria.expiraEm,
        trocaObrigatoria: true,
        falhasSeguidas: 0,
        bloqueadoAte: null,
        versaoToken: { increment: 1 },
      },
      select: SAIDA,
    });
    await this.sessoes.revogarTodas(id, 'SENHA_PROVISORIA');
    await this.prisma.eventoAcesso.create({
      data: { usuarioId: id, tipo: 'SENHA_PROVISORIA', detalhe: `gerada pelo admin ${adminId}` },
    });
    return { usuario, senhaProvisoria: provisoria.senha, expiraEm: provisoria.expiraEm };
  }

  /** Encerra todas as sessões (celular perdido, desligamento). */
  async revogarSessoes(id: number, adminId: number) {
    await this.garantirExiste(id);
    await this.prisma.usuario.update({ where: { id }, data: { versaoToken: { increment: 1 } } });
    const sessoes = await this.sessoes.revogarTodas(id, 'REVOGADO_PELO_ADMIN');
    await this.prisma.eventoAcesso.create({
      data: { usuarioId: id, tipo: 'REVOGACAO', detalhe: `pelo admin ${adminId}` },
    });
    return { sessoesEncerradas: sessoes };
  }

  private async garantirExiste(id: number) {
    const u = await this.prisma.usuario.findUnique({ where: { id }, select: { id: true } });
    if (!u) throw naoEncontrado();
  }
}
