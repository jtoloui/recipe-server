export type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends Array<infer ArrayElementType>
    ? ArrayElementType extends object
      ? `${Key}.${NestedKeyOf<ArrayElementType>}`
      : `${Key}`
    : ObjectType[Key] extends object
    ? `${Key}` | `${Key}.${NestedKeyOf<ObjectType[Key]>}`
    : `${Key}`;
}[keyof ObjectType & (string | number)];

/**
 * Escape regex metacharacters so a user-supplied search term is matched
 * LITERALLY inside a Mongo $regex, instead of being interpreted as a pattern.
 * Prevents regex-injection / ReDoS (e.g. a search of "(a+)+$" no longer
 * compiles to a catastrophic-backtracking pattern). See RECON-FINDINGS D1.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildOrQuery<T extends object>(
  search: string,
  keys: NestedKeyOf<T>[],
  regexOptions: string = 'i'
): Record<string, { $regex: string; $options: string }>[] {
  const safe = escapeRegex(search);
  return keys.map((key) => {
    return { [key]: { $regex: safe, $options: regexOptions } };
  });
}
