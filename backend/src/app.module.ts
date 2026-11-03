import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChangeLog, Inspection, Photo, ProcessedOp } from './entities';
import { AuthGuard } from './auth.guard';
import { loadConfig } from './config';
import { PhotosController } from './photos.controller';
import { SyncController } from './sync/sync.controller';
import { SyncService } from './sync/sync.service';

const entities = [Inspection, ChangeLog, ProcessedOp, Photo];

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: loadConfig().databaseUrl,
      entities,
      synchronize: true, // schema is auto-managed; see README limitations
    }),
    TypeOrmModule.forFeature(entities),
  ],
  controllers: [SyncController, PhotosController],
  providers: [SyncService, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
