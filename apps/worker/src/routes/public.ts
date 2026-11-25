import { Hono } from "hono";
import { GAME_CATALOG } from "@croco/shared";
import type { AppEnv } from "../http/context";
import { rateLimit } from "../http/ratelimit";
import { getSettings } from "../settings";

export const publicRoutes = new Hono<AppEnv>();

publicRoutes.get("/health", (c) => c.json({ ok: true, environment: c.get("config").environment }));

publicRoutes.get("/config/public", async (c) => {
  await rateLimit(c, "read", "public_config");
  const settings = await getSettings(c.env);
  return c.json({
    environment: c.get("config").environment,
    turnstileSiteKey: c.get("config").turnstile?.siteKey ?? null,
    registrationOpen: settings.registrationOpen,
    maintenanceMessage: settings.maintenanceMessage || null,
  });
});

publicRoutes.get("/games", (c) => c.json({ items: Object.values(GAME_CATALOG) }));
