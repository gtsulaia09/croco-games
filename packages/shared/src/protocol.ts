import { z } from "zod";
import { botDifficultySchema, chatTextSchema, userIdSchema } from "./validation";
import type { BotDifficulty, GameType } from "./games";

export { WS_PROTOCOL, WS_TICKET_PREFIX, WS_CLOSE } from "./constants";

const msgId = z.string().regex(/^[A-Za-z0-9_-]{8,40}$/);

export const roomSettingsPatchSchema = z
  .strictObject({
    turnSeconds: z.number().int().min(10).max(120).optional(),
    autoStart: z.boolean().optional(),
    chatEnabled: z.boolean().optional(),
    botDifficulty: botDifficultySchema.optional(),
    gameConfig: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, "empty_update");

/** Strict allowlist of client → server room messages. Unknown types are rejected. */
export const clientRoomMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("ping"), id: msgId }),
  z.strictObject({ type: z.literal("sync"), id: msgId }),
  z.strictObject({ type: z.literal("chat.send"), id: msgId, text: chatTextSchema }),
  z.strictObject({ type: z.literal("room.ready"), id: msgId, ready: z.boolean() }),
  z.strictObject({ type: z.literal("room.start"), id: msgId }),
  z.strictObject({ type: z.literal("room.addBot"), id: msgId, difficulty: botDifficultySchema }),
  z.strictObject({ type: z.literal("room.removeBot"), id: msgId, seat: z.number().int().min(0).max(8) }),
  z.strictObject({ type: z.literal("room.kick"), id: msgId, userId: userIdSchema }),
  z.strictObject({ type: z.literal("room.mute"), id: msgId, userId: userIdSchema, muted: z.boolean() }),
  z.strictObject({ type: z.literal("room.transferHost"), id: msgId, userId: userIdSchema }),
  z.strictObject({ type: z.literal("room.updateSettings"), id: msgId, settings: roomSettingsPatchSchema }),
  z.strictObject({
    type: z.literal("game.action"),
    id: msgId,
    rev: z.number().int().min(0),
    action: z.record(z.string(), z.unknown()),
  }),
  z.strictObject({ type: z.literal("room.leave"), id: msgId }),
]);
export type ClientRoomMessage = z.infer<typeof clientRoomMessageSchema>;

export const clientLobbyMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("ping"), id: msgId }),
  z.strictObject({ type: z.literal("presence.set"), id: msgId, status: z.enum(["online", "away"]) }),
]);
export type ClientLobbyMessage = z.infer<typeof clientLobbyMessageSchema>;

export type PresenceStatus = "online" | "away" | "in_game" | "offline";
export type RoomPhase = "waiting" | "playing" | "finished";
export type RoomVisibility = "public" | "private" | "invite";

export interface UserBadges {
  admin: boolean;
  moderator: boolean;
}

export interface PublicUser {
  id: string;
  username: string;
  avatar: string;
  badges: UserBadges;
}

export interface SeatInfo {
  seat: number;
  occupant: "empty" | "human" | "bot";
  user?: PublicUser;
  botName?: string;
  botDifficulty?: BotDifficulty;
  connected: boolean;
  botControlled: boolean;
  ready: boolean;
}

export interface RoomSettings {
  turnSeconds: number;
  autoStart: boolean;
  chatEnabled: boolean;
  allowSpectators: boolean;
  allowInvites: boolean;
  botDifficulty: BotDifficulty;
  disconnectGraceMs: number;
  gameConfig: Record<string, unknown>;
}

export interface RoomSnapshot {
  id: string;
  gameType: GameType;
  name: string;
  visibility: RoomVisibility;
  hasPassword: boolean;
  hostId: string;
  phase: RoomPhase;
  maxPlayers: number;
  seats: SeatInfo[];
  spectators: number;
  settings: RoomSettings;
  matchNumber: number;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  ts: number;
  kind: "user" | "system";
  user?: PublicUser;
  text: string;
  /** For system messages: an i18n key and params instead of free text. */
  key?: string;
  params?: Record<string, string | number>;
}

export interface MatchResultEntry {
  seat: number;
  userId?: string;
  username?: string;
  isBot: boolean;
  placement: number;
  score: number;
  ratingDelta?: number;
}

export interface MatchResult {
  matchId: string;
  gameType: GameType;
  rated: boolean;
  entries: MatchResultEntry[];
  finishedAt: number;
}

export type ServerRoomMessage =
  | {
      type: "hello";
      seq: number;
      you: { userId: string; seat: number | null; spectator: boolean; isHost: boolean; muted: boolean };
      room: RoomSnapshot;
      chat: ChatMessage[];
      game: { rev: number; view: unknown; deadline: number | null } | null;
    }
  | { type: "room"; seq: number; room: RoomSnapshot }
  | { type: "chat"; seq: number; message: ChatMessage }
  | { type: "game"; seq: number; rev: number; view: unknown; deadline: number | null; events: unknown[] }
  | { type: "match.end"; seq: number; result: MatchResult }
  | { type: "ack"; seq: number; id: string }
  | { type: "pong"; seq: number; id: string; serverTime: number }
  | { type: "error"; seq: number; id?: string; code: string };

export interface NotificationDto {
  id: string;
  kind:
    | "friend_request"
    | "friend_accepted"
    | "friend_online"
    | "game_invitation"
    | "invitation_accepted"
    | "room_joined"
    | "match_started"
    | "match_completed";
  createdAt: number;
  read: boolean;
  actor?: PublicUser;
  data: Record<string, string | number | boolean | null>;
}

export type ServerLobbyMessage =
  | { type: "hello"; seq: number; unread: number }
  | { type: "notification"; seq: number; notification: NotificationDto }
  | { type: "presence"; seq: number; userId: string; status: PresenceStatus }
  | { type: "pong"; seq: number; id: string; serverTime: number }
  | { type: "error"; seq: number; code: string };
