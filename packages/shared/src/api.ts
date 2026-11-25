import type { GameType } from "./games";
import type { PresenceStatus, PublicUser, RoomPhase, RoomVisibility } from "./protocol";

/** Stable error codes returned by the API. Messages are localised on the client. */
export const ERROR_CODES = [
  "bad_request",
  "validation_failed",
  "unauthenticated",
  "token_expired",
  "session_revoked",
  "forbidden",
  "not_found",
  "conflict",
  "rate_limited",
  "payload_too_large",
  "unsupported_media_type",
  "method_not_allowed",
  "email_not_verified",
  "profile_required",
  "profile_exists",
  "username_taken",
  "account_suspended",
  "recent_auth_required",
  "mfa_required",
  "mfa_invalid",
  "mfa_not_enrolled",
  "step_up_required",
  "room_full",
  "room_closed",
  "room_password_invalid",
  "room_password_locked",
  "already_in_room",
  "not_in_room",
  "invitation_expired",
  "blocked",
  "already_friends",
  "request_pending",
  "registration_closed",
  "room_creation_closed",
  "turnstile_failed",
  "service_unavailable",
  "internal_error",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: { code: ErrorCode; ref: string; fields?: Record<string, string> };
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface MeResponse {
  account: {
    signInProvider: string;
    emailVerified: boolean;
    identityVerified: boolean;
  };
  profile: (PublicUser & { locale: "ka" | "en"; showOnline: boolean; createdAt: number }) | null;
  roles: Array<"admin" | "moderator">;
  admin: { mfaEnrolled: boolean; mfaRequired: boolean } | null;
  activeRoomId: string | null;
}

export interface RoomSummary {
  id: string;
  gameType: GameType;
  name: string;
  visibility: RoomVisibility;
  hasPassword: boolean;
  host: PublicUser;
  players: number;
  maxPlayers: number;
  phase: RoomPhase;
  stage: string | null;
  allowSpectators: boolean;
  spectators: number;
  createdAt: number;
}

export interface FriendDto {
  user: PublicUser;
  status: PresenceStatus;
  roomId: string | null;
  gameType: GameType | null;
  since: number;
}

export interface FriendRequestDto {
  id: string;
  from: PublicUser;
  to: PublicUser;
  createdAt: number;
  status: "pending" | "accepted" | "rejected" | "cancelled";
}

export interface InvitationDto {
  id: string;
  from: PublicUser;
  room: { id: string; name: string; gameType: GameType };
  createdAt: number;
  expiresAt: number;
  status: "pending" | "accepted" | "rejected" | "expired";
}

export interface LeaderboardEntry {
  rank: number;
  user: PublicUser;
  rating: number;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  recent: Array<"W" | "L" | "D">;
  established: boolean;
  /** Points ahead of the next player (null for the last entry). */
  leadOverNext: number | null;
}

export interface GameLeaderDto {
  gameType: GameType;
  leader: { user: PublicUser; rating: number; leadOverSecond: number | null } | null;
  youLead: boolean;
  yourRank: number | null;
}

export interface GlobalLeaderboardEntry {
  rank: number;
  user: PublicUser;
  gamesLed: number;
  averagePercentile: number;
  strongestGame: GameType | null;
  gamesRanked: number;
  firstPlaces: GameType[];
}

export interface PlayerStatsDto {
  gameType: GameType;
  rating: number;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  rank: number | null;
  established: boolean;
}

export interface MatchHistoryDto {
  matchId: string;
  gameType: GameType;
  finishedAt: number;
  placement: number;
  players: number;
  score: number;
  ratingDelta: number | null;
  rated: boolean;
}

export interface SessionDto {
  id: string;
  createdAt: number;
  lastSeenAt: number;
  provider: string;
  device: string;
  country: string | null;
  current: boolean;
  revoked: boolean;
}

/** Same shape as `PlatformSettings` (validation.ts), declared without zod for the browser bundle. */
export interface PlatformSettingsDto {
  registrationOpen: boolean;
  roomCreationOpen: boolean;
  maintenanceMessage: string;
  maxRoomsPerUser: number;
}
