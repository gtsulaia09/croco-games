/**
 * RoomDO — one Durable Object per room. It is the single authority for room membership, seat
 * ownership, chat, game state, turn timers, bot control and match finalisation.
 *
 * Security properties:
 *  - WebSockets are accepted only with a one-time, user-bound, 30-second ticket (subprotocol).
 *  - Every frame is size-limited, rate-limited, schema-validated and authorised.
 *  - Game actions must reference the current revision and carry a unique id (replay protection).
 *  - Each socket only ever receives `engine.view(state, itsSeat)`.
 */
import { DurableObject } from "cloudflare:workers";
import { allEngines, cryptoRng, type GameEngine, type PublicEvent } from "@croco/game-engine";
import {
  isAllowedOrigin,
  pbkdf2Hash,
  pbkdf2Verify,
  randomId,
  randomToken,
  sha256Hex,
  SlidingWindowCounter,
  TokenBucket,
} from "@croco/security";
import {
  clientRoomMessageSchema,
  GAME_CATALOG,
  LIMITS,
  WS_CLOSE,
  WS_PROTOCOL,
  WS_TICKET_PREFIX,
  type BotDifficulty,
  type ChatMessage,
  type ClientRoomMessage,
  type ErrorCode,
  type GameType,
  type MatchResult,
  type PublicUser,
  type RoomPhase,
  type RoomSettings,
  type RoomSnapshot,
  type RoomVisibility,
  type SeatInfo,
  type ServerRoomMessage,
} from "@croco/shared";
import { securityEvent } from "../audit";
import { run, stmt } from "../db";
import { loadConfig, type Env } from "../env";
import { lobbyStub, notify } from "../notify";
import { finalizeMatch } from "../ratings";

interface SeatData {
  seat: number;
  kind: "empty" | "human" | "bot";
  userId?: string;
  botName?: string;
  difficulty?: BotDifficulty;
  connected: boolean;
  botControlled: boolean;
  disconnectedAt: number | null;
  forfeited: boolean;
  ready: boolean;
}

interface MemberData {
  user: PublicUser;
  seat: number | null;
  spectator: boolean;
  muted: boolean;
  joinedAt: number;
}

interface RoomData {
  id: string;
  gameType: GameType;
  name: string;
  visibility: RoomVisibility;
  passwordHash: string | null;
  hostId: string;
  createdAt: number;
  closed: boolean;
  phase: RoomPhase;
  settings: RoomSettings;
  maxPlayers: number;
  seats: SeatData[];
  members: Record<string, MemberData>;
  banned: string[];
  matchNumber: number;
  botCounter: number;
  lastResult: MatchResult | null;
  tickets: Record<string, { userId: string; exp: number }>;
  pwFails: Record<string, number[]>;
  lastHumanSeenAt: number;
}

interface GameData {
  matchId: string;
  state: unknown;
  rev: number;
  turnKey: string;
  deadline: number | null;
  botActAt: number | null;
  startedAt: number;
  processed: string[];
}

export interface CreateRoomInput {
  roomId: string;
  gameType: GameType;
  name: string;
  visibility: RoomVisibility;
  password: string | null;
  host: PublicUser;
  maxPlayers: number;
  bots: number;
  settings: RoomSettings;
}

export type RoomResult<T = object> = ({ ok: true } & T) | { ok: false; error: ErrorCode };

const MAX_EVENTS = 1000;
const BOT_DELAY_MS = 900;
const IDLE_BOT_DELAY_MS = 2500;
const ABANDON_AFTER_MS = 30 * 60_000;

export class RoomDO extends DurableObject<Env> {
  private room: RoomData | null = null;
  private game: GameData | null = null;
  private chat: ChatMessage[] = [];
  private events: PublicEvent[] = [];
  private seq = 0;
  private buckets = new Map<WebSocket, TokenBucket>();
  private badFrames = new Map<WebSocket, number>();
  private chatLimiter = new SlidingWindowCounter(LIMITS.chat.burst, LIMITS.chat.perSeconds * 1000);

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<RoomData>("room")) ?? null;
      this.game = (await ctx.storage.get<GameData>("game")) ?? null;
      this.chat = (await ctx.storage.get<ChatMessage[]>("chat")) ?? [];
      this.events = (await ctx.storage.get<PublicEvent[]>("events")) ?? [];
    });
    // Client heartbeats are answered without waking the object (no billing, no CPU).
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"hb"}', '{"type":"hb_ack"}'));
  }

  // ───────────────────────────── persistence ─────────────────────────────

  private async save(parts: { room?: boolean; game?: boolean; chat?: boolean; events?: boolean } = { room: true }): Promise<void> {
    const entries: Record<string, unknown> = {};
    if (parts.room && this.room) entries["room"] = this.room;
    if (parts.game) entries["game"] = this.game;
    if (parts.chat) entries["chat"] = this.chat;
    if (parts.events) entries["events"] = this.events;
    const deletions = Object.entries(entries).filter(([, v]) => v === null).map(([k]) => k);
    const puts = Object.fromEntries(Object.entries(entries).filter(([, v]) => v !== null));
    if (Object.keys(puts).length) await this.ctx.storage.put(puts);
    if (deletions.length) await this.ctx.storage.delete(deletions);
  }

  private engine(): GameEngine {
    return allEngines[this.room!.gameType];
  }

  // ───────────────────────────── RPC: lifecycle ─────────────────────────────

  async create(input: CreateRoomInput): Promise<RoomResult> {
    if (this.room) return { ok: false, error: "conflict" };
    const engine = allEngines[input.gameType];
    const configParse = engine.configSchema.safeParse(input.settings.gameConfig);
    if (!configParse.success) return { ok: false, error: "validation_failed" };
    const limits = engine.seatLimits(configParse.data);
    if (input.maxPlayers < limits.min || input.maxPlayers > limits.max) return { ok: false, error: "validation_failed" };
    if (input.bots > input.maxPlayers - 1) return { ok: false, error: "validation_failed" };
    const now = Date.now();
    const seats: SeatData[] = Array.from({ length: input.maxPlayers }, (_, seat) => emptySeat(seat));
    seats[0] = { ...emptySeat(0), kind: "human", userId: input.host.id, connected: false };
    this.room = {
      id: input.roomId,
      gameType: input.gameType,
      name: input.name,
      visibility: input.visibility,
      passwordHash: input.password ? await pbkdf2Hash(input.password) : null,
      hostId: input.host.id,
      createdAt: now,
      closed: false,
      phase: "waiting",
      settings: { ...input.settings, gameConfig: configParse.data as Record<string, unknown> },
      maxPlayers: input.maxPlayers,
      seats,
      members: { [input.host.id]: { user: input.host, seat: 0, spectator: false, muted: false, joinedAt: now } },
      banned: [],
      matchNumber: 0,
      botCounter: 0,
      lastResult: null,
      tickets: {},
      pwFails: {},
      lastHumanSeenAt: now,
    };
    for (let i = 0; i < input.bots; i++) this.addBot(input.settings.botDifficulty);
    await this.save({ room: true });
    this.systemChat("room_created", { name: input.name });
    await this.save({ chat: true });
    return { ok: true };
  }

  async snapshot(): Promise<RoomSnapshot | null> {
    return this.room ? this.buildSnapshot() : null;
  }

  /** Checks whether `userId` may invite others (and, when `requireHost`, whether they host). */
  async inviteCheck(userId: string, requireHost = false): Promise<RoomResult<{ name: string; gameType: GameType }>> {
    const room = this.room;
    if (!room || room.closed) return { ok: false, error: "room_closed" };
    if (!room.members[userId]) return { ok: false, error: "not_in_room" };
    if (requireHost && room.hostId !== userId) return { ok: false, error: "forbidden" };
    if (!room.settings.allowInvites && room.hostId !== userId) return { ok: false, error: "forbidden" };
    return { ok: true, name: room.name, gameType: room.gameType };
  }

  async join(
    user: PublicUser,
    opts: { password?: string; inviteGrant?: boolean; asSpectator?: boolean },
  ): Promise<RoomResult<{ seat: number | null }>> {
    const room = this.room;
    if (!room || room.closed) return { ok: false, error: "room_closed" };
    if (room.banned.includes(user.id)) return { ok: false, error: "forbidden" };
    const existing = room.members[user.id];
    if (existing) return { ok: true, seat: existing.seat };
    if (room.visibility === "invite" && !opts.inviteGrant) return { ok: false, error: "forbidden" };

    if (room.passwordHash && !opts.inviteGrant) {
      const now = Date.now();
      const userKey = `u:${user.id}`;
      const fails = (room.pwFails[userKey] ?? []).filter((t) => now - t < LIMITS.room.passwordFailureWindowMs);
      const roomFails = (room.pwFails["room"] ?? []).filter((t) => now - t < 60 * 60_000);
      if (fails.length >= LIMITS.room.passwordFailuresPerUser || roomFails.length >= LIMITS.room.passwordFailuresPerRoomPerHour) {
        return { ok: false, error: "room_password_locked" };
      }
      if (!opts.password || !(await pbkdf2Verify(opts.password, room.passwordHash))) {
        room.pwFails[userKey] = [...fails, now];
        room.pwFails["room"] = [...roomFails, now];
        await this.save({ room: true });
        this.ctx.waitUntil(securityEvent(this.env, "room.password_failed", { userId: user.id, details: { roomId: room.id, attempts: fails.length + 1 } }));
        return { ok: false, error: "room_password_invalid" };
      }
    }

    let seat: number | null = null;
    const spectator = Boolean(opts.asSpectator);
    if (spectator) {
      if (!room.settings.allowSpectators) return { ok: false, error: "forbidden" };
      const spectators = Object.values(room.members).filter((m) => m.spectator).length;
      if (spectators >= LIMITS.room.maxSpectators) return { ok: false, error: "room_full" };
    } else {
      if (room.phase === "playing") return { ok: false, error: "room_full" };
      const free = room.seats.find((s) => s.kind === "empty");
      if (!free) return { ok: false, error: "room_full" };
      seat = free.seat;
    }

    // The unique partial index in D1 enforces "one active room per user" globally.
    try {
      await run(
        this.env.DB,
        "INSERT INTO room_members (room_id, user_id, role, seat, joined_at, left_at) VALUES (?, ?, ?, ?, ?, NULL) ON CONFLICT(room_id, user_id) DO UPDATE SET role = excluded.role, seat = excluded.seat, joined_at = excluded.joined_at, left_at = NULL",
        room.id,
        user.id,
        spectator ? "spectator" : "player",
        seat,
        Date.now(),
      );
    } catch (e) {
      if (/UNIQUE/i.test(String(e))) return { ok: false, error: "already_in_room" };
      throw e;
    }
    if (seat !== null) room.seats[seat] = { ...emptySeat(seat), kind: "human", userId: user.id };
    room.members[user.id] = { user, seat, spectator, muted: false, joinedAt: Date.now() };
    await this.save({ room: true });
    this.systemChat(spectator ? "spectator_joined" : "player_joined", { name: user.username });
    await this.save({ chat: true });
    this.broadcastRoom();
    await this.syncRoomRow();
    this.ctx.waitUntil(this.setActivity(user.id, false));
    // Let the host know someone joined (push-only notification).
    if (user.id !== room.hostId) this.ctx.waitUntil(notify(this.env, room.hostId, "room_joined", user, { roomId: room.id }));
    return { ok: true, seat };
  }

  async leave(userId: string, reason = "left"): Promise<RoomResult> {
    const room = this.room;
    if (!room) return { ok: false, error: "not_found" };
    const member = room.members[userId];
    if (!member) return { ok: false, error: "not_in_room" };
    await this.removeMember(userId, reason);
    return { ok: true };
  }

  async issueTicket(userId: string): Promise<RoomResult<{ ticket: string; expiresIn: number }>> {
    const room = this.room;
    if (!room || room.closed) return { ok: false, error: "room_closed" };
    if (!room.members[userId]) return { ok: false, error: "not_in_room" };
    const now = Date.now();
    for (const [h, t] of Object.entries(room.tickets)) if (t.exp <= now) delete room.tickets[h];
    const outstanding = Object.values(room.tickets).filter((t) => t.userId === userId).length;
    if (outstanding >= 5) return { ok: false, error: "rate_limited" };
    const ticket = randomToken(32);
    room.tickets[await sha256Hex(ticket)] = { userId, exp: now + LIMITS.ws.ticketTtlMs };
    await this.save({ room: true });
    return { ok: true, ticket, expiresIn: LIMITS.ws.ticketTtlMs };
  }

  /** Copies a reported chat message for moderators (reporter must be a member; message must be the target's). */
  async chatSnapshot(reporterId: string, messageId: string, targetUserId: string): Promise<string | null> {
    if (!this.room?.members[reporterId]) return null;
    const msg = this.chat.find((m) => m.id === messageId && m.kind === "user" && m.user?.id === targetUserId);
    return msg ? msg.text.slice(0, 300) : null;
  }

  async adminKick(userId: string): Promise<RoomResult> {
    if (!this.room?.members[userId]) return { ok: false, error: "not_in_room" };
    this.room.banned.push(userId);
    await this.removeMember(userId, "kicked");
    return { ok: true };
  }

  async adminClose(): Promise<RoomResult> {
    if (!this.room) return { ok: false, error: "not_found" };
    await this.closeRoom("closed_by_admin");
    return { ok: true };
  }

  // ───────────────────────────── WebSocket entry ─────────────────────────────

  override async fetch(request: Request): Promise<Response> {
    const room = this.room;
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    // Defense in depth: the Worker already checked Origin; check again here.
    const config = loadConfig(this.env);
    if (!isAllowedOrigin(request.headers.get("Origin"), config.allowedOrigins)) {
      this.ctx.waitUntil(securityEvent(this.env, "ws.rejected", { details: { reason: "origin", room: room?.id } }));
      return new Response("Forbidden", { status: 403 });
    }
    if (!room || room.closed) return new Response("Gone", { status: 410 });
    const protocols = (request.headers.get("Sec-WebSocket-Protocol") ?? "").split(",").map((p) => p.trim());
    const ticket = protocols.find((p) => p.startsWith(WS_TICKET_PREFIX))?.slice(WS_TICKET_PREFIX.length);
    if (!protocols.includes(WS_PROTOCOL) || !ticket || !/^[A-Za-z0-9_-]{40,64}$/.test(ticket)) return new Response("Unauthorized", { status: 401 });
    const hash = await sha256Hex(ticket);
    const entry = room.tickets[hash];
    delete room.tickets[hash]; // single use, even when invalid/expired
    await this.save({ room: true });
    if (!entry || entry.exp <= Date.now() || !room.members[entry.userId]) {
      this.ctx.waitUntil(securityEvent(this.env, "ws.rejected", { details: { reason: "ticket", room: room.id } }));
      return new Response("Unauthorized", { status: 401 });
    }
    if (this.ctx.getWebSockets().length >= LIMITS.ws.maxSocketsPerRoom) return new Response("Too many connections", { status: 429 });

    const userId = entry.userId;
    // One live socket per user: the newest authenticated connection owns the seat.
    for (const old of this.ctx.getWebSockets(userId)) {
      try {
        old.close(WS_CLOSE.superseded, "superseded");
      } catch {
        /* already closed */
      }
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [userId]);
    server.serializeAttachment({ userId });

    const member = room.members[userId]!;
    room.lastHumanSeenAt = Date.now();
    if (member.seat !== null) {
      const seat = room.seats[member.seat]!;
      const wasAway = !seat.connected || seat.botControlled;
      seat.connected = true;
      seat.disconnectedAt = null;
      if (seat.botControlled && !seat.forfeited) {
        seat.botControlled = false; // the original owner takes the seat back from the bot
        this.systemChat("player_returned", { name: member.user.username });
        this.rescheduleTurn(true);
      } else if (wasAway && room.phase === "playing") {
        this.systemChat("player_reconnected", { name: member.user.username });
      }
    }
    await this.save({ room: true, chat: true, game: true });
    this.sendHello(server, userId);
    this.broadcastRoom();
    await this.scheduleAlarm();
    return new Response(null, { status: 101, webSocket: client, headers: { "Sec-WebSocket-Protocol": WS_PROTOCOL } });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const { userId } = ws.deserializeAttachment() as { userId: string };
    if (typeof message !== "string") return ws.close(WS_CLOSE.policy, "binary frames are not accepted");
    if (message.length > LIMITS.ws.maxFrameBytes) return ws.close(WS_CLOSE.tooLarge, "frame too large");
    let bucket = this.buckets.get(ws);
    if (!bucket) {
      bucket = new TokenBucket(LIMITS.ws.msgBurst, LIMITS.ws.msgPerSecond);
      this.buckets.set(ws, bucket);
    }
    if (!bucket.take()) {
      this.ctx.waitUntil(securityEvent(this.env, "ws.rejected", { userId, details: { reason: "flood", room: this.room?.id } }));
      return ws.close(WS_CLOSE.rateLimited, "rate limited");
    }
    let parsed: ClientRoomMessage;
    try {
      const result = clientRoomMessageSchema.safeParse(JSON.parse(message));
      if (!result.success) throw new Error("schema");
      parsed = result.data;
    } catch {
      const bad = (this.badFrames.get(ws) ?? 0) + 1;
      this.badFrames.set(ws, bad);
      this.send(ws, { type: "error", seq: ++this.seq, code: "bad_message" });
      if (bad > 20) ws.close(WS_CLOSE.policy, "too many malformed messages");
      return;
    }
    const room = this.room;
    if (!room || room.closed || !room.members[userId]) return ws.close(WS_CLOSE.roomClosed, "not a member");
    room.lastHumanSeenAt = Date.now();
    const result = await this.handle(userId, parsed);
    if (result) this.send(ws, { type: "error", seq: ++this.seq, id: parsed.id, code: result });
    else if (parsed.type !== "ping" && parsed.type !== "sync") this.send(ws, { type: "ack", seq: ++this.seq, id: parsed.id });
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await this.onSocketGone(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.onSocketGone(ws);
  }

  private async onSocketGone(ws: WebSocket): Promise<void> {
    this.buckets.delete(ws);
    this.badFrames.delete(ws);
    const room = this.room;
    if (!room) return;
    const { userId } = ws.deserializeAttachment() as { userId: string };
    const stillConnected = this.ctx.getWebSockets(userId).some((s) => s !== ws && s.readyState === WebSocket.OPEN);
    if (stillConnected) return;
    const member = room.members[userId];
    if (member?.seat !== null && member?.seat !== undefined) {
      const seat = room.seats[member.seat]!;
      seat.connected = false;
      seat.disconnectedAt = Date.now();
      if (room.phase === "playing") this.systemChat("player_disconnected", { name: member.user.username });
      await this.save({ room: true, chat: true });
      this.broadcastRoom();
      await this.scheduleAlarm();
    }
  }

  // ───────────────────────────── message handling ─────────────────────────────

  private async handle(userId: string, msg: ClientRoomMessage): Promise<string | null> {
    const room = this.room!;
    const member = room.members[userId]!;
    const isHost = room.hostId === userId;
    switch (msg.type) {
      case "ping": {
        for (const ws of this.ctx.getWebSockets(userId)) this.send(ws, { type: "pong", seq: ++this.seq, id: msg.id, serverTime: Date.now() });
        return null;
      }
      case "sync": {
        for (const ws of this.ctx.getWebSockets(userId)) this.sendHello(ws, userId);
        return null;
      }
      case "chat.send": {
        if (!room.settings.chatEnabled) return "chat_disabled";
        if (member.muted) return "muted";
        if (this.chatLimiter.isLimited(userId)) return "rate_limited";
        this.chatLimiter.hit(userId);
        const message: ChatMessage = { id: randomId("m", 16), ts: Date.now(), kind: "user", user: member.user, text: msg.text };
        this.pushChat(message);
        await this.save({ chat: true });
        return null;
      }
      case "room.ready": {
        if (room.phase !== "waiting" || member.seat === null) return "invalid_state";
        room.seats[member.seat]!.ready = msg.ready;
        await this.save({ room: true });
        this.broadcastRoom();
        await this.maybeAutoStart();
        return null;
      }
      case "room.start": {
        if (!isHost) return "forbidden";
        return this.startMatch();
      }
      case "room.addBot": {
        if (!isHost) return "forbidden";
        if (room.phase !== "waiting") return "invalid_state";
        if (!this.addBot(msg.difficulty)) return "room_full";
        await this.save({ room: true });
        this.broadcastRoom();
        await this.syncRoomRow();
        await this.maybeAutoStart();
        return null;
      }
      case "room.removeBot": {
        if (!isHost) return "forbidden";
        if (room.phase !== "waiting") return "invalid_state";
        const seat = room.seats[msg.seat];
        if (!seat || seat.kind !== "bot") return "invalid_target";
        room.seats[msg.seat] = emptySeat(msg.seat);
        await this.save({ room: true });
        this.broadcastRoom();
        await this.syncRoomRow();
        return null;
      }
      case "room.kick": {
        if (!isHost || msg.userId === userId) return "forbidden";
        const target = room.members[msg.userId];
        if (!target) return "invalid_target";
        if (target.user.badges.admin) return "forbidden";
        room.banned.push(msg.userId);
        await this.removeMember(msg.userId, "kicked");
        return null;
      }
      case "room.mute": {
        if (!isHost || msg.userId === userId) return "forbidden";
        const target = room.members[msg.userId];
        if (!target || target.user.badges.admin) return "invalid_target";
        target.muted = msg.muted;
        await this.save({ room: true });
        this.broadcastRoom();
        return null;
      }
      case "room.transferHost": {
        if (!isHost) return "forbidden";
        const target = room.members[msg.userId];
        if (!target || target.spectator) return "invalid_target";
        room.hostId = msg.userId;
        this.systemChat("host_changed", { name: target.user.username });
        await this.save({ room: true, chat: true });
        this.broadcastRoom();
        await this.syncRoomRow();
        return null;
      }
      case "room.updateSettings": {
        if (!isHost) return "forbidden";
        if (room.phase !== "waiting") return "invalid_state";
        const next = { ...room.settings, ...msg.settings } as RoomSettings;
        if (msg.settings.gameConfig) {
          const parsed = this.engine().configSchema.safeParse(msg.settings.gameConfig);
          if (!parsed.success) return "validation_failed";
          next.gameConfig = parsed.data as Record<string, unknown>;
        }
        room.settings = next;
        await this.save({ room: true });
        this.broadcastRoom();
        return null;
      }
      case "game.action": {
        if (member.seat === null || !this.game) return "invalid_state";
        const seat = room.seats[member.seat]!;
        if (seat.botControlled || seat.forfeited) return "invalid_state";
        // Idempotency: a repeated action id is acknowledged without re-applying it.
        if (this.game.processed.includes(msg.id)) return null;
        if (msg.rev !== this.game.rev) {
          for (const ws of this.ctx.getWebSockets(userId)) this.sendGame(ws, userId, []);
          return "stale_revision";
        }
        return this.applyAction(member.seat, msg.action, msg.id, "human");
      }
      case "room.leave": {
        await this.removeMember(userId, "left");
        return null;
      }
    }
  }

  // ───────────────────────────── game flow ─────────────────────────────

  private addBot(difficulty: BotDifficulty): boolean {
    const room = this.room!;
    const free = room.seats.find((s) => s.kind === "empty");
    if (!free) return false;
    room.botCounter += 1;
    room.seats[free.seat] = { ...emptySeat(free.seat), kind: "bot", botName: `#${room.botCounter}`, difficulty, connected: true, ready: true };
    return true;
  }

  private async maybeAutoStart(): Promise<void> {
    const room = this.room!;
    if (!room.settings.autoStart || room.phase !== "waiting") return;
    const full = room.seats.every((s) => s.kind !== "empty");
    const ready = room.seats.every((s) => s.kind !== "human" || s.ready);
    if (full && ready) await this.startMatch();
  }

  private async startMatch(): Promise<string | null> {
    const room = this.room!;
    if (room.phase !== "waiting") return "invalid_state";
    const engine = this.engine();
    const config = engine.configSchema.parse(room.settings.gameConfig);
    const occupied = room.seats.filter((s) => s.kind !== "empty");
    const limits = engine.seatLimits(config);
    if (occupied.length < limits.min || occupied.length > limits.max) return "not_enough_players";
    // Compact occupied seats to 0..n-1 so that engine seats equal room seats.
    room.seats = occupied.map((s, i) => ({ ...s, seat: i, ready: false }));
    for (const m of Object.values(room.members)) {
      if (m.seat !== null) m.seat = room.seats.findIndex((s) => s.userId === m.user.id);
    }
    const now = Date.now();
    const state = engine.create(config, occupied.length, { rng: cryptoRng(), now });
    room.phase = "playing";
    room.matchNumber += 1;
    this.game = { matchId: randomId("m"), state, rev: 0, turnKey: "", deadline: null, botActAt: null, startedAt: now, processed: [] };
    this.events = [];
    this.rescheduleTurn(false);
    this.systemChat("match_started", { number: room.matchNumber });
    await this.save({ room: true, game: true, events: true, chat: true });
    const humans = room.seats.filter((s) => s.kind === "human" && s.userId);
    await this.env.DB.batch([
      stmt(
        this.env.DB,
        "INSERT INTO game_sessions (id, room_id, game_type, status, rated, players, humans, started_at) VALUES (?, ?, ?, 'active', 0, ?, ?, ?)",
        this.game.matchId,
        room.id,
        room.gameType,
        occupied.length,
        humans.length,
        now,
      ),
      ...room.seats.map((s) =>
        s.userId ? stmt(this.env.DB, "UPDATE room_members SET seat = ? WHERE room_id = ? AND user_id = ? AND left_at IS NULL", s.seat, room.id, s.userId) : null,
      ).filter((x): x is D1PreparedStatement => x !== null),
    ]);
    await this.syncRoomRow();
    for (const h of humans) {
      this.ctx.waitUntil(this.setActivity(h.userId!, true));
      this.ctx.waitUntil(notify(this.env, h.userId!, "match_started", null, { roomId: room.id, gameType: room.gameType }));
    }
    this.broadcastRoom();
    this.broadcastGame([]);
    await this.scheduleAlarm();
    return null;
  }

  /** Sets turn deadline / bot timing whenever the acting seat changes. */
  private rescheduleTurn(force: boolean): void {
    const room = this.room!;
    const game = this.game;
    if (!game || room.phase !== "playing") return;
    const engine = this.engine();
    const actor = engine.actors(game.state)[0];
    if (actor === undefined) {
      game.deadline = null;
      game.botActAt = null;
      return;
    }
    const key = `${game.rev}:${actor}`;
    if (!force && key === game.turnKey) return;
    game.turnKey = key;
    const seat = room.seats[actor]!;
    const now = Date.now();
    if (seat.kind === "bot" || seat.botControlled) {
      const humansOnline = room.seats.some((s) => s.kind === "human" && s.connected && !s.botControlled);
      game.botActAt = now + (humansOnline ? BOT_DELAY_MS : IDLE_BOT_DELAY_MS);
      game.deadline = null;
    } else {
      game.botActAt = null;
      game.deadline = now + room.settings.turnSeconds * 1000;
    }
  }

  private async applyAction(seat: number, rawAction: unknown, actionId: string | null, source: "human" | "bot" | "timeout"): Promise<string | null> {
    const room = this.room!;
    const game = this.game!;
    const engine = this.engine();
    if (!engine.actors(game.state).includes(seat)) return "not_your_turn";
    const parsed = engine.actionSchema.safeParse(rawAction);
    if (!parsed.success) return "invalid_action";
    const result = engine.apply(game.state, seat, parsed.data, { rng: cryptoRng(), now: Date.now() });
    if (!result.ok) {
      if (source === "human") this.ctx.waitUntil(securityEvent(this.env, "game.illegal_action", { userId: room.seats[seat]?.userId ?? null, details: { room: room.id, error: result.error } }));
      return result.error;
    }
    game.state = result.state;
    game.rev += 1;
    if (actionId) {
      game.processed.push(actionId);
      if (game.processed.length > LIMITS.ws.processedActionIds) game.processed.splice(0, game.processed.length - LIMITS.ws.processedActionIds);
    }
    const events = result.events.map((e) => ({ ...e, by: source }));
    this.events.push(...events);
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    if (engine.isOver(game.state)) {
      this.broadcastGame(events);
      await this.finishMatch();
      return null;
    }
    this.rescheduleTurn(false);
    await this.save({ game: true, events: true });
    this.broadcastGame(events);
    if (game.rev % 25 === 0) this.ctx.waitUntil(this.syncRoomRow());
    await this.scheduleAlarm();
    return null;
  }

  private async finishMatch(): Promise<void> {
    const room = this.room!;
    const game = this.game!;
    const engine = this.engine();
    const outcome = engine.outcome(game.state);
    const n = room.seats.length;
    const participants = room.seats.map((s, i) => ({
      seat: i,
      userId: s.kind === "human" ? (s.userId ?? null) : null,
      isBot: s.kind === "bot",
      forfeited: s.forfeited,
      placement: s.forfeited ? n : outcome.placements[i]!,
      score: outcome.scores[i] ?? 0,
    }));
    const finishedAt = Date.now();
    let rated = false;
    let changes: Array<{ userId: string; delta: number }> = [];
    try {
      const r = await finalizeMatch(this.env.DB, {
        matchId: game.matchId,
        roomId: room.id,
        gameType: room.gameType,
        startedAt: game.startedAt,
        finishedAt,
        finalRev: game.rev,
        participants,
        eventsJson: JSON.stringify(this.events.slice(-500)),
        eventsTruncated: this.events.length > 500,
      });
      rated = r.rated;
      changes = r.changes;
    } catch (e) {
      console.error(JSON.stringify({ level: "error", msg: "finalize_match_failed", room: room.id, error: String(e) }));
    }
    const result: MatchResult = {
      matchId: game.matchId,
      gameType: room.gameType,
      rated,
      finishedAt,
      entries: participants.map((p) => ({
        seat: p.seat,
        userId: p.userId ?? undefined,
        username: p.userId ? room.members[p.userId]?.user.username : undefined,
        isBot: p.isBot,
        placement: p.placement,
        score: p.score,
        ratingDelta: changes.find((c) => c.userId === p.userId)?.delta,
      })),
    };
    room.lastResult = result;
    room.phase = "waiting";
    // Free forfeited seats; keep connected humans and bots for a rematch.
    room.seats = room.seats.map((s) => (s.forfeited ? emptySeat(s.seat) : { ...s, ready: false, botControlled: s.kind === "human" ? false : s.botControlled }));
    while (room.seats.length < room.maxPlayers) room.seats.push(emptySeat(room.seats.length));
    this.game = null;
    this.systemChat("match_finished", { number: room.matchNumber });
    await this.save({ room: true, game: true, chat: true, events: true });
    for (const ws of this.ctx.getWebSockets()) this.send(ws, { type: "match.end", seq: ++this.seq, result });
    this.broadcastRoom();
    await this.syncRoomRow();
    for (const p of participants) {
      if (!p.userId) continue;
      this.ctx.waitUntil(this.setActivity(p.userId, false));
      this.ctx.waitUntil(notify(this.env, p.userId, "match_completed", null, { roomId: room.id, gameType: room.gameType, placement: p.placement }));
    }
    // Members who left during the match are removed now that the match is final.
    for (const [uid, m] of Object.entries(room.members)) {
      if (m.seat === null && !m.spectator) delete room.members[uid];
    }
    await this.save({ room: true });
    await this.scheduleAlarm();
  }

  private async removeMember(userId: string, reason: string): Promise<void> {
    const room = this.room!;
    const member = room.members[userId];
    if (!member) return;
    const now = Date.now();
    if (member.seat !== null) {
      const seat = room.seats[member.seat]!;
      if (room.phase === "playing") {
        // Leaving a running match forfeits: a bot finishes the seat; the result counts as last place.
        seat.forfeited = true;
        seat.botControlled = true;
        seat.connected = false;
        member.seat = null;
        this.rescheduleTurn(true);
      } else {
        room.seats[member.seat] = emptySeat(member.seat);
      }
    }
    if (room.phase !== "playing" || member.spectator) delete room.members[userId];
    else room.members[userId] = { ...member, seat: null };
    for (const ws of this.ctx.getWebSockets(userId)) {
      try {
        ws.close(reason === "kicked" ? WS_CLOSE.kicked : WS_CLOSE.normal, reason);
      } catch {
        /* ignore */
      }
    }
    await run(this.env.DB, "UPDATE room_members SET left_at = ? WHERE room_id = ? AND user_id = ? AND left_at IS NULL", now, room.id, userId);
    this.systemChat(reason === "kicked" ? "player_kicked" : "player_left", { name: member.user.username });
    this.ctx.waitUntil(this.setActivity(userId, false, true));

    const humansLeft = room.seats.filter((s) => s.kind === "human" && !s.forfeited).length + Object.values(room.members).filter((m) => m.spectator).length;
    if (humansLeft === 0) {
      await this.closeRoom("empty");
      return;
    }
    if (room.hostId === userId) {
      const next = room.seats.find((s) => s.kind === "human" && !s.forfeited && s.userId && room.members[s.userId]);
      if (next?.userId) {
        room.hostId = next.userId;
        this.systemChat("host_changed", { name: room.members[next.userId]!.user.username });
      }
    }
    await this.save({ room: true, chat: true, game: true });
    this.broadcastRoom();
    await this.syncRoomRow();
    await this.scheduleAlarm();
  }

  private async closeRoom(reason: string): Promise<void> {
    const room = this.room!;
    room.closed = true;
    room.phase = "finished";
    if (this.game) {
      await run(this.env.DB, "UPDATE game_sessions SET status = 'void', finished_at = ? WHERE id = ? AND status = 'active'", Date.now(), this.game.matchId);
      this.game = null;
    }
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(WS_CLOSE.roomClosed, reason);
      } catch {
        /* ignore */
      }
    }
    await this.env.DB.batch([
      stmt(this.env.DB, "UPDATE rooms SET phase = 'closed', players = 0, spectators = 0, updated_at = ? WHERE id = ?", Date.now(), room.id),
      stmt(this.env.DB, "UPDATE room_members SET left_at = ? WHERE room_id = ? AND left_at IS NULL", Date.now(), room.id),
    ]);
    for (const uid of Object.keys(room.members)) this.ctx.waitUntil(this.setActivity(uid, false, true));
    room.members = {};
    room.tickets = {};
    this.chat = [];
    this.events = [];
    await this.save({ room: true, game: true, chat: true, events: true });
    await this.ctx.storage.deleteAlarm();
  }

  // ───────────────────────────── alarms ─────────────────────────────

  private async scheduleAlarm(): Promise<void> {
    const room = this.room;
    if (!room || room.closed) return;
    const times: number[] = [];
    const grace = room.settings.disconnectGraceMs;
    for (const s of room.seats) {
      if (s.kind === "human" && !s.connected && !s.botControlled && s.disconnectedAt !== null && room.phase === "playing") times.push(s.disconnectedAt + grace);
    }
    if (this.game?.deadline) times.push(this.game.deadline);
    if (this.game?.botActAt) times.push(this.game.botActAt);
    if (room.phase === "playing") times.push(room.lastHumanSeenAt + ABANDON_AFTER_MS);
    if (!times.length) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(Math.max(Date.now() + 50, Math.min(...times)));
  }

  override async alarm(): Promise<void> {
    const room = this.room;
    if (!room || room.closed) return;
    const now = Date.now();
    let changed = false;
    if (room.phase === "playing") {
      const anyoneConnected = room.seats.some((s) => s.kind === "human" && s.connected);
      if (!anyoneConnected && now - room.lastHumanSeenAt >= ABANDON_AFTER_MS) {
        await this.closeRoom("abandoned");
        return;
      }
      for (const s of room.seats) {
        if (s.kind === "human" && !s.connected && !s.botControlled && s.disconnectedAt !== null && now - s.disconnectedAt >= room.settings.disconnectGraceMs) {
          s.botControlled = true; // temporary: released as soon as the owner reconnects
          this.systemChat("bot_took_over", { name: (s.userId && room.members[s.userId]?.user.username) || "" });
          changed = true;
        }
      }
      if (changed) {
        this.rescheduleTurn(true);
        await this.save({ room: true, chat: true, game: true });
        this.broadcastRoom();
      }
    }
    const game = this.game;
    if (game && room.phase === "playing") {
      const engine = this.engine();
      const actor = engine.actors(game.state)[0];
      if (actor !== undefined) {
        const seat = room.seats[actor]!;
        const botTurn = seat.kind === "bot" || seat.botControlled;
        if (botTurn && game.botActAt !== null && game.botActAt <= now) {
          const difficulty: BotDifficulty = seat.kind === "bot" ? (seat.difficulty ?? "medium") : "medium";
          const view = engine.botView ? engine.botView(game.state, actor) : engine.view(game.state, actor);
          const legal = engine.legalActions(game.state, actor);
          const action = engine.bot({ view, legal, seat: actor, difficulty, rng: cryptoRng() });
          const error = await this.applyAction(actor, action, null, "bot");
          if (error) {
            // Defensive fallback: a bot must never stall the table.
            const fallback = engine.timeoutAction(game.state, actor, { rng: cryptoRng(), now });
            await this.applyAction(actor, fallback, null, "bot");
          }
          return;
        }
        if (!botTurn && game.deadline !== null && game.deadline <= now) {
          const action = engine.timeoutAction(game.state, actor, { rng: cryptoRng(), now });
          this.systemChat("turn_timeout", { name: (seat.userId && room.members[seat.userId]?.user.username) || "" });
          await this.save({ chat: true });
          await this.applyAction(actor, action, null, "timeout");
          return;
        }
      }
    }
    await this.scheduleAlarm();
  }

  // ───────────────────────────── outbound ─────────────────────────────

  private send(ws: WebSocket, msg: ServerRoomMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket closing */
    }
  }

  private seatOf(userId: string): number | null {
    return this.room?.members[userId]?.seat ?? null;
  }

  private gameFrame(userId: string): { rev: number; view: unknown; deadline: number | null } | null {
    const game = this.game;
    if (!game) return null;
    // Spectators and seatless members receive the public view only.
    return { rev: game.rev, view: this.engine().view(game.state, this.seatOf(userId)), deadline: game.deadline };
  }

  private sendHello(ws: WebSocket, userId: string): void {
    const room = this.room!;
    const member = room.members[userId];
    if (!member) return;
    this.send(ws, {
      type: "hello",
      seq: ++this.seq,
      you: { userId, seat: member.seat, spectator: member.spectator, isHost: room.hostId === userId, muted: member.muted },
      room: this.buildSnapshot(),
      chat: this.chat.slice(-LIMITS.chat.restoreOnReconnect),
      game: this.gameFrame(userId),
    });
  }

  private sendGame(ws: WebSocket, userId: string, events: PublicEvent[]): void {
    const frame = this.gameFrame(userId);
    if (!frame) return;
    this.send(ws, { type: "game", seq: ++this.seq, rev: frame.rev, view: frame.view, deadline: frame.deadline, events });
  }

  private broadcastGame(events: PublicEvent[]): void {
    const game = this.game;
    if (!game) return;
    const cache = new Map<number | null, unknown>();
    for (const ws of this.ctx.getWebSockets()) {
      const { userId } = ws.deserializeAttachment() as { userId: string };
      const seat = this.seatOf(userId);
      if (!cache.has(seat)) cache.set(seat, this.engine().view(game.state, seat));
      this.send(ws, { type: "game", seq: ++this.seq, rev: game.rev, view: cache.get(seat), deadline: game.deadline, events });
    }
  }

  private broadcastRoom(): void {
    if (!this.room) return;
    const snapshot = this.buildSnapshot();
    for (const ws of this.ctx.getWebSockets()) this.send(ws, { type: "room", seq: ++this.seq, room: snapshot });
  }

  private pushChat(message: ChatMessage): void {
    this.chat.push(message);
    if (this.chat.length > LIMITS.chat.historySize) this.chat.splice(0, this.chat.length - LIMITS.chat.historySize);
    for (const ws of this.ctx.getWebSockets()) this.send(ws, { type: "chat", seq: ++this.seq, message });
  }

  private systemChat(key: string, params: Record<string, string | number>): void {
    this.pushChat({ id: randomId("m", 16), ts: Date.now(), kind: "system", text: "", key, params });
  }

  private buildSnapshot(): RoomSnapshot {
    const room = this.room!;
    const seats: SeatInfo[] = room.seats.map((s) => ({
      seat: s.seat,
      occupant: s.kind,
      ...(s.userId && room.members[s.userId] ? { user: room.members[s.userId]!.user } : {}),
      ...(s.botName ? { botName: s.botName } : {}),
      ...(s.difficulty ? { botDifficulty: s.difficulty } : {}),
      connected: s.kind === "bot" ? true : s.connected,
      botControlled: s.botControlled,
      ready: s.ready,
    }));
    return {
      id: room.id,
      gameType: room.gameType,
      name: room.name,
      visibility: room.visibility,
      hasPassword: room.passwordHash !== null,
      hostId: room.hostId,
      phase: room.closed ? "finished" : room.phase,
      maxPlayers: room.maxPlayers,
      seats,
      spectators: Object.values(room.members).filter((m) => m.spectator).length,
      settings: room.settings,
      matchNumber: room.matchNumber,
      createdAt: room.createdAt,
    };
  }

  private async syncRoomRow(): Promise<void> {
    const room = this.room;
    if (!room || room.closed) return;
    const players = room.seats.filter((s) => s.kind !== "empty").length;
    const spectators = Object.values(room.members).filter((m) => m.spectator).length;
    const stage = this.game ? this.engine().stage(this.game.state).slice(0, 60) : null;
    await run(
      this.env.DB,
      "UPDATE rooms SET players = ?, spectators = ?, phase = ?, stage = ?, host_id = ?, max_players = ?, updated_at = ? WHERE id = ?",
      players,
      spectators,
      room.phase,
      stage,
      room.hostId,
      room.maxPlayers,
      Date.now(),
      room.id,
    );
  }

  private async setActivity(userId: string, playing: boolean, left = false): Promise<void> {
    try {
      await lobbyStub(this.env).setActivity(userId, left ? null : { roomId: this.room!.id, gameType: this.room!.gameType, playing });
    } catch {
      /* presence is best-effort */
    }
  }
}

function emptySeat(seat: number): SeatData {
  return { seat, kind: "empty", connected: false, botControlled: false, disconnectedAt: null, forfeited: false, ready: false };
}

export const ROOM_SEAT_LIMITS = Object.fromEntries(Object.values(GAME_CATALOG).map((g) => [g.type, { min: g.minPlayers, max: g.maxPlayers }]));
