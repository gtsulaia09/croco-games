import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { describe, expect, it } from "vitest";
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  API_SECURITY_HEADERS,
  decodeKey,
  isAllowedOrigin,
  parseAllowedOrigins,
  pbkdf2Hash,
  pbkdf2Verify,
  randomBytes,
  redact,
  spaContentSecurityPolicy,
  verifyFirebaseIdToken,
} from "./index";

describe("security hardening regression tests", () => {
  it("handles JWKS signing-key rotation across multiple kids", async () => {
    const k1 = await generateKeyPair("RS256", { extractable: true });
    const k2 = await generateKeyPair("RS256", { extractable: true });
    const jwk1: JWK = { ...(await exportJWK(k1.publicKey)), kid: "key-old", alg: "RS256", use: "sig" };
    const jwk2: JWK = { ...(await exportJWK(k2.publicKey)), kid: "key-new", alg: "RS256", use: "sig" };
    const jwks = createLocalJWKSet({ keys: [jwk1, jwk2] });
    const now = 1_800_000_000;
    const sign = (kid: string, key: CryptoKey) =>
      new SignJWT({ auth_time: now - 5, email: "u@example.com", email_verified: true, firebase: { sign_in_provider: "google.com" } })
        .setProtectedHeader({ alg: "RS256", kid })
        .setIssuer("https://securetoken.google.com/croco-rot")
        .setAudience("croco-rot")
        .setSubject("uid-rot")
        .setIssuedAt(now - 5)
        .setExpirationTime(now + 1800)
        .sign(key);

    expect((await verifyFirebaseIdToken(await sign("key-old", k1.privateKey), { projectId: "croco-rot", keys: jwks, nowSeconds: now })).uid).toBe("uid-rot");
    expect((await verifyFirebaseIdToken(await sign("key-new", k2.privateKey), { projectId: "croco-rot", keys: jwks, nowSeconds: now })).uid).toBe("uid-rot");
    // Cross-kid signature mismatch must fail.
    await expect(verifyFirebaseIdToken(await sign("key-new", k1.privateKey), { projectId: "croco-rot", keys: jwks, nowSeconds: now })).rejects.toThrow();
  });

  it("uses unique IVs for AES-GCM encryption and rejects truncated ciphertexts", async () => {
    const key = randomBytes(32);
    const pt = new TextEncoder().encode("same-secret-value");
    const a = await aesGcmEncrypt(key, pt, "aad:1");
    const b = await aesGcmEncrypt(key, pt, "aad:1");
    expect(a.data).not.toBe(b.data);
    expect(await aesGcmDecrypt(key, a.data, "aad:1")).toEqual(pt);
    await expect(aesGcmDecrypt(key, "AAAA", "aad:1")).rejects.toThrow(/short/);
    expect(() => decodeKey("not-valid-length", 32)).toThrow();
  });

  it("rejects malformed or out-of-range PBKDF2 hashes and normalizes NFC passwords", async () => {
    const hash = await pbkdf2Hash("caf\u00e9-pass", 2_000);
    expect(await pbkdf2Verify("cafe\u0301-pass", hash)).toBe(true);
    expect(await pbkdf2Verify("caf\u00e9-pass", "pbkdf2-sha256$10$aaaa$bbbb")).toBe(false);
    expect(await pbkdf2Verify("caf\u00e9-pass", "pbkdf2-sha256$99999999$aaaa$bbbb")).toBe(false);
    expect(await pbkdf2Verify("caf\u00e9-pass", "scrypt$1000$aaaa$bbbb")).toBe(false);
  });

  it("enforces strict API security headers and SPA CSP", () => {
    expect(API_SECURITY_HEADERS["Content-Security-Policy"]).toContain("default-src 'none'");
    expect(API_SECURITY_HEADERS["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(API_SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
    expect(API_SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
    expect(API_SECURITY_HEADERS["Cache-Control"]).toBe("no-store");
    const cspWithTurnstile = spaContentSecurityPolicy({ apiOrigin: "https://api.croco.example", firebaseAuthDomain: "croco.firebaseapp.com", turnstile: true });
    expect(cspWithTurnstile).toContain("https://challenges.cloudflare.com");
    expect(cspWithTurnstile).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
  });

  it("rejects malformed origins, path-bearing origins, and subdomain spoofing", () => {
    const allowed = parseAllowedOrigins("https://croco.pages.dev, https://bad.example/path, https://user:pass@evil.example, null, *");
    expect(allowed).toEqual(["https://croco.pages.dev"]);
    expect(isAllowedOrigin("https://croco.pages.dev", allowed)).toBe(true);
    expect(isAllowedOrigin("https://croco.pages.dev.attacker.com", allowed)).toBe(false);
    expect(isAllowedOrigin("http://croco.pages.dev", allowed)).toBe(false);
  });

  it("redacts nested secrets, recovery codes, step-up headers, and caps recursion depth", () => {
    const deep: Record<string, unknown> = { level: 0 };
    let cur = deep;
    for (let i = 1; i <= 10; i++) {
      const next: Record<string, unknown> = { level: i };
      cur["child"] = next;
      cur = next;
    }
    const sanitized = redact({
      "X-Admin-Step-Up": "secret-step-up-token",
      recoveryCodes: ["aaaa-bbbb-cccc-dddd"],
      totpSecret: "JBSWY3DPEHPK3PXP",
      deep,
    }) as Record<string, unknown>;
    const json = JSON.stringify(sanitized);
    expect(json).not.toContain("secret-step-up-token");
    expect(json).not.toContain("aaaa-bbbb-cccc-dddd");
    expect(json).not.toContain("JBSWY3DPEHPK3PXP");
    expect(json).toContain("[depth]");
  });
});
