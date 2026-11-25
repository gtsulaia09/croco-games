import type { PublicUser } from "@croco/shared";
import { all, one } from "./db";

export interface PublicUserRow {
  id: string;
  username: string;
  avatar: string;
  is_admin: number;
  is_mod: number;
}

const PUBLIC_USER_COLUMNS = `p.user_id AS id, p.username, p.avatar,
  EXISTS (SELECT 1 FROM roles r WHERE r.user_id = p.user_id AND r.role = 'admin') AS is_admin,
  EXISTS (SELECT 1 FROM roles r WHERE r.user_id = p.user_id AND r.role = 'moderator') AS is_mod`;

export function toPublicUser(row: PublicUserRow): PublicUser {
  return { id: row.id, username: row.username, avatar: row.avatar, badges: { admin: row.is_admin === 1, moderator: row.is_mod === 1 } };
}

const PUBLIC_USERS_BY_IDS =
  "SELECT p.user_id AS id, p.username, p.avatar, EXISTS (SELECT 1 FROM roles r WHERE r.user_id = p.user_id AND r.role = 'admin') AS is_admin, EXISTS (SELECT 1 FROM roles r WHERE r.user_id = p.user_id AND r.role = 'moderator') AS is_mod FROM profiles p JOIN users u ON u.id = p.user_id WHERE u.status <> 'deleted' AND p.user_id IN (SELECT value FROM json_each(?))";

/** Public user DTOs for a bounded list of ids (bound as a JSON array — no dynamic SQL). */
export async function publicUsers(db: D1Database, ids: string[]): Promise<Map<string, PublicUser>> {
  const unique = [...new Set(ids)].slice(0, 200);
  if (!unique.length) return new Map();
  const rows = await all<PublicUserRow>(db, PUBLIC_USERS_BY_IDS, JSON.stringify(unique));
  return new Map(rows.map((r) => [r.id, toPublicUser(r)]));
}

export async function publicUser(db: D1Database, id: string): Promise<PublicUser | null> {
  return (await publicUsers(db, [id])).get(id) ?? null;
}

export async function isBlockedEitherWay(db: D1Database, a: string, b: string): Promise<boolean> {
  const row = await one<{ n: number }>(
    db,
    "SELECT COUNT(*) AS n FROM blocks WHERE (blocker = ? AND blocked = ?) OR (blocker = ? AND blocked = ?)",
    a,
    b,
    b,
    a,
  );
  return (row?.n ?? 0) > 0;
}

export async function areFriends(db: D1Database, a: string, b: string): Promise<boolean> {
  const [x, y] = a < b ? [a, b] : [b, a];
  return (await one(db, "SELECT 1 AS ok FROM friends WHERE user_a = ? AND user_b = ?", x, y)) !== null;
}

export { PUBLIC_USER_COLUMNS };
