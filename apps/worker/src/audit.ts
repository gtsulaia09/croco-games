import { redact, sha256Hex } from "@croco/security";
import { all, one, run } from "./db";
import type { Env } from "./env";

const GENESIS = "0".repeat(64);

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export interface AuditEntry {
  actorId: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, unknown>;
  ipHash?: string | null;
}

async function computeHash(prev: string, ts: number, e: AuditEntry, detailsJson: string): Promise<string> {
  return sha256Hex(
    `${prev}|${canonical({ ts, actor: e.actorId, action: e.action, targetType: e.targetType ?? null, targetId: e.targetId ?? null, details: detailsJson, ip: e.ipHash ?? null })}`,
  );
}

/**
 * Appends to the hash-chained, append-only admin audit log. The insert is conditional on the
 * previous hash still being the chain head, so concurrent writers cannot fork the chain.
 */
export async function appendAudit(env: Env, entry: AuditEntry): Promise<void> {
  const detailsJson = JSON.stringify(redact(entry.details ?? {}));
  for (let attempt = 0; attempt < 6; attempt++) {
    const head = await one<{ hash: string }>(env.DB, "SELECT hash FROM admin_audit_logs ORDER BY id DESC LIMIT 1");
    const prev = head?.hash ?? GENESIS;
    const ts = Date.now();
    const hash = await computeHash(prev, ts, entry, detailsJson);
    const res = await run(
      env.DB,
      `INSERT INTO admin_audit_logs (ts, actor_id, action, target_type, target_id, details_json, ip_hash, prev_hash, hash)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE COALESCE((SELECT hash FROM admin_audit_logs ORDER BY id DESC LIMIT 1), ?) = ?`,
      ts,
      entry.actorId,
      entry.action,
      entry.targetType ?? null,
      entry.targetId ?? null,
      detailsJson,
      entry.ipHash ?? null,
      prev,
      hash,
      GENESIS,
      prev,
    );
    if (res.meta.changes === 1) return;
  }
  throw new Error("Could not append to the audit log");
}

export interface AuditRow {
  id: number;
  ts: number;
  actor_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details_json: string;
  ip_hash: string | null;
  prev_hash: string;
  hash: string;
}

/** Recomputes the chain; returns the first broken row id or null when intact. */
export async function verifyAuditChain(env: Env, maxRows = 5000): Promise<{ checked: number; brokenAt: number | null }> {
  let lastId = 0;
  let prev: string | null = null;
  let checked = 0;
  while (checked < maxRows) {
    const rows = await all<AuditRow>(env.DB, "SELECT * FROM admin_audit_logs WHERE id > ? ORDER BY id ASC LIMIT 500", lastId);
    if (!rows.length) break;
    for (const r of rows) {
      if (prev !== null && r.prev_hash !== prev) return { checked, brokenAt: r.id };
      const expected = await computeHash(
        r.prev_hash,
        r.ts,
        { actorId: r.actor_id, action: r.action, targetType: r.target_type, targetId: r.target_id, ipHash: r.ip_hash },
        r.details_json,
      );
      if (expected !== r.hash) return { checked, brokenAt: r.id };
      prev = r.hash;
      lastId = r.id;
      checked++;
    }
  }
  return { checked, brokenAt: null };
}

const NOISY = new Set(["ratelimit.exceeded", "auth.invalid_token", "ws.rejected", "authz.denied"]);
const recent = new Map<string, number>();

/** Structured security event. Noisy kinds are sampled (1/min per key per isolate) to protect D1 quotas. */
export async function securityEvent(
  env: Env,
  kind: string,
  data: { userId?: string | null; ipHash?: string | null; country?: string | null; details?: Record<string, unknown> } = {},
): Promise<void> {
  if (NOISY.has(kind)) {
    const key = `${kind}|${data.userId ?? ""}|${data.ipHash ?? ""}`;
    const now = Date.now();
    if ((recent.get(key) ?? 0) > now - 60_000) return;
    if (recent.size > 5000) recent.clear();
    recent.set(key, now);
  }
  try {
    await run(
      env.DB,
      "INSERT INTO security_events (ts, kind, user_id, ip_hash, country, details_json) VALUES (?, ?, ?, ?, ?, ?)",
      Date.now(),
      kind,
      data.userId ?? null,
      data.ipHash ?? null,
      data.country ?? null,
      JSON.stringify(redact(data.details ?? {})),
    );
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "security_event_write_failed", kind, error: String(e) }));
  }
}
