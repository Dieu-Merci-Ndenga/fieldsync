import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import { AppModule } from './app.module';

export function configure(app: NestExpressApplication) {
  app.enableCors();
  app.use('/photos', express.raw({ type: ['image/jpeg', 'image/png'], limit: '15mb' }));
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configure(app);
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
if (require.main === module) bootstrap();
