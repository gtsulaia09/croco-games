/**
 * TOTP (RFC 6238) for administrator MFA, built on the vetted `@oslojs/otp` HOTP primitive.
 * Adds what the primitive does not provide: replay protection (monotonic time-step) and a
 * ±1 step window for clock drift.
 */
import { encodeBase32UpperCaseNoPadding } from "@oslojs/encoding";
import { createTOTPKeyURI, generateHOTP } from "@oslojs/otp";
import { hmacSha256Hex, randomBytes, timingSafeEqual } from "./crypto";

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function generateTotpSecret(): Uint8Array {
  return randomBytes(20);
}

export function totpKeyUri(issuer: string, accountName: string, secret: Uint8Array): string {
  return createTOTPKeyURI(issuer, accountName, secret, TOTP_PERIOD_SECONDS, TOTP_DIGITS);
}

export function totpSecretBase32(secret: Uint8Array): string {
  return encodeBase32UpperCaseNoPadding(secret);
}

export function currentTimeStep(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

export function totpCodeAt(secret: Uint8Array, step: number): string {
  return generateHOTP(secret, BigInt(step), TOTP_DIGITS);
}

export interface TotpVerifyResult {
  ok: boolean;
  /** The matched time-step; persist it and pass it as `lastUsedStep` next time. */
  step: number | null;
  replay: boolean;
}

/**
 * Verifies a 6-digit code against steps [now-1, now, now+1]. A code whose step is ≤ the last
 * accepted step is rejected as a replay even if it is otherwise valid.
 */
export function verifyTotp(secret: Uint8Array, code: string, lastUsedStep: number | null, nowMs = Date.now()): TotpVerifyResult {
  if (!/^\d{6}$/.test(code)) return { ok: false, step: null, replay: false };
  const now = currentTimeStep(nowMs);
  let matched: number | null = null;
  for (const step of [now - 1, now, now + 1]) {
    // Evaluate every candidate to keep timing independent of which one matches.
    if (timingSafeEqual(totpCodeAt(secret, step), code) && matched === null) matched = step;
  }
  if (matched === null) return { ok: false, step: null, replay: false };
  if (lastUsedStep !== null && matched <= lastUsedStep) return { ok: false, step: matched, replay: true };
  return { ok: true, step: matched, replay: false };
}

const RECOVERY_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

/** 10 codes of 16 base32 characters (80 bits each), formatted xxxx-xxxx-xxxx-xxxx. */
export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(16);
    let s = "";
    for (const b of bytes) s += RECOVERY_ALPHABET[b & 31];
    codes.push(`${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}`);
  }
  return codes;
}

export async function hashRecoveryCode(pepper: string, code: string): Promise<string> {
  return hmacSha256Hex(pepper, `recovery:v1:${code.toLowerCase()}`);
}
