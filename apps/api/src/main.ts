import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { readPort } from './config';

async function bootstrap(): Promise<void> {
  // Plataformas de hospedagem definem a porta em PORT; localmente vale API_PORT.
  const port = process.env.API_PORT ? readPort('API_PORT', 3000) : readPort('PORT', 3000);
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Na Vercel a requisição chega por proxy, que sobrescreve X-Forwarded-For com o IP do cliente.
  // Sem isto, o rate limit veria o IP do proxy e todos os usuários dividiriam o mesmo limite.
  if (process.env.VERCEL) app.set('trust proxy', true);
  app.enableShutdownHooks();

  await app.listen(port);
  Logger.log(`API ouvindo em http://localhost:${port} (health: /health)`, 'Bootstrap');
}

void bootstrap();
