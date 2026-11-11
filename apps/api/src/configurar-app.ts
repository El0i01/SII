import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Configuração comum ao servidor real e aos testes e2e. */
export function configurarApp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1');
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
      .build(),
  );
  SwaggerModule.setup('api/docs', app, documento);
}
