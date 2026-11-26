import { describe, expect, it } from "vitest";
import { env, SELF } from "cloudflare:test";
import { api, attach, msgId, ORIGIN, player, type Client } from "./helpers";

async function chatTicket(c: Client, game: string): Promise<string> {
  const t = await c.json("POST", `/api/chat/${game}/ticket`);
  if (t.status !== 200) throw new Error(`ticket failed ${t.status} ${JSON.stringify(t.body)}`);
  return t.body.ticket as string;
}

function openChat(c: Client, game: string, ticket: string, origin = ORIGIN) {
  return SELF.fetch(`https://api.croco.test/api/chat/${game}/ws`, {
    headers: { Upgrade: "websocket", Origin: origin, "Sec-WebSocket-Protocol": `croco.v1, t.${ticket}`, "CF-Connecting-IP": c.ip },
  });
}

async function join(c: Client, game: string) {
  const res = await openChat(c, game, await chatTicket(c, game));
  expect(res.status).toBe(101);
  const h = attach(res.webSocket!);
  const hello = await h.next((m) => m.type === "hello");
  return { h, hello };
}

describe("game chat rooms", () => {
  it("needs a signed-in player and a known game", async () => {
    expect((await api("POST", "/api/chat/joker/ticket")).status).toBe(401);
    const p = await player("chat_auth");
    expect((await p.json("POST", "/api/chat/chess/ticket")).status).toBe(404);
  });

  it("rejects foreign origins, missing and reused tickets", async () => {
    const p = await player("chat_sec");
    const ticket = await chatTicket(p, "joker");
    expect((await openChat(p, "joker", ticket, "https://evil.example")).status).toBe(403);
    const noTicket = await SELF.fetch("https://api.croco.test/api/chat/joker/ws", {
      headers: { Upgrade: "websocket", Origin: ORIGIN, "Sec-WebSocket-Protocol": "croco.v1" },
    });
    expect(noTicket.status).toBe(401);
    const fresh = await chatTicket(p, "joker");
    expect((await openChat(p, "joker", fresh)).status).toBe(101);
    expect((await openChat(p, "joker", fresh)).status).toBe(401); // single use
  });

  it("keeps every game's chat separate and restores recent history", async () => {
    const a = await player("chat_a");
    const b = await player("chat_b");
    const c = await player("chat_c");
    const joker1 = await join(a, "joker");
    const joker2 = await join(b, "joker");
    const bura = await join(c, "bura3");
    expect(joker1.hello.gameType).toBe("joker");
    expect(bura.hello.gameType).toBe("bura3");

    const text = `hello joker ${msgId()}`;
    joker1.h.send({ type: "chat.send", id: msgId(), text });
    const got = await joker2.h.next((m) => m.type === "chat" && m.message.text === text);
    expect(got.message.user.username).toBe(a.username);
    await joker1.h.next((m) => m.type === "ack");
    // The Bura chat never sees it.
    await new Promise((r) => setTimeout(r, 150));
    expect(bura.h.messages.some((m) => m.type === "chat" && m.message.text === text)).toBe(false);

    // A later visitor gets the message in the history.
    const late = await join(c, "joker");
    expect(late.hello.chat.some((m: { text: string }) => m.text === text)).toBe(true);
  });

  it("sanitises text, rejects unknown message types and rate-limits bursts", async () => {
    const p = await player("chat_rl");
    const { h } = await join(p, "japanese_joker");
    h.send({ type: "chat.delete", id: msgId() });
    expect((await h.next((m) => m.type === "error")).code).toBe("bad_message");
    for (let i = 0; i < 6; i++) h.send({ type: "chat.send", id: msgId(), text: `burst ${i}` });
    expect((await h.next((m) => m.type === "error" && m.code === "rate_limited")).code).toBe("rate_limited");
  });

  it("lets a player report a game chat message with a moderator snapshot", async () => {
    const author = await player("chat_author");
    const reporter = await player("chat_reporter");
    const one = await join(author, "bura5");
    const two = await join(reporter, "bura5");
    one.h.send({ type: "chat.send", id: msgId(), text: "rude words" });
    const msg = await two.h.next((m) => m.type === "chat" && m.message.text === "rude words");
    const res = await reporter.json("POST", "/api/reports", { targetUserId: author.userId, chatGame: "bura5", messageId: msg.message.id, reason: "abuse" });
    expect(res.status).toBe(201);
    const row = await env.DB.prepare("SELECT room_id, message_snapshot FROM reports WHERE id = ?").bind(res.body.id).first<{ room_id: string; message_snapshot: string }>();
    expect(row?.room_id).toBe("chat:bura5");
    expect(row?.message_snapshot).toContain("rude words");
  });
});
