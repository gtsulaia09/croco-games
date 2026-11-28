/**
 * Public, build-time configuration. Everything here ends up in the browser bundle and must
 * never contain secrets (Firebase web config values are public identifiers by design).
 */
const env = import.meta.env;

export const config = {
  apiBase: (env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, "") ?? "",
  firebase: {
    apiKey: (env.VITE_FIREBASE_API_KEY as string | undefined) ?? "",
    authDomain: (env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ?? "",
    projectId: (env.VITE_FIREBASE_PROJECT_ID as string | undefined) ?? "",
    appId: (env.VITE_FIREBASE_APP_ID as string | undefined) ?? "",
  },
  /** Facebook login needs a Meta app connected in Firebase; the button stays hidden until then. */
  facebookLogin: env.VITE_FACEBOOK_LOGIN === "true",
  turnstileSiteKey: (env.VITE_TURNSTILE_SITE_KEY as string | undefined) ?? "",
  deployment: (env.VITE_DEPLOYMENT as string | undefined) ?? "cloudflare-pages",
};

export const backendConfigured = Boolean(config.apiBase && config.firebase.apiKey && config.firebase.authDomain && config.firebase.projectId);

export function wsUrl(path: string): string {
  const url = new URL(config.apiBase + path);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
