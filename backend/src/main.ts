import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import { AppModule } from './app.module';
import { loadConfig } from './config';

export function configure(app: NestExpressApplication) {
  const { corsOrigin } = loadConfig();
  app.disable('x-powered-by');
  if (corsOrigin) app.enableCors({ origin: corsOrigin.split(',') });
  app.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  if (process.env.NODE_ENV !== 'test') {
    const log = new Logger('HTTP');
    app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      res.on('finish', () => log.log(`${req.method} ${req.path} ${res.statusCode}`));
      next();
    });
  }
  app.use('/photos', express.raw({ type: ['image/jpeg', 'image/png'], limit: '15mb' }));
  app.enableShutdownHooks();
}

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: true });
  configure(app);
  await app.listen(config.port, '0.0.0.0');
  new Logger('Bootstrap').log(`FieldSync API listening on :${config.port}`);
}
if (require.main === module) bootstrap();
