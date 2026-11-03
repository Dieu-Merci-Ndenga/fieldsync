import { mergePatch } from './merge';

const history = [
  { version: 1, changes: { title: 'A', notes: '' } },
  { version: 2, changes: { notes: 'server note' } },
];
const base = { serverFields: { title: 'A', notes: 'server note' }, serverVersion: 2, history };

describe('mergePatch', () => {
  it('applies a fast-forward patch', () => {
    const r = mergePatch({ ...base, baseVersion: 2, patch: { title: 'B' } });
    expect(r).toMatchObject({ status: 'applied', merged: false });
  });

  it('auto-merges disjoint fields', () => {
    const r = mergePatch({ ...base, baseVersion: 1, patch: { title: 'B' } });
    expect(r).toMatchObject({ status: 'applied', merged: true, fields: { title: 'B', notes: 'server note' } });
  });

  it('reports a conflict on the same field', () => {
    const r = mergePatch({ ...base, baseVersion: 1, patch: { notes: 'my note' } });
    expect(r).toEqual({
      status: 'conflict',
      conflicts: [{ field: 'notes', mine: 'my note', theirs: 'server note' }],
    });
  });

  it('ignores the author\'s own earlier edits', () => {
    const h = [{ version: 1, changes: { notes: 'x' }, userId: 'a' }, { version: 2, changes: { notes: 'y' }, userId: 'a' }];
    const r = mergePatch({ serverFields: { notes: 'y' }, serverVersion: 2, baseVersion: 0, patch: { notes: 'z' }, history: h, userId: 'a' });
    expect(r.status).toBe('applied');
  });

  it('accepts identical concurrent edits', () => {
    const r = mergePatch({ ...base, baseVersion: 1, patch: { notes: 'server note' } });
    expect(r.status).toBe('applied');
  });
});
