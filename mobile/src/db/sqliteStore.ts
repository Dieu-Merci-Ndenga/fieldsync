import * as SQLite from 'expo-sqlite';
import { LocalInspection, LocalPhoto, OutboxOp, Store } from '../core/types';

const SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS inspections (
  id TEXT PRIMARY KEY, fields TEXT NOT NULL, base_version INTEGER NOT NULL,
  sync_state TEXT NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS outbox (
  op_id TEXT PRIMARY KEY, inspection_id TEXT NOT NULL, base_version INTEGER NOT NULL,
  patch TEXT NOT NULL, force INTEGER NOT NULL, created_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL, last_error TEXT, conflicts TEXT
);
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY, inspection_id TEXT NOT NULL, uri TEXT NOT NULL,
  mime TEXT NOT NULL, uploaded INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

type Row = Record<string, any>;
const toInspection = (r: Row): LocalInspection => ({
  id: r.id,
  fields: JSON.parse(r.fields),
  baseVersion: r.base_version,
  syncState: r.sync_state,
  updatedAt: r.updated_at,
});
const toOp = (r: Row): OutboxOp => ({
  opId: r.op_id,
  inspectionId: r.inspection_id,
  baseVersion: r.base_version,
  patch: JSON.parse(r.patch),
  force: !!r.force,
  createdAt: r.created_at,
  attempts: r.attempts,
  lastError: r.last_error,
  conflicts: r.conflicts ? JSON.parse(r.conflicts) : null,
});

export async function openStore(name = 'fieldsync.db'): Promise<Store> {
  const db = await SQLite.openDatabaseAsync(name);
  await db.execAsync(SCHEMA);

  const writeOp = (op: OutboxOp) =>
    db.runAsync(
      `INSERT OR REPLACE INTO outbox (op_id, inspection_id, base_version, patch, force, created_at, attempts, last_error, conflicts)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      op.opId,
      op.inspectionId,
      op.baseVersion,
      JSON.stringify(op.patch),
      op.force ? 1 : 0,
      op.createdAt,
      op.attempts,
      op.lastError,
      op.conflicts ? JSON.stringify(op.conflicts) : null,
    );

  return {
    async getInspection(id) {
      const r = await db.getFirstAsync<Row>('SELECT * FROM inspections WHERE id = ?', id);
      return r ? toInspection(r) : null;
    },
    async listInspections() {
      return (await db.getAllAsync<Row>('SELECT * FROM inspections ORDER BY updated_at DESC')).map(toInspection);
    },
    async saveInspection(i) {
      await db.runAsync(
        'INSERT OR REPLACE INTO inspections (id, fields, base_version, sync_state, updated_at) VALUES (?,?,?,?,?)',
        i.id,
        JSON.stringify(i.fields),
        i.baseVersion,
        i.syncState,
        i.updatedAt,
      );
    },
    async listOutbox() {
      return (await db.getAllAsync<Row>('SELECT * FROM outbox ORDER BY created_at')).map(toOp);
    },
    addOp: async (op) => void (await writeOp(op)),
    updateOp: async (op) => void (await writeOp(op)),
    async removeOp(opId) {
      await db.runAsync('DELETE FROM outbox WHERE op_id = ?', opId);
    },
    async addPhoto(p: LocalPhoto) {
      await db.runAsync(
        'INSERT OR REPLACE INTO photos (id, inspection_id, uri, mime, uploaded) VALUES (?,?,?,?,0)',
        p.id,
        p.inspectionId,
        p.uri,
        p.mime,
      );
    },
    async listPhotos(inspectionId) {
      const rows = inspectionId
        ? await db.getAllAsync<Row>('SELECT * FROM photos WHERE inspection_id = ?', inspectionId)
        : await db.getAllAsync<Row>('SELECT * FROM photos');
      return rows.map((r) => ({
        id: r.id,
        inspectionId: r.inspection_id,
        uri: r.uri,
        mime: r.mime,
        uploaded: !!r.uploaded,
      }));
    },
    async markPhotoUploaded(id) {
      await db.runAsync('UPDATE photos SET uploaded = 1 WHERE id = ?', id);
    },
    async getCursor() {
      return (await db.getFirstAsync<Row>("SELECT value FROM meta WHERE key = 'cursor'"))?.value ?? '0';
    },
    async setCursor(c) {
      await db.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES ('cursor', ?)", c);
    },
  };
}
