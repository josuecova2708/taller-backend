import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const corsOrigins = configService
    .get<string>('CORS_ORIGINS', 'http://localhost:3001,http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);

  console.log(`🚀 Backend escuchando en http://localhost:${port}/api`);
  console.log('🔒 Autenticación JWT global activa (endpoints cerrados por defecto)');
}

bootstrap().catch((error) => {
  // La validación de entorno falla aquí. Mensaje explícito en lugar de un
  // stack trace de Nest, para que el problema sea evidente en la demo.
  console.error('\n❌ El backend no pudo iniciar:\n');
  console.error(`   ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
