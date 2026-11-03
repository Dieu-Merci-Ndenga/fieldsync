import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChangeLog, Inspection, Photo, ProcessedOp } from './entities';
import { PhotosController } from './photos.controller';
import { SyncController } from './sync/sync.controller';
import { SyncService } from './sync/sync.service';

const entities = [Inspection, ChangeLog, ProcessedOp, Photo];

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL ?? 'postgres://fieldsync:fieldsync@localhost:5432/fieldsync',
      entities,
      synchronize: true, // demo project: schema auto-managed
    }),
    TypeOrmModule.forFeature(entities),
  ],
  controllers: [SyncController, PhotosController],
  providers: [SyncService],
})
export class AppModule {}
