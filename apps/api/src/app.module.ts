import path from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { BancoModule } from './banco/banco.module';
import { validarEnv } from './config/env';
import { CargasModule } from './cargas/cargas.module';
import { CriptoModule } from './cripto/cripto.service';
import { EducacaoModule } from './educacao/educacao.module';
import { PessoasModule } from './pessoas/pessoas.module';
import { RedisModule } from './redis/redis.module';
import { StatusModule } from './status/status.module';
import { TerritorioModule } from './territorio/territorio.module';
import { UsuariosModule } from './usuarios/usuarios.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // .env da raiz do monorepo (a partir de apps/api/src ou apps/api/dist).
      envFilePath: [path.resolve(__dirname, '../../../.env')],
      validate: validarEnv,
    }),
    BancoModule,
    CriptoModule,
    RedisModule,
    AuthModule,
    StatusModule,
    UsuariosModule,
    PessoasModule,
    EducacaoModule,
    TerritorioModule,
    CargasModule,
  ],
})
export class AppModule {}
