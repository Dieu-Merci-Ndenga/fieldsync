import { BadRequestException, Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { SyncService } from './sync.service';
import { validateOps } from './validation';

@Controller()
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('health')
  health() {
    return { ok: true };
  }

  @Post('sync/push')
  push(@Headers('x-user-id') userId: string, @Body() body: { ops?: unknown }) {
    return this.sync.push(userId, validateOps(body?.ops));
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
