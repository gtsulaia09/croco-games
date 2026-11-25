/**
 * Centralised security and resource limits. Changing a value here changes it for the
 * frontend (input hints), the Worker (enforcement) and the tests (assertions).
 */
export const LIMITS = {
  http: {
    maxBodyBytes: 16 * 1024,
    maxTokenBytes: 4096,
  },
  pagination: {
    defaultLimit: 20,
    maxLimit: 50,
    maxCursorLength: 200,
  },
  username: { min: 3, max: 20 },
  roomName: { min: 3, max: 40 },
  roomPassword: { min: 4, max: 64 },
  chat: {
    maxLength: 300,
    burst: 5,
    perSeconds: 10,
    historySize: 200,
    restoreOnReconnect: 50,
  },
  search: { min: 3, max: 20, results: 20 },
  report: { detailsMax: 500, perDay: 10 },
  ws: {
    maxFrameBytes: 4096,
    lobbyMaxFrameBytes: 1024,
    ticketTtlMs: 30_000,
    msgBurst: 20,
    msgPerSecond: 10,
    heartbeatMs: 25_000,
    idleTimeoutMs: 75_000,
    maxSocketsPerRoom: 20,
    processedActionIds: 256,
  },
  room: {
    passwordFailuresPerUser: 5,
    passwordFailureWindowMs: 15 * 60_000,
    passwordFailuresPerRoomPerHour: 50,
    createdPer10Min: 3,
    disconnectGraceMs: { min: 5_000, max: 120_000, default: 30_000 },
    turnSeconds: { min: 10, max: 120, default: 30 },
    maxSpectators: 10,
    inviteTtlMs: 30 * 60_000,
    inviteLinkTtlMs: 2 * 60 * 60_000,
    inviteLinkMaxUses: 20,
  },
  social: {
    maxPendingOutgoingRequests: 50,
    maxFriends: 500,
  },
  admin: {
    stepUpTtlMs: 15 * 60_000,
    recentAuthMs: 10 * 60_000,
    mfaFailuresPer15Min: 5,
    recoveryCodes: 10,
    moderatorMaxSuspendDays: 7,
  },
  rating: {
    initial: 1500,
    kFactor: 32,
    establishedMatches: 10,
    maxRatedMatchesPerPairPerDay: 5,
    minHumansForRated: 2,
  },
} as const;
