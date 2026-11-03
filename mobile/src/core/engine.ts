import { Api, Fields, LocalInspection, OutboxOp, PhotoMeta, Store, SyncState } from './types';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncReport {
  status: SyncStatus;
  pushed: number;
  conflicts: number;
  error?: string;
}

const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

export class SyncEngine {
  private running: Promise<SyncReport> | null = null;
  private listeners = new Set<(r: SyncReport) => void>();
  last: SyncReport = { status: 'idle', pushed: 0, conflicts: 0 };

  constructor(
    private store: Store,
    private api: Api,
    private now = () => Date.now(),
  ) {}

  subscribe(fn: (r: SyncReport) => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private emit(r: SyncReport) {
    this.last = r;
    this.listeners.forEach((l) => l(r));
  }

  // ---- local-first writes: always succeed offline -------------------------

  async createInspection(patch: Fields): Promise<string> {
    const id = uuid();
    await this.store.saveInspection({ id, fields: {}, baseVersion: 0, syncState: 'pending', updatedAt: this.now() });
    await this.edit(id, patch);
    return id;
  }

  async edit(id: string, patch: Fields): Promise<void> {
    const insp = await this.store.getInspection(id);
    if (!insp) throw new Error('inspection not found');
    const syncState: SyncState = insp.syncState === 'conflict' ? 'conflict' : 'pending';
    // Persist the edit and its outbox entry together-ish: op first, so a crash never loses an edit.
    await this.store.addOp({
      opId: uuid(),
      inspectionId: id,
      baseVersion: insp.baseVersion,
      patch,
      force: false,
      createdAt: this.now(),
      attempts: 0,
      lastError: null,
      conflicts: null,
    });
    await this.store.saveInspection({
      ...insp,
      fields: { ...insp.fields, ...patch },
      syncState,
      updatedAt: this.now(),
    });
  }

  async addPhoto(inspectionId: string, uri: string, mime: string, caption = ''): Promise<string> {
    const id = uuid();
    await this.store.addPhoto({ id, inspectionId, uri, mime, uploaded: false });
    const meta: PhotoMeta = { caption, mime };
    await this.edit(inspectionId, { [`photo:${id}`]: meta });
    return id;
  }

  // ---- conflict resolution ------------------------------------------------

  /** Keep my values: replay the op on top of the server version, overwriting the conflicting fields. */
  async resolveKeepMine(opId: string): Promise<void> {
    const op = (await this.store.listOutbox()).find((o) => o.opId === opId);
    if (!op) return;
    await this.store.updateOp({ ...op, force: true, conflicts: null, lastError: null });
    await this.refreshState(op.inspectionId);
  }

  /** Keep theirs: discard my op and show the server's values. */
  async resolveKeepTheirs(opId: string): Promise<void> {
    const op = (await this.store.listOutbox()).find((o) => o.opId === opId);
    if (!op) return;
    await this.store.removeOp(opId);
    const insp = await this.store.getInspection(op.inspectionId);
    if (insp) {
      for (const c of op.conflicts ?? []) insp.fields[c.field] = c.theirs;
      for (const f of Object.keys(op.patch)) {
        if (!(op.conflicts ?? []).some((c) => c.field === f)) insp.fields[f] = op.patch[f];
      }
      await this.store.saveInspection(insp);
    }
    await this.refreshState(op.inspectionId);
  }

  private async refreshState(inspectionId: string) {
    const insp = await this.store.getInspection(inspectionId);
    if (!insp) return;
    const ops = (await this.store.listOutbox()).filter((o) => o.inspectionId === inspectionId);
    const syncState: SyncState = ops.some((o) => o.conflicts) ? 'conflict' : ops.length ? 'pending' : 'synced';
    await this.store.saveInspection({ ...insp, syncState });
  }

  // ---- synchronisation ----------------------------------------------------

  /** Single-flight: concurrent callers share one run. Safe to call at any time. */
  sync(): Promise<SyncReport> {
    if (!this.running) {
      this.running = this.run().finally(() => (this.running = null));
    }
    return this.running;
  }

  private async run(): Promise<SyncReport> {
    this.emit({ ...this.last, status: 'syncing', error: undefined });
    let pushed = 0;
    try {
      pushed = await this.pushOps();
      const photoFailures = await this.uploadPhotos();
      await this.pull();
      const conflicts = (await this.store.listOutbox()).filter((o) => o.conflicts).length;
      const r: SyncReport = photoFailures.length
        ? {
            status: 'error',
            pushed,
            conflicts,
            error: `${photoFailures.length} photo(s) not uploaded yet, will retry (${photoFailures[0]})`,
          }
        : { status: 'idle', pushed, conflicts };
      this.emit(r);
      return r;
    } catch (e) {
      const r: SyncReport = {
        status: isNetworkError(e) ? 'offline' : 'error',
        pushed,
        conflicts: 0,
        error: (e as Error).message,
      };
      this.emit(r);
      return r;
    }
  }

  private async pushOps(): Promise<number> {
    const outbox = (await this.store.listOutbox()).sort((a, b) => a.createdAt - b.createdAt);
    // Ops of an inspection stay ordered: stop that inspection at its first conflict.
    const blocked = new Set(outbox.filter((o) => o.conflicts).map((o) => o.inspectionId));
    const ready: OutboxOp[] = [];
    for (const op of outbox) {
      if (op.conflicts || blocked.has(op.inspectionId)) continue;
      ready.push(op);
    }
    if (!ready.length) return 0;

    const results = await this.api.push(
      ready.map(({ opId, inspectionId, baseVersion, patch, force }) => ({
        opId,
        inspectionId,
        baseVersion,
        patch,
        force,
      })),
    );
    let applied = 0;
    const touched = new Set<string>();
    const stopped = new Set<string>();
    for (const op of ready) {
      const r = results.find((x) => x.opId === op.opId);
      touched.add(op.inspectionId);
      if (!r || r.status === 'error' || stopped.has(op.inspectionId)) {
        stopped.add(op.inspectionId);
        if (r?.status === 'error')
          await this.store.updateOp({ ...op, attempts: op.attempts + 1, lastError: r.message });
      } else if (r.status === 'applied') {
        await this.store.removeOp(op.opId);
        applied++;
      } else {
        stopped.add(op.inspectionId);
        await this.store.updateOp({ ...op, attempts: op.attempts + 1, conflicts: r.conflicts, lastError: null });
      }
    }
    for (const id of touched) await this.refreshState(id);
    return applied;
  }

  /** A failing photo must not block data sync: network errors abort, server errors are reported and retried later. */
  private async uploadPhotos(): Promise<string[]> {
    const failures: string[] = [];
    for (const p of await this.store.listPhotos()) {
      if (p.uploaded) continue;
      try {
        await this.api.uploadPhoto(p);
        await this.store.markPhotoUploaded(p.id);
      } catch (e) {
        if (isNetworkError(e)) throw e;
        failures.push((e as Error).message);
      }
    }
    return failures;
  }

  private async pull() {
    let cursor = await this.store.getCursor();
    for (;;) {
      const page = await this.api.pull(cursor);
      const outbox = await this.store.listOutbox();
      for (const s of page.inspections) {
        const local = await this.store.getInspection(s.id);
        const mine = outbox.filter((o) => o.inspectionId === s.id);
        let fields: Fields = { ...s.fields };
        for (const op of mine.sort((a, b) => a.createdAt - b.createdAt)) {
          // Conflicting ops keep showing the server value until the user resolves them.
          const patch = { ...op.patch };
          for (const c of op.conflicts ?? []) delete patch[c.field];
          fields = { ...fields, ...patch };
        }
        const syncState: SyncState = mine.some((o) => o.conflicts) ? 'conflict' : mine.length ? 'pending' : 'synced';
        const next: LocalInspection = {
          id: s.id,
          fields,
          baseVersion: s.version,
          syncState,
          updatedAt: local?.updatedAt ?? this.now(),
        };
        await this.store.saveInspection(next);
      }
      cursor = page.cursor;
      await this.store.setCursor(cursor);
      if (!page.more) break;
    }
  }
}

export function isNetworkError(e: unknown): boolean {
  const m = (e as Error)?.message ?? '';
  return e instanceof TypeError || /network|timeout|failed to fetch|abort/i.test(m);
}
