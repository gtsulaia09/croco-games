import path from "node:path";
import { webcrypto } from "node:crypto";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { exportJWK, generateKeyPair } from "jose";
import { defineConfig } from "vitest/config";

const GOOGLE_JWKS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "../../database/migrations"));
  // A test-only signing key. The Worker code is unchanged: it fetches "Google's" JWKS, which the
  // test runtime's outbound service answers with this key's public half.
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const publicJwk = { ...(await exportJWK(publicKey)), kid: "test-key-1", alg: "RS256", use: "sig" };
  const privateJwk = { ...(await exportJWK(privateKey)), kid: "test-key-1", alg: "RS256" };
  const mfaKey = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: {
            ENVIRONMENT: "test",
            FIREBASE_PROJECT_ID: "croco-test",
            ALLOWED_ORIGINS: "https://app.croco.test",
            TEST_MIGRATIONS: migrations,
            TEST_PRIVATE_JWK: JSON.stringify(privateJwk),
            MFA_ENCRYPTION_KEY: mfaKey,
            RECOVERY_CODE_PEPPER: "test-only-recovery-pepper-0123456789abcdef",
            IP_HASH_KEY: "test-only-ip-hash-key-0123456789abcdefghij",
            ADMIN_FIREBASE_UID: "owner-firebase-uid",
            ADMIN_BOOTSTRAP_EMAIL: "owner@croco.test",
          },
          outboundService: async (request: Request) => {
            if (request.url === GOOGLE_JWKS) return Response.json({ keys: [publicJwk] }, { headers: { "Cache-Control": "max-age=3600" } });
            return new Response("outbound blocked in tests", { status: 503 });
          },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/setup.ts"],
      include: ["test/**/*.test.ts"],
      testTimeout: 30_000,
    },
  };
});
