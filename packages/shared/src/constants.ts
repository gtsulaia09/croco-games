/** Plain constants shared by the server and the browser bundle (no runtime dependencies). */

/** WebSocket subprotocol negotiated by the server. The ticket travels as a second entry. */
export const WS_PROTOCOL = "croco.v1";
export const WS_TICKET_PREFIX = "t.";

export const WS_CLOSE = {
  normal: 1000,
  policy: 1008,
  tooLarge: 1009,
  superseded: 4001,
  kicked: 4002,
  roomClosed: 4003,
  unauthorized: 4004,
  rateLimited: 4005,
  idle: 4006,
} as const;

export const AVATAR_IDS = Array.from({ length: 24 }, (_, i) => `a${String(i + 1).padStart(2, "0")}`);
