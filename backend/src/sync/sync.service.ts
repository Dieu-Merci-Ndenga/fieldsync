import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In, MoreThan } from 'typeorm';
import { ChangeLog, Inspection, ProcessedOp } from '../entities';
import { Fields, mergePatch } from './merge';

export interface PushOp {
  opId: string;
  inspectionId: string;
  baseVersion: number;
  patch: Fields;
  /** Resolve a conflict by overwriting the server's values for the patched fields. */
  force?: boolean;
}

export type OpResult =
  | { opId: string; status: 'applied'; version: number; merged: boolean }
  | { opId: string; status: 'conflict'; serverVersion: number; conflicts: { field: string; mine: unknown; theirs: unknown }[] }
  | { opId: string; status: 'error'; message: string };

@Injectable()
export class SyncService {
  constructor(private readonly ds: DataSource) {}

  async push(userId: string, ops: PushOp[]): Promise<OpResult[]> {
    const results: OpResult[] = [];
    for (const op of ops) {
      try {
        results.push(await this.ds.transaction((m) => this.applyOp(m, userId, op)));
      } catch (e) {
        results.push({ opId: op.opId, status: 'error', message: (e as Error).message });
      }
    }
    return results;
  }

  private async applyOp(m: EntityManager, userId: string, op: PushOp): Promise<OpResult> {
    const done = await m.findOne(ProcessedOp, { where: { opId: op.opId } });
    if (done) return done.result as unknown as OpResult;

    let insp = await m.findOne(Inspection, { where: { id: op.inspectionId }, lock: { mode: 'pessimistic_write' } });
    if (!insp) {
      await m.createQueryBuilder().insert().into(Inspection)
        .values({ id: op.inspectionId, fields: {}, version: 0, updatedBy: userId }).orIgnore().execute();
      insp = await m.findOneOrFail(Inspection, { where: { id: op.inspectionId }, lock: { mode: 'pessimistic_write' } });
    }

    const history = op.force || op.baseVersion >= insp.version
      ? []
      : await m.find(ChangeLog, { where: { inspectionId: insp.id, version: MoreThan(op.baseVersion) } });

    const r = op.force
      ? ({ status: 'applied', fields: { ...insp.fields, ...op.patch }, applied: op.patch, merged: true } as const)
      : mergePatch({ serverFields: insp.fields, serverVersion: insp.version, baseVersion: op.baseVersion, patch: op.patch, history, userId });

    let result: OpResult;
    if (r.status === 'conflict') {
      return { opId: op.opId, status: 'conflict', serverVersion: insp.version, conflicts: r.conflicts };
    } else {
      insp.fields = r.fields;
      insp.version += 1;
      insp.updatedBy = userId;
      insp.updatedAt = new Date();
      await m.save(insp);
      await m.save(m.create(ChangeLog, {
        inspectionId: insp.id, version: insp.version, userId, changes: r.applied, opId: op.opId, merged: r.merged,
      }));
      result = { opId: op.opId, status: 'applied', version: insp.version, merged: r.merged };
    }
    // Conflicts are not stored so the client can retry the same op with force.
    await m.save(m.create(ProcessedOp, { opId: op.opId, result: result as unknown as Record<string, unknown> }));
    return result;
  }

  async pull(cursor: string) {
    const entries = await this.ds.getRepository(ChangeLog).createQueryBuilder('c')
      .where('c.id > :cursor', { cursor }).orderBy('c.id', 'ASC').limit(500).getMany();
    const ids = [...new Set(entries.map((e) => e.inspectionId))];
    const inspections = ids.length ? await this.ds.getRepository(Inspection).findBy({ id: In(ids) }) : [];
    const next = entries.length ? entries[entries.length - 1].id : cursor;
    return { cursor: next, more: entries.length === 500, inspections };
  }

  history(inspectionId: string) {
    return this.ds.getRepository(ChangeLog).find({ where: { inspectionId }, order: { id: 'ASC' } });
  }
}
