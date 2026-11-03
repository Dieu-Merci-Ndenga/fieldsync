export type Fields = Record<string, unknown>;

export interface HistoryEntry {
  version: number;
  changes: Fields;
  userId?: string;
}

export interface MergeInput {
  serverFields: Fields;
  serverVersion: number;
  baseVersion: number;
  patch: Fields;
  history: HistoryEntry[];
  /** Author of the patch: their own earlier edits never conflict with their later ones. */
  userId?: string;
}

export interface FieldConflict {
  field: string;
  mine: unknown;
  theirs: unknown;
}

export type MergeResult =
  | { status: 'applied'; fields: Fields; applied: Fields; merged: boolean }
  | { status: 'conflict'; conflicts: FieldConflict[] };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Field-level three-way merge. A patch based on an older version is accepted
 * when it does not touch fields changed by someone else since that version
 * (or touches them with the same value). Otherwise it is reported as a conflict.
 */
export function mergePatch(input: MergeInput): MergeResult {
  const { serverFields, serverVersion, baseVersion, patch, history, userId } = input;

  if (baseVersion >= serverVersion) {
    return { status: 'applied', fields: { ...serverFields, ...patch }, applied: patch, merged: false };
  }

  const changedSince = new Set<string>();
  for (const h of history) {
    if (h.version > baseVersion && !(userId && h.userId === userId))
      Object.keys(h.changes).forEach((k) => changedSince.add(k));
  }

  const conflicts: FieldConflict[] = [];
  const applied: Fields = {};
  for (const [field, value] of Object.entries(patch)) {
    if (changedSince.has(field) && !same(serverFields[field], value)) {
      conflicts.push({ field, mine: value, theirs: serverFields[field] });
    } else {
      applied[field] = value;
    }
  }

  if (conflicts.length) return { status: 'conflict', conflicts };
  return { status: 'applied', fields: { ...serverFields, ...applied }, applied, merged: true };
}
