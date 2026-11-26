import { Hono } from "hono";
import { isAllowedOrigin } from "@croco/security";
import { isGameType, type GameType } from "@croco/shared";
import { authenticate, requireProfile } from "../auth";
import { securityEvent } from "../audit";
import type { Env } from "../env";
import type { AppEnv, Ctx } from "../http/context";
import { ApiError } from "../http/errors";
import { rateLimit } from "../http/ratelimit";
import { publicUser } from "../users";

/**
 * Game chat rooms: one per game type, shown beside that game's room list. Tickets need a signed-in
 * player with a profile; the socket itself authenticates with the one-time ticket.
 */
export const chatRoutes = new Hono<AppEnv>();

export function gameChatStub(env: Env, game: GameType) {
  return env.GAME_CHAT.get(env.GAME_CHAT.idFromName(`chat:${game}`));
}

function gameParam(c: Ctx): GameType {
  const game = c.req.param("game");
  if (!isGameType(game)) throw new ApiError("not_found");
  return game;
}

chatRoutes.post("/chat/:game/ticket", authenticate, requireProfile, async (c) => {
  const game = gameParam(c);
  const { user } = c.get("auth");
  await rateLimit(c, "ticket", "chat_ticket", user.id);
  const me = await publicUser(c.env.DB, user.id);
  if (!me) throw new ApiError("forbidden");
  return c.json(await gameChatStub(c.env, game).issueTicket(game, me));
});

chatRoutes.get("/chat/:game/ws", async (c) => {
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") throw new ApiError("bad_request");
  if (!isAllowedOrigin(c.req.header("Origin"), c.get("config").allowedOrigins)) {
    c.executionCtx.waitUntil(securityEvent(c.env, "ws.rejected", { ipHash: c.get("ipHash"), details: { reason: "origin" } }));
    throw new ApiError("forbidden");
  }
  const game = gameParam(c);
  await rateLimit(c, "ticket", "ws_connect");
  return gameChatStub(c.env, game).fetch(c.req.raw);
});
