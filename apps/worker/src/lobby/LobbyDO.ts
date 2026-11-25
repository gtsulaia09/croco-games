/**
 * LobbyDO — singleton Durable Object for presence and realtime notifications.
 * Presence is derived from authenticated WebSockets (one-time tickets, Origin allowlist).
 * Presence changes are only fanned out to the user's friends.
 */
import { DurableObject } from "cloudflare:workers";
import { isAllowedOrigin, randomToken, sha256Hex, TokenBucket } from "@croco/security";
import {
  clientLobbyMessageSchema,
  LIMITS,
  WS_CLOSE,
  WS_PROTOCOL,
  WS_TICKET_PREFIX,
  type NotificationDto,
  type PresenceStatus,
  type ServerLobbyMessage,
} from "@croco/shared";
import { all, one } from "../db";
import { loadConfig, type Env } from "../env";
import { publicUser } from "../users";

interface Attachment {
  userId: string;
  status: "online" | "away";
  since: number;
}

interface Activity {
  roomId: string;
  gameType: string;
  playing: boolean;
}

export interface PresenceEntry {
  userId: string;
  status: PresenceStatus;
  roomId: string | null;
  gameType: string | null;
}

export class LobbyDO extends DurableObject<Env> {
  private activity = new Map<string, Activity>();
  private buckets = new Map<WebSocket, TokenBucket>();
  private seq = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<Record<string, Activity>>("activity");
      if (stored) this.activity = new Map(Object.entries(stored));
    });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"hb"}', '{"type":"hb_ack"}'));
  }

  private sockets(userId?: string): WebSocket[] {
    return this.ctx.getWebSockets(userId).filter((ws) => ws.readyState === WebSocket.OPEN);
  }

  private statusOf(userId: string): PresenceStatus {
    const sockets = this.sockets(userId);
    if (!sockets.length) return "offline";
    if (this.activity.get(userId)?.playing) return "in_game";
    const statuses = sockets.map((ws) => (ws.deserializeAttachment() as Attachment).status);
    return statuses.includes("online") ? "online" : "away";
  }

  async issueTicket(userId: string): Promise<{ ticket: string; expiresIn: number }> {
    const now = Date.now();
    // Tickets are persisted so that they survive eviction between issue and connect.
    const stored = (await this.ctx.storage.get<Record<string, { userId: string; exp: number }>>("tickets")) ?? {};
    for (const [h, t] of Object.entries(stored)) if (t.exp <= now) delete stored[h];
    const ticket = randomToken(32);
    stored[await sha256Hex(ticket)] = { userId, exp: now + LIMITS.ws.ticketTtlMs };
    await this.ctx.storage.put("tickets", stored);
    return { ticket, expiresIn: LIMITS.ws.ticketTtlMs };
  }

  async push(userId: string, notification: NotificationDto): Promise<void> {
    for (const ws of this.sockets(userId)) this.send(ws, { type: "notification", seq: ++this.seq, notification });
  }

  async presence(userIds: string[]): Promise<PresenceEntry[]> {
    return userIds.slice(0, 500).map((userId) => {
      const a = this.activity.get(userId);
      const status = this.statusOf(userId);
      return { userId, status, roomId: status === "offline" ? null : (a?.roomId ?? null), gameType: status === "offline" ? null : (a?.gameType ?? null) };
    });
  }

  async listOnline(limit: number): Promise<PresenceEntry[]> {
    const seen = new Map<string, number>();
    for (const ws of this.sockets()) {
      const att = ws.deserializeAttachment() as Attachment;
      seen.set(att.userId, Math.min(seen.get(att.userId) ?? Infinity, att.since));
    }
    return [...seen.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(0, Math.min(limit, 500))
      .map(([userId]) => ({ userId, status: this.statusOf(userId), roomId: this.activity.get(userId)?.roomId ?? null, gameType: this.activity.get(userId)?.gameType ?? null }));
  }

  async setActivity(userId: string, activity: Activity | null): Promise<void> {
    const before = this.statusOf(userId);
    if (activity) this.activity.set(userId, activity);
    else this.activity.delete(userId);
    await this.ctx.storage.put("activity", Object.fromEntries(this.activity));
    const after = this.statusOf(userId);
    if (before !== after) await this.fanOutPresence(userId, after);
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    if (!isAllowedOrigin(request.headers.get("Origin"), loadConfig(this.env).allowedOrigins)) return new Response("Forbidden", { status: 403 });
    const protocols = (request.headers.get("Sec-WebSocket-Protocol") ?? "").split(",").map((p) => p.trim());
    const ticket = protocols.find((p) => p.startsWith(WS_TICKET_PREFIX))?.slice(WS_TICKET_PREFIX.length);
    if (!protocols.includes(WS_PROTOCOL) || !ticket || !/^[A-Za-z0-9_-]{40,64}$/.test(ticket)) return new Response("Unauthorized", { status: 401 });
    const hash = await sha256Hex(ticket);
    const stored = (await this.ctx.storage.get<Record<string, { userId: string; exp: number }>>("tickets")) ?? {};
    const entry = stored[hash];
    delete stored[hash]; // single use
    await this.ctx.storage.put("tickets", stored);
    if (!entry || entry.exp <= Date.now()) return new Response("Unauthorized", { status: 401 });
    const userId = entry.userId;
    // Cap sockets per user (multiple tabs/devices are fine, floods are not).
    const existing = this.sockets(userId);
    if (existing.length >= 5) existing[0]!.close(WS_CLOSE.superseded, "too many sessions");
    const wasOffline = existing.length === 0;
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [userId]);
    server.serializeAttachment({ userId, status: "online", since: Date.now() } satisfies Attachment);
    const unread = await one<{ n: number }>(this.env.DB, "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL", userId);
    this.send(server, { type: "hello", seq: ++this.seq, unread: unread?.n ?? 0 });
    if (wasOffline) this.ctx.waitUntil(this.fanOutPresence(userId, this.statusOf(userId), true));
    return new Response(null, { status: 101, webSocket: client, headers: { "Sec-WebSocket-Protocol": WS_PROTOCOL } });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string" || message.length > LIMITS.ws.lobbyMaxFrameBytes) return ws.close(WS_CLOSE.policy, "invalid frame");
    let bucket = this.buckets.get(ws);
    if (!bucket) {
      bucket = new TokenBucket(6, 0.1);
      this.buckets.set(ws, bucket);
    }
    if (!bucket.take()) return ws.close(WS_CLOSE.rateLimited, "rate limited");
    let msg;
    try {
      const parsed = clientLobbyMessageSchema.safeParse(JSON.parse(message));
      if (!parsed.success) throw new Error("schema");
      msg = parsed.data;
    } catch {
      this.send(ws, { type: "error", seq: ++this.seq, code: "bad_message" });
      return;
    }
    const att = ws.deserializeAttachment() as Attachment;
    if (msg.type === "ping") {
      this.send(ws, { type: "pong", seq: ++this.seq, id: msg.id, serverTime: Date.now() });
      return;
    }
    const before = this.statusOf(att.userId);
    ws.serializeAttachment({ ...att, status: msg.status } satisfies Attachment);
    const after = this.statusOf(att.userId);
    if (before !== after) await this.fanOutPresence(att.userId, after);
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await this.gone(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.gone(ws);
  }

  private async gone(ws: WebSocket): Promise<void> {
    this.buckets.delete(ws);
    const { userId } = ws.deserializeAttachment() as Attachment;
    if (this.sockets(userId).filter((s) => s !== ws).length === 0) await this.fanOutPresence(userId, "offline");
  }

  /** Sends a presence update only to the user's friends who are online (and only if visible). */
  private async fanOutPresence(userId: string, status: PresenceStatus, cameOnline = false): Promise<void> {
    const visible = await one<{ show_online: number }>(this.env.DB, "SELECT show_online FROM profiles WHERE user_id = ?", userId);
    if (!visible || visible.show_online !== 1) return;
    const friends = await all<{ friend: string }>(
      this.env.DB,
      "SELECT CASE WHEN user_a = ? THEN user_b ELSE user_a END AS friend FROM friends WHERE user_a = ? OR user_b = ? LIMIT 500",
      userId,
      userId,
      userId,
    );
    const actor = cameOnline ? await publicUser(this.env.DB, userId) : null;
    for (const { friend } of friends) {
      for (const ws of this.sockets(friend)) {
        this.send(ws, { type: "presence", seq: ++this.seq, userId, status });
        if (actor) {
          this.send(ws, {
            type: "notification",
            seq: ++this.seq,
            notification: { id: `n_live${Date.now().toString(36)}${this.seq}`, kind: "friend_online", createdAt: Date.now(), read: false, actor, data: {} },
          });
        }
      }
    }
  }

  private send(ws: WebSocket, msg: ServerLobbyMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* closing */
    }
  }
}
