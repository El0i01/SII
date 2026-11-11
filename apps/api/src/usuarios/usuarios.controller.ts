import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CriarUsuario } from '@sii/shared';
import { UsuarioAtual, type UsuarioAutenticado } from '../comum/usuario-autenticado';
import { ZodPipe } from '../comum/zod.pipe';
import { Perfis } from '../auth/decorators';
import { UsuariosService } from './usuarios.service';

@ApiTags('usuarios')
@Perfis('ADMIN_CTI')
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar usuários' })
  listar() {
    return this.usuarios.listar();
  }

  @Post()
  @ApiOperation({ summary: 'Criar usuário (recebe senha provisória de 24 h)' })
  criar(
    @Body(new ZodPipe(CriarUsuario)) dados: CriarUsuario,
    @UsuarioAtual() admin: UsuarioAutenticado,
  ) {
    return this.usuarios.criar(dados, admin.id);
  }

  @Post(':id/senha-provisoria')
  @ApiOperation({ summary: 'Gerar nova senha provisória (também destrava a conta)' })
  senhaProvisoria(
    @Param('id', ParseIntPipe) id: number,
    @UsuarioAtual() admin: UsuarioAutenticado,
  ) {
    return this.usuarios.novaSenhaProvisoria(id, admin.id);
  }

  @Post(':id/revogar-sessoes')
  @ApiOperation({ summary: 'Encerrar todas as sessões do usuário' })
  revogar(@Param('id', ParseIntPipe) id: number, @UsuarioAtual() admin: UsuarioAutenticado) {
    return this.usuarios.revogarSessoes(id, admin.id);
  }
}
