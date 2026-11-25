/**
 * Thin wrappers over the WebCrypto API (available in Cloudflare Workers, browsers and Node ≥ 20).
 * No custom cryptographic algorithms are implemented here — only encoding and composition of
 * standard primitives (SHA-256, HMAC-SHA-256, AES-256-GCM, PBKDF2-SHA-256, CSPRNG).
 */
import { decodeBase64urlIgnorePadding, encodeBase64urlNoPadding, encodeHexLowerCase } from "@oslojs/encoding";

const encoder = new TextEncoder();

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

/** URL-safe random token, default 256 bits. */
export function randomToken(bytes = 32): string {
  return encodeBase64urlNoPadding(randomBytes(bytes));
}

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Unbiased random identifier `prefix_xxxxxxxxxxxxxxxxxxxx` (≈119 bits for length 20). */
export function randomId(prefix: string, length = 20): string {
  let out = "";
  // 62 * 4 = 248 → reject bytes ≥ 248 to avoid modulo bias.
  while (out.length < length) {
    const buf = randomBytes(length * 2);
    for (const byte of buf) {
      if (byte < 248 && out.length < length) out += ID_ALPHABET[byte % 62];
    }
  }
  return `${prefix}_${out}`;
}

export function utf8(input: string): Uint8Array {
  return encoder.encode(input);
}

export async function sha256(data: Uint8Array | string): Promise<Uint8Array> {
  const bytes = typeof data === "string" ? utf8(data) : data;
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  return encodeHexLowerCase(await sha256(data));
}

async function importHmacKey(secret: Uint8Array | string): Promise<CryptoKey> {
  const raw = typeof secret === "string" ? utf8(secret) : secret;
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

export async function hmacSha256Hex(secret: Uint8Array | string, message: string): Promise<string> {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, utf8(message) as BufferSource);
  return encodeHexLowerCase(new Uint8Array(sig));
}

/** Constant-time comparison of two equal-length strings or byte arrays. */
export function timingSafeEqual(a: Uint8Array | string, b: Uint8Array | string): boolean {
  const x = typeof a === "string" ? utf8(a) : a;
  const y = typeof b === "string" ? utf8(b) : b;
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function decodeKey(base64url: string, expectedLength = 32): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = decodeBase64urlIgnorePadding(base64url.replace(/\+/g, "-").replace(/\//g, "_"));
  } catch {
    throw new Error("Invalid key encoding");
  }
  if (bytes.length !== expectedLength) throw new Error(`Key must be ${expectedLength} bytes`);
  return bytes;
}

export interface EncryptedBlob {
  /** base64url(iv ‖ ciphertext ‖ tag) */
  data: string;
  keyVersion: number;
}

export async function aesGcmEncrypt(
  key: Uint8Array,
  plaintext: Uint8Array,
  aad: string,
  keyVersion = 1,
): Promise<EncryptedBlob> {
  const cryptoKey = await crypto.subtle.importKey("raw", key as BufferSource, "AES-GCM", false, ["encrypt"]);
  const iv = randomBytes(12);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource, additionalData: utf8(aad) as BufferSource },
      cryptoKey,
      plaintext as BufferSource,
    ),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return { data: encodeBase64urlNoPadding(out), keyVersion };
}

export async function aesGcmDecrypt(key: Uint8Array, blob: string, aad: string): Promise<Uint8Array> {
  const raw = decodeBase64urlIgnorePadding(blob);
  if (raw.length < 12 + 16) throw new Error("Ciphertext too short");
  const cryptoKey = await crypto.subtle.importKey("raw", key as BufferSource, "AES-GCM", false, ["decrypt"]);
  const iv = raw.slice(0, 12);
  const ct = raw.slice(12);
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource, additionalData: utf8(aad) as BufferSource },
      cryptoKey,
      ct as BufferSource,
    ),
  );
}

/**
 * Room password hashing. Iterations are deliberately below the OWASP recommendation for
 * account passwords because Workers Free allows 10 ms CPU per request; see THREAT_MODEL R7.
 * Room passwords are short-lived, never leave the Durable Object, and online guessing is
 * limited to 5 attempts per user per 15 minutes.
 */
export const ROOM_PASSWORD_PBKDF2_ITERATIONS = 20_000;

export async function pbkdf2Hash(password: string, iterations = ROOM_PASSWORD_PBKDF2_ITERATIONS): Promise<string> {
  const salt = randomBytes(16);
  const hash = await pbkdf2(password, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${encodeBase64urlNoPadding(salt)}$${encodeBase64urlNoPadding(hash)}`;
}

export async function pbkdf2Verify(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 1_000_000) return false;
  const salt = decodeBase64urlIgnorePadding(parts[2] ?? "");
  const expected = decodeBase64urlIgnorePadding(parts[3] ?? "");
  const actual = await pbkdf2(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey("raw", utf8(password.normalize("NFC")) as BufferSource, "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    baseKey,
    256,
  );
  return new Uint8Array(bits);
}
