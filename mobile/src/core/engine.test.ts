import { beforeEach, describe, expect, it } from 'vitest';
import { mergePatch } from '../../../backend/src/sync/merge';
import { SyncEngine } from './engine';
import { MemoryStore } from './memory';
import { Api, Fields, LocalPhoto, PushResult } from './types';

/** In-process fake of the NestJS server, reusing its real merge logic. */
class FakeServer {
  data = new Map<string, { fields: Fields; version: number }>();
  log: { inspectionId: string; version: number; changes: Fields; userId: string }[] = [];
  done = new Map<string, PushResult>();
  online = true;
  failAfter: number | null = null; // simulate connection drop after N ops were processed
  processed = 0;

  api(userId: string): Api {
    return {
      push: async (ops) => {
        if (!this.online) throw new TypeError('Network request failed');
        const out: PushResult[] = [];
        for (const op of ops) {
          if (this.failAfter !== null && this.processed >= this.failAfter) {
            this.online = false; // server applied N ops but the response is lost
            throw new TypeError('Network request failed');
          }
          this.processed++;
          if (this.done.has(op.opId)) {
            out.push(this.done.get(op.opId)!);
            continue;
          }
          const cur = this.data.get(op.inspectionId) ?? { fields: {}, version: 0 };
          const hist = this.log
            .filter((l) => l.inspectionId === op.inspectionId)
            .map((l) => ({ version: l.version, changes: l.changes, userId: l.userId }));
          const r = op.force
            ? ({ status: 'applied', fields: { ...cur.fields, ...op.patch }, applied: op.patch, merged: true } as const)
            : mergePatch({
                serverFields: cur.fields,
                serverVersion: cur.version,
                baseVersion: op.baseVersion,
                patch: op.patch,
                history: hist,
                userId,
              });
          if (r.status === 'conflict') {
            out.push({ opId: op.opId, status: 'conflict', serverVersion: cur.version, conflicts: r.conflicts });
            continue;
          }
          const version = cur.version + 1;
          this.data.set(op.inspectionId, { fields: r.fields, version });
          this.log.push({ inspectionId: op.inspectionId, version, changes: r.applied, userId });
          const res: PushResult = { opId: op.opId, status: 'applied', version, merged: r.merged };
          this.done.set(op.opId, res);
          out.push(res);
        }
        return out;
      },
      pull: async () => {
        if (!this.online) throw new TypeError('Network request failed');
        return {
          cursor: String(this.log.length),
          more: false,
          inspections: [...this.data].map(([id, v]) => ({ id, ...structuredClone(v) })),
        };
      },
      uploadPhoto: async (_p: LocalPhoto) => {
        if (!this.online) throw new TypeError('Network request failed');
      },
      history: async () => [],
    };
  }
}

describe('SyncEngine', () => {
  let server: FakeServer;
  let a: SyncEngine, b: SyncEngine, aStore: MemoryStore, bStore: MemoryStore;
  beforeEach(() => {
    server = new FakeServer();
    aStore = new MemoryStore();
    bStore = new MemoryStore();
    a = new SyncEngine(aStore, server.api('alice'));
    b = new SyncEngine(bStore, server.api('bob'));
  });

  it('records edits offline and syncs when back online', async () => {
    server.online = false;
    const id = await a.createInspection({ title: 'Pump 1', notes: '' });
    await a.addPhoto(id, 'file:///p.jpg', 'image/jpeg', 'leak');
    expect((await a.sync()).status).toBe('offline');
    expect((await aStore.getInspection(id))!.syncState).toBe('pending');
    expect(aStore.outbox.size).toBe(2);

    server.online = true;
    const r = await a.sync();
    expect(r).toMatchObject({ status: 'idle', pushed: 2 });
    expect(aStore.outbox.size).toBe(0);
    expect((await aStore.getInspection(id))!.syncState).toBe('synced');
    expect(server.data.get(id)!.version).toBe(2);
    expect([...aStore.photos.values()][0].uploaded).toBe(true);
  });

  it('resumes after an interrupted sync without duplicating operations', async () => {
    const id = await a.createInspection({ title: 'T' });
    await a.edit(id, { notes: 'one' });
    await a.edit(id, { notes: 'two' });
    server.failAfter = 1;
    expect((await a.sync()).status).toBe('offline');
    server.online = true;
    server.failAfter = null;
    await a.sync();
    expect(aStore.outbox.size).toBe(0);
    expect(server.data.get(id)!.version).toBe(3);
    expect(server.data.get(id)!.fields).toMatchObject({ title: 'T', notes: 'two' });
  });

  it('replays an op whose response was lost idempotently', async () => {
    const id = await a.createInspection({ title: 'T' });
    server.failAfter = 1; // server applies op, connection drops before the client hears
    // processed counter trips on the NEXT op; emulate lost response explicitly:
    const api = server.api('alice');
    const [op] = await aStore.listOutbox();
    await api.push([op]);
    await a.sync();
    expect(server.data.get(id)!.version).toBe(1);
  });

  it('detects conflicts, auto-merges disjoint fields and lets the user resolve', async () => {
    const id = await a.createInspection({ title: 'Pump', notes: '' });
    await a.sync();
    await b.sync();

    await a.edit(id, { notes: 'alice note' });
    await b.edit(id, { notes: 'bob note', title: 'Pump B' });
    await a.sync();
    const rb = await b.sync();
    expect(rb.conflicts).toBe(1);
    expect((await bStore.getInspection(id))!.syncState).toBe('conflict');
    expect((await bStore.getInspection(id))!.fields.notes).toBe('alice note'); // server value shown

    const op = (await bStore.listOutbox())[0];
    expect(op.conflicts![0]).toMatchObject({ field: 'notes', mine: 'bob note', theirs: 'alice note' });

    await b.resolveKeepMine(op.opId);
    await b.sync();
    expect(server.data.get(id)!.fields).toMatchObject({ notes: 'bob note', title: 'Pump B' });
    expect((await bStore.getInspection(id))!.syncState).toBe('synced');
  });

  it('keep theirs drops the local edit', async () => {
    const id = await a.createInspection({ notes: '' });
    await a.sync();
    await b.sync();
    await a.edit(id, { notes: 'A' });
    await b.edit(id, { notes: 'B' });
    await a.sync();
    await b.sync();
    await b.resolveKeepTheirs((await bStore.listOutbox())[0].opId);
    await b.sync();
    expect(server.data.get(id)!.fields.notes).toBe('A');
    expect((await bStore.getInspection(id))!.fields.notes).toBe('A');
    expect(bStore.outbox.size).toBe(0);
  });
});
