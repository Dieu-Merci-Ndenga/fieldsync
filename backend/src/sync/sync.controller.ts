import { BadRequestException, Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { PushOp, SyncService } from './sync.service';

@Controller()
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('health')
  health() {
    return { ok: true };
  }

  @Post('sync/push')
  push(@Headers('x-user-id') userId: string, @Body() body: { ops: PushOp[] }) {
    if (!userId) throw new BadRequestException('x-user-id header required');
    if (!Array.isArray(body?.ops)) throw new BadRequestException('ops must be an array');
    for (const op of body.ops) {
      if (!op?.opId || !op.inspectionId || typeof op.patch !== 'object' || op.patch === null) {
        throw new BadRequestException('invalid operation');
      }
    }
    return this.sync.push(userId, body.ops.map((o) => ({ ...o, baseVersion: o.baseVersion ?? 0 })));
  }

  @Get('sync/pull')
  pull(@Query('cursor') cursor = '0') {
    if (!/^\d+$/.test(cursor)) throw new BadRequestException('invalid cursor');
    return this.sync.pull(cursor);
  }

  @Get('inspections/:id/history')
  history(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.sync.history(id);
  }
}
