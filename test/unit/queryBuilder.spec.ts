import { describe, expect, it } from 'vitest';

import { buildOrQuery } from '@/store/utils/queryBuilder';

// CHARACTERIZATION tests: these capture the query builder's CURRENT behavior
// on `main` so the D1 (regex-injection) fix in the next stacked PR is a
// deliberate, visible change rather than a silent one.
describe('buildOrQuery (characterization of current behavior)', () => {
  it('maps each key to a $regex clause with the given options', () => {
    const out = buildOrQuery<{ name: string; author: string }>('pasta', ['name', 'author'], 'i');
    expect(out).toEqual([
      { name: { $regex: 'pasta', $options: 'i' } },
      { author: { $regex: 'pasta', $options: 'i' } },
    ]);
  });

  it('defaults to case-insensitive options', () => {
    const out = buildOrQuery<{ name: string }>('x', ['name']);
    expect(out[0].name.$options).toBe('i');
  });

  // BUG D1 (documented, not yet fixed): raw user input is passed straight into
  // $regex with no escaping — a ReDoS / regex-injection surface. This test
  // pins the vulnerable behavior; when D1 is fixed the assertion flips to
  // expect the metacharacters to be escaped.
  it('DOCUMENTS D1: passes raw regex metacharacters through unescaped (vulnerable)', () => {
    const malicious = '(a+)+$';
    const out = buildOrQuery<{ name: string }>(malicious, ['name']);
    expect(out[0].name.$regex).toBe(malicious); // <-- unescaped today; fix will change this
  });
});
