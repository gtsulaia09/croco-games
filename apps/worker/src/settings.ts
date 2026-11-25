import { adminSettingsSchema, DEFAULT_PLATFORM_SETTINGS, type PlatformSettings } from "@croco/shared";
import { all } from "./db";
import type { Env } from "./env";

let cache: { at: number; value: PlatformSettings } | null = null;

export async function getSettings(env: Env, fresh = false): Promise<PlatformSettings> {
  if (!fresh && cache && Date.now() - cache.at < 30_000) return cache.value;
  const rows = await all<{ key: string; value_json: string }>(env.DB, "SELECT key, value_json FROM platform_settings");
  const merged: Record<string, unknown> = { ...DEFAULT_PLATFORM_SETTINGS };
  for (const r of rows) {
    try {
      merged[r.key] = JSON.parse(r.value_json);
    } catch {
      /* ignore corrupt values; defaults apply */
    }
  }
  const parsed = adminSettingsSchema.safeParse(merged);
  const value = parsed.success ? parsed.data : DEFAULT_PLATFORM_SETTINGS;
  cache = { at: Date.now(), value };
  return value;
}

export function invalidateSettings(): void {
  cache = null;
}
