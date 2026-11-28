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
  const { FIREBASE_WEB_API_KEY: apiKey, FIREBASE_APP_ID: appId } = c.env;
  const projectId = c.get("config").projectId;
  return c.json({
    environment: c.get("config").environment,
    turnstileSiteKey: c.get("config").turnstile?.siteKey ?? null,
    registrationOpen: settings.registrationOpen,
    maintenanceMessage: settings.maintenanceMessage || null,
    // Public by design (it ships in the site); null until both values are configured.
    firebaseWeb:
      apiKey && appId && /^[A-Za-z0-9_-]{20,80}$/.test(apiKey)
        ? { apiKey, appId, projectId, authDomain: c.env.FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com` }
        : null,
  });
});

publicRoutes.get("/games", (c) => c.json({ items: Object.values(GAME_CATALOG) }));
