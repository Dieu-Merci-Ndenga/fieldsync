import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configure } from '../src/main';

// Requires a running Postgres (docker compose up -d db). Skipped otherwise.
const d = process.env.DATABASE_URL ? describe : describe.skip;

d('sync API (e2e)', () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configure(app);
    await app.init();
  });
  afterAll(() => app.close());

  const push = (user: string, ops: object[]) =>
    request(app.getHttpServer()).post('/sync/push').set('x-user-id', user).send({ ops });

  it('creates, is idempotent, merges, detects and resolves conflicts', async () => {
    const id = randomUUID();
    const op1 = randomUUID();
    let r = await push('alice', [{ opId: op1, inspectionId: id, baseVersion: 0, patch: { title: 'Pump', notes: '' } }]);
    expect(r.body[0]).toMatchObject({ status: 'applied', version: 1 });

    r = await push('alice', [{ opId: op1, inspectionId: id, baseVersion: 0, patch: { title: 'Pump', notes: '' } }]);
    expect(r.body[0]).toMatchObject({ status: 'applied', version: 1 });

    await push('bob', [{ opId: randomUUID(), inspectionId: id, baseVersion: 1, patch: { notes: 'bob' } }]);

    r = await push('alice', [{ opId: randomUUID(), inspectionId: id, baseVersion: 1, patch: { title: 'Pump A' } }]);
    expect(r.body[0]).toMatchObject({ status: 'applied', merged: true, version: 3 });

    const conflictOp = randomUUID();
    r = await push('alice', [{ opId: conflictOp, inspectionId: id, baseVersion: 1, patch: { notes: 'alice' } }]);
    expect(r.body[0]).toMatchObject({ status: 'conflict', serverVersion: 3 });
    expect(r.body[0].conflicts[0]).toMatchObject({ field: 'notes', mine: 'alice', theirs: 'bob' });

    r = await push('alice', [{ opId: conflictOp, inspectionId: id, baseVersion: 3, patch: { notes: 'alice' }, force: true }]);
    expect(r.body[0]).toMatchObject({ status: 'applied', version: 4 });

    const h = await request(app.getHttpServer()).get(`/inspections/${id}/history`);
    expect(h.body.map((e: { userId: string }) => e.userId)).toEqual(['alice', 'bob', 'alice', 'alice']);

    const pull = await request(app.getHttpServer()).get('/sync/pull?cursor=0');
    expect(pull.body.inspections.find((i: { id: string }) => i.id === id).fields).toMatchObject({ title: 'Pump A', notes: 'alice' });
  });

  it('uploads and serves a photo', async () => {
    const pid = randomUUID();
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    await request(app.getHttpServer()).put(`/photos/${pid}?inspectionId=${randomUUID()}`)
      .set('x-user-id', 'alice').set('Content-Type', 'image/jpeg').send(bytes).expect(200);
    const g = await request(app.getHttpServer()).get(`/photos/${pid}`).expect(200);
    expect(g.headers['content-type']).toContain('image/jpeg');
  });
});
