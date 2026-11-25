import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

/**
 * Security headers per deployment target:
 *  - cloudflare-pages: a `_headers` file (CSP, HSTS, frame-ancestors, COOP, …).
 *  - github-pages: GitHub Pages cannot set headers, so a meta CSP is injected (frame-ancestors
 *    is not supported in meta tags — the app also refuses to render inside frames).
 */
function cspFor(env: Record<string, string>): string {
  const api = env.VITE_API_BASE ? new URL(env.VITE_API_BASE) : null;
  const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN;
  const turnstile = Boolean(env.VITE_TURNSTILE_SITE_KEY);
  const scriptSrc = ["'self'"];
  const frameSrc: string[] = [];
  const connect = ["'self'"];
  if (api) connect.push(api.origin, `${api.protocol === "https:" ? "wss:" : "ws:"}//${api.host}`);
  if (authDomain) {
    scriptSrc.push("https://apis.google.com");
    frameSrc.push(`https://${authDomain}`);
    connect.push("https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com", "https://www.googleapis.com");
  }
  if (turnstile) {
    scriptSrc.push("https://challenges.cloudflare.com");
    frameSrc.push("https://challenges.cloudflare.com");
  }
  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connect.join(" ")}`,
    `frame-src ${frameSrc.length ? frameSrc.join(" ") : "'none'"}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

function securityHeaders(env: Record<string, string>): Plugin {
  const deployment = env.VITE_DEPLOYMENT ?? "cloudflare-pages";
  const csp = cspFor(env);
  return {
    name: "croco-security-headers",
    transformIndexHtml(html) {
      if (deployment !== "github-pages") return html;
      return html.replace("<!--csp-->", `<meta http-equiv="Content-Security-Policy" content="${csp}; upgrade-insecure-requests" />`);
    },
    generateBundle() {
      if (deployment === "github-pages") return;
      const headers = [
        "/*",
        `  Content-Security-Policy: ${csp}; frame-ancestors 'none'; upgrade-insecure-requests`,
        "  Strict-Transport-Security: max-age=31536000; includeSubDomains",
        "  X-Content-Type-Options: nosniff",
        "  X-Frame-Options: DENY",
        "  Referrer-Policy: strict-origin-when-cross-origin",
        "  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()",
        "  Cross-Origin-Opener-Policy: same-origin-allow-popups",
        "  Cross-Origin-Resource-Policy: same-origin",
        "/assets/*",
        "  Cache-Control: public, max-age=31536000, immutable",
        "/sw.js",
        "  Cache-Control: no-cache",
        "",
      ].join("\n");
      this.emitFile({ type: "asset", fileName: "_headers", source: headers });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    base: env.VITE_BASE_PATH || "/",
    plugins: [react(), tailwindcss(), securityHeaders(env)],
    build: {
      target: "es2022",
      sourcemap: false,
      cssCodeSplit: true,
      chunkSizeWarningLimit: 300,
    },
    server: { port: 5173, strictPort: true },
  };
});
