import { LocalInspection, LocalPhoto, OutboxOp, Store } from './types';

export class MemoryStore implements Store {
  inspections = new Map<string, LocalInspection>();
  outbox = new Map<string, OutboxOp>();
  photos = new Map<string, LocalPhoto>();
  cursor = '0';
  async getInspection(id: string) {
    const i = this.inspections.get(id);
    return i ? structuredClone(i) : null;
  }
  async listInspections() {
    return [...this.inspections.values()].map((i) => structuredClone(i));
  }
  async saveInspection(i: LocalInspection) {
    this.inspections.set(i.id, structuredClone(i));
  }
  async listOutbox() {
    return [...this.outbox.values()].map((o) => structuredClone(o));
  }
  async addOp(op: OutboxOp) {
    this.outbox.set(op.opId, structuredClone(op));
  }
  async updateOp(op: OutboxOp) {
    this.outbox.set(op.opId, structuredClone(op));
  }
  async removeOp(id: string) {
    this.outbox.delete(id);
  }
  async addPhoto(p: LocalPhoto) {
    this.photos.set(p.id, p);
  }
  async listPhotos(inspectionId?: string) {
    return [...this.photos.values()].filter((p) => !inspectionId || p.inspectionId === inspectionId);
  }
  async markPhotoUploaded(id: string) {
    const p = this.photos.get(id);
    if (p) p.uploaded = true;
  }
  async getCursor() {
    return this.cursor;
  }
  async setCursor(c: string) {
    this.cursor = c;
  }
}
