import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { FiltroErros } from './comum/erros';

/** Configuração comum ao servidor real e aos testes e2e. */
export function configurarApp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.useGlobalFilters(new FiltroErros());
  app.enableCors({
    origin: process.env.WEB_ORIGEM ?? 'http://localhost:3000',
    credentials: true,
  });

  const documento = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('SII · Sistema Integrado Intersecretarial')
      .setDescription('API da Prefeitura de Itapuã do Oeste/RO')
      .setVersion('0.1')
      .addBearerAuth({ type: 'http', scheme: 'bearer', description: 'App mobile' })
      .addCookieAuth('sii_acesso', { type: 'apiKey', in: 'cookie', description: 'Web' })
      .addSecurityRequirements('bearer')
      .addSecurityRequirements('cookie')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, documento);
}
