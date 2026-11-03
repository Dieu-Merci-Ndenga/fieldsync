import { BadRequestException } from '@nestjs/common';
import { PushOp } from './sync.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELD_RE = /^[A-Za-z0-9_.:-]{1,80}$/;
export const MAX_OPS = 100;
export const MAX_PATCH_BYTES = 64 * 1024;

export function validateOps(ops: unknown): PushOp[] {
  if (!Array.isArray(ops)) throw new BadRequestException('ops must be an array');
  if (ops.length > MAX_OPS) throw new BadRequestException(`at most ${MAX_OPS} ops per request`);
  return ops.map((raw, i) => {
    const op = raw as Partial<PushOp>;
    const bad = (m: string) => new BadRequestException(`ops[${i}]: ${m}`);
    if (typeof op?.opId !== 'string' || !UUID_RE.test(op.opId)) throw bad('opId must be a UUID');
    if (typeof op.inspectionId !== 'string' || !UUID_RE.test(op.inspectionId)) throw bad('inspectionId must be a UUID');
    const base = op.baseVersion ?? 0;
    if (!Number.isInteger(base) || base < 0) throw bad('baseVersion must be a non-negative integer');
    const patch = op.patch;
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) throw bad('patch must be an object');
    const keys = Object.keys(patch);
    if (!keys.length) throw bad('patch must not be empty');
    for (const k of keys) {
      if (!FIELD_RE.test(k) || k === '__proto__') throw bad(`invalid field name "${k.slice(0, 20)}"`);
    }
    if (JSON.stringify(patch).length > MAX_PATCH_BYTES) throw bad('patch too large');
    return { opId: op.opId, inspectionId: op.inspectionId, baseVersion: base, patch, force: op.force === true };
  });
}
