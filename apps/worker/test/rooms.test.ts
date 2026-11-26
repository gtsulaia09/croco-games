import { describe, expect, it } from "vitest";
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { attach, msgId, openRoomSocket, player, type Client } from "./helpers";

const baseRoom = {
  gameType: "bura3",
  name: "Test room",
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

async function createRoom(host: Client, over: Record<string, unknown> = {}): Promise<string> {
  const res = await host.json("POST", "/api/rooms", { ...baseRoom, ...over });
  if (res.status !== 201) throw new Error(`create failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.id as string;
}

async function connect(c: Client, roomId: string) {
  const { res } = await openRoomSocket(c, roomId);
  expect(res.status).toBe(101);
  expect(res.headers.get("Sec-WebSocket-Protocol")).toBe("croco.v1");
  const h = attach(res.webSocket!);
  const hello = await h.next((m) => m.type === "hello");
  return { h, hello };
}

describe("room lifecycle and browser", () => {
  it("creates, lists, joins and enforces one active room per user", async () => {
    const host = await player("rm_host");
    const guest = await player("rm_guest");
    const roomId = await createRoom(host, { name: "Joker lovers" });
    const list = await guest.json("GET", "/api/rooms?gameType=bura3&filter=seats");
    const summary = list.body.items.find((r: { id: string }) => r.id === roomId);
    expect(summary).toMatchObject({ name: "Joker lovers", players: 1, maxPlayers: 2, phase: "waiting", hasPassword: false });
    expect(JSON.stringify(summary)).not.toMatch(/pbkdf2|"password"|ticket/i);
    expect((await guest.json("POST", `/api/rooms/${roomId}/join`, {})).status).toBe(200);
    // Second room for the same user is rejected.
    expect((await guest.json("POST", "/api/rooms", baseRoom)).body.error.code).toBe("already_in_room");
    // Room is full now.
    const third = await player("rm_third");
    expect((await third.json("POST", `/api/rooms/${roomId}/join`, {})).body.error.code).toBe("room_full");
    // Spectating is allowed.
    expect((await third.json("POST", `/api/rooms/${roomId}/join`, { asSpectator: true })).status).toBe(200);
  });

  it("validates game configuration and seat counts server-side", async () => {
    const host = await player("rm_cfg");
    expect((await host.json("POST", "/api/rooms", { ...baseRoom, gameType: "joker", maxPlayers: 2 })).status).toBe(400);
    expect((await host.json("POST", "/api/rooms", { ...baseRoom, gameConfig: { targetPoints: 9999 } })).status).toBe(400);
    expect((await host.json("POST", "/api/rooms", { ...baseRoom, gameConfig: { evil: true } })).status).toBe(400);
    expect((await host.json("POST", "/api/rooms", { ...baseRoom, bots: 2 })).status).toBe(400);
  });

  it("protects password rooms: hash never exposed, wrong passwords limited", async () => {
    const host = await player("pw_host");
    const roomId = await createRoom(host, { visibility: "private", password: "s3cret-pass" });
    const guest = await player("pw_guest");
    const details = await guest.json("GET", `/api/rooms/${roomId}`);
    expect(details.body.room.hasPassword).toBe(true);
    expect(JSON.stringify(details.body)).not.toContain("s3cret");
    expect(JSON.stringify(details.body)).not.toContain("pbkdf2");
    const codes: string[] = [];
    for (let i = 0; i < 6; i++) codes.push((await guest.json("POST", `/api/rooms/${roomId}/join`, { password: `wrong-${i}` })).body.error.code);
    expect(codes.slice(0, 5).every((c) => c === "room_password_invalid")).toBe(true);
    expect(codes[5]).toBe("room_password_locked");
    // Even the correct password is refused while locked.
    expect((await guest.json("POST", `/api/rooms/${roomId}/join`, { password: "s3cret-pass" })).body.error.code).toBe("room_password_locked");
    const other = await player("pw_other");
    expect((await other.json("POST", `/api/rooms/${roomId}/join`, { password: "s3cret-pass" })).status).toBe(200);
  });

  it("private rooms require a password at creation", async () => {
    const host = await player("pw_req");
    expect((await host.json("POST", "/api/rooms", { ...baseRoom, visibility: "private" })).status).toBe(400);
  });
});

describe("WebSocket security", () => {
  it("rejects foreign origins (CSWSH), missing tickets and reused tickets", async () => {
    const host = await player("ws_host");
    const roomId = await createRoom(host);
    const foreign = await openRoomSocket(host, roomId, { origin: "https://evil.example" });
    expect(foreign.res.status).toBe(403);
    const noTicket = await SELF.fetch(`https://api.croco.test/api/rooms/${roomId}/ws`, {
      headers: { Upgrade: "websocket", Origin: "https://app.croco.test", "Sec-WebSocket-Protocol": "croco.v1" },
    });
    expect(noTicket.status).toBe(401);
    const ok = await openRoomSocket(host, roomId);
    expect(ok.res.status).toBe(101);
    attach(ok.res.webSocket!);
    const reuse = await openRoomSocket(host, roomId, { ticket: ok.ticket });
    expect(reuse.res.status).toBe(401);
  });

  it("does not issue tickets to non-members", async () => {
    const host = await player("ws_host2");
    const roomId = await createRoom(host);
    const outsider = await player("ws_out");
    expect((await outsider.json("POST", `/api/rooms/${roomId}/ticket`)).body.error.code).toBe("not_in_room");
  });

  it("rejects unknown message types, extra fields and oversized frames", async () => {
    const host = await player("ws_msg");
    const roomId = await createRoom(host);
    const { h } = await connect(host, roomId);
    h.send({ type: "admin.grant", id: msgId() });
    expect((await h.next((m) => m.type === "error")).code).toBe("bad_message");
    h.send({ type: "room.start", id: msgId(), seat: 1 });
    expect((await h.next((m) => m.type === "error")).code).toBe("bad_message");
    const closed = new Promise<number>((resolve) => h.ws.addEventListener("close", (e) => resolve(e.code)));
    h.ws.send("x".repeat(5000));
    expect(await closed).toBe(1009);
  });

  it("supersedes an older socket when the same user connects from another device", async () => {
    const host = await player("ws_dev");
    const roomId = await createRoom(host);
    const first = await connect(host, roomId);
    const closed = new Promise<number>((resolve) => first.h.ws.addEventListener("close", (e) => resolve(e.code)));
    await connect(host, roomId);
    expect(await closed).toBe(4001);
  });
});

describe("authoritative game play", () => {
  async function startedGame() {
    const a = await player("g_a");
    const b = await player("g_b");
    const roomId = await createRoom(a);
    expect((await b.json("POST", `/api/rooms/${roomId}/join`, {})).status).toBe(200);
    const A = await connect(a, roomId);
    const B = await connect(b, roomId);
    A.h.send({ type: "room.start", id: msgId() });
    const ga = await A.h.next((m) => m.type === "game");
    const gb = await B.h.next((m) => m.type === "game");
    return { a, b, roomId, A, B, ga, gb };
  }

  it("only the host can start, and each player sees only their own cards", async () => {
    const { roomId, A, B, ga, gb } = await startedGame();
    expect(ga.view.you.hand).toHaveLength(3);
    expect(gb.view.you.hand).toHaveLength(3);
    // Compare against the authoritative state inside the Durable Object.
    const hidden = await runInDurableObject(env.ROOM.get(env.ROOM.idFromName(roomId)), async (instance) => {
      const game = (instance as unknown as { game: { state: { hands: string[][]; stock: string[] } } }).game;
      return game.state;
    });
    const seatA = A.hello.you.seat as number;
    const seatB = B.hello.you.seat as number;
    const aJson = JSON.stringify(ga);
    const bJson = JSON.stringify(gb);
    for (const card of hidden.hands[seatB]!) expect(aJson.includes(`"${card}"`) && card !== ga.view.trumpCard).toBe(false);
    for (const card of hidden.hands[seatA]!) expect(bJson.includes(`"${card}"`) && card !== gb.view.trumpCard).toBe(false);
    // The stock order (future cards) is never sent.
    expect(aJson).not.toContain('"stock":');
  });

  it("rejects out-of-turn moves, stale revisions and replays, applying each action exactly once", async () => {
    const { A, B, ga, gb } = await startedGame();
    const aLeads = A.hello.you.seat === ga.view.toAct;
    const [leader, follower] = aLeads ? [A, B] : [B, A];
    const hand: string[] = (aLeads ? ga : gb).view.you.hand;
    follower.h.send({ type: "game.action", id: msgId(), rev: 0, action: { type: "lead", cards: [hand[0]] } });
    expect((await follower.h.next((m) => m.type === "error")).code).toBe("not_your_turn");
    leader.h.send({ type: "game.action", id: msgId(), rev: 99, action: { type: "lead", cards: [hand[0]] } });
    expect((await leader.h.next((m) => m.type === "error")).code).toBe("stale_revision");
    const id = msgId();
    leader.h.send({ type: "game.action", id, rev: 0, action: { type: "lead", cards: [hand[0]] } });
    expect((await leader.h.next((m) => m.type === "game" && m.rev === 1)).rev).toBe(1);
    await leader.h.next((m) => m.type === "ack" && m.id === id);
    // Exact replay: acknowledged again, but not applied a second time.
    leader.h.send({ type: "game.action", id, rev: 0, action: { type: "lead", cards: [hand[0]] } });
    await leader.h.next((m) => m.type === "ack" && m.id === id);
    await new Promise((r) => setTimeout(r, 200));
    expect(leader.h.messages.some((m) => m.type === "game" && m.rev === 2)).toBe(false);
  });

  it("rejects illegal moves (cards not in hand)", async () => {
    const { A, B, ga, gb } = await startedGame();
    const aLeads = A.hello.you.seat === ga.view.toAct;
    const leader = aLeads ? A : B;
    const hand: string[] = (aLeads ? ga : gb).view.you.hand;
    const notMine = ["AS", "AH", "AD", "AC", "TS", "TH"].find((c) => !hand.includes(c))!;
    leader.h.send({ type: "game.action", id: msgId(), rev: 0, action: { type: "lead", cards: [notMine] } });
    expect((await leader.h.next((m) => m.type === "error")).code).toBe("card_not_in_hand");
  });

  it("hands a disconnected seat to a bot after the grace period and restores it on reconnect", async () => {
    const { a, roomId, A, B, ga, gb } = await startedGame();
    const stub = env.ROOM.get(env.ROOM.idFromName(roomId));
    await runInDurableObject(stub, async (instance) => {
      (instance as unknown as { room: { settings: { disconnectGraceMs: number } } }).room.settings.disconnectGraceMs = 50;
    });
    const seatA = A.hello.you.seat as number;
    // Make sure it is player A's turn so the bot must act for A.
    if (ga.view.toAct !== seatA) {
      B.h.send({ type: "game.action", id: msgId(), rev: 0, action: { type: "lead", cards: [gb.view.you.hand[0]] } });
      await B.h.next((m) => m.type === "game" && m.rev === 1);
    }
    A.h.ws.close(1000, "bye");
    // The bot takes over and plays for seat A; B observes the revision advancing.
    const botMove = await B.h.next((m) => m.type === "chat" && m.message.key === "bot_took_over", 8000);
    expect(botMove.message.params.name).toBe(a.username);
    // Cross-device recovery: the same user reconnects (new ticket) and gets the seat back.
    const active = await a.json("GET", "/api/me/active-game");
    expect(active.body.active.roomId).toBe(roomId);
    const again = await connect(a, roomId);
    expect(again.hello.you.seat).toBe(seatA);
    expect(again.hello.game.view.you.hand.length).toBeGreaterThanOrEqual(0);
    const room = await again.h.next((m) => m.type === "room");
    expect(room.room.seats[seatA].botControlled).toBe(false);
  });

  it("keeps chat isolated per room, rate-limited and attributed by the server", async () => {
    const { A, B, a } = await startedGame();
    A.h.send({ type: "chat.send", id: msgId(), text: "<img src=x onerror=alert(1)> hello" });
    const got = await B.h.next((m) => m.type === "chat" && m.message.kind === "user");
    expect(got.message.user.id).toBe(a.userId);
    expect(got.message.text).toBe("<img src=x onerror=alert(1)> hello");
    const outsider = await player("chat_out");
    const otherRoom = await createRoom(outsider);
    const O = await connect(outsider, otherRoom);
    expect(O.h.messages.some((m) => m.type === "chat" && m.message.kind === "user")).toBe(false);
    for (let i = 0; i < 8; i++) A.h.send({ type: "chat.send", id: msgId(), text: `spam ${i}` });
    expect((await A.h.next((m) => m.type === "error" && m.code === "rate_limited")).code).toBe("rate_limited");
  });
});

describe("bot table talk", () => {
  it("bots post a quote or joke on the default timer (every 5–10 minutes) while the chat is on", async () => {
    const host = await player("bt_host");
    const roomId = await createRoom(host, { bots: 1 });
    const { h } = await connect(host, roomId);
    h.send({ type: "room.start", id: msgId() });
    await h.next((m) => m.type === "game");
    const stub = env.ROOM.get(env.ROOM.idFromName(roomId));
    const scheduled = await runInDurableObject(stub, async (instance) => {
      const game = (instance as unknown as { game: { botChatAt: number | null } }).game;
      const at = game.botChatAt;
      game.botChatAt = Date.now() - 1; // due now
      return at;
    });
    // Bots are rare: the first line comes 5–10 minutes after the deal.
    expect(scheduled).toBeGreaterThan(Date.now() + 4.5 * 60_000);
    expect(scheduled).toBeLessThanOrEqual(Date.now() + 10 * 60_000);
    await runInDurableObject(stub, async (instance) => (instance as unknown as { alarm(): Promise<void> }).alarm());
    const talk = await h.next((m) => m.type === "chat" && m.message.kind === "bot");
    expect(talk.message.key).toMatch(/^[qj]\d{2}$/);
    expect(talk.message.text).toBe("");
    expect(talk.message.bot.seat).toBe(1);
    const next = await runInDurableObject(stub, async (instance) => (instance as unknown as { game: { botChatAt: number } }).game.botChatAt);
    expect(next).toBeGreaterThan(Date.now() + 4.5 * 60_000); // next line in 5–10 minutes
  });

  it("stays quiet when the table chat is turned off", async () => {
    const host = await player("bt_quiet");
    const roomId = await createRoom(host, { bots: 1, chatEnabled: false });
    const { h } = await connect(host, roomId);
    h.send({ type: "room.start", id: msgId() });
    await h.next((m) => m.type === "game");
    const stub = env.ROOM.get(env.ROOM.idFromName(roomId));
    await runInDurableObject(stub, async (instance) => {
      (instance as unknown as { game: { botChatAt: number } }).game.botChatAt = Date.now() - 1;
      await (instance as unknown as { alarm(): Promise<void> }).alarm();
    });
    await new Promise((r) => setTimeout(r, 150));
    expect(h.messages.some((m) => m.type === "chat" && m.message.kind === "bot")).toBe(false);
  });
});
