import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  currentTimeStep,
  generateRecoveryCodes,
  hashRecoveryCode,
  isAllowedOrigin,
  isIdentityVerified,
  parseAllowedOrigins,
  pbkdf2Hash,
  pbkdf2Verify,
  randomBytes,
  randomId,
  redact,
  SlidingWindowCounter,
  spaContentSecurityPolicy,
  timingSafeEqual,
  TokenBucket,
  totpCodeAt,
  TokenVerificationError,
  verifyFirebaseIdToken,
  verifyTotp,
} from "./index";

const PROJECT = "croco-test";
const NOW = 1_800_000_000;

let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const kp = await generateKeyPair("RS256", { extractable: true });
  const other = await generateKeyPair("RS256", { extractable: true });
  privateKey = kp.privateKey;
  otherPrivateKey = other.privateKey;
  const jwk: JWK = { ...(await exportJWK(kp.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  jwks = createLocalJWKSet({ keys: [jwk] });
});

interface TokenOverrides {
  [key: string]: unknown;
}

async function makeToken(overrides: TokenOverrides = {}, opts: { kid?: string; key?: CryptoKey; alg?: string } = {}) {
  const claims: Record<string, unknown> = {
    auth_time: NOW - 100,
    email: "player@example.com",
    email_verified: true,
    firebase: { sign_in_provider: "google.com" },
    ...overrides,
  };
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: opts.alg ?? "RS256", kid: opts.kid ?? "k1" })
    .setIssuer((overrides["iss"] as string) ?? `https://securetoken.google.com/${PROJECT}`)
    .setAudience((overrides["aud"] as string) ?? PROJECT)
    .setSubject((overrides["sub"] as string) ?? "firebase-uid-123")
    .setIssuedAt((overrides["iat"] as number) ?? NOW - 60)
    .setExpirationTime((overrides["exp"] as number) ?? NOW + 3000);
  return jwt.sign(opts.key ?? privateKey);
}

const verify = (token: string) => verifyFirebaseIdToken(token, { projectId: PROJECT, keys: jwks, nowSeconds: NOW });

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(TokenVerificationError);
  await promise.catch((e: TokenVerificationError) => expect(e.code).toBe(code));
}

describe("Firebase ID token verification", () => {
  it("accepts a correctly signed token and extracts identity from claims", async () => {
    const result = await verify(await makeToken());
    expect(result).toMatchObject({ uid: "firebase-uid-123", emailVerified: true, signInProvider: "google.com" });
  });

  it("rejects malformed tokens without parsing", async () => {
    await expectCode(verify("not-a-token"), "malformed");
    await expectCode(verify("a.b.c"), "malformed");
    await expectCode(verify("x".repeat(5000)), "malformed");
  });

  it("rejects alg=none tokens", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", kid: "k1" })).toString("base64url");
    const body = Buffer.from(JSON.stringify({ sub: "attacker", aud: PROJECT })).toString("base64url");
    await expectCode(verify(`${header}.${body}.AAAAAAAAAAAAAAAA`), "invalid_signature");
  });

  it("rejects tokens signed by an unknown key", async () => {
    await expectCode(verify(await makeToken({}, { key: otherPrivateKey })), "invalid_signature");
  });

  it("rejects tokens with an unknown kid", async () => {
    await expectCode(verify(await makeToken({}, { kid: "rotated-away" })), "invalid_signature");
  });

  it("rejects HS256 algorithm-confusion tokens", async () => {
    const secret = new TextEncoder().encode("public-key-material-used-as-hmac-secret");
    const token = await new SignJWT({ firebase: { sign_in_provider: "google.com" }, auth_time: NOW - 10 })
      .setProtectedHeader({ alg: "HS256", kid: "k1" })
      .setIssuer(`https://securetoken.google.com/${PROJECT}`)
      .setAudience(PROJECT)
      .setSubject("attacker")
      .setIssuedAt(NOW - 10)
      .setExpirationTime(NOW + 100)
      .sign(secret);
    await expectCode(verify(token), "invalid_signature");
  });

  it("rejects expired tokens", async () => {
    await expectCode(verify(await makeToken({ iat: NOW - 4000, exp: NOW - 400 })), "expired");
  });

  it("rejects wrong audience and wrong issuer (token from another Firebase project)", async () => {
    await expectCode(verify(await makeToken({ aud: "other-project" })), "invalid_claims");
    await expectCode(verify(await makeToken({ iss: "https://securetoken.google.com/other-project" })), "invalid_claims");
  });

  it("rejects future auth_time and future iat", async () => {
    await expectCode(verify(await makeToken({ auth_time: NOW + 3600 })), "invalid_claims");
    await expectCode(verify(await makeToken({ iat: NOW + 3600, exp: NOW + 7000 })), "invalid_claims");
  });

  it("rejects tokens with an abnormal lifetime", async () => {
    await expectCode(verify(await makeToken({ iat: NOW - 10, exp: NOW + 86_400 })), "invalid_claims");
  });

  it("rejects disallowed sign-in providers (e.g. anonymous, custom)", async () => {
    await expectCode(verify(await makeToken({ firebase: { sign_in_provider: "anonymous" } })), "unsupported_provider");
    await expectCode(verify(await makeToken({ firebase: { sign_in_provider: "custom" } })), "unsupported_provider");
  });

  it("treats unverified password accounts as unverified identities", () => {
    expect(isIdentityVerified({ signInProvider: "password", emailVerified: false })).toBe(false);
    expect(isIdentityVerified({ signInProvider: "password", emailVerified: true })).toBe(true);
    expect(isIdentityVerified({ signInProvider: "google.com", emailVerified: false })).toBe(true);
  });

  it("fails closed when the project id is not configured", async () => {
    await expect(verifyFirebaseIdToken(await makeToken(), { projectId: "", keys: jwks })).rejects.toThrow(/not configured/);
  });
});

describe("TOTP", () => {
  // RFC 6238 Appendix B, SHA-1 secret "12345678901234567890", T=59 → 94287082 (8 digits) → 287082.
  const rfcSecret = new TextEncoder().encode("12345678901234567890");

  it("matches the RFC 6238 test vector", () => {
    expect(totpCodeAt(rfcSecret, Math.floor(59 / 30))).toBe("287082");
  });

  it("accepts the current code and rejects its replay", () => {
    const now = 1_700_000_000_000;
    const step = currentTimeStep(now);
    const code = totpCodeAt(rfcSecret, step);
    const first = verifyTotp(rfcSecret, code, null, now);
    expect(first).toEqual({ ok: true, step, replay: false });
    const replay = verifyTotp(rfcSecret, code, first.step, now);
    expect(replay.ok).toBe(false);
    expect(replay.replay).toBe(true);
  });

  it("tolerates ±1 step of clock drift but not more", () => {
    const now = 1_700_000_000_000;
    const step = currentTimeStep(now);
    expect(verifyTotp(rfcSecret, totpCodeAt(rfcSecret, step - 1), null, now).ok).toBe(true);
    expect(verifyTotp(rfcSecret, totpCodeAt(rfcSecret, step + 1), null, now).ok).toBe(true);
    expect(verifyTotp(rfcSecret, totpCodeAt(rfcSecret, step - 2), null, now).ok).toBe(false);
  });

  it("rejects malformed codes", () => {
    expect(verifyTotp(rfcSecret, "12345", null).ok).toBe(false);
    expect(verifyTotp(rfcSecret, "abcdef", null).ok).toBe(false);
  });

  it("generates high-entropy recovery codes and hashes them with a pepper", async () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[a-z2-7]{4}(-[a-z2-7]{4}){3}$/);
    const h1 = await hashRecoveryCode("pepper-1", codes[0]!);
    const h2 = await hashRecoveryCode("pepper-2", codes[0]!);
    expect(h1).not.toBe(h2);
    expect(h1).not.toContain(codes[0]!);
  });
});

describe("crypto helpers", () => {
  it("encrypts and decrypts with AES-GCM and binds ciphertext to AAD", async () => {
    const key = randomBytes(32);
    const secret = randomBytes(20);
    const blob = await aesGcmEncrypt(key, secret, "u_1:totp");
    expect(await aesGcmDecrypt(key, blob.data, "u_1:totp")).toEqual(secret);
    await expect(aesGcmDecrypt(key, blob.data, "u_2:totp")).rejects.toThrow();
    await expect(aesGcmDecrypt(randomBytes(32), blob.data, "u_1:totp")).rejects.toThrow();
  });

  it("detects ciphertext tampering", async () => {
    const key = randomBytes(32);
    const blob = await aesGcmEncrypt(key, randomBytes(20), "aad");
    const chars = blob.data.split("");
    chars[20] = chars[20] === "A" ? "B" : "A";
    await expect(aesGcmDecrypt(key, chars.join(""), "aad")).rejects.toThrow();
  });

  it("hashes room passwords with salt and verifies in constant time", async () => {
    const h1 = await pbkdf2Hash("secret-pass");
    const h2 = await pbkdf2Hash("secret-pass");
    expect(h1).not.toBe(h2);
    expect(h1).not.toContain("secret-pass");
    expect(await pbkdf2Verify("secret-pass", h1)).toBe(true);
    expect(await pbkdf2Verify("wrong-pass", h1)).toBe(false);
    expect(await pbkdf2Verify("secret-pass", "garbage")).toBe(false);
  });

  it("produces well-formed unique ids", () => {
    const ids = new Set(Array.from({ length: 2000 }, () => randomId("u")));
    expect(ids.size).toBe(2000);
    for (const id of ids) expect(id).toMatch(/^u_[A-Za-z0-9]{20}$/);
  });

  it("compares in constant time and handles length mismatches", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});

describe("HTTP perimeter helpers", () => {
  it("parses only well-formed origins and never allows wildcards", () => {
    const list = parseAllowedOrigins("https://games.example.com, *, http://localhost:5173, javascript:alert(1), https://evil.example.com/path");
    expect(list).toEqual(["https://games.example.com", "http://localhost:5173"]);
    expect(isAllowedOrigin("https://games.example.com", list)).toBe(true);
    expect(isAllowedOrigin("https://games.example.com.evil.com", list)).toBe(false);
    expect(isAllowedOrigin("null", list)).toBe(false);
    expect(isAllowedOrigin(null, list)).toBe(false);
  });

  it("redacts tokens, passwords and tickets from log payloads", () => {
    const out = redact({
      authorization: "Bearer abc",
      body: { password: "hunter2", nested: { ticket: "t" } },
      note: "token eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl inside",
    }) as Record<string, unknown>;
    const json = JSON.stringify(out);
    expect(json).not.toContain("hunter2");
    expect(json).not.toContain("Bearer abc");
    expect(json).not.toContain("eyJhbGciOiJSUzI1NiJ9");
    expect(json).toContain("[redacted]");
  });

  it("builds a CSP without unsafe-inline or unsafe-eval", () => {
    const csp = spaContentSecurityPolicy({
      apiOrigin: "https://api.example.com",
      firebaseAuthDomain: "croco.firebaseapp.com",
      turnstile: false,
    });
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("wss://api.example.com");
  });

  it("token bucket and sliding window enforce limits", () => {
    const bucket = new TokenBucket(2, 1, 0);
    expect(bucket.take(1, 0)).toBe(true);
    expect(bucket.take(1, 0)).toBe(true);
    expect(bucket.take(1, 0)).toBe(false);
    expect(bucket.take(1, 1000)).toBe(true);

    const window = new SlidingWindowCounter(2, 1000);
    window.hit("a", 0);
    window.hit("a", 10);
    expect(window.isLimited("a", 20)).toBe(true);
    expect(window.isLimited("a", 1500)).toBe(false);
  });
});
