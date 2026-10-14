import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { readPort } from './config';

async function bootstrap(): Promise<void> {
  const port = readPort('API_PORT', 3000);
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  await app.listen(port);
  Logger.log(`API ouvindo em http://localhost:${port} (health: /health)`, 'Bootstrap');
}

void bootstrap();
