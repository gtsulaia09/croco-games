/**
 * Firebase ID token verification for Cloudflare Workers using `jose`.
 *
 * Checks performed (Firebase "Verify ID tokens using a third-party JWT library" guidance):
 *  - header: alg === RS256, kid present and found in Google's securetoken JWKS
 *  - signature (jose)
 *  - exp in the future, iat and auth_time not in the future (with tolerance)
 *  - iss === https://securetoken.google.com/<projectId>, aud === projectId
 *  - sub non-empty string ≤ 128 chars
 *  - sign-in provider in an allowlist
 */
import { createRemoteJWKSet, decodeProtectedHeader, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

export const GOOGLE_SECURETOKEN_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export const ALLOWED_SIGN_IN_PROVIDERS = ["password", "google.com", "facebook.com"] as const;
export type SignInProvider = (typeof ALLOWED_SIGN_IN_PROVIDERS)[number];

export interface VerifiedFirebaseToken {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  signInProvider: SignInProvider;
  authTime: number;
  issuedAt: number;
  expiresAt: number;
}

export type TokenErrorCode = "malformed" | "expired" | "invalid_signature" | "invalid_claims" | "unsupported_provider";

export class TokenVerificationError extends Error {
  constructor(
    readonly code: TokenErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TokenVerificationError";
  }
}

let cachedJwks: JWTVerifyGetKey | null = null;

/** Module-scoped JWKS cache (per isolate). jose refetches on unknown `kid` (key rotation). */
export function googleJwks(): JWTVerifyGetKey {
  if (!cachedJwks) {
    cachedJwks = createRemoteJWKSet(new URL(GOOGLE_SECURETOKEN_JWKS_URL), {
      cooldownDuration: 30_000,
      cacheMaxAge: 6 * 60 * 60_000,
      timeoutDuration: 5_000,
    });
  }
  return cachedJwks;
}

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{10,2000}\.[A-Za-z0-9_-]{10,3000}\.[A-Za-z0-9_-]{10,1000}$/;
const CLOCK_TOLERANCE_S = 60;

export interface VerifyOptions {
  projectId: string;
  /** Defaults to Google's JWKS. Tests inject a local key set. */
  keys?: JWTVerifyGetKey;
  nowSeconds?: number;
}

export async function verifyFirebaseIdToken(token: string, options: VerifyOptions): Promise<VerifiedFirebaseToken> {
  if (!options.projectId || !/^[a-z0-9-]{4,40}$/.test(options.projectId)) {
    throw new Error("FIREBASE_PROJECT_ID is not configured correctly");
  }
  if (typeof token !== "string" || token.length > 4096 || !TOKEN_SHAPE.test(token)) {
    throw new TokenVerificationError("malformed", "Token is malformed");
  }

  let header;
  try {
    header = decodeProtectedHeader(token);
  } catch {
    throw new TokenVerificationError("malformed", "Token header is malformed");
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string" || header.kid.length === 0) {
    throw new TokenVerificationError("invalid_signature", "Unexpected token algorithm or key id");
  }

  const issuer = `https://securetoken.google.com/${options.projectId}`;
  let payload: JWTPayload;
  try {
    const result = await jwtVerify(token, options.keys ?? googleJwks(), {
      algorithms: ["RS256"],
      issuer,
      audience: options.projectId,
      clockTolerance: CLOCK_TOLERANCE_S,
      requiredClaims: ["exp", "iat", "sub", "auth_time"],
      ...(options.nowSeconds !== undefined ? { currentDate: new Date(options.nowSeconds * 1000) } : {}),
    });
    payload = result.payload;
  } catch (err) {
    if (err instanceof errors.JWTExpired) throw new TokenVerificationError("expired", "Token expired");
    if (err instanceof errors.JWTClaimValidationFailed) {
      throw new TokenVerificationError("invalid_claims", "Token claims are invalid");
    }
    if (err instanceof errors.JOSEError) throw new TokenVerificationError("invalid_signature", "Token signature is invalid");
    throw err;
  }

  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const sub = payload.sub;
  const authTime = payload["auth_time"];
  const iat = payload.iat;
  const exp = payload.exp;
  if (typeof sub !== "string" || sub.length === 0 || sub.length > 128) {
    throw new TokenVerificationError("invalid_claims", "Invalid subject");
  }
  if (typeof authTime !== "number" || authTime > now + CLOCK_TOLERANCE_S) {
    throw new TokenVerificationError("invalid_claims", "Invalid auth_time");
  }
  if (typeof iat !== "number" || iat > now + CLOCK_TOLERANCE_S || typeof exp !== "number") {
    throw new TokenVerificationError("invalid_claims", "Invalid iat/exp");
  }
  // Firebase ID tokens live for one hour; anything longer is suspicious.
  if (exp - iat > 3600 + CLOCK_TOLERANCE_S) {
    throw new TokenVerificationError("invalid_claims", "Token lifetime too long");
  }

  const firebase = payload["firebase"] as { sign_in_provider?: unknown } | undefined;
  const provider = firebase?.sign_in_provider;
  if (typeof provider !== "string" || !(ALLOWED_SIGN_IN_PROVIDERS as readonly string[]).includes(provider)) {
    throw new TokenVerificationError("unsupported_provider", "Sign-in provider is not allowed");
  }

  const email = typeof payload["email"] === "string" ? (payload["email"] as string) : null;
  return {
    uid: sub,
    email,
    emailVerified: payload["email_verified"] === true,
    signInProvider: provider as SignInProvider,
    authTime,
    issuedAt: iat,
    expiresAt: exp,
  };
}

/** Google and Facebook accounts are provider-verified; password accounts need a verified email. */
export function isIdentityVerified(token: Pick<VerifiedFirebaseToken, "signInProvider" | "emailVerified">): boolean {
  if (token.signInProvider === "password") return token.emailVerified;
  return true;
}
