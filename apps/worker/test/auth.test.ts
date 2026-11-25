import { describe, expect, it } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { api, client, player, token } from "./helpers";

async function status(tok: string, path = "/api/me") {
  return (await api("GET", path, { token: tok })).status;
}

describe("token verification", () => {
  it("rejects missing, malformed and non-bearer credentials", async () => {
    expect((await api("GET", "/api/me")).status).toBe(401);
    expect((await api("GET", "/api/me", { headers: { Authorization: "Bearer not-a-jwt" } })).status).toBe(401);
    expect((await api("GET", "/api/me", { headers: { Authorization: "Basic dXNlcjpwYXNz" } })).status).toBe(401);
  });

  it("rejects tokens signed by an attacker-controlled key", async () => {
    const { privateKey } = await generateKeyPair("RS256");
    const forged = await new SignJWT({ auth_time: Math.floor(Date.now() / 1000), firebase: { sign_in_provider: "google.com" } })
      .setProtectedHeader({ alg: "RS256", kid: "test-key-1" })
      .setIssuer("https://securetoken.google.com/croco-test")
      .setAudience("croco-test")
      .setSubject("owner-firebase-uid")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);
    expect(await status(forged)).toBe(401);
    void exportJWK;
  });

  it("rejects expired tokens, wrong audience and unknown key ids", async () => {
    const now = Math.floor(Date.now() / 1000);
    const expired = await api("GET", "/api/me", { token: await token("auth-exp", { iat: now - 7200, exp: now - 3600, authTime: now - 7200 }) });
    expect(expired.status).toBe(401);
    expect(((await expired.json()) as { error: { code: string } }).error.code).toBe("token_expired");
    expect(await status(await token("auth-aud", { aud: "another-project" }))).toBe(401);
    expect(await status(await token("auth-kid", { kid: "unknown-kid" }))).toBe(401);
  });

  it("rejects disallowed sign-in providers", async () => {
    expect(await status(await token("auth-anon", { provider: "anonymous" }))).toBe(401);
  });

  it("derives identity from the token, never from client input", async () => {
    const c = await client("auth-identity");
    const res = await c.json("POST", "/api/me/profile", { username: "Identity_1", avatar: "a02", locale: "ka", userId: "u_AAAAAAAAAAAAAAAAAAAA" });
    expect(res.status).toBe(400); // unknown field rejected (mass assignment)
    const ok = await c.json("POST", "/api/me/profile", { username: "Identity_1", avatar: "a02", locale: "ka" });
    expect(ok.status).toBe(201);
    const me = await c.json("GET", "/api/me");
    expect(me.body.profile.username).toBe("Identity_1");
    expect(me.body.roles).toEqual([]);
  });
});

describe("registration", () => {
  it("enforces unique, non-reserved usernames (including look-alikes)", async () => {
    const a = await client("reg-a");
    const b = await client("reg-b");
    expect((await a.json("POST", "/api/me/profile", { username: "Tamar_77", avatar: "a03", locale: "en" })).status).toBe(201);
    const dup = await b.json("POST", "/api/me/profile", { username: "tamar_77", avatar: "a03", locale: "en" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("username_taken");
    const lookalike = await b.json("POST", "/api/me/profile", { username: "Tamar_7T", avatar: "a03", locale: "en" });
    expect(lookalike.status).toBe(409); // "7" and "T" share a skeleton
    for (const name of ["Admin", "adm1n", "Moderator", "<script>"]) {
      expect((await b.json("POST", "/api/me/profile", { username: name, avatar: "a03", locale: "en" })).status).toBe(400);
    }
  });

  it("prevents creating a second profile", async () => {
    const p = await player("twice");
    expect((await p.json("POST", "/api/me/profile", { username: "Another_99", avatar: "a01", locale: "en" })).body.error.code).toBe("profile_exists");
  });

  it("requires a profile before using player features", async () => {
    const c = await client("no-profile");
    expect((await c.json("GET", "/api/rooms?gameType=bura3")).body.error.code).toBe("profile_required");
  });
});

describe("sessions", () => {
  it("lists sessions and revokes everything with logout-everywhere", async () => {
    const p = await player("sess");
    const sessions = await p.json("GET", "/api/me/sessions");
    expect(sessions.body.items.length).toBeGreaterThan(0);
    expect(sessions.body.items[0].current).toBe(true);
    expect((await p.json("POST", "/api/me/sessions/revoke-all")).status).toBe(200);
    const after = await p.json("GET", "/api/me");
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe("session_revoked");
    // A fresh sign-in (later auth_time) works again.
    p.tok = await token(p.uid, { authTime: Math.floor(Date.now() / 1000) + 2, iat: Math.floor(Date.now() / 1000) + 2 });
    expect((await p.json("GET", "/api/me")).status).toBe(200);
  });

  it("revokes a single session and blocks IDOR on other users' sessions", async () => {
    const a = await player("idor-a");
    const b = await player("idor-b");
    const aSession = (await a.json("GET", "/api/me/sessions")).body.items[0].id as string;
    expect((await b.json("POST", "/api/me/sessions/revoke", { sessionId: aSession })).status).toBe(404);
    expect((await a.json("GET", "/api/me")).status).toBe(200);
    expect((await a.json("POST", "/api/me/sessions/revoke", { sessionId: aSession })).status).toBe(200);
    expect((await a.json("GET", "/api/me")).body.error.code).toBe("session_revoked");
  });
});

describe("email verification for sensitive actions", () => {
  it("blocks unverified password accounts from social and multiplayer writes", async () => {
    const p = await player("unverified", { provider: "password", emailVerified: false });
    const res = await p.json("POST", "/api/rooms", {
      gameType: "bura3", name: "My room", visibility: "public", maxPlayers: 2, allowSpectators: true, bots: 1,
      botDifficulty: "easy", turnSeconds: 30, autoStart: false, chatEnabled: true, allowInvites: true, gameConfig: {},
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("email_not_verified");
  });
});

describe("account deletion", () => {
  it("requires recent authentication and removes personal data", async () => {
    const now = Math.floor(Date.now() / 1000);
    const stale = await player("delete-stale", { authTime: now - 3600 });
    expect((await stale.json("DELETE", "/api/me")).body.error.code).toBe("recent_auth_required");
    const p = await player("delete-me");
    expect((await p.json("DELETE", "/api/me")).status).toBe(200);
    // The tombstone is unlinked from the Firebase identity: nothing personal remains, and the
    // same identity would start over as a brand-new account without a profile.
    const after = await p.json("GET", "/api/me");
    expect(after.body.profile).toBeNull();
    const search = await (await player("delete_obs")).json("GET", `/api/users/${p.userId}`);
    expect(search.status).toBe(404);
  });
});
