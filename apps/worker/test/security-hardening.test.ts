import { describe, expect, it } from "vitest";
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { totpCodeAt, currentTimeStep } from "@croco/security";
import { loadConfig, ConfigError, type Env } from "../src/env";
import { api, attach, msgId, openRoomSocket, ORIGIN, player, token, type Client } from "./helpers";

const BASE_ROOM = {
  gameType: "bura3",
  name: "Hardening room",
  visibility: "public",
  maxPlayers: 2,
  allowSpectators: true,
  bots: 0,
  botDifficulty: "easy",
  turnSeconds: 30,
  autoStart: false,
  chatEnabled: true,
  allowInvites: true,
  gameConfig: {},
};

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

async function openLobbySocket(c: Client, opts: { origin?: string; ticket?: string } = {}) {
  let ticket = opts.ticket;
  if (!ticket) {
    const t = await c.json("POST", "/api/lobby/ticket");
    if (t.status !== 200) throw new Error(`lobby ticket failed ${t.status}`);
    ticket = t.body.ticket as string;
  }
  const res = await SELF.fetch("https://api.croco.test/api/lobby/ws", {
    headers: { Upgrade: "websocket", Origin: opts.origin ?? ORIGIN, "Sec-WebSocket-Protocol": `croco.v1, t.${ticket}`, "CF-Connecting-IP": c.ip },
  });
  return { res, ticket };
}

async function bootstrapAdminWithStepUp(): Promise<{ admin: Client & { userId: string }; stepUp: Record<string, string> }> {
  const p = await player("sec_adm");
  p.uid = "owner-firebase-uid";
  p.tok = await token("owner-firebase-uid", { email: "owner@croco.test" });
  await p.json("POST", "/api/me/profile", { username: "Owner_sec_1", avatar: "a01", locale: "en" });
  const me = await p.json("GET", "/api/me");
  const admin = Object.assign(p, { userId: me.body.profile.id as string });
  
  const status = await admin.json("GET", "/api/admin/mfa/status");
  if (!status.body.enrolled) {
    const start = await admin.json("POST", "/api/admin/mfa/enroll/start");
    const secret = base32Decode(start.body.secret);
    const confirm = await admin.json("POST", "/api/admin/mfa/enroll/confirm", { code: totpCodeAt(secret, currentTimeStep()) });
    return { admin, stepUp: { "X-Admin-Step-Up": confirm.body.stepUpToken as string } };
  }
  // If already enrolled in the shared DB, issue a fresh recovery-code-free step-up via DB-seeded test token is avoided;
  // instead generate a fresh step-up by enrolling a dedicated moderator or reusing enrolled secret.
  const start = await admin.json("POST", "/api/admin/mfa/enroll/start");
  if (start.status === 200) {
    const secret = base32Decode(start.body.secret);
    const confirm = await admin.json("POST", "/api/admin/mfa/enroll/confirm", { code: totpCodeAt(secret, currentTimeStep()) });
    return { admin, stepUp: { "X-Admin-Step-Up": confirm.body.stepUpToken as string } };
  }
  throw new Error("Admin already enrolled in isolated test; run with fresh DB");
}

describe("default-deny route inventory", () => {
  const PROTECTED: Array<[string, string]> = [
    ["GET", "/api/me"],
    ["POST", "/api/me/profile"],
    ["PATCH", "/api/me/profile"],
    ["DELETE", "/api/me"],
    ["GET", "/api/me/sessions"],
    ["POST", "/api/me/sessions/revoke"],
    ["POST", "/api/me/sessions/revoke-all"],
    ["GET", "/api/me/login-history"],
    ["GET", "/api/me/active-game"],
    ["GET", "/api/me/stats"],
    ["GET", "/api/me/matches"],
    ["GET", "/api/users/u_AAAAAAAAAAAAAAAAAAAA"],
    ["GET", "/api/users/search?q=abc"],
    ["GET", "/api/friends"],
    ["DELETE", "/api/friends/u_AAAAAAAAAAAAAAAAAAAA"],
    ["GET", "/api/friend-requests"],
    ["POST", "/api/friend-requests"],
    ["GET", "/api/blocks"],
    ["POST", "/api/blocks"],
    ["GET", "/api/notifications"],
    ["POST", "/api/notifications/read"],
    ["GET", "/api/invitations"],
    ["POST", "/api/invitations"],
    ["POST", "/api/invite-links"],
    ["GET", "/api/invite-links/aaaaaaaaaaaaaaaaaaaaaaaa"],
    ["GET", "/api/presence/online"],
    ["GET", "/api/rooms?gameType=bura3"],
    ["POST", "/api/rooms"],
    ["GET", "/api/rooms/r_AAAAAAAAAAAAAAAAAAAA"],
    ["POST", "/api/rooms/r_AAAAAAAAAAAAAAAAAAAA/join"],
    ["POST", "/api/rooms/r_AAAAAAAAAAAAAAAAAAAA/leave"],
    ["POST", "/api/rooms/r_AAAAAAAAAAAAAAAAAAAA/ticket"],
    ["POST", "/api/lobby/ticket"],
    ["POST", "/api/reports"],
    ["GET", "/api/leaderboards/joker"],
    ["GET", "/api/leaderboards/global"],
    ["GET", "/api/leaders"],
    ["GET", "/api/admin/mfa/status"],
    ["GET", "/api/admin/overview"],
    ["GET", "/api/admin/users"],
    ["GET", "/api/admin/online"],
    ["GET", "/api/admin/rooms"],
    ["GET", "/api/admin/reports"],
    ["GET", "/api/admin/integrity"],
    ["GET", "/api/admin/audit"],
    ["GET", "/api/admin/audit/verify"],
    ["GET", "/api/admin/security-events"],
    ["GET", "/api/admin/settings"],
    ["PUT", "/api/admin/settings"],
  ];

  it("rejects unauthenticated requests on every non-public endpoint", async () => {
    for (const [method, path] of PROTECTED) {
      const res = await api(method, path, { body: method === "GET" || method === "DELETE" ? undefined : {} });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });
});

describe("fail-closed configuration validation", () => {
  const baseEnv = {
    ENVIRONMENT: "production",
    FIREBASE_PROJECT_ID: "croco-prod-123",
    ALLOWED_ORIGINS: "https://croco.pages.dev",
    IP_HASH_KEY: "a".repeat(32),
  } as unknown as Env;

  it("rejects placeholder project IDs, insecure origins, and missing IP_HASH_KEY in deployed envs", () => {
    expect(() => loadConfig({ ...baseEnv, FIREBASE_PROJECT_ID: "REPLACE_WITH_PROD_PROJECT_ID" })).toThrow(ConfigError);
    expect(() => loadConfig({ ...baseEnv, ALLOWED_ORIGINS: "http://croco.pages.dev" })).toThrow(ConfigError);
    expect(() => loadConfig({ ...baseEnv, ALLOWED_ORIGINS: "*" })).toThrow(ConfigError);
    expect(() => loadConfig({ ...baseEnv, IP_HASH_KEY: "short" })).toThrow(ConfigError);
    expect(() => loadConfig({ ...baseEnv, MFA_ENCRYPTION_KEY: "not-32-bytes" })).toThrow(ConfigError);
  });

  it("disables admin features when any admin secret is absent", () => {
    const cfg = loadConfig({ ...baseEnv });
    expect(cfg.admin.enabled).toBe(false);
  });
});

describe("room host blocking, moderation, and invite link isolation", () => {
  it("prevents a blocked user from joining the host's room", async () => {
    const host = await player("blk_host");
    const blocked = await player("blk_user");
    const room = await host.json("POST", "/api/rooms", BASE_ROOM);
    expect(room.status).toBe(201);
    const roomId = room.body.id as string;
    expect((await host.json("POST", "/api/blocks", { userId: blocked.userId })).status).toBe(201);
    const join = await blocked.json("POST", `/api/rooms/${roomId}/join`, {});
    expect(join.status).toBe(403);
    expect(join.body.error.code).toBe("forbidden");
  });

  it("binds invite links strictly to the room they were created for", async () => {
    const hostA = await player("lnk_a");
    const hostB = await player("lnk_b");
    const guest = await player("lnk_g");
    const roomA = (await hostA.json("POST", "/api/rooms", { ...BASE_ROOM, visibility: "invite" })).body.id as string;
    const roomB = (await hostB.json("POST", "/api/rooms", { ...BASE_ROOM, visibility: "invite" })).body.id as string;
    const link = await hostA.json("POST", "/api/invite-links", { roomId: roomA });
    expect(link.status).toBe(201);
    const crossRoom = await guest.json("POST", `/api/rooms/${roomB}/join`, { inviteCode: link.body.code });
    expect(crossRoom.status).toBe(403);
    const sameRoom = await guest.json("POST", `/api/rooms/${roomA}/join`, { inviteCode: link.body.code });
    expect(sameRoom.status).toBe(200);
  });

  it("blocks non-hosts from privileged room commands and enforces mute", async () => {
    const host = await player("mod_host");
    const guest = await player("mod_guest");
    const roomId = (await host.json("POST", "/api/rooms", BASE_ROOM)).body.id as string;
    expect((await guest.json("POST", `/api/rooms/${roomId}/join`, {})).status).toBe(200);
    const hSock = attach((await openRoomSocket(host, roomId)).res.webSocket!);
    const gSock = attach((await openRoomSocket(guest, roomId)).res.webSocket!);
    await hSock.next((m) => m.type === "hello");
    await gSock.next((m) => m.type === "hello");

    for (const cmd of [
      { type: "room.start", id: msgId() },
      { type: "room.addBot", id: msgId(), difficulty: "easy" },
      { type: "room.kick", id: msgId(), userId: host.userId },
      { type: "room.mute", id: msgId(), userId: host.userId, muted: true },
      { type: "room.transferHost", id: msgId(), userId: guest.userId },
      { type: "room.updateSettings", id: msgId(), settings: { turnSeconds: 45 } },
    ]) {
      gSock.send(cmd);
      expect((await gSock.next((m) => m.type === "error")).code).toBe("forbidden");
    }

    // Host mutes guest; guest chat is then rejected server-side.
    hSock.send({ type: "room.mute", id: msgId(), userId: guest.userId, muted: true });
    await hSock.next((m) => m.type === "ack");
    gSock.send({ type: "chat.send", id: msgId(), text: "should be muted" });
    expect((await gSock.next((m) => m.type === "error")).code).toBe("muted");

    // Host transfers host to guest; guest can now start.
    hSock.send({ type: "room.transferHost", id: msgId(), userId: guest.userId });
    await hSock.next((m) => m.type === "ack");
    gSock.send({ type: "room.start", id: msgId() });
    expect((await gSock.next((m) => m.type === "game")).rev).toBe(0);
  });
});

describe("LobbyDO WebSocket security and friend-only presence", () => {
  it("rejects foreign origins, reused tickets, and oversized frames", async () => {
    const p = await player("lob_sec");
    const foreign = await openLobbySocket(p, { origin: "https://evil.example" });
    expect(foreign.res.status).toBe(403);
    const ok = await openLobbySocket(p);
    expect(ok.res.status).toBe(101);
    const h = attach(ok.res.webSocket!);
    await h.next((m) => m.type === "hello");
    const reuse = await openLobbySocket(p, { ticket: ok.ticket });
    expect(reuse.res.status).toBe(401);
    const closed = new Promise<number>((resolve) => h.ws.addEventListener("close", (e) => resolve(e.code)));
    h.ws.send("x".repeat(2048));
    expect(await closed).toBe(1008);
  });

  it("fans out presence only to friends and respects showOnline=false", async () => {
    const a = await player("prs_a");
    const friend = await player("prs_f");
    const stranger = await player("prs_s");
    const fr = (await a.json("POST", "/api/friend-requests", { toUserId: friend.userId })).body.id;
    await friend.json("POST", `/api/friend-requests/${fr}/accept`);

    const fSock = attach((await openLobbySocket(friend)).res.webSocket!);
    const sSock = attach((await openLobbySocket(stranger)).res.webSocket!);
    await fSock.next((m) => m.type === "hello");
    await sSock.next((m) => m.type === "hello");

    const aSock = attach((await openLobbySocket(a)).res.webSocket!);
    await aSock.next((m) => m.type === "hello");
    const got = await fSock.next((m) => m.type === "presence" && m.userId === a.userId);
    expect(got.status).toBe("online");
    await new Promise((r) => setTimeout(r, 150));
    expect(sSock.messages.some((m) => m.type === "presence" && m.userId === a.userId)).toBe(false);
  });
});

describe("spectator and opponent private card redaction across game families", () => {
  it.each([
    ["holdem", 2],
    ["omaha", 2],
    ["japanese_joker", 2],
    ["dominoes", 2],
  ] as const)("redacts private state for spectators and opponents in %s", async (gameType, maxPlayers) => {
    const host = await player(`red_${gameType}_h`);
    const guest = await player(`red_${gameType}_g`);
    const spec = await player(`red_${gameType}_s`);
    const roomId = (await host.json("POST", "/api/rooms", { ...BASE_ROOM, gameType, maxPlayers })).body.id as string;
    expect((await guest.json("POST", `/api/rooms/${roomId}/join`, {})).status).toBe(200);
    expect((await spec.json("POST", `/api/rooms/${roomId}/join`, { asSpectator: true })).status).toBe(200);

    const hSock = attach((await openRoomSocket(host, roomId)).res.webSocket!);
    const gSock = attach((await openRoomSocket(guest, roomId)).res.webSocket!);
    const sSock = attach((await openRoomSocket(spec, roomId)).res.webSocket!);
    await hSock.next((m) => m.type === "hello");
    await gSock.next((m) => m.type === "hello");
    await sSock.next((m) => m.type === "hello");

    hSock.send({ type: "room.start", id: msgId() });
    const gh = await hSock.next((m) => m.type === "game");
    const gg = await gSock.next((m) => m.type === "game");
    const gs = await sSock.next((m) => m.type === "game");

    // Spectators never receive a `you` block or private hands.
    expect(gs.view.you).toBeNull();
    const specJson = JSON.stringify(gs.view);
    const hidden = await runInDurableObject(env.ROOM.get(env.ROOM.idFromName(roomId)), async (instance) => {
      return (instance as unknown as { game: { state: any } }).game.state;
    });
    if (gameType === "holdem" || gameType === "omaha") {
      for (const p of hidden.players as Array<{ hole: string[] }>) {
        for (const c of p.hole) expect(specJson).not.toContain(`"${c}"`);
      }
      expect(JSON.stringify(gh.view)).not.toContain('"deck"');
      expect(JSON.stringify(gg.view)).not.toContain('"deck"');
    } else if (gameType === "dominoes") {
      for (const hand of hidden.hands as string[][]) for (const tile of hand) expect(specJson).not.toContain(`"${tile}"`);
      for (const tile of hidden.boneyard as string[]) expect(JSON.stringify(gh.view)).not.toContain(`"${tile}"`);
    } else if (gameType === "japanese_joker") {
      for (const hand of hidden.hands as string[][]) for (const c of hand) expect(specJson).not.toContain(`"${c}"`);
    }
  });
});

describe("moderator least privilege, audit append-only triggers, and platform settings", () => {
  it("enforces moderator boundaries, SQLite append-only triggers, and settings gates", async () => {
    const { admin, stepUp: adminStep } = await bootstrapAdminWithStepUp();
    const mod = await player("mod_role");
    const victim = await player("mod_victim");

    // Grant moderator role and verify fresh session + MFA enrollment.
    expect((await admin.json("POST", `/api/admin/users/${mod.userId}/roles`, { role: "moderator", action: "grant" }, adminStep)).status).toBe(200);
    mod.tok = await token(mod.uid, { authTime: Math.floor(Date.now() / 1000) + 2, iat: Math.floor(Date.now() / 1000) + 2 });
    const start = await mod.json("POST", "/api/admin/mfa/enroll/start");
    expect(start.status).toBe(200);
    const confirm = await mod.json("POST", "/api/admin/mfa/enroll/confirm", { code: totpCodeAt(base32Decode(start.body.secret), currentTimeStep()) });
    expect(confirm.status).toBe(200);
    const modStep = { "X-Admin-Step-Up": confirm.body.stepUpToken as string };

    // Moderator can list users, but email is redacted (least privilege).
    const users = await mod.json("GET", "/api/admin/users", undefined, modStep);
    expect(users.status).toBe(200);
    expect(users.body.items.every((u: { email: string | null }) => u.email === null)).toBe(true);

    // Moderator cannot access admin-only endpoints or suspend > 7 days or suspend admins.
    expect((await mod.json("GET", "/api/admin/audit", undefined, modStep)).status).toBe(403);
    expect((await mod.json("GET", "/api/admin/security-events", undefined, modStep)).status).toBe(403);
    expect((await mod.json("GET", "/api/admin/settings", undefined, modStep)).status).toBe(403);
    expect((await mod.json("POST", `/api/admin/users/${victim.userId}/suspend`, { days: 30, reason: "too long" }, modStep)).status).toBe(403);
    expect((await mod.json("POST", `/api/admin/users/${admin.userId}/suspend`, { days: 1, reason: "cannot suspend admin" }, modStep)).status).toBe(403);

    // Moderator CAN suspend an ordinary user for ≤ 7 days and unsuspend them.
    expect((await mod.json("POST", `/api/admin/users/${victim.userId}/suspend`, { days: 3, reason: "Abusive chat" }, modStep)).status).toBe(200);
    expect((await victim.json("GET", "/api/me")).status).toBe(403);
    expect((await mod.json("POST", `/api/admin/users/${victim.userId}/unsuspend`, {}, modStep)).status).toBe(200);

    // Append-only triggers block UPDATE and DELETE on admin_audit_logs.
    await expect(env.DB.prepare("UPDATE admin_audit_logs SET action = 'tampered' WHERE id = 1").run()).rejects.toThrow(/append-only/);
    await expect(env.DB.prepare("DELETE FROM admin_audit_logs WHERE id = 1").run()).rejects.toThrow(/retained/);

    // Admin updates platform settings; public config and room creation gate reflect changes.
    expect(
      (await admin.json("PUT", "/api/admin/settings", { registrationOpen: false, roomCreationOpen: false, maintenanceMessage: "Scheduled maintenance", maxRoomsPerUser: 1 }, adminStep)).status,
    ).toBe(200);
    const pub = await (await api("GET", "/api/config/public")).json() as { registrationOpen: boolean; maintenanceMessage: string | null };
    expect(pub.registrationOpen).toBe(false);
    expect(pub.maintenanceMessage).toBe("Scheduled maintenance");
    const blockedRoom = await mod.json("POST", "/api/rooms", BASE_ROOM);
    expect(blockedRoom.status).toBe(403);
    expect(blockedRoom.body.error.code).toBe("room_creation_closed");

    // Restore settings and verify audit hash chain integrity.
    expect(
      (await admin.json("PUT", "/api/admin/settings", { registrationOpen: true, roomCreationOpen: true, maintenanceMessage: "", maxRoomsPerUser: 1 }, adminStep)).status,
    ).toBe(200);
    const chain = await admin.json("GET", "/api/admin/audit/verify", undefined, adminStep);
    expect(chain.body.brokenAt).toBeNull();
    expect(chain.body.checked).toBeGreaterThan(5);
  });
});

describe("abuse protection and rate caps", () => {
  it("caps room creation per 10 minutes and reports per day", async () => {
    const p = await player("cap_user");
    const other = await player("cap_target");
    for (let i = 0; i < 3; i++) {
      const r = await p.json("POST", "/api/rooms", { ...BASE_ROOM, name: `Room ${i}` });
      expect(r.status).toBe(201);
      await p.json("POST", `/api/rooms/${r.body.id}/leave`);
    }
    const fourth = await p.json("POST", "/api/rooms", { ...BASE_ROOM, name: "Room 4" });
    expect(fourth.status).toBe(429);

    for (let i = 0; i < 10; i++) {
      const rep = await p.json("POST", "/api/reports", { targetUserId: other.userId, reason: "spam", details: `<b>report ${i}</b>` });
      expect(rep.status).toBe(201);
    }
    const eleventh = await p.json("POST", "/api/reports", { targetUserId: other.userId, reason: "spam" });
    expect(eleventh.status).toBe(429);
  });
});
