/**
 * GameChatDO — one chat room per game type (Joker, Bura, …), shown beside that game's room list.
 * Each game type gets its own Durable Object instance (`idFromName("chat:<game>")`), so the rooms
 * are isolated by construction: a message sent in the Joker chat can only ever reach Joker sockets.
 *
 * Same controls as the table chat: authenticated one-time tickets (sent as a subprotocol, hashed
 * at rest, single use, 30 s), exact Origin allowlist, per-socket frame budget, per-user sliding
 * window for messages, strict message schema, server-side text sanitising and bounded history.
 */
import { DurableObject } from "cloudflare:workers";
import { isAllowedOrigin, randomId, randomToken, sha256Hex, SlidingWindowCounter, TokenBucket } from "@croco/security";
import {
  clientGameChatMessageSchema,
  LIMITS,
  WS_CLOSE,
  WS_PROTOCOL,
  WS_TICKET_PREFIX,
  type ChatMessage,
  type GameType,
  type PublicUser,
  type ServerGameChatMessage,
} from "@croco/shared";
import { loadConfig, type Env } from "../env";

interface Attachment {
  user: PublicUser;
  since: number;
}

interface StoredTicket {
  user: PublicUser;
  exp: number;
}

/** Sockets per user (tabs / devices) and per game chat in all. */
const MAX_SOCKETS_PER_USER = 3;
const MAX_SOCKETS = 500;

export class GameChatDO extends DurableObject<Env> {
  private gameType: GameType | null = null;
  private history: ChatMessage[] = [];
  private buckets = new Map<WebSocket, TokenBucket>();
  private limiter = new SlidingWindowCounter(LIMITS.chat.burst, LIMITS.chat.perSeconds * 1000);
  private seq = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.history = (await ctx.storage.get<ChatMessage[]>("history")) ?? [];
      this.gameType = (await ctx.storage.get<GameType>("gameType")) ?? null;
    });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"hb"}', '{"type":"hb_ack"}'));
  }

  private sockets(tag?: string): WebSocket[] {
    return this.ctx.getWebSockets(tag).filter((ws) => ws.readyState === WebSocket.OPEN);
  }

  /** Distinct users connected to this game's chat. */
  private onlineCount(): number {
    return new Set(this.sockets().map((ws) => (ws.deserializeAttachment() as Attachment).user.id)).size;
  }

  async issueTicket(gameType: GameType, user: PublicUser): Promise<{ ticket: string; expiresIn: number }> {
    if (this.gameType !== gameType) {
      this.gameType = gameType;
      await this.ctx.storage.put("gameType", gameType);
    }
    const now = Date.now();
    const stored = (await this.ctx.storage.get<Record<string, StoredTicket>>("tickets")) ?? {};
    for (const [h, t] of Object.entries(stored)) if (t.exp <= now) delete stored[h];
    // Bound outstanding tickets per user so the map cannot be inflated.
    const mine = Object.entries(stored).filter(([, t]) => t.user.id === user.id);
    if (mine.length >= 5) delete stored[mine[0]![0]];
    const ticket = randomToken(32);
    stored[await sha256Hex(ticket)] = { user, exp: now + LIMITS.ws.ticketTtlMs };
    await this.ctx.storage.put("tickets", stored);
    return { ticket, expiresIn: LIMITS.ws.ticketTtlMs };
  }

  /** Copies a reported message for moderators; it must exist and belong to the reported user. */
  async chatSnapshot(messageId: string, targetUserId: string): Promise<string | null> {
    const msg = this.history.find((m) => m.id === messageId && m.kind === "user" && m.user?.id === targetUserId);
    return msg ? JSON.stringify({ chat: this.gameType, user: msg.user?.username, text: msg.text, ts: msg.ts }) : null;
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    if (!isAllowedOrigin(request.headers.get("Origin"), loadConfig(this.env).allowedOrigins)) return new Response("Forbidden", { status: 403 });
    const protocols = (request.headers.get("Sec-WebSocket-Protocol") ?? "").split(",").map((p) => p.trim());
    const ticket = protocols.find((p) => p.startsWith(WS_TICKET_PREFIX))?.slice(WS_TICKET_PREFIX.length);
    if (!protocols.includes(WS_PROTOCOL) || !ticket || !/^[A-Za-z0-9_-]{40,64}$/.test(ticket)) return new Response("Unauthorized", { status: 401 });
    const hash = await sha256Hex(ticket);
    const stored = (await this.ctx.storage.get<Record<string, StoredTicket>>("tickets")) ?? {};
    const entry = stored[hash];
    delete stored[hash]; // single use
    await this.ctx.storage.put("tickets", stored);
    if (!entry || entry.exp <= Date.now()) return new Response("Unauthorized", { status: 401 });
    if (this.sockets().length >= MAX_SOCKETS) return new Response("Busy", { status: 503 });

    const existing = this.sockets(entry.user.id);
    if (existing.length >= MAX_SOCKETS_PER_USER) existing[0]!.close(WS_CLOSE.superseded, "too many sessions");
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [entry.user.id]);
    server.serializeAttachment({ user: entry.user, since: Date.now() } satisfies Attachment);
    this.send(server, {
      type: "hello",
      seq: ++this.seq,
      gameType: this.gameType!,
      chat: this.history.slice(-LIMITS.chat.restoreOnReconnect),
      online: this.onlineCount(),
    });
    this.broadcastOnline();
    return new Response(null, { status: 101, webSocket: client, headers: { "Sec-WebSocket-Protocol": WS_PROTOCOL } });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string" || message.length > LIMITS.ws.maxFrameBytes) return ws.close(WS_CLOSE.policy, "invalid frame");
    let bucket = this.buckets.get(ws);
    if (!bucket) {
      bucket = new TokenBucket(LIMITS.ws.msgBurst, LIMITS.ws.msgPerSecond);
      this.buckets.set(ws, bucket);
    }
    if (!bucket.take()) return ws.close(WS_CLOSE.rateLimited, "rate limited");
    let msg;
    try {
      const parsed = clientGameChatMessageSchema.safeParse(JSON.parse(message));
      if (!parsed.success) throw new Error("schema");
      msg = parsed.data;
    } catch {
      this.send(ws, { type: "error", seq: ++this.seq, code: "bad_message" });
      return;
    }
    if (msg.type === "ping") {
      this.send(ws, { type: "pong", seq: ++this.seq, id: msg.id, serverTime: Date.now() });
      return;
    }
    const { user } = ws.deserializeAttachment() as Attachment;
    if (this.limiter.isLimited(user.id)) {
      this.send(ws, { type: "error", seq: ++this.seq, id: msg.id, code: "rate_limited" });
      return;
    }
    this.limiter.hit(user.id);
    const chat: ChatMessage = { id: randomId("m", 16), ts: Date.now(), kind: "user", user, text: msg.text };
    this.history.push(chat);
    if (this.history.length > LIMITS.chat.historySize) this.history.splice(0, this.history.length - LIMITS.chat.historySize);
    await this.ctx.storage.put("history", this.history);
    for (const s of this.sockets()) this.send(s, { type: "chat", seq: ++this.seq, message: chat });
    this.send(ws, { type: "ack", seq: ++this.seq, id: msg.id });
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    this.gone(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.gone(ws);
  }

  private gone(ws: WebSocket): void {
    this.buckets.delete(ws);
    this.broadcastOnline(ws);
  }

  private broadcastOnline(closing?: WebSocket): void {
    const open = this.sockets().filter((s) => s !== closing);
    const online = new Set(open.map((s) => (s.deserializeAttachment() as Attachment).user.id)).size;
    for (const s of open) this.send(s, { type: "online", seq: ++this.seq, online });
  }

  private send(ws: WebSocket, msg: ServerGameChatMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* closing */
    }
  }
}
