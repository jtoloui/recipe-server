import { describe, expect, it } from 'vitest';

import { buildOrQuery, escapeRegex } from '@/store/utils/queryBuilder';

describe('buildOrQuery', () => {
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

  // D1 FIX (was a documented vulnerability): user input is now escaped so
  // regex metacharacters are matched literally — no ReDoS / regex injection.
  it('escapes regex metacharacters in the search term (D1 fix)', () => {
    const malicious = '(a+)+$';
    const out = buildOrQuery<{ name: string }>(malicious, ['name']);
    expect(out[0].name.$regex).toBe('\\(a\\+\\)\\+\\$');
  });

  it('a plain search term is unchanged by escaping', () => {
    expect(escapeRegex('chicken curry')).toBe('chicken curry');
  });

  it('escapes each dangerous character', () => {
    expect(escapeRegex('.*+?^${}()|[]\\')).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
  });
});
