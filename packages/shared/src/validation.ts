import { z } from "zod";
import { BOT_DIFFICULTIES, GAME_TYPES } from "./games";
import { LIMITS } from "./limits";

/** Remove C0/C1 control characters, bidi overrides and zero-width characters. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

export function sanitizeText(input: string): string {
  return input.normalize("NFC").replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();
}

/** Latin letters, digits, underscore and Georgian Mkhedruli letters (no punctuation from the block). */
export const USERNAME_PATTERN = /^[A-Za-z0-9_ა-ჺჽ-ჿ]+$/;

const RESERVED_SKELETONS = [
  "admin",
  "administrator",
  "moderator",
  "moder",
  "system",
  "croco",
  "support",
  "official",
  "staff",
  "owner",
  "root",
  "bot",
  "ადმინ",
  "მოდერატორ",
  "სისტემა",
  "ბოტი",
  "კროკო",
];

const LOOKALIKES: Record<string, string> = {
  "0": "o",
  "1": "i",
  l: "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "9": "g",
};

/** Skeleton used to detect impersonation such as "Adm1n" or "a_d_m_i_n". */
export function usernameSkeleton(username: string): string {
  return username
    .normalize("NFC")
    .toLowerCase()
    .replace(/_/g, "")
    .split("")
    .map((ch) => LOOKALIKES[ch] ?? ch)
    .join("");
}

export function isReservedUsername(username: string): boolean {
  const skeleton = usernameSkeleton(username);
  return RESERVED_SKELETONS.some((reserved) => {
    const reservedSkeleton = usernameSkeleton(reserved);
    // "bot" is only reserved as a prefix/suffix so that names like "abbott" remain possible.
    if (reservedSkeleton === "bot") return skeleton.startsWith("bot") || skeleton.endsWith("bot");
    return skeleton.includes(reservedSkeleton);
  });
}

export const usernameSchema = z
  .string()
  .transform((s) => s.normalize("NFC").trim())
  .pipe(
    z
      .string()
      .min(LIMITS.username.min)
      .max(LIMITS.username.max)
      .regex(USERNAME_PATTERN, "invalid_characters")
      .refine((s) => !isReservedUsername(s), "reserved"),
  );

export const idSchema = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9]{16,32}$`), "invalid_id");

export const userIdSchema = idSchema("u");
export const roomIdSchema = idSchema("r");
export const requestIdSchema = idSchema("fr");
export const invitationIdSchema = idSchema("inv");
export const notificationIdSchema = idSchema("n");
export const reportIdSchema = idSchema("rp");
export const sessionIdSchema = idSchema("s");
export const inviteCodeSchema = z.string().regex(/^[A-Za-z0-9_-]{22,64}$/, "invalid_code");

export const roomNameSchema = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().min(LIMITS.roomName.min).max(LIMITS.roomName.max));

export const roomPasswordSchema = z.string().min(LIMITS.roomPassword.min).max(LIMITS.roomPassword.max);

export const chatTextSchema = z
  .string()
  .max(LIMITS.chat.maxLength * 4)
  .transform(sanitizeText)
  .pipe(z.string().min(1).max(LIMITS.chat.maxLength));

export const searchQuerySchema = z
  .string()
  .transform((s) => s.normalize("NFC").trim())
  .pipe(z.string().min(LIMITS.search.min).max(LIMITS.search.max).regex(USERNAME_PATTERN));

export const paginationSchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(LIMITS.pagination.maxLimit).default(LIMITS.pagination.defaultLimit),
  cursor: z.string().max(LIMITS.pagination.maxCursorLength).optional(),
});

export const AVATAR_IDS = Array.from({ length: 24 }, (_, i) => `a${String(i + 1).padStart(2, "0")}`);
export const avatarSchema = z.enum(AVATAR_IDS as [string, ...string[]]);
export const localeSchema = z.enum(["ka", "en"]);

export const createProfileSchema = z.strictObject({
  username: usernameSchema,
  avatar: avatarSchema,
  locale: localeSchema,
  turnstileToken: z.string().max(2048).optional(),
});

export const updateProfileSchema = z
  .strictObject({
    avatar: avatarSchema.optional(),
    locale: localeSchema.optional(),
    showOnline: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, "empty_update");

export const gameTypeSchema = z.enum(GAME_TYPES);
export const botDifficultySchema = z.enum(BOT_DIFFICULTIES);
export const roomVisibilitySchema = z.enum(["public", "private", "invite"]);

export const createRoomSchema = z.strictObject({
  gameType: gameTypeSchema,
  name: roomNameSchema,
  visibility: roomVisibilitySchema,
  password: roomPasswordSchema.optional(),
  maxPlayers: z.number().int().min(2).max(9),
  allowSpectators: z.boolean(),
  bots: z.number().int().min(0).max(8),
  botDifficulty: botDifficultySchema,
  turnSeconds: z.number().int().min(LIMITS.room.turnSeconds.min).max(LIMITS.room.turnSeconds.max),
  autoStart: z.boolean(),
  chatEnabled: z.boolean(),
  allowInvites: z.boolean(),
  /** Validated by the selected engine's own strict schema on the server. */
  gameConfig: z.record(z.string(), z.unknown()),
});
export type CreateRoomInput = z.infer<typeof createRoomSchema>;

export const joinRoomSchema = z.strictObject({
  password: roomPasswordSchema.optional(),
  inviteCode: inviteCodeSchema.optional(),
  asSpectator: z.boolean().optional(),
});

export const roomListQuerySchema = z.strictObject({
  gameType: gameTypeSchema,
  filter: z.enum(["all", "public", "password", "invite", "waiting", "active", "seats"]).default("all"),
  q: z
    .string()
    .transform(sanitizeText)
    .pipe(z.string().max(40))
    .optional(),
  limit: z.coerce.number().int().min(1).max(LIMITS.pagination.maxLimit).default(LIMITS.pagination.defaultLimit),
  cursor: z.string().max(LIMITS.pagination.maxCursorLength).optional(),
});

export const friendRequestCreateSchema = z.strictObject({ toUserId: userIdSchema });
export const blockCreateSchema = z.strictObject({ userId: userIdSchema });
export const invitationCreateSchema = z.strictObject({ roomId: roomIdSchema, toUserId: userIdSchema });
export const inviteLinkCreateSchema = z.strictObject({ roomId: roomIdSchema });
export const notificationsReadSchema = z.union([
  z.strictObject({ all: z.literal(true) }),
  z.strictObject({ ids: z.array(notificationIdSchema).min(1).max(50) }),
]);
export const sessionRevokeSchema = z.strictObject({ sessionId: sessionIdSchema });

export const REPORT_REASONS = ["cheating", "abuse", "spam", "impersonation", "inappropriate_name", "other"] as const;
export const reportCreateSchema = z.strictObject({
  targetUserId: userIdSchema,
  roomId: roomIdSchema.optional(),
  messageId: z.string().regex(/^m_[A-Za-z0-9]{8,32}$/).optional(),
  reason: z.enum(REPORT_REASONS),
  details: z
    .string()
    .transform(sanitizeText)
    .pipe(z.string().max(LIMITS.report.detailsMax))
    .optional(),
});

export const leaderboardQuerySchema = z.strictObject({
  period: z.enum(["all", "month", "week"]).default("all"),
  limit: z.coerce.number().int().min(1).max(LIMITS.pagination.maxLimit).default(LIMITS.pagination.defaultLimit),
  cursor: z.string().max(LIMITS.pagination.maxCursorLength).optional(),
});

export const totpCodeSchema = z.strictObject({ code: z.string().regex(/^\d{6}$/) });
export const recoveryCodeSchema = z.strictObject({ code: z.string().regex(/^[a-z2-7]{4}(-[a-z2-7]{4}){3}$/) });

export const adminSuspendSchema = z.strictObject({
  days: z.number().int().min(1).max(3650),
  reason: z.string().transform(sanitizeText).pipe(z.string().min(3).max(300)),
});
export const adminRoleChangeSchema = z.strictObject({
  role: z.literal("moderator"),
  action: z.enum(["grant", "revoke"]),
});
export const adminKickSchema = z.strictObject({
  userId: userIdSchema,
  reason: z.string().transform(sanitizeText).pipe(z.string().min(3).max(300)),
});
export const adminResolveSchema = z.strictObject({
  resolution: z.enum(["dismissed", "actioned"]),
  note: z.string().transform(sanitizeText).pipe(z.string().max(500)),
});
export const PLATFORM_SETTING_KEYS = ["registrationOpen", "roomCreationOpen", "maintenanceMessage", "maxRoomsPerUser"] as const;
export const adminSettingsSchema = z.strictObject({
  registrationOpen: z.boolean(),
  roomCreationOpen: z.boolean(),
  maintenanceMessage: z.string().transform(sanitizeText).pipe(z.string().max(200)),
  maxRoomsPerUser: z.number().int().min(1).max(5),
});
export type PlatformSettings = z.infer<typeof adminSettingsSchema>;
export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  registrationOpen: true,
  roomCreationOpen: true,
  maintenanceMessage: "",
  maxRoomsPerUser: 1,
};

/** Only allow navigation to internal hash routes — protects against open redirects. */
export function safeInternalPath(candidate: unknown, fallback = "/"): string {
  if (typeof candidate !== "string") return fallback;
  if (!/^\/[A-Za-z0-9/_-]{0,200}$/.test(candidate)) return fallback;
  if (candidate.startsWith("//")) return fallback;
  return candidate;
}
