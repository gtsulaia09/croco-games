/**
 * D1 access helpers. Every query goes through `prepare(sql).bind(...params)`.
 * SQL strings must be static literals — `scripts/security-checks.mjs` fails the build if a
 * template literal with interpolation is passed to `prepare`.
 */
export type SqlValue = string | number | null;

export async function one<T>(db: D1Database, sql: string, ...params: SqlValue[]): Promise<T | null> {
  return (await db.prepare(sql).bind(...params).first<T>()) ?? null;
}

export async function all<T>(db: D1Database, sql: string, ...params: SqlValue[]): Promise<T[]> {
  const res = await db.prepare(sql).bind(...params).all<T>();
  return res.results ?? [];
}

export async function run(db: D1Database, sql: string, ...params: SqlValue[]): Promise<D1Result> {
  return db.prepare(sql).bind(...params).run();
}

export function stmt(db: D1Database, sql: string, ...params: SqlValue[]): D1PreparedStatement {
  return db.prepare(sql).bind(...params);
}

/** Opaque numeric offset cursor (bounded to avoid deep scans). */
export function decodeOffsetCursor(cursor: string | undefined, max = 1000): number {
  if (!cursor) return 0;
  const n = Number.parseInt(cursor, 10);
  if (!Number.isInteger(n) || n < 0 || n > max || String(n) !== cursor) return 0;
  return n;
}

export function nextOffsetCursor(offset: number, pageSize: number, got: number, max = 1000): string | null {
  const next = offset + pageSize;
  return got === pageSize && next <= max ? String(next) : null;
}

/** Keyset cursor "<timestamp>:<id>" for time-ordered lists. */
export function decodeTimeCursor(cursor: string | undefined): { ts: number; id: string } | null {
  if (!cursor) return null;
  const m = /^(\d{1,15}):([A-Za-z0-9_]{1,40})$/.exec(cursor);
  if (!m) return null;
  return { ts: Number(m[1]), id: m[2]! };
}

export const encodeTimeCursor = (ts: number, id: string) => `${ts}:${id}`;
