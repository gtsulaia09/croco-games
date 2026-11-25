import { randomId } from "@croco/security";
import type { NotificationDto, PublicUser } from "@croco/shared";
import { run } from "./db";
import type { Env } from "./env";

export function lobbyStub(env: Env) {
  return env.LOBBY.get(env.LOBBY.idFromName("global"));
}

/** Kinds stored in D1 (others are push-only to protect the free-tier write quota). */
const PERSISTED = new Set<NotificationDto["kind"]>(["friend_request", "friend_accepted", "game_invitation", "invitation_accepted", "match_completed"]);

export async function notify(
  env: Env,
  userId: string,
  kind: NotificationDto["kind"],
  actor: PublicUser | null,
  data: NotificationDto["data"],
): Promise<void> {
  const dto: NotificationDto = { id: randomId("n"), kind, createdAt: Date.now(), read: false, ...(actor ? { actor } : {}), data };
  if (PERSISTED.has(kind)) {
    await run(
      env.DB,
      "INSERT INTO notifications (id, user_id, kind, actor_id, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      dto.id,
      userId,
      kind,
      actor?.id ?? null,
      JSON.stringify(data),
      dto.createdAt,
    );
  }
  try {
    await lobbyStub(env).push(userId, dto);
  } catch (e) {
    console.error(JSON.stringify({ level: "warn", msg: "notification_push_failed", kind, error: String(e) }));
  }
}
