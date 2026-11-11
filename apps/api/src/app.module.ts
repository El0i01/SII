import path from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BancoModule } from './banco/banco.module';
import { validarEnv } from './config/env';
import { RedisModule } from './redis/redis.module';
import { StatusModule } from './status/status.module';

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
    RedisModule,
    StatusModule,
  ],
})
export class AppModule {}
