export type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends Array<infer ArrayElementType>
    ? ArrayElementType extends object
      ? `${Key}.${NestedKeyOf<ArrayElementType>}`
      : `${Key}`
    : ObjectType[Key] extends object
    ? `${Key}` | `${Key}.${NestedKeyOf<ObjectType[Key]>}`
    : `${Key}`;
}[keyof ObjectType & (string | number)];

export function buildOrQuery<T extends object>(
  search: string,
  keys: NestedKeyOf<T>[],
  regexOptions: string = 'i'
): Record<string, { $regex: string; $options: string }>[] {
  return keys.map((key) => {
    return { [key]: { $regex: search, $options: regexOptions } };
  });
}
