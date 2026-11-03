import { randomUUID } from 'crypto';
import { MAX_OPS, validateOps } from './validation';

const op = (over: object = {}) => ({
  opId: randomUUID(),
  inspectionId: randomUUID(),
  baseVersion: 0,
  patch: { title: 'x' },
  ...over,
});

describe('validateOps', () => {
  it('accepts well-formed ops and normalises defaults', () => {
    const [o] = validateOps([{ ...op(), baseVersion: undefined }]);
    expect(o).toMatchObject({ baseVersion: 0, force: false });
  });
  it.each([
    ['non-array', 'x'],
    ['bad opId', [op({ opId: 'nope' })]],
    ['bad inspectionId', [op({ inspectionId: '1' })]],
    ['negative baseVersion', [op({ baseVersion: -1 })]],
    ['empty patch', [op({ patch: {} })]],
    ['array patch', [op({ patch: [] })]],
    ['unsafe field name', [op({ patch: JSON.parse('{"__proto__": 1}') })]],
    ['field with spaces', [op({ patch: { 'a b': 1 } })]],
    ['oversized patch', [op({ patch: { big: 'x'.repeat(70_000) } })]],
    ['too many ops', Array.from({ length: MAX_OPS + 1 }, () => op())],
  ])('rejects %s', (_n, input) => {
    expect(() => validateOps(input)).toThrow();
  });
});
