/** Keeps only the filled-in query values, so URLs and query keys stay small. */
export function compact<T extends Record<string, unknown>>(q: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(q) as (keyof T)[]) {
    const v = q[key];
    if (v !== undefined && v !== null && v !== "") out[key] = v;
  }
  return out;
}
