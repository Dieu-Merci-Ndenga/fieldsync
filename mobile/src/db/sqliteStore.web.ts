import { MemoryStore } from '../core/memory';
import { LocalInspection, LocalPhoto, OutboxOp, Store } from '../core/types';

const KEY = 'fieldsync.db';

interface Snapshot {
  inspections: LocalInspection[];
  outbox: OutboxOp[];
  photos: LocalPhoto[];
  cursor: string;
}

/** Browser build: same Store contract, persisted to localStorage (expo-sqlite on web needs special COOP/COEP headers). */
class WebStore extends MemoryStore {
  constructor() {
    super();
    try {
      const snap: Snapshot | null = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (snap) {
        snap.inspections.forEach((i) => this.inspections.set(i.id, i));
        snap.outbox.forEach((o) => this.outbox.set(o.opId, o));
        snap.photos.forEach((p) => this.photos.set(p.id, p));
        this.cursor = snap.cursor;
      }
    } catch {
      /* corrupted snapshot: start clean */
    }
  }

  private persist() {
    const snap: Snapshot = {
      inspections: [...this.inspections.values()],
      outbox: [...this.outbox.values()],
      photos: [...this.photos.values()],
      cursor: this.cursor,
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(snap));
    } catch {
      // Quota exceeded (large photos): keep working in memory.
    }
  }
}

for (const m of [
  'saveInspection',
  'addOp',
  'updateOp',
  'removeOp',
  'addPhoto',
  'markPhotoUploaded',
  'setPhotoError',
  'removePhoto',
  'setCursor',
] as const) {
  const orig = MemoryStore.prototype[m] as (...a: unknown[]) => Promise<void>;
  (WebStore.prototype as unknown as Record<string, unknown>)[m] = async function (this: WebStore, ...a: unknown[]) {
    await orig.apply(this, a);
    (this as unknown as { persist(): void }).persist();
  };
}

export async function openStore(): Promise<Store> {
  return new WebStore();
}
