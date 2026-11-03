export type Fields = Record<string, unknown>;

export interface ChecklistItem {
  label: string;
  checked: boolean;
  comment?: string;
}

export interface PhotoMeta {
  caption: string;
  mime: string;
}

export type SyncState = 'synced' | 'pending' | 'conflict';

export interface LocalInspection {
  id: string;
  fields: Fields; // what the user sees (server state + pending local edits)
  baseVersion: number; // last server version this device has seen
  syncState: SyncState;
  updatedAt: number;
}

export interface FieldConflict {
  field: string;
  mine: unknown;
  theirs: unknown;
}

export interface OutboxOp {
  opId: string;
  inspectionId: string;
  baseVersion: number;
  patch: Fields;
  force: boolean;
  createdAt: number;
  attempts: number;
  lastError: string | null;
  conflicts: FieldConflict[] | null;
}

export interface LocalPhoto {
  id: string;
  inspectionId: string;
  uri: string;
  mime: string;
  uploaded: boolean;
}

export interface ServerInspection {
  id: string;
  fields: Fields;
  version: number;
}

export type PushResult =
  | { opId: string; status: 'applied'; version: number; merged: boolean }
  | { opId: string; status: 'conflict'; serverVersion: number; conflicts: FieldConflict[] }
  | { opId: string; status: 'error'; message: string };

export interface HistoryItem {
  id: string;
  version: number;
  userId: string;
  changes: Fields;
  merged: boolean;
  createdAt: string;
}

export interface Api {
  push(ops: Pick<OutboxOp, 'opId' | 'inspectionId' | 'baseVersion' | 'patch' | 'force'>[]): Promise<PushResult[]>;
  pull(cursor: string): Promise<{ cursor: string; more: boolean; inspections: ServerInspection[] }>;
  uploadPhoto(photo: LocalPhoto): Promise<void>;
  history(inspectionId: string): Promise<HistoryItem[]>;
}

export interface Store {
  getInspection(id: string): Promise<LocalInspection | null>;
  listInspections(): Promise<LocalInspection[]>;
  saveInspection(i: LocalInspection): Promise<void>;
  listOutbox(): Promise<OutboxOp[]>;
  addOp(op: OutboxOp): Promise<void>;
  updateOp(op: OutboxOp): Promise<void>;
  removeOp(opId: string): Promise<void>;
  addPhoto(p: LocalPhoto): Promise<void>;
  listPhotos(inspectionId?: string): Promise<LocalPhoto[]>;
  markPhotoUploaded(id: string): Promise<void>;
  getCursor(): Promise<string>;
  setCursor(c: string): Promise<void>;
}
