import { describe, expect, it } from "vitest";
import { player } from "./helpers";

describe("friends", () => {
  it("runs the request → accept → list → remove flow", async () => {
    const a = await player("fr_a");
    const b = await player("fr_b");
    const req = await a.json("POST", "/api/friend-requests", { toUserId: b.userId });
    expect(req.status).toBe(201);
    expect((await a.json("POST", "/api/friend-requests", { toUserId: b.userId })).status).toBe(409);
    const incoming = await b.json("GET", "/api/friend-requests");
    expect(incoming.body.incoming[0].from.id).toBe(a.userId);
    // Only the recipient can accept (IDOR).
    expect((await a.json("POST", `/api/friend-requests/${req.body.id}/accept`)).status).toBe(404);
    expect((await b.json("POST", `/api/friend-requests/${req.body.id}/accept`)).status).toBe(200);
    expect((await a.json("GET", "/api/friends")).body.items.map((f: { user: { id: string } }) => f.user.id)).toEqual([b.userId]);
    const notes = await a.json("GET", "/api/notifications");
    expect(notes.body.items.some((n: { kind: string }) => n.kind === "friend_accepted")).toBe(true);
    expect((await b.json("DELETE", `/api/friends/${a.userId}`)).status).toBe(200);
    expect((await a.json("GET", "/api/friends")).body.items).toEqual([]);
  });

  it("lets the sender cancel and the recipient reject, but not each other's actions", async () => {
    const a = await player("fr_c");
    const b = await player("fr_d");
    const r1 = (await a.json("POST", "/api/friend-requests", { toUserId: b.userId })).body.id;
    expect((await b.json("POST", `/api/friend-requests/${r1}/cancel`)).status).toBe(404);
    expect((await a.json("POST", `/api/friend-requests/${r1}/cancel`)).status).toBe(200);
    const r2 = (await a.json("POST", "/api/friend-requests", { toUserId: b.userId })).body.id;
    expect((await a.json("POST", `/api/friend-requests/${r2}/reject`)).status).toBe(404);
    expect((await b.json("POST", `/api/friend-requests/${r2}/reject`)).status).toBe(200);
  });

  it("blocking removes friendship and hides the blocker from requests and search", async () => {
    const a = await player("blk_a");
    const b = await player("blk_b");
    expect((await b.json("POST", "/api/blocks", { userId: a.userId })).status).toBe(201);
    const req = await a.json("POST", "/api/friend-requests", { toUserId: b.userId });
    expect(req.status).toBe(404); // indistinguishable from a non-existent user
    const search = await a.json("GET", `/api/users/search?q=${encodeURIComponent(b.username.slice(0, 6))}`);
    expect(search.body.items.some((u: { id: string }) => u.id === b.userId)).toBe(false);
    expect((await a.json("GET", `/api/users/${b.userId}`)).status).toBe(404);
  });

  it("cannot read or mark other users' notifications", async () => {
    const a = await player("nt_a");
    const b = await player("nt_b");
    await a.json("POST", "/api/friend-requests", { toUserId: b.userId });
    const bNotes = await b.json("GET", "/api/notifications");
    const id = bNotes.body.items[0].id as string;
    expect((await a.json("GET", "/api/notifications")).body.items.some((n: { id: string }) => n.id === id)).toBe(false);
    await a.json("POST", "/api/notifications/read", { ids: [id] });
    expect((await b.json("GET", "/api/notifications")).body.unread).toBe(1);
  });
});

describe("search input handling", () => {
  it.each(["' OR 1=1 --", "%' UNION SELECT email FROM users --", "a\" OR \"1\"=\"1", "ab"])("rejects or safely handles %s", async (q) => {
    const p = await player("sqli");
    const res = await p.json("GET", `/api/users/search?q=${encodeURIComponent(q)}`);
    expect([400, 200]).toContain(res.status);
    if (res.status === 200) expect(res.body.items).toEqual([]);
    expect(JSON.stringify(res.body)).not.toMatch(/@|firebase/);
  });

  it("finds users by prefix and never returns private fields", async () => {
    const a = await player("findme");
    const b = await player("finder");
    const res = await b.json("GET", `/api/users/search?q=${encodeURIComponent(a.username.slice(0, 8))}`);
    const hit = res.body.items.find((u: { id: string }) => u.id === a.userId);
    expect(hit).toBeTruthy();
    expect(Object.keys(hit).sort()).toEqual(["avatar", "badges", "id", "username"]);
  });
});

describe("invitations", () => {
  it("only lets room members invite friends, and only the invitee can accept", async () => {
    const host = await player("inv_host");
    const friend = await player("inv_friend");
    const stranger = await player("inv_stranger");
    const fr = (await host.json("POST", "/api/friend-requests", { toUserId: friend.userId })).body.id;
    await friend.json("POST", `/api/friend-requests/${fr}/accept`);
    const room = await host.json("POST", "/api/rooms", {
      gameType: "bura3", name: "Invite room", visibility: "invite", maxPlayers: 3, allowSpectators: false, bots: 0,
      botDifficulty: "easy", turnSeconds: 30, autoStart: false, chatEnabled: true, allowInvites: true, gameConfig: {},
    });
    expect(room.status).toBe(201);
    const roomId = room.body.id as string;
    // Invite-only rooms are invisible and not joinable without a grant.
    expect((await stranger.json("GET", "/api/rooms?gameType=bura3&filter=invite")).body.items.some((r: { id: string }) => r.id === roomId)).toBe(false);
    expect((await stranger.json("GET", `/api/rooms/${roomId}`)).status).toBe(404);
    expect((await stranger.json("POST", `/api/rooms/${roomId}/join`, {})).status).toBe(403);
    // Non-friends cannot be invited; non-members cannot invite.
    expect((await host.json("POST", "/api/invitations", { roomId, toUserId: stranger.userId })).status).toBe(403);
    expect((await stranger.json("POST", "/api/invitations", { roomId, toUserId: friend.userId })).status).toBe(403);
    const inv = await host.json("POST", "/api/invitations", { roomId, toUserId: friend.userId });
    expect(inv.status).toBe(201);
    expect((await stranger.json("POST", `/api/invitations/${inv.body.id}/accept`)).status).toBe(404);
    const accepted = await friend.json("POST", `/api/invitations/${inv.body.id}/accept`);
    expect(accepted.status).toBe(200);
    expect(accepted.body.roomId).toBe(roomId);
    expect((await friend.json("GET", "/api/me/active-game")).body.active.roomId).toBe(roomId);
  });
});
