import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import { Env } from '../config/env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EscopoGuard, JwtGuard, PerfisGuard, TrocaObrigatoriaGuard } from './guards';
import { JwtStrategy } from './jwt.strategy';
import { SessoesService } from './sessoes.service';
import { ACESSO_MINUTOS } from './tokens';

const ehLogin = (req: Request) => req.method === 'POST' && req.path.endsWith('/auth/login');

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SEGREDO', { infer: true }),
        signOptions: { algorithm: 'HS256', expiresIn: `${ACESSO_MINUTOS}m` },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
    // Limite por IP. "login": tentativas de login por minuto (o bloqueio por conta fica no banco).
    // "padrao": teto geral contra abuso. Em memória: a API roda numa instância só.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [
          {
            name: 'login',
            ttl: 60_000,
            limit: config.get('LOGIN_LIMITE_POR_MINUTO', { infer: true }),
            skipIf: (ctx) => !ehLogin(ctx.switchToHttp().getRequest<Request>()),
          },
          { name: 'padrao', ttl: 60_000, limit: 600 },
        ],
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessoesService,
    JwtStrategy,
    // Ordem importa: limite → login → troca obrigatória → perfil → escopo.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtGuard },
    { provide: APP_GUARD, useClass: TrocaObrigatoriaGuard },
    { provide: APP_GUARD, useClass: PerfisGuard },
    { provide: APP_GUARD, useClass: EscopoGuard },
  ],
  exports: [SessoesService],
})
export class AuthModule {}
