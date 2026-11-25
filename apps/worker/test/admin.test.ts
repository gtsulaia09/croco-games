import { describe, expect, it } from "vitest";
import { totpCodeAt, currentTimeStep } from "@croco/security";
import { player, token, type Client } from "./helpers";

function base32Decode(input: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of input.replace(/=+$/, "")) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

async function owner(): Promise<Client & { userId: string }> {
  return player("gio_main", { email: "owner@croco.test" }).then(async (p) => {
    // Re-issue the token for the configured admin UID.
    p.uid = "owner-firebase-uid";
    p.tok = await token("owner-firebase-uid", { email: "owner@croco.test" });
    const prof = await p.json("POST", "/api/me/profile", { username: "Giorgi_main", avatar: "a05", locale: "ka" });
    if (prof.status !== 201 && prof.body?.error?.code !== "profile_exists") throw new Error(JSON.stringify(prof.body));
    const me = await p.json("GET", "/api/me");
    return Object.assign(p, { userId: me.body.profile.id as string });
  });
}

describe("administrator bootstrap and MFA", () => {
  it("does not grant admin to a look-alike identity (wrong email or unverified)", async () => {
    const fake = await player("imposter");
    fake.tok = await token("owner-firebase-uid-2", { email: "owner@croco.test" });
    expect((await fake.json("GET", "/api/me")).body.roles).toEqual([]);
    const unverified = await player("unverified_x");
    unverified.tok = await token("owner-firebase-uid", { email: "owner@croco.test", emailVerified: false, provider: "password" });
    expect((await unverified.json("GET", "/api/me")).body.roles).toEqual([]);
  });

  it("bootstraps the owner, requires MFA, issues step-up tokens and prevents TOTP replay", async () => {
    const admin = await owner();
    const me = await admin.json("GET", "/api/me");
    expect(me.body.roles).toContain("admin");
    expect(me.body.profile.badges.admin).toBe(true);
    expect(me.body.admin).toEqual({ mfaEnrolled: false, mfaRequired: true });

    // Admin privileges are unusable before MFA enrollment.
    expect((await admin.json("GET", "/api/admin/overview")).body.error.code).toBe("mfa_not_enrolled");

    // Enrollment requires recent authentication.
    const stale = Math.floor(Date.now() / 1000) - 3600;
    const staleTok = await token("owner-firebase-uid", { email: "owner@croco.test", authTime: stale });
    const staleRes = await admin.call("POST", "/api/admin/mfa/enroll/start", undefined, { Authorization: `Bearer ${staleTok}` });
    expect(staleRes.status).toBe(403);

    const start = await admin.json("POST", "/api/admin/mfa/enroll/start");
    expect(start.status).toBe(200);
    expect(start.body.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    const secret = base32Decode(start.body.secret);
    const step = currentTimeStep();

    expect((await admin.json("POST", "/api/admin/mfa/enroll/confirm", { code: "000000" })).status).toBe(401);
    const confirm = await admin.json("POST", "/api/admin/mfa/enroll/confirm", { code: totpCodeAt(secret, step) });
    expect(confirm.status).toBe(200);
    expect(confirm.body.recoveryCodes).toHaveLength(10);

    // The same code cannot be used again (replay).
    expect((await admin.json("POST", "/api/admin/mfa/verify", { code: totpCodeAt(secret, step) })).body.error.code).toBe("mfa_invalid");

    // Without a step-up token admin routes stay closed.
    expect((await admin.json("GET", "/api/admin/overview")).body.error.code).toBe("step_up_required");
    const verify = await admin.json("POST", "/api/admin/mfa/verify", { code: totpCodeAt(secret, step + 1) });
    expect(verify.status).toBe(200);
    const stepUp = { "X-Admin-Step-Up": verify.body.stepUpToken as string };
    const overview = await admin.json("GET", "/api/admin/overview", undefined, stepUp);
    expect(overview.status).toBe(200);
    expect(overview.body.users).toBeGreaterThan(0);

    // A step-up token is bound to this user: another user cannot use it.
    const other = await player("stepup_thief");
    expect((await other.json("GET", "/api/admin/overview", undefined, stepUp)).status).toBe(403);

    // Recovery codes work exactly once.
    const code = confirm.body.recoveryCodes[0] as string;
    expect((await admin.json("POST", "/api/admin/mfa/recover", { code })).status).toBe(200);
    expect((await admin.json("POST", "/api/admin/mfa/recover", { code })).status).toBe(401);

    // Moderator management is audited and the audit chain verifies.
    const target = await player("future_mod");
    expect((await admin.json("POST", `/api/admin/users/${target.userId}/roles`, { role: "moderator", action: "grant" }, stepUp)).status).toBe(200);
    // Privilege change rotates the target's sessions.
    expect((await target.json("GET", "/api/me")).body.error.code).toBe("session_revoked");
    const audit = await admin.json("GET", "/api/admin/audit", undefined, stepUp);
    const actions = audit.body.items.map((i: { action: string }) => i.action);
    expect(actions).toEqual(expect.arrayContaining(["admin.bootstrap", "mfa.enrolled", "mfa.step_up", "role.grant"]));
    const chain = await admin.json("GET", "/api/admin/audit/verify", undefined, stepUp);
    expect(chain.body.brokenAt).toBeNull();
    expect(chain.body.checked).toBeGreaterThan(3);

    // Admins cannot be granted admin via the API and cannot change their own roles.
    expect((await admin.json("POST", `/api/admin/users/${target.userId}/roles`, { role: "admin", action: "grant" }, stepUp)).status).toBe(400);
    expect((await admin.json("POST", `/api/admin/users/${admin.userId}/roles`, { role: "moderator", action: "grant" }, stepUp)).status).toBe(403);
  });

  it("limits MFA guessing", async () => {
    const admin = await owner();
    const status = await admin.json("GET", "/api/admin/mfa/status");
    if (!status.body.enrolled) {
      const start = await admin.json("POST", "/api/admin/mfa/enroll/start");
      const secret = base32Decode(start.body.secret);
      expect((await admin.json("POST", "/api/admin/mfa/enroll/confirm", { code: totpCodeAt(secret, currentTimeStep()) })).status).toBe(200);
    }
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await admin.json("POST", "/api/admin/mfa/verify", { code: String(100000 + i) })).status);
    expect(statuses.slice(0, 2)).toEqual([401, 401]);
    expect(statuses[statuses.length - 1]).toBe(429);
  });

  it("keeps every admin route closed to ordinary users", async () => {
    const p = await player("plain");
    for (const [m, path] of [
      ["GET", "/api/admin/overview"],
      ["GET", "/api/admin/users"],
      ["GET", "/api/admin/audit"],
      ["GET", "/api/admin/security-events"],
      ["PUT", "/api/admin/settings"],
      ["POST", "/api/admin/users/u_AAAAAAAAAAAAAAAAAAAA/suspend"],
      ["POST", "/api/admin/mfa/enroll/start"],
    ] as const) {
      const res = await p.json(m, path, m === "GET" ? undefined : {});
      expect(res.status, `${m} ${path}`).toBe(403);
    }
  });
});
